from __future__ import annotations

import json
import os
import csv
import io
import logging
import math
import re
import time
import asyncio
import threading
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from kiteconnect import KiteConnect, KiteTicker
from pydantic import BaseModel, Field, SecretStr, ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    kite_api_key: str = ""
    frontend_origin: str = "http://127.0.0.1:5173"
    token_file: Path = Path(__file__).resolve().parents[1] / "data" / "session.json"
    model_config = SettingsConfigDict(env_file=(".env", "backend/.env"), extra="ignore")


settings = Settings()
app = FastAPI(title="Northstar Kite Connect API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([settings.frontend_origin, "http://localhost:5173"])),
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):517[0-9]+$",
    allow_credentials=False,
    allow_methods=["DELETE", "GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)


class LoginRequest(BaseModel):
    api_key: str = Field(min_length=1, max_length=128)
    api_secret: SecretStr
    request_token: str = Field(min_length=1, max_length=512)


class SignalsRequest(BaseModel):
    short_sma: int = Field(default=6, ge=2, le=100)
    long_sma: int = Field(default=30, ge=3, le=250)
    lookback_days: int = Field(default=90, ge=1, le=365)
    max_stocks: int = Field(default=100, ge=1, le=100)

    @model_validator(mode="after")
    def validate_sma_order(self) -> "SignalsRequest":
        if self.short_sma >= self.long_sma:
            raise ValueError("Short SMA must be less than Long SMA.")
        return self


class GttCandidate(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    quantity: int = Field(default=1, ge=1)
    buy_price: float | None = None
    stoploss: float | None = None
    last_price: float | None = None


class GttStateRequest(BaseModel):
    orders: list[GttCandidate] = Field(max_length=100)


class GttPlacementRequest(GttStateRequest):
    confirm_live: bool = False


class StockOrderRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9&._-]+$")
    transaction_type: Literal["BUY", "SELL"]
    product: Literal["CNC", "MIS"] = "CNC"
    quantity: int = Field(ge=1, le=100000)
    confirm_live: bool = False


class StrategySection(BaseModel):
    segment: Literal["Option", "Share"]
    symbol: str | None = Field(default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9&._-]+$")
    option_type: Literal["CE", "PE"] = "CE"
    week: Literal["Current week", "Next week", "Monthly"] = "Current week"
    lot_quantity: int = Field(ge=1, le=100000)
    strike_price: Literal["OTM 1", "OTM 2", "OTM 3", "ATM", "ITM 1", "ITM 2", "ITM 3"] | None = None
    premium_price: float | None = Field(default=None, gt=0, le=10000000)
    action: Literal["BUY", "SELL"]
    stop_loss_percentage: float | None = Field(default=None, gt=0, le=100)

    @model_validator(mode="after")
    def validate_price_reference(self) -> "StrategySection":
        if self.segment == "Share":
            return self
        if self.symbol is not None:
            raise ValueError("Option sections cannot include an equity symbol.")
        if (self.strike_price is None) == (self.premium_price is None):
            raise ValueError("Choose exactly one of strike_price or premium_price.")
        return self


class StrategyPayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=60)
    product: Literal["MIS", "NRML"] = "MIS"
    sections: list[StrategySection] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_text(self) -> "StrategyPayload":
        self.name = self.name.strip()
        self.category = self.category.strip()
        if not self.name or not self.category:
            raise ValueError("Strategy name and category cannot be blank.")
        return self


class StrategyRecord(StrategyPayload):
    id: str
    created_at: datetime
    starred: bool = False


class StrategyExecutionConfirmation(BaseModel):
    confirm_live: bool = False


NIFTY_100_CSV = "https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv"
NIFTY_50_CSV = "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"
STOCK_WATCHLIST_FILE = Path(__file__).resolve().parents[1] / "data" / "stock_watchlist.json"
STRATEGIES_FILE = Path(__file__).resolve().parents[1] / "data" / "strategies.json"
STRATEGY_EXECUTIONS_FILE = Path(__file__).resolve().parents[1] / "data" / "strategy_executions.json"
STRATEGIES_LOCK = threading.Lock()
STRATEGY_EXECUTIONS_LOCK = threading.Lock()


def load_strategies() -> list[dict[str, Any]]:
    if not STRATEGIES_FILE.exists():
        return []
    try:
        with STRATEGIES_FILE.open(encoding="utf-8") as strategies_file:
            data = json.load(strategies_file)
        if not isinstance(data, list):
            raise ValueError("The strategy file must contain a JSON array.")
        return [StrategyRecord.model_validate(item).model_dump(mode="json") for item in data]
    except (OSError, json.JSONDecodeError, ValidationError, ValueError) as exc:
        logger.error("Could not load strategies at %s: %s", STRATEGIES_FILE, exc)
        raise HTTPException(status_code=500, detail="Could not load the saved strategies.") from exc


def save_strategies(strategies: list[dict[str, Any]]) -> None:
    temporary_file = STRATEGIES_FILE.with_suffix(".json.tmp")
    try:
        STRATEGIES_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary_file.write_text(json.dumps(strategies, indent=2) + "\n", encoding="utf-8")
        temporary_file.replace(STRATEGIES_FILE)
    except OSError as exc:
        logger.error("Could not save strategies at %s: %s", STRATEGIES_FILE, exc)
        raise HTTPException(status_code=500, detail="Could not save the strategies file.") from exc


def load_stock_watchlist() -> list[str]:
    try:
        with STOCK_WATCHLIST_FILE.open(encoding="utf-8") as watchlist_file:
            symbols = json.load(watchlist_file)
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Could not load stock watchlist at %s: %s", STOCK_WATCHLIST_FILE, exc)
        raise HTTPException(status_code=500, detail="Could not load the configured stock watchlist.") from exc

    if (
        not isinstance(symbols, list)
        or not symbols
        or any(not isinstance(symbol, str) or not re.fullmatch(r"[A-Z0-9&._-]{1,32}", symbol) for symbol in symbols)
        or len(symbols) != len(set(symbols))
    ):
        logger.error("Stock watchlist at %s must contain unique uppercase trading symbols.", STOCK_WATCHLIST_FILE)
        raise HTTPException(status_code=500, detail="The configured stock watchlist is invalid.")
    return symbols


def load_nifty_index(url: str) -> list[dict[str, str]]:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
            "Referer": "https://www.niftyindices.com/",
            "Accept": "text/csv,text/plain,*/*",
        },
    )
    try:
        with urlopen(request, timeout=25) as response:
            content = response.read().decode("utf-8-sig")
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Could not load the Nifty 100 constituents from the official Nifty Indices CSV.") from exc

    rows: list[dict[str, str]] = []
    reader = csv.DictReader(io.StringIO(content))
    for row in reader:
        normalized = {str(key or "").strip().lower(): str(value or "").strip() for key, value in row.items()}
        symbol = normalized.get("symbol", "")
        company = normalized.get("company name") or normalized.get("company") or normalized.get("name") or symbol
        if symbol:
            rows.append({"symbol": symbol, "company": company})
    if not rows:
        raise HTTPException(status_code=502, detail="The official Nifty 100 CSV did not contain any recognizable stock symbols.")
    return rows


def load_nifty_100() -> list[dict[str, str]]:
    return load_nifty_index(NIFTY_100_CSV)


def load_nifty_50_symbols() -> set[str]:
    try:
        return {row["symbol"] for row in load_nifty_index(NIFTY_50_CSV)}
    except HTTPException:
        # Nifty flags are supplemental metadata; the requested Nifty 100 scan
        # remains available if the Nifty 50 list is temporarily unavailable.
        return set()


def sma_crossovers(
    candles: list[dict[str, Any]], short_period: int, long_period: int, cutoff: date
) -> dict[str, Any] | None:
    closes = [float(candle["close"]) for candle in candles]
    recent: dict[str, Any] | None = None
    for index in range(long_period, len(closes)):
        short_now = sum(closes[index - short_period + 1 : index + 1]) / short_period
        long_now = sum(closes[index - long_period + 1 : index + 1]) / long_period
        short_before = sum(closes[index - short_period : index]) / short_period
        long_before = sum(closes[index - long_period : index]) / long_period
        bullish = short_before <= long_before and short_now > long_now
        bearish = short_before >= long_before and short_now < long_now
        if not (bullish or bearish):
            continue
        timestamp = candles[index]["date"]
        crossover_day = timestamp.date() if isinstance(timestamp, datetime) else timestamp
        if crossover_day < cutoff:
            continue
        recent = {
            "crossover_type": "Bullish" if bullish else "Bearish",
            "crossover_date": crossover_day.isoformat(),
            "close": round(closes[index], 2),
            "short_sma_value": round(short_now, 2),
            "long_sma_value": round(long_now, 2),
        }
    return recent


def token_path() -> Path:
    return Path(os.getenv("KITE_TOKEN_FILE", str(settings.token_file)))


def read_session() -> dict[str, Any] | None:
    path = token_path()
    try:
        session = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(session, dict) or not session.get("access_token") or not session.get("api_key"):
            return None
        return session
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None


def write_session(session: dict[str, Any]) -> None:
    path = token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(session), encoding="utf-8")
    try:
        temporary_path.chmod(0o600)
    except OSError:
        pass  # Windows does not support POSIX file modes.
    temporary_path.replace(path)


def clear_session() -> None:
    try:
        token_path().unlink()
    except FileNotFoundError:
        pass


def kite_client(session: dict[str, Any]) -> KiteConnect:
    client = KiteConnect(api_key=session["api_key"])
    client.set_access_token(session["access_token"])
    return client


def public_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """Return only the fields the UI needs; omit all credentials and tokens."""
    return {
        "user_name": profile.get("user_name", ""),
        "user_id": profile.get("user_id", ""),
        "products": profile.get("products", []),
        "exchanges": profile.get("exchanges", []),
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/session")
def session_status() -> dict[str, Any]:
    """Check the saved local token without ever sending it to the caller."""
    session = read_session()
    if not session:
        return {"authenticated": False}
    try:
        profile = kite_client(session).profile()
        return {"authenticated": True, "profile": public_profile(profile)}
    except Exception:
        # An expired/revoked token must not be treated as a valid session.
        clear_session()
        return {"authenticated": False}


@app.post("/api/login")
def login(credentials: LoginRequest) -> dict[str, Any]:
    """Exchange the short-lived request token on the backend only."""
    if settings.kite_api_key and credentials.api_key != settings.kite_api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="API key does not match the backend configuration.")
    kite = KiteConnect(api_key=credentials.api_key)
    try:
        data = kite.generate_session(
            credentials.request_token,
            api_secret=credentials.api_secret.get_secret_value(),
        )
        access_token = data.get("access_token")
        if not access_token:
            raise ValueError("Kite did not return an access token.")
        kite.set_access_token(access_token)
        profile = kite.profile()
    except Exception as exc:
        # Do not echo Kite's raw exception: it may contain request/credential data.
        raise HTTPException(status_code=400, detail="Kite login failed. Verify your API key, API secret, and unused request token, then try again.") from exc

    write_session({"api_key": credentials.api_key, "access_token": access_token})
    return {"authenticated": True, "profile": public_profile(profile)}


@app.get("/api/profile")
def profile() -> dict[str, Any]:
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    try:
        return public_profile(kite_client(session).profile())
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Kite session has expired. Please log in again.") from exc


@app.post("/api/logout")
def logout() -> dict[str, bool]:
    clear_session()
    return {"authenticated": False}


@app.get("/api/strategies")
def get_strategies() -> dict[str, list[dict[str, Any]]]:
    with STRATEGIES_LOCK:
        strategies = load_strategies()
    strategies.sort(key=lambda strategy: strategy["created_at"], reverse=True)
    return {"strategies": strategies}


@app.post("/api/strategies")
def create_strategy(payload: StrategyPayload) -> dict[str, Any]:
    strategy = StrategyRecord(
        **payload.model_dump(),
        id=uuid4().hex,
        created_at=datetime.now().astimezone(),
        starred=False,
    ).model_dump(mode="json")
    with STRATEGIES_LOCK:
        strategies = load_strategies()
        strategies.append(strategy)
        save_strategies(strategies)
    return {"strategy": strategy}


@app.put("/api/strategies/{strategy_id}")
def update_strategy(strategy_id: str, payload: StrategyPayload) -> dict[str, Any]:
    with STRATEGIES_LOCK:
        strategies = load_strategies()
        for index, saved_strategy in enumerate(strategies):
            if saved_strategy["id"] == strategy_id:
                strategy = StrategyRecord(
                    **payload.model_dump(),
                    id=strategy_id,
                    created_at=saved_strategy["created_at"],
                    starred=saved_strategy["starred"],
                ).model_dump(mode="json")
                strategies[index] = strategy
                save_strategies(strategies)
                return {"strategy": strategy}
    raise HTTPException(status_code=404, detail="Strategy not found.")


@app.delete("/api/strategies/{strategy_id}", status_code=204)
def delete_strategy(strategy_id: str) -> Response:
    with STRATEGY_EXECUTIONS_LOCK:
        with STRATEGIES_LOCK:
            strategies = load_strategies()
            strategy = next((item for item in strategies if item["id"] == strategy_id), None)
        if strategy is None:
            raise HTTPException(status_code=404, detail="Strategy not found.")

        records = _load_strategy_executions()
        if records.get(strategy_id):
            session = read_session()
            if not session:
                raise HTTPException(status_code=401, detail="Connect to Kite to verify this strategy has no open tracked positions before deleting it.")
            if _strategy_exit_plan(strategy_id, kite_client(session)):
                raise HTTPException(status_code=409, detail="Exit this strategy's tracked live positions before deleting it.")
            records.pop(strategy_id, None)
            _save_strategy_executions(records)

        with STRATEGIES_LOCK:
            strategies = load_strategies()
            remaining = [item for item in strategies if item["id"] != strategy_id]
            if len(remaining) == len(strategies):
                raise HTTPException(status_code=404, detail="Strategy not found.")
            save_strategies(remaining)
    return Response(status_code=204)


@app.post("/api/strategies/{strategy_id}/star")
def toggle_strategy_star(strategy_id: str) -> dict[str, Any]:
    with STRATEGIES_LOCK:
        strategies = load_strategies()
        for index, saved_strategy in enumerate(strategies):
            if saved_strategy["id"] == strategy_id:
                strategy = {**saved_strategy, "starred": not saved_strategy["starred"]}
                strategies[index] = strategy
                save_strategies(strategies)
                return {"strategy": strategy}
    raise HTTPException(status_code=404, detail="Strategy not found.")


def _find_strategy(strategy_id: str) -> dict[str, Any]:
    with STRATEGIES_LOCK:
        strategy = next((item for item in load_strategies() if item["id"] == strategy_id), None)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found.")
    return strategy


def _load_strategy_executions() -> dict[str, list[dict[str, Any]]]:
    if not STRATEGY_EXECUTIONS_FILE.exists():
        return {}
    try:
        data = json.loads(STRATEGY_EXECUTIONS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or any(not isinstance(rows, list) for rows in data.values()):
            raise ValueError("Strategy execution file must contain a JSON object of order lists.")
        return data
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        logger.error("Could not load strategy execution records at %s: %s", STRATEGY_EXECUTIONS_FILE, exc)
        raise HTTPException(status_code=500, detail="Could not load the strategy execution records.") from exc


def _save_strategy_executions(records: dict[str, list[dict[str, Any]]]) -> None:
    temporary_file = STRATEGY_EXECUTIONS_FILE.with_suffix(".json.tmp")
    try:
        STRATEGY_EXECUTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary_file.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
        temporary_file.replace(STRATEGY_EXECUTIONS_FILE)
    except OSError as exc:
        logger.error("Could not save strategy execution records at %s: %s", STRATEGY_EXECUTIONS_FILE, exc)
        raise HTTPException(status_code=500, detail="Could not save the strategy execution records.") from exc


def _kite_expiry(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _market_quote(kite: KiteConnect, exchange: str, symbol: str) -> float:
    key = f"{exchange}:{symbol}"
    try:
        quote = kite.ltp(key).get(key)
        last_price = quote.get("last_price") if quote else None
        if last_price is None or float(last_price) <= 0:
            raise ValueError("Missing last traded price.")
        return float(last_price)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not retrieve the current price for {key}; no order was placed.") from exc


def _resolve_strategy_order_plan(strategy: dict[str, Any], kite: KiteConnect) -> list[dict[str, Any]]:
    """Resolve saved strategy sections to market orders without submitting them."""
    today = date.today()
    plan: list[dict[str, Any]] = []
    instruments_by_exchange: dict[str, list[dict[str, Any]]] = {}
    for index, section in enumerate(strategy["sections"], start=1):
        if section["segment"] == "Share":
            symbol = (section.get("symbol") or "").strip().upper()
            if not symbol:
                raise HTTPException(status_code=422, detail=f"Section {index} needs an NSE symbol before it can be traded.")
            try:
                if "NSE" not in instruments_by_exchange:
                    instruments_by_exchange["NSE"] = kite.instruments("NSE")
                instruments = instruments_by_exchange["NSE"]
                instrument = next((item for item in instruments if item.get("tradingsymbol") == symbol and item.get("instrument_type") == "EQ"), None)
            except Exception as exc:
                raise HTTPException(status_code=502, detail="Could not load NSE instruments; no order was placed.") from exc
            if instrument is None:
                raise HTTPException(status_code=422, detail=f"{symbol} is not an available NSE equity instrument.")
            exchange = "NSE"
            quantity = int(section["lot_quantity"])
            last_price = _market_quote(kite, exchange, symbol)
            order_product = "CNC" if strategy.get("product", "MIS") == "NRML" else "MIS"
        else:
            market = strategy["category"].upper()
            if market not in {"NIFTY", "SENSEX"}:
                raise HTTPException(status_code=422, detail=f"{market} is not supported for live options orders.")
            exchange = "NFO" if market == "NIFTY" else "BFO"
            try:
                if exchange not in instruments_by_exchange:
                    instruments_by_exchange[exchange] = kite.instruments(exchange)
                instruments = instruments_by_exchange[exchange]
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Could not load {exchange} option instruments; no order was placed.") from exc
            options = [
                item for item in instruments
                if item.get("name") == market
                and item.get("instrument_type") == section["option_type"]
                and _kite_expiry(item.get("expiry")) is not None
                and _kite_expiry(item.get("expiry")) >= today
            ]
            expiries = sorted({_kite_expiry(item.get("expiry")) for item in options})
            if not expiries:
                raise HTTPException(status_code=422, detail=f"No active {market} {section['option_type']} contracts are available.")
            if section["week"] == "Next week":
                expiry_index = 1
                if len(expiries) <= expiry_index:
                    raise HTTPException(status_code=422, detail=f"No next-week {market} expiry is available.")
                expiry = expiries[expiry_index]
            elif section["week"] == "Monthly":
                nearest = expiries[0]
                same_month = [value for value in expiries if value.year == nearest.year and value.month == nearest.month]
                expiry = same_month[-1]
            else:
                expiry = expiries[0]
            contracts = [item for item in options if _kite_expiry(item.get("expiry")) == expiry]
            if section.get("premium_price") is not None:
                quote_keys = [f"{exchange}:{item['tradingsymbol']}" for item in contracts]
                quote_prices: dict[str, float] = {}
                try:
                    for offset in range(0, len(quote_keys), 500):
                        quote_prices.update(kite.ltp(*quote_keys[offset:offset + 500]))
                except Exception as exc:
                    raise HTTPException(status_code=502, detail="Could not load option prices for premium matching; no order was placed.") from exc
                priced = [
                    (item, quote_prices.get(f"{exchange}:{item['tradingsymbol']}", {}).get("last_price"))
                    for item in contracts
                ]
                priced = [(item, float(price)) for item, price in priced if price is not None and float(price) > 0]
                if not priced:
                    raise HTTPException(status_code=502, detail="No option prices were available for premium matching; no order was placed.")
                instrument, last_price = min(priced, key=lambda pair: abs(pair[1] - float(section["premium_price"])))
            else:
                spot_exchange = "NSE" if market == "NIFTY" else "BSE"
                spot_symbol = "NIFTY 50" if market == "NIFTY" else "SENSEX"
                spot_price = _market_quote(kite, spot_exchange, spot_symbol)
                strikes = sorted({float(item["strike"]) for item in contracts})
                if not strikes:
                    raise HTTPException(status_code=422, detail=f"No strikes are available for {market} expiry {expiry.isoformat()}.")
                atm_index = min(range(len(strikes)), key=lambda strike_index: abs(strikes[strike_index] - spot_price))
                reference = section["strike_price"]
                offset = int(reference.rsplit(" ", 1)[1]) if reference.startswith(("OTM ", "ITM ")) else 0
                is_otm = reference.startswith("OTM ")
                higher_strike = (section["option_type"] == "CE") == is_otm
                strike_index = atm_index + offset if higher_strike else atm_index - offset
                if strike_index < 0 or strike_index >= len(strikes):
                    raise HTTPException(status_code=422, detail=f"{reference} strike is unavailable for {market} {section['option_type']}.")
                strike = strikes[strike_index]
                instrument = next(item for item in contracts if float(item["strike"]) == strike)
                last_price = _market_quote(kite, exchange, instrument["tradingsymbol"])
            symbol = instrument["tradingsymbol"]
            lot_size = int(instrument.get("lot_size") or 0)
            if lot_size <= 0:
                raise HTTPException(status_code=502, detail=f"Kite did not provide a valid lot size for {symbol}; no order was placed.")
            quantity = int(section["lot_quantity"]) * lot_size
            order_product = strategy.get("product", "MIS")
        if quantity > 100000:
            raise HTTPException(status_code=422, detail=f"Section {index} quantity exceeds the 100,000-unit order limit.")
        plan.append({
            "section": index,
            "tradingsymbol": symbol,
            "exchange": exchange,
            "transaction_type": section["action"],
            "quantity": quantity,
            "product": order_product,
            "last_price": round(float(last_price), 2),
            "order_type": "MARKET",
        })
    return plan


def _execution_tag(strategy_id: str) -> str:
    return f"NS{strategy_id[:8]}{uuid4().hex[:10]}"[:20]


def _capture_order_fill(kite: KiteConnect, order_record: dict[str, Any], order_id: str) -> None:
    try:
        history = kite.order_history(order_id)
    except Exception as exc:
        logger.warning("Could not immediately verify Kite order fill %s: %s", order_id, type(exc).__name__)
        return
    if not history:
        return
    latest = history[-1]
    kite_status = str(latest.get("status", "")).upper()
    order_record["kite_status"] = kite_status
    order_record["filled_quantity"] = int(latest.get("filled_quantity") or latest.get("executed_quantity", 0) or 0)
    order_record["fill_status_verified"] = kite_status in {"COMPLETE", "CANCELLED", "REJECTED"}


@app.post("/api/strategies/{strategy_id}/preview")
def preview_strategy(strategy_id: str) -> dict[str, Any]:
    strategy = _find_strategy(strategy_id)
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    plan = _resolve_strategy_order_plan(strategy, kite_client(session))
    return {
        "strategy_id": strategy_id,
        "product": strategy.get("product", "MIS"),
        "orders": plan,
        "notice": "Market prices are indicative and can change before execution. Stop-loss percentages are not submitted as orders.",
    }


@app.post("/api/strategies/{strategy_id}/run")
def run_strategy(strategy_id: str, confirmation: StrategyExecutionConfirmation) -> dict[str, Any]:
    if not confirmation.confirm_live:
        raise HTTPException(status_code=400, detail="Live strategy confirmation is required.")
    strategy = _find_strategy(strategy_id)
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    kite = kite_client(session)
    plan = _resolve_strategy_order_plan(strategy, kite)
    submitted: list[dict[str, Any]] = []
    with STRATEGY_EXECUTIONS_LOCK:
        records = _load_strategy_executions()
        executions = records.setdefault(strategy_id, [])
        for order in plan:
            order_record = {
                **order,
                "role": "entry",
                "tag": _execution_tag(strategy_id),
                "status": "submitting",
                "order_id": None,
            }
            executions.append(order_record)
            _save_strategy_executions(records)
            try:
                order_id = kite.place_order(
                    variety=kite.VARIETY_REGULAR,
                    tradingsymbol=order["tradingsymbol"],
                    exchange=order["exchange"],
                    transaction_type=order["transaction_type"],
                    quantity=order["quantity"],
                    order_type=kite.ORDER_TYPE_MARKET,
                    market_protection=-1,
                    product=kite.PRODUCT_MIS if order["product"] == "MIS" else kite.PRODUCT_NRML,
                    validity=kite.VALIDITY_DAY,
                    tag=order_record["tag"],
                )
            except Exception as exc:
                order_record["status"] = "unknown"
                _save_strategy_executions(records)
                logger.error("Kite strategy order submission failed for %s:%s: %s", order["exchange"], order["tradingsymbol"], type(exc).__name__)
                raise HTTPException(status_code=502, detail="Kite did not confirm every order. Check the Kite order book before retrying; completed orders remain tracked for Exit strategy.") from exc
            order_record["order_id"] = str(order_id)
            order_record["status"] = "submitted"
            _capture_order_fill(kite, order_record, str(order_id))
            _save_strategy_executions(records)
            submitted.append({**order, "order_id": str(order_id)})
    return {"submitted": submitted, "product": strategy.get("product", "MIS")}


def _strategy_exit_plan(strategy_id: str, kite: KiteConnect) -> list[dict[str, Any]]:
    records = _load_strategy_executions().get(strategy_id, [])
    if not records:
        raise HTTPException(status_code=409, detail="This strategy has no tracked live orders to exit.")
    try:
        order_book = kite.orders() or []
        positions = (kite.positions() or {}).get("net") or []
        holdings = kite.holdings() or []
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not verify strategy orders and current positions; no exit order was placed.") from exc
    positions = list(positions)
    for holding in holdings:
        held_quantity = int(holding.get("quantity", 0) or 0) + int(holding.get("t1_quantity", 0) or 0)
        if held_quantity:
            positions.append({
                "exchange": holding.get("exchange", "NSE"),
                "tradingsymbol": holding.get("tradingsymbol"),
                "product": "CNC",
                "quantity": held_quantity,
            })
    signed_quantities: dict[tuple[str, str, str], int] = {}
    for order in records:
        matching_orders = [item for item in order_book if item.get("tag") == order["tag"]]
        if not matching_orders and order.get("order_id"):
            try:
                matching_orders = kite.order_history(order["order_id"])
            except Exception as exc:
                if order.get("fill_status_verified"):
                    matching_orders = [{
                        "status": order.get("kite_status"),
                        "filled_quantity": order.get("filled_quantity", 0),
                        "order_id": order["order_id"],
                    }]
                else:
                    raise HTTPException(status_code=502, detail="Could not verify a tracked order's fill history; no exit order was placed.") from exc
        if not matching_orders and order.get("fill_status_verified"):
            matching_orders = [{
                "status": order.get("kite_status"),
                "filled_quantity": order.get("filled_quantity", 0),
                "order_id": order.get("order_id"),
            }]
        if not matching_orders and order["status"] in {"submitting", "unknown"}:
            raise HTTPException(status_code=409, detail="A prior submission has an unknown status. Check Kite's order book before exiting or running again.")
        if not matching_orders:
            raise HTTPException(status_code=502, detail="Could not verify a tracked order's fill history; no exit order was placed.")
        latest = matching_orders[-1]
        latest_status = str(latest.get("status", "")).upper()
        if latest_status not in {"COMPLETE", "CANCELLED", "REJECTED"}:
            raise HTTPException(status_code=409, detail="A strategy order is still active. Wait for it to complete or cancel it in Kite before exiting.")
        if not order.get("order_id") and latest.get("order_id"):
            order["order_id"] = str(latest["order_id"])
            order["status"] = "submitted"
        quantity = int(latest.get("filled_quantity") or latest.get("executed_quantity", 0) or 0)
        order["kite_status"] = latest_status
        order["filled_quantity"] = quantity
        order["fill_status_verified"] = order["kite_status"] in {"COMPLETE", "CANCELLED", "REJECTED"}
        key = (order["exchange"], order["tradingsymbol"], order["product"])
        signed_quantities[key] = signed_quantities.get(key, 0) + quantity * (1 if order["transaction_type"] == "BUY" else -1)
    _save_strategy_executions({**_load_strategy_executions(), strategy_id: records})
    plan = []
    for (exchange, symbol, product), signed_quantity in signed_quantities.items():
        if signed_quantity == 0:
            continue
        position = next(
            (item for item in positions if item.get("exchange") == exchange and item.get("tradingsymbol") == symbol and item.get("product") == product),
            None,
        )
        current_quantity = int((position or {}).get("quantity", 0) or 0)
        if not (product == "CNC" and signed_quantity < 0) and (
            current_quantity == 0
            or (current_quantity > 0) != (signed_quantity > 0)
            or abs(current_quantity) < abs(signed_quantity)
        ):
            raise HTTPException(status_code=409, detail=f"Current {exchange}:{symbol} position does not safely cover this strategy's tracked quantity.")
        plan.append({
            "tradingsymbol": symbol,
            "exchange": exchange,
            "transaction_type": "SELL" if signed_quantity > 0 else "BUY",
            "quantity": abs(signed_quantity),
            "product": product,
            "last_price": None,
            "order_type": "MARKET",
        })
    return plan


@app.post("/api/strategies/{strategy_id}/exit-preview")
def preview_strategy_exit(strategy_id: str) -> dict[str, Any]:
    _find_strategy(strategy_id)
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    with STRATEGY_EXECUTIONS_LOCK:
        plan = _strategy_exit_plan(strategy_id, kite_client(session))
    return {"orders": plan, "notice": "Only this strategy's verified filled quantity will be sent as market exit orders."}


@app.post("/api/strategies/{strategy_id}/exit")
def exit_strategy(strategy_id: str, confirmation: StrategyExecutionConfirmation) -> dict[str, Any]:
    if not confirmation.confirm_live:
        raise HTTPException(status_code=400, detail="Live exit confirmation is required.")
    _find_strategy(strategy_id)
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    kite = kite_client(session)
    with STRATEGY_EXECUTIONS_LOCK:
        plan = _strategy_exit_plan(strategy_id, kite)
        records = _load_strategy_executions()
        executions = records.setdefault(strategy_id, [])
        submitted = []
        for order in plan:
            order_record = {
                **order,
                "role": "exit",
                "tag": _execution_tag(strategy_id),
                "status": "submitting",
                "order_id": None,
            }
            executions.append(order_record)
            _save_strategy_executions(records)
            try:
                order_id = kite.place_order(
                    variety=kite.VARIETY_REGULAR,
                    tradingsymbol=order["tradingsymbol"],
                    exchange=order["exchange"],
                    transaction_type=order["transaction_type"],
                    quantity=order["quantity"],
                    order_type=kite.ORDER_TYPE_MARKET,
                    market_protection=-1,
                    product=kite.PRODUCT_MIS if order["product"] == "MIS" else kite.PRODUCT_NRML,
                    validity=kite.VALIDITY_DAY,
                    tag=order_record["tag"],
                )
            except Exception as exc:
                order_record["status"] = "unknown"
                _save_strategy_executions(records)
                logger.error("Kite strategy exit submission failed for %s:%s: %s", order["exchange"], order["tradingsymbol"], type(exc).__name__)
                raise HTTPException(status_code=502, detail="Kite did not confirm every exit order. Check the Kite order book before retrying.") from exc
            order_record["order_id"] = str(order_id)
            order_record["status"] = "submitted"
            _capture_order_fill(kite, order_record, str(order_id))
            _save_strategy_executions(records)
            submitted.append({**order, "order_id": str(order_id)})
    return {"submitted": submitted}


@app.get("/api/stock-instruments")
def stock_instruments() -> dict[str, list[dict[str, str]]]:
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    return {"instruments": [{"symbol": symbol} for symbol in load_stock_watchlist()]}


@app.post("/api/stock-orders")
def place_stock_order(request: StockOrderRequest) -> dict[str, Any]:
    if not request.confirm_live:
        raise HTTPException(status_code=400, detail="Live order confirmation is required.")
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    kite = kite_client(session)
    symbol = request.symbol.upper()
    valid_symbols = set(load_stock_watchlist())
    if symbol not in valid_symbols:
        raise HTTPException(status_code=422, detail=f"{symbol} is not in the configured stock watchlist.")
    try:
        order_id = kite.place_order(
            variety=kite.VARIETY_REGULAR,
            tradingsymbol=symbol,
            exchange=kite.EXCHANGE_NSE,
            transaction_type=request.transaction_type,
            quantity=request.quantity,
            order_type=kite.ORDER_TYPE_MARKET,
            market_protection=-1,
            product=kite.PRODUCT_CNC if request.product == "CNC" else kite.PRODUCT_MIS,
            validity=kite.VALIDITY_DAY,
        )
    except Exception as exc:
        error_message = str(exc)
        for secret_key in ("api_key", "access_token"):
            secret = session.get(secret_key)
            if secret:
                error_message = error_message.replace(secret, "[REDACTED]")
        logger.error(
            "Kite order submission failed for NSE:%s %s quantity %s: %s: %s",
            symbol,
            request.transaction_type,
            request.quantity,
            type(exc).__name__,
            error_message,
        )
        raise HTTPException(
            status_code=502,
            detail="Kite did not confirm the order request. Check your Kite order book before retrying.",
        ) from exc
    return {
        "submitted": True,
        "order_id": str(order_id),
        "tradingsymbol": symbol,
        "exchange": "NSE",
        "transaction_type": request.transaction_type,
        "quantity": request.quantity,
        "order_type": "MARKET",
        "market_protection": -1,
        "product": request.product,
        "validity": "DAY",
    }


@app.post("/api/signals")
def generate_signals(options: SignalsRequest) -> dict[str, Any]:
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")

    kite = kite_client(session)
    try:
        constituents = load_nifty_100()
        instruments = kite.instruments("NSE")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not load Kite's NSE instrument list. Check that your Kite session is active.") from exc

    by_symbol = {
        item["tradingsymbol"]: item
        for item in instruments
        if item.get("exchange") == "NSE" and item.get("instrument_type") == "EQ"
    }
    today = date.today()
    cutoff = today - timedelta(days=options.lookback_days)
    warmup_days = math.ceil((options.long_sma + 2) * 7 / 5) + 3
    start = cutoff - timedelta(days=warmup_days)
    start_text = start.isoformat()
    end_text = today.isoformat()
    results: list[dict[str, Any]] = []
    missing_tokens = 0
    failed_history = 0
    requested = 0

    for stock in constituents:
        instrument = by_symbol.get(stock["symbol"])
        if not instrument:
            missing_tokens += 1
            continue
        if requested:
            # Kite documents a 3 requests/second limit for historical candles.
            time.sleep(0.36)
        requested += 1
        try:
            candles = kite.historical_data(
                instrument["instrument_token"], start_text, end_text, "day"
            )
        except Exception:
            failed_history += 1
            continue
        crossover = sma_crossovers(candles, options.short_sma, options.long_sma, cutoff)
        if crossover:
            results.append(
                {
                    "ticker": stock["symbol"],
                    "company": stock["company"],
                    **crossover,
                }
            )

    results.sort(key=lambda item: (item["crossover_date"], item["ticker"]), reverse=True)
    results = results[: options.max_stocks]
    for rank, item in enumerate(results, start=1):
        item["rank"] = rank

    return {
        "signals": results,
        "short_sma": options.short_sma,
        "long_sma": options.long_sma,
        "lookback_days": options.lookback_days,
        "max_stocks": options.max_stocks,
        "scanned": requested,
        "missing_tokens": missing_tokens,
        "failed_history": failed_history,
        "as_of": today.isoformat(),
        "source": "Nifty Indices Nifty 100 constituents and Kite Connect daily candles",
    }


def scanner_cache_path() -> Path:
    return token_path().parent / "scanner-data.json"


def load_scanner_cache() -> dict[str, Any] | None:
    try:
        cached = json.loads(scanner_cache_path().read_text(encoding="utf-8"))
        if cached.get("metadata", {}).get("cache_date") == date.today().isoformat():
            return cached
    except (OSError, json.JSONDecodeError, AttributeError):
        pass
    return None


@app.get("/api/scanner-data")
def scanner_data(refresh: bool = Query(default=False)) -> dict[str, Any]:
    """Load the daily Nifty 100 candle cache, rebuilding it at most once per day."""
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    if not refresh:
        cached = load_scanner_cache()
        if cached:
            return cached

    with SCANNER_CACHE_LOCK:
        if not refresh:
            cached = load_scanner_cache()
            if cached:
                return cached
        return build_scanner_data(session)


SCANNER_CACHE_LOCK = threading.Lock()


def build_scanner_data(session: dict[str, Any]) -> dict[str, Any]:
    kite = kite_client(session)
    try:
        constituents = load_nifty_100()
        nifty50 = load_nifty_50_symbols()
        instruments = kite.instruments("NSE")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not load Nifty constituents or Kite's NSE instrument list.") from exc

    by_symbol = {
        item["tradingsymbol"]: item
        for item in instruments
        if item.get("exchange") == "NSE" and item.get("instrument_type") == "EQ"
    }
    today = date.today()
    start = today - timedelta(days=120)
    stocks: list[dict[str, Any]] = []
    missing_instruments = 0
    history_errors = 0
    requested = 0
    for company in constituents:
        instrument = by_symbol.get(company["symbol"])
        if not instrument:
            missing_instruments += 1
            continue
        if requested:
            time.sleep(0.36)
        requested += 1
        try:
            raw_candles = kite.historical_data(
                instrument["instrument_token"], start.isoformat(), today.isoformat(), "day"
            )
        except Exception:
            history_errors += 1
            continue
        candles = [
            {
                "date": candle["date"].date().isoformat()
                if isinstance(candle["date"], datetime)
                else candle["date"].isoformat(),
                "open": float(candle["open"]),
                "high": float(candle["high"]),
                "low": float(candle["low"]),
                "close": float(candle["close"]),
                "volume": int(candle["volume"]),
            }
            for candle in raw_candles
        ]
        stocks.append(
            {
                "symbol": company["symbol"],
                "company_name": company["company"],
                "instrument_token": int(instrument["instrument_token"]),
                "nifty50": company["symbol"] in nifty50,
                "nifty100": True,
                "nifty_flags": {
                    "nifty50": company["symbol"] in nifty50,
                    "nifty100": True,
                },
                "candles": candles,
            }
        )

    if not stocks or (history_errors and history_errors >= requested):
        raise HTTPException(status_code=502, detail="Kite did not return daily candles for the Nifty 100. Confirm your session and historical data access, then try again.")

    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    data = {
        "metadata": {
            "index": "Nifty 100",
            "source": NIFTY_100_CSV,
            "interval": "day",
            "generated_at": generated_at,
            "cache_date": today.isoformat(),
            "stocks_scanned": len(stocks),
            "missing_instruments": missing_instruments,
            "history_errors": history_errors,
        },
        "stocks": stocks,
    }
    path = scanner_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(data), encoding="utf-8")
    temporary_path.replace(path)
    return data

@app.get("/api/scanner-ohlc")
def scanner_ohlc(symbols: str = Query(min_length=1, max_length=4000)) -> dict[str, Any]:
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    requested_symbols = list(dict.fromkeys(value.strip().upper() for value in symbols.split(",") if value.strip()))
    if not requested_symbols or len(requested_symbols) > 100 or any(not value.replace("&", "").replace("-", "").isalnum() for value in requested_symbols):
        raise HTTPException(status_code=422, detail="Provide up to 100 valid NSE symbols.")
    try:
        snapshots = kite_client(session).ohlc([f"NSE:{symbol}" for symbol in requested_symbols])
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not load the Kite OHLC price snapshot.") from exc
    return {
        "prices": {
            symbol: snapshot["last_price"]
            for symbol in requested_symbols
            if (snapshot := snapshots.get(f"NSE:{symbol}")) and snapshot.get("last_price") is not None
        }
    }


# This workflow is deliberately local-only. It records simulations and contains
# no Kite order/GTT mutation path. The lock covers account checks plus writes.
GTT_LOCK = threading.RLock()


def dummy_gtt_path() -> Path:
    return token_path().parent / "dummy-gtts.json"


def read_dummy_gtts() -> list[dict[str, Any]]:
    try:
        data = json.loads(dummy_gtt_path().read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def write_dummy_gtts(records: list[dict[str, Any]]) -> None:
    path = dummy_gtt_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(records, indent=2), encoding="utf-8")
    temporary.replace(path)


def _round_to_tick(value: float | None, tick: float) -> float | None:
    if value is None or not math.isfinite(float(value)) or tick <= 0:
        return None
    amount, step = Decimal(str(value)), Decimal(str(tick))
    return float((amount / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step)


def _today_order(order: dict[str, Any]) -> bool:
    timestamp = order.get("order_timestamp") or order.get("exchange_timestamp") or order.get("created")
    if isinstance(timestamp, datetime):
        return timestamp.date() == date.today()
    if isinstance(timestamp, str):
        try:
            return datetime.fromisoformat(timestamp.replace("Z", "+00:00")).date() == date.today()
        except ValueError:
            return False
    return False


def _gtt_legs(gtt: dict[str, Any]) -> list[dict[str, Any]]:
    legs = gtt.get("orders") or gtt.get("legs") or []
    if isinstance(legs, dict):
        legs = [legs]
    return [leg for leg in legs if isinstance(leg, dict)]


def _account_rows(kite: KiteConnect) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, float]]:
    try:
        gtts = kite.get_gtts() or []
        orders = kite.orders() or []
        positions = kite.positions() or {}
        holdings = kite.holdings() or []
        instruments = kite.instruments("NSE") or []
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not read Kite orders, GTTs, positions, holdings, and NSE tick sizes.") from exc
    day = positions.get("day", []) if isinstance(positions, dict) else []
    net = positions.get("net", []) if isinstance(positions, dict) else []
    position_source = net if net else day
    position_rows = [row for row in position_source if isinstance(row, dict)]
    ticks = {
        str(item.get("tradingsymbol", "")).upper(): float(item.get("tick_size", 0))
        for item in instruments if item.get("exchange") == "NSE" and item.get("tradingsymbol") and item.get("tick_size")
    }
    return gtts, orders, position_rows, holdings, ticks


def _candidate_state(candidate: GttCandidate, gtts: list[dict[str, Any]], orders: list[dict[str, Any]], positions: list[dict[str, Any]], holdings: list[dict[str, Any]], ticks: dict[str, float], dummy: list[dict[str, Any]]) -> dict[str, Any]:
    symbol = candidate.symbol.strip().upper()
    tick = ticks.get(symbol)
    buy = _round_to_tick(candidate.buy_price, tick) if tick else None
    stop = _round_to_tick(buy * 0.95, tick) if buy is not None and tick else None
    if candidate.buy_price is None or candidate.buy_price <= 0:
        status_value, message = "not_available", "Buy price is not available for this row."
    elif not tick or not buy or buy <= 0 or stop is None or stop <= 0:
        status_value, message = "invalid", "Trigger price should be a multiple of tick size."
    elif candidate.last_price is None or candidate.last_price <= 0:
        status_value, message = "waiting_for_ltp", "Waiting for LTP."
    else:
        status_value, message = "ready", "Ready for buy GTT placement."

    result: dict[str, Any] = {
        "symbol": symbol, "quantity": 1, "buy_price": buy, "stoploss": stop, "tick_size": tick,
        "last_price": candidate.last_price, "account_state": "clear", "position_quantity": 0,
        "active_buy_trigger_id": None, "active_stoploss_trigger_id": None,
        "day_buy_order_id": None, "day_buy_order_status": None, "buy_status": status_value,
        "buy_trigger_id": None, "stoploss_status": "planned_after_buy", "stoploss_trigger_id": None,
        "message": message,
    }
    if status_value == "invalid":
        result["account_state"] = "invalid"
        return result
    active_dummies = [record for record in dummy if record.get("symbol", "").upper() == symbol and record.get("active", True)]
    matching_dummy = next((record for record in active_dummies if buy is not None and record.get("buy_price") == buy), None)
    if active_dummies:
        record = matching_dummy or active_dummies[0]
        result.update(account_state="already_active", buy_status="already_active", active_buy_trigger_id=record.get("buy_trigger_id"), buy_trigger_id=record.get("buy_trigger_id"), message="Skipped: dummy buy GTT already active.")
        return result
    for gtt in gtts:
        if str(gtt.get("status", "")).lower() not in {"active", "trigger pending", "pending"}:
            continue
        legs = _gtt_legs(gtt)
        leg = next((item for item in legs if str(item.get("tradingsymbol", "")).upper() == symbol and str(item.get("exchange", "NSE")).upper() == "NSE"), None)
        if not leg:
            continue
        trigger_id = gtt.get("id") or gtt.get("trigger_id")
        side_buy = any(str(item.get("transaction_type", "")).upper() == "BUY" for item in legs)
        if side_buy:
            result.update(account_state="already_active", buy_status="already_active", active_buy_trigger_id=trigger_id, message="Skipped: buy GTT already active.")
            if any(float(value or 0) == float(leg.get("price", -1)) for value in (buy,)):
                result["active_buy_trigger_id"] = trigger_id
            return result
        position = next((p for p in positions if str(p.get("tradingsymbol", "")).upper() == symbol and float(p.get("quantity", 0) or 0) > 0), None)
        holding = next((h for h in holdings if str(h.get("tradingsymbol", "")).upper() == symbol and float(h.get("quantity", 0) or 0) > 0), None)
        if position or holding:
            result["active_stoploss_trigger_id"] = trigger_id
    position_qty = sum(float(row.get("quantity", 0) or 0) for row in positions if str(row.get("tradingsymbol", "")).upper() == symbol)
    holding_qty = sum(float(row.get("quantity", 0) or 0) for row in holdings if str(row.get("tradingsymbol", "")).upper() == symbol)
    result["position_quantity"] = position_qty + holding_qty
    if result["position_quantity"] > 0:
        result.update(account_state="blocked", buy_status="blocked", message=f"Skipped: existing position/holding quantity is {result['position_quantity']:g}.")
        return result
    day_order = next((order for order in orders if _today_order(order) and str(order.get("tradingsymbol", "")).upper() == symbol and str(order.get("exchange", "NSE")).upper() == "NSE" and str(order.get("transaction_type", "")).upper() == "BUY" and str(order.get("product", "")).upper() in {"CNC", "DELIVERY"} and str(order.get("status", "")).upper() not in {"CANCELLED", "REJECTED"}), None)
    if day_order:
        result.update(account_state="blocked", buy_status="blocked", day_buy_order_id=day_order.get("order_id"), day_buy_order_status=day_order.get("status"), message="Skipped: day BUY order already exists.")
    return result


@app.post("/api/algo-orders/gtt-state")
def algo_gtt_state(request: GttStateRequest) -> dict[str, Any]:
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    with GTT_LOCK:
        gtts, orders, positions, holdings, ticks = _account_rows(kite_client(session))
        dummy = read_dummy_gtts()
        return {"orders": [_candidate_state(candidate, gtts, orders, positions, holdings, ticks, dummy) for candidate in request.orders]}


@app.post("/api/algo-orders/live-gtt")
def algo_live_gtt(request: GttPlacementRequest) -> dict[str, Any]:
    if not request.confirm_live:
        raise HTTPException(status_code=400, detail="confirm_live must be true. This endpoint creates simulated records only.")
    session = read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    with GTT_LOCK:
        kite = kite_client(session)
        gtts, orders, positions, holdings, ticks = _account_rows(kite)
        dummy = read_dummy_gtts()
        results: list[dict[str, Any]] = []
        for candidate in request.orders:
            row = _candidate_state(candidate, gtts, orders, positions, holdings, ticks, dummy)
            if row["buy_status"] != "ready":
                results.append(row)
                continue
            trigger_id = f"DUMMY-{row['symbol']}-{len(dummy) + 1:06d}"
            record = {"buy_trigger_id": trigger_id, "symbol": row["symbol"], "quantity": 1, "buy_price": row["buy_price"], "trigger_price": row["buy_price"], "product": "CNC", "exchange": "NSE", "transaction_type": "BUY", "order_type": "LIMIT", "active": True, "created_at": datetime.now().astimezone().isoformat(timespec="seconds"), "simulated": True}
            try:
                dummy.append(record)
                write_dummy_gtts(dummy)
                row.update(buy_status="success", buy_trigger_id=trigger_id, active_buy_trigger_id=trigger_id, message="Dummy buy GTT created. No order sent to Kite. Stoploss planned after buy execution.")
            except Exception as exc:
                dummy = read_dummy_gtts()
                row.update(buy_status="failed", message=f"Unable to create dummy GTT record: {exc}")
            results.append(row)
        return {"orders": results}


@app.websocket("/ws/ticks")
async def live_ticks(websocket: WebSocket, tokens: str = "", mode: str = "full") -> None:
    session = read_session()
    token_ids: list[int] = []
    try:
        token_ids = list(dict.fromkeys(int(value) for value in tokens.split(",") if value.strip()))
    except ValueError:
        await websocket.close(code=4400, reason="Invalid instrument tokens")
        return
    if not session:
        await websocket.close(code=4401, reason="Kite session required")
        return
    if not token_ids or len(token_ids) > 100 or mode != "full":
        await websocket.close(code=4400, reason="Provide up to 100 tokens and mode=full")
        return

    await websocket.accept()
    loop = asyncio.get_running_loop()
    messages: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def publish(message: dict[str, Any]) -> None:
        if not loop.is_closed():
            asyncio.run_coroutine_threadsafe(messages.put(message), loop)

    ticker = KiteTicker(session["api_key"], session["access_token"])

    def on_connect(connection: Any, response: Any) -> None:
        connection.subscribe(token_ids)
        connection.set_mode(connection.MODE_FULL, token_ids)
        publish({"type": "status", "status": "connected"})

    def on_ticks(connection: Any, ticks: list[dict[str, Any]]) -> None:
        publish(
            {
                "type": "ticks",
                "ticks": [
                    {"instrument_token": tick["instrument_token"], "last_price": tick["last_price"]}
                    for tick in ticks
                    if tick.get("instrument_token") is not None and tick.get("last_price") is not None
                ],
            }
        )

    def on_error(connection: Any, code: Any, reason: Any) -> None:
        publish({"type": "status", "status": "error", "message": "Kite live ticks disconnected."})

    def on_close(connection: Any, code: Any, reason: Any) -> None:
        publish({"type": "status", "status": "disconnected"})

    ticker.on_connect = on_connect
    ticker.on_ticks = on_ticks
    ticker.on_error = on_error
    ticker.on_close = on_close
    try:
        ticker.connect(threaded=True)
        while True:
            outgoing = asyncio.create_task(messages.get())
            incoming = asyncio.create_task(websocket.receive_text())
            done, pending = await asyncio.wait(
                {outgoing, incoming}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            if incoming in done:
                incoming.result()  # Client messages are ignored; close frames exit via WebSocketDisconnect.
            if outgoing in done:
                await websocket.send_json(outgoing.result())
    except WebSocketDisconnect:
        pass
    finally:
        try:
            ticker.close()
        except Exception:
            pass
