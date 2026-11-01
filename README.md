# Northstar · Kite Connect

A local React + Vite dashboard backed by FastAPI and the official Kite Connect Python SDK. It exchanges the one-time request token on the backend, saves the resulting access token locally, and only returns the small set of profile fields the interface needs.

## Prerequisites

- Node.js 20.19+ or 22.12+
- Python 3.10+
- A Kite Connect app from the [Kite developer console](https://developers.kite.trade/)

## 1. Configure the backend

From the project root, create and activate a Python virtual environment, then install the backend requirements:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `backend/.env` and set `KITE_API_KEY` to your Kite Connect app's API key. The API secret is entered only in the local login form and is not saved. The callback URL configured for your Kite app should return a `request_token` to you; paste that short-lived token into the login form.

Start FastAPI in the activated environment:

```powershell
python -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000
```

## 2. Start the frontend

In a second terminal, from the project root:

```powershell
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Enter your API key, API secret, and request token to connect. The profile is read directly from Kite by FastAPI.

## Install as a Windows app

Run `launcher\setup.bat` from the project folder or double-click it to install and open the app. After pulling code updates, run these from the project root:

```powershell
git pull
.\launcher\setup.bat
```

Setup checks Python and Node.js, installs or updates backend/frontend dependencies when their manifests change, creates the missing default stock watchlist, refreshes the Northstar Desktop and Start menu shortcuts, restarts the local app services from the current source, and opens the dashboard. The shortcut opens this checkout; after each pull, run setup so already-running services load the updated code. Routine launches from **Northstar Trading Desk** remain silent and do not restart services that are already running. If a different application is using port 8000 or 5173, setup reports the conflict instead of stopping that application. Startup logs are under `%LOCALAPPDATA%\Northstar\logs`.

The shortcut points to this project folder, so keep the folder in place. The app needs the project's `.env`/backend configuration and local runtimes. The launcher does not display, copy, or modify credential files.

## Token storage and local development

The backend stores the API key and access token in `backend/data/session.json`, which is git-ignored. It never returns the access token to the browser. The development server's `--reload` watches Python source files and may restart after edits; the session file lives outside the application module, so the saved token is reused across code reloads and ordinary frontend changes. Select **Sign out** in the sidebar to remove the saved local session. Kite access tokens are typically valid only for the trading day; when Kite expires one, sign in again with a fresh request token.

For a custom frontend origin, set `FRONTEND_ORIGIN` in `backend/.env`. To store the local session elsewhere, set `KITE_TOKEN_FILE` in the backend process environment. Do not commit `.env` or `backend/data/session.json`.

## Customization

The interface uses plain CSS variables in `src/styles.css` for the palette, spacing, and surfaces. Edit those first to adapt the dark theme. The dashboard tabs, profile cards, and Signals scanner live in `src/App.jsx`; the API endpoints and SMA calculations live in `backend/app/main.py`. Strategy Builder supports NIFTY/SENSEX options, NSE equity symbols, per-strategy MIS (intraday) or carry-forward product selection (NRML options / CNC shares), and CE/PE per option section. Duplicate creates a new strategy draft, while Edit updates the existing one. Stop-loss percentage is optional; if provided, it is informational and is not submitted as an automatic stop order. Run strategy resolves the saved contracts and shows an indicative market-price review before a separate user confirmation submits live market orders through Kite. Exit strategy previews and closes only the filled quantity tracked for that strategy, after verifying the current Kite position or CNC holding. Kite reports net positions rather than strategy-owned lots, so the app cannot distinguish strategy fills from other trades in the same contract/product; inspect the proposed exit quantities before confirming. Order records are stored locally in `backend/data/strategy_executions.json`; strategy records are stored in `backend/data/strategies.json`. Market prices can change before execution, and Kite may partially fill or reject orders. The Signals and Algo Signals scanners read Nifty 100 members from the official Nifty Indices CSV, map them to NSE equity instruments from Kite, and evaluate daily candles. Algo Signals builds a local daily candle cache on the first request (this can take around 40 seconds), then reuses it during the day. Its live ticker bridge sends only instrument tokens and prices to the browser; the Kite access token remains on the backend. It returns the most recent crossover per stock within the selected calendar-day lookback, newest first. Scanning all 100 stocks is rate-limited to respect Kite historical-data request limits and may take around 40 seconds.

## API reference

- `GET /api/health` — backend health check
- `GET /api/session` — checks the saved session; never includes token data
- `POST /api/login` — exchanges the request token server-side
- `GET /api/profile` — fetches the Kite profile server-side
- `POST /api/logout` — deletes the saved local session
- `GET /api/strategies` — lists strategies saved in the local JSON file
- `POST /api/strategies` — creates a strategy and assigns its creation timestamp
- `PUT /api/strategies/{id}` — edits a strategy without changing its creation timestamp or starred state
- `POST /api/strategies/{id}/star` — toggles the starred state
- `DELETE /api/strategies/{id}` — deletes a saved strategy after verifying it has no tracked open positions
- `POST /api/strategies/{id}/preview` and `/exit-preview` — resolve entry/exit contracts without submitting orders
- `POST /api/strategies/{id}/run` and `/exit` — submit live market orders after explicit confirmation
- `POST /api/stock-orders` — submits a separately confirmed live PNB NSE equity market order (`BUY` or `SELL`, CNC, day validity); this endpoint does not place mutual fund orders or accept other symbols

Upstream `502` responses include a safe, actionable cause where available (such as an expired Kite session, denied permission, or network failure). Backend logs include the failed operation and cause category; raw provider messages and credentials are not returned to the browser.

Configure Kite credentials locally when signing in. Do not store API secrets or access tokens in this README or commit them to source control.