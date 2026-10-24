import { useCallback, useEffect, useState } from 'react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, ChevronDown, CircleHelp, Command, Copy, Fingerprint, Grid2X2, KeyRound, LayoutDashboard, LockKeyhole, LogOut, Menu, PanelLeftClose, Pencil, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Star, Trash2, UserRound, Wallet, X } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const initialTabs = ['Overview', 'User', 'Signals', 'Algo Signals', 'GTT Placement', 'Buy / Sell', 'Strategy Builder', 'Strategies', 'Holdings', 'Orders']

function Brand({ compact = false }) {
  return <div className="brand"><div className="brand-mark"><Activity size={17} strokeWidth={2.4} /></div>{!compact && <div className="brand-copy"><span>northstar</span><small>TRADING DESK</small></div>}</div>
}

function IconButton({ label, children, onClick, className = '' }) { return <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</button> }

function Login({ onLogin, onDemo }) {
  const [form, setForm] = useState({ api_key: '', api_secret: '', request_token: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const change = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`${API}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Unable to sign in. Check your credentials and try again.')
      onLogin(body.profile)
    } catch (err) { setError(err.message || 'Could not connect to the backend. Is FastAPI running?') }
    finally { setBusy(false) }
  }
  return <main className="login-screen">
    <div className="login-noise" />
    <header className="login-top"><Brand /><div className="secure-label"><span className="secure-dot" /> SECURE LOCAL SESSION</div></header>
    <section className="login-layout">
      <div className="login-story">
        <div className="eyebrow"><span className="eyebrow-line" /> YOUR MARKET, IN FOCUS</div>
        <h1>Clarity for<br />every <span>position.</span></h1>
        <p className="login-intro">A quieter way to stay connected to your trading account. Your credentials stay on this device.</p>
        <div className="story-divider" />
        <div className="trust-row"><span className="trust-icon"><LockKeyhole size={16} /></span><div><strong>Your session stays private</strong><p>Access tokens are stored locally on your backend only.</p></div></div>
        <div className="trust-row"><span className="trust-icon"><Fingerprint size={16} /></span><div><strong>Direct Kite Connect access</strong><p>Authenticated with Zerodha’s official Python SDK.</p></div></div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="card-heading"><div className="card-icon"><KeyRound size={18} /></div><div><h2>Connect your account</h2><p>Enter your Kite Connect credentials</p></div></div>
        <label className="field-label" htmlFor="api-key">API key</label><div className="input-wrap"><Command size={16} /><input id="api-key" autoComplete="off" value={form.api_key} onChange={change('api_key')} placeholder="Your Kite Connect API key" required /></div>
        <label className="field-label" htmlFor="api-secret">API secret</label><div className="input-wrap"><LockKeyhole size={16} /><input id="api-secret" autoComplete="new-password" type={showSecret ? 'text' : 'password'} value={form.api_secret} onChange={change('api_secret')} placeholder="Your API secret" required /><button className="field-action" type="button" onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Show'}</button></div>
        <div className="token-label-row"><label className="field-label" htmlFor="request-token">Request token</label>{form.api_key ? <a className="request-token-link" href={`https://kite.trade/connect/login?api_key=${encodeURIComponent(form.api_key)}&v=3`} target="_blank" rel="noreferrer">Get request token ↗</a> : <span>FROM KITE LOGIN</span>}</div><div className="input-wrap"><Fingerprint size={16} /><input id="request-token" autoComplete="off" value={form.request_token} onChange={change('request_token')} placeholder="Paste request token from your redirect URL" required /></div>
        <p className="request-token-help">Sign in at Kite, then copy the request_token from your app's configured redirect URL.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button login-submit" disabled={busy}>{busy ? <><span className="spinner" /> Connecting securely…</> : <>Connect to Kite <ArrowRight size={16} /></>}</button>
        <button className="secondary-button demo-login-button" type="button" onClick={onDemo}>Open demo preview</button>
        <p className="demo-login-note">Demo access · no credentials or Zerodha connection</p>
        <p className="login-foot"><ShieldCheck size={14} /> Encrypted in transit · Token never sent to your browser</p>
      </form>
    </section>
    <footer className="login-footer"><span>BUILT FOR A MORE FOCUSED MARKET DAY</span><span>LOCAL DEVELOPMENT · KITE CONNECT</span></footer>
  </main>
}

function Overview({ profile, onUser, demoMode = false }) {
  return <div className="overview-content">
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR TRADING DESK</div><h1>Good to have you here{profile?.user_name ? `, ${profile.user_name.split(' ')[0]}` : ''}.</h1><p>{demoMode ? 'You are viewing a disconnected demo.' : 'Your account connection is active and ready.'}</p></div><div className="date-pill"><span className="date-dot" /> {demoMode ? 'DEMO · OFFLINE' : 'CONNECTION ACTIVE'}</div></div>
    <div className="metric-grid"><div className="metric-card"><div className="metric-top"><span>ACCOUNT STATUS</span><span className="metric-icon green"><Activity size={16}/></span></div><div className="metric-value status-value"><i/> {demoMode ? 'Demo preview' : 'Connected'}</div><div className="metric-caption">{demoMode ? 'No Kite account connected' : 'Kite Connect session is active'}</div><div className="metric-footer"><span className="positive-text">{demoMode ? 'DEMO PREVIEW' : '● LIVE SESSION'}</span><span>{demoMode ? 'Offline' : 'Local backend'}</span></div></div>
      <div className="metric-card"><div className="metric-top"><span>AVAILABLE PRODUCTS</span><span className="metric-icon"><Wallet size={16}/></span></div><div className="metric-value">{profile?.products?.length ?? '—'}</div><div className="metric-caption">Products enabled for your account</div><div className="metric-footer"><span>{profile?.products?.slice(0, 3).join(' · ') || 'No product data'}</span><span><ArrowUpRight size={14}/></span></div></div>
      <div className="metric-card"><div className="metric-top"><span>CONNECTED EXCHANGES</span><span className="metric-icon violet"><Grid2X2 size={16}/></span></div><div className="metric-value">{profile?.exchanges?.length ?? '—'}</div><div className="metric-caption">Exchanges available to you</div><div className="metric-footer"><span>{profile?.exchanges?.slice(0, 3).join(' · ') || 'No exchange data'}</span><span><ArrowUpRight size={14}/></span></div></div></div>
    <div className="overview-bottom"><section className="panel account-panel"><div className="panel-heading"><div><h3>Account overview</h3><p>Your connected Kite profile at a glance</p></div><button className="text-button" onClick={onUser}>View profile <ArrowRight size={14}/></button></div><div className="account-summary"><div className="avatar">{profile?.user_name?.charAt(0)?.toUpperCase() || 'K'}</div><div className="account-name"><strong>{profile?.user_name || 'Kite account'}</strong><span>User ID · {profile?.user_id || '—'}</span></div><span className="connected-tag"><i/> Connected</span></div><div className="summary-divider"/><div className="summary-details"><div><span>PRODUCTS</span><strong>{profile?.products?.join(', ') || '—'}</strong></div><div><span>EXCHANGES</span><strong>{profile?.exchanges?.slice(0, 5).join(', ') || '—'}</strong></div></div></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><h3>Getting started</h3><p>Your desk is ready when you are</p></div><div className="ready-icon"><Sparkles size={16}/></div></div><div className="activity-list"><div className="activity-item"><div className="activity-icon"><ShieldCheck size={15}/></div><div><strong>Account connected securely</strong><span>Your token is stored on the backend</span></div><span className="activity-time">NOW</span></div><div className="activity-item"><div className="activity-icon"><UserRound size={15}/></div><div><strong>Review your profile</strong><span>See your Kite account permissions</span></div><button className="activity-go" onClick={onUser} aria-label="Open profile"><ArrowRight size={15}/></button></div><div className="activity-item"><div className="activity-icon"><Grid2X2 size={15}/></div><div><strong>Explore your workspace</strong><span>More trading tools are on the way</span></div><span className="coming-soon">SOON</span></div></div></section></div>
    <div className="bottom-note"><span><ShieldCheck size={14}/> Your access token never leaves the backend</span><span>DATA PROVIDED BY KITE CONNECT</span></div>
  </div>
}

function UserTab({ profile, loading, error, reload }) {
  if (loading) return <div className="profile-state"><span className="spinner"/> Loading your profile…</div>
  if (error) return <div className="profile-state error-state"><p>{error}</p><button className="secondary-button" onClick={reload}><RefreshCw size={14}/> Try again</button></div>
  const details = [
    { icon: UserRound, label: 'USER NAME', value: profile?.user_name, note: 'Name registered with your Kite account' },
    { icon: Fingerprint, label: 'USER ID', value: profile?.user_id, note: 'Your unique Kite account identifier' },
    { icon: Wallet, label: 'PRODUCTS', value: profile?.products?.join(', '), note: 'Trading products available to your account' },
    { icon: Grid2X2, label: 'EXCHANGES', value: profile?.exchanges?.join(', '), note: 'Markets enabled for your account' },
  ]
  return <div className="user-content"><div className="user-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> ACCOUNT DETAILS</div><h1>Your profile</h1><p>Information returned by your Kite Connect account.</p></div><button className="secondary-button" onClick={reload}><RefreshCw size={14}/> Refresh</button></div>
    <section className="panel profile-hero"><div className="profile-avatar">{profile?.user_name?.charAt(0)?.toUpperCase() || 'K'}</div><div className="profile-hero-copy"><span className="profile-overline">KITE CONNECT ACCOUNT</span><h2>{profile?.user_name || 'Kite account'}</h2><span className="profile-userid">{profile?.user_id || '—'}</span></div><div className="connected-tag profile-status"><i/> CONNECTION ACTIVE</div></section>
    <div className="profile-grid">{details.map(({ icon: Icon, label, value, note }) => <section key={label} className="panel profile-detail"><div className="detail-icon"><Icon size={17}/></div><span className="detail-label">{label}</span><strong className="detail-value">{value || 'Not available'}</strong><span className="detail-note">{note}</span></section>)}</div>
    <div className="profile-security"><ShieldCheck size={15}/><span>Profile details are requested from Kite by your backend. Your access token is never exposed to this page.</span></div>
  </div>
}

function SignalsTab({ demoMode = false }) {
  const [options, setOptions] = useState({ short_sma: 6, long_sma: 30, lookback_days: 90, max_stocks: 100 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const update = (key) => (event) => setOptions({ ...options, [key]: Number(event.target.value) })
  async function generate(event) {
    event.preventDefault(); if (demoMode) return; setBusy(true); setError(''); setReport(null)
    try {
      const response = await fetch(`${API}/api/signals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Could not generate signals. Please try again.')
      setReport(body)
    } catch (err) { setError(err.message || 'Could not connect to the backend.') }
    finally { setBusy(false) }
  }
  return <div className="signals-content">
    <div className="signals-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> MARKET SCANNER</div><h1>Signals</h1><p>Find recent moving-average crossovers across Nifty 100 stocks.</p></div><div className="scanner-source"><span className="date-dot"/> NIFTY 100</div></div>
    <form className="panel scanner-controls" onSubmit={generate}>
      <div className="scanner-controls-heading"><div><h2>Scanner settings</h2><p>Choose the averages and date range to scan.</p></div><div className="scanner-icon"><Activity size={16}/></div></div>
      <div className="scanner-inputs">
        <label className="scanner-field"><span>SHORT SMA <i>FAST</i></span><div><input type="number" min="2" max="100" value={options.short_sma} onChange={update('short_sma')} required/><small>days</small></div></label>
        <label className="scanner-field"><span>LONG SMA <i>SLOW</i></span><div><input type="number" min="3" max="250" value={options.long_sma} onChange={update('long_sma')} required/><small>days</small></div></label>
        <label className="scanner-field"><span>LOOKBACK</span><div><input type="number" min="1" max="365" value={options.lookback_days} onChange={update('lookback_days')} required/><small>calendar days</small></div></label>
        <label className="scanner-field"><span>MAX STOCKS</span><div><input type="number" min="1" max="100" value={options.max_stocks} onChange={update('max_stocks')} required/><small>results</small></div></label>
        <button className="primary-button generate-button" disabled={demoMode || busy || options.short_sma >= options.long_sma}>{busy ? <><span className="spinner"/> Scanning Nifty 100…</> : <><Activity size={15}/> Generate signals</>}</button>
      </div>
      <p className="scanner-hint"><ShieldCheck size={13}/> Uses the official Nifty Indices constituent list and daily candles from Kite Connect. A full scan can take around 40 seconds.</p>
    </form>
    {error && <div className="scanner-error" role="alert"><span>{error}</span><button className="secondary-button" onClick={generate}><RefreshCw size={13}/> Retry</button></div>}
    {busy && <div className="scan-progress"><span className="progress-line"/><div><strong>Checking daily candles</strong><span>Fetching the Nifty 100 and confirming each crossover…</span></div></div>}
    {report && <section className="panel signal-results"><div className="results-heading"><div><div className="results-eyebrow">LATEST CROSSOVERS</div><h2>Signal results</h2><p>{report.signals.length} found · {report.scanned} stocks scanned · through {report.as_of}</p></div><div className="results-count"><strong>{report.signals.length.toString().padStart(2, '0')}</strong><span>SIGNALS</span></div></div>
      {(report.failed_history > 0 || report.missing_tokens > 0) && <div className="scan-warning">Some stocks could not be checked ({report.failed_history} candle errors, {report.missing_tokens} missing instruments).</div>}
      {report.signals.length ? <div className="signals-table-wrap"><table className="signals-table"><thead><tr><th>RANK</th><th>TICKER</th><th>COMPANY</th><th>CROSSOVER TYPE</th><th>CROSSOVER DATE</th><th className="numeric">CLOSE</th><th className="numeric">SMA {report.short_sma}</th><th className="numeric">SMA {report.long_sma}</th></tr></thead><tbody>{report.signals.map((signal) => <tr key={`${signal.ticker}-${signal.crossover_date}`}><td><span className="signal-rank">{String(signal.rank).padStart(2, '0')}</span></td><td><strong className="signal-ticker">{signal.ticker}</strong></td><td className="signal-company">{signal.company}</td><td><span className={`crossover-badge ${signal.crossover_type.toLowerCase()}`}>{signal.crossover_type === 'Bullish' ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {signal.crossover_type}</span></td><td className="signal-date">{signal.crossover_date}</td><td className="numeric signal-number">₹{signal.close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="numeric signal-number">₹{signal.short_sma_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="numeric signal-number">₹{signal.long_sma_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>)}</tbody></table></div> : <div className="signals-empty"><div className="placeholder-icon"><Search size={18}/></div><strong>No crossovers in this lookback</strong><span>Try a longer lookback or different SMA periods.</span></div>}
      <div className="results-footnote"><span>Ranked by most recent crossover date</span><span>Daily candles · {report.short_sma}/{report.long_sma} SMA</span></div>
    </section>}
  </div>
}

const ALGO_PARAMETERS = { volumeLookback: 20, volumeMultiplier: 3, priceLookback: 20, maxBreakoutAge: 20, midpointTolerance: 1 }

function normalizeScannerDate(value) {
  const text = String(value ?? '')
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function normalizeScannerStock(stock) {
  const candles = (stock.candles || stock.dailyCandles || stock.daily_candles || []).map(candle => ({
    date: normalizeScannerDate(candle.date ?? candle.timestamp ?? candle.time),
    open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume),
  })).filter(candle => candle.date && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)).sort((a, b) => a.date.localeCompare(b.date))
  return {
    ...stock,
    symbol: String(stock.symbol ?? stock.tradingsymbol ?? '').toUpperCase(),
    companyName: stock.companyName ?? stock.company_name ?? stock.company ?? stock.name ?? stock.symbol ?? '',
    instrumentToken: Number(stock.instrument_token ?? stock.instrumentToken ?? stock.token),
    candles,
  }
}

function findBreakoutRetest(stock) {
  const candles = stock.candles
  const lastIndex = candles.length - 1
  if (candles.length < 25) return null
  const earliest = Math.max(ALGO_PARAMETERS.priceLookback, lastIndex - ALGO_PARAMETERS.maxBreakoutAge)
  for (let bIndex = lastIndex - 1; bIndex >= earliest; bIndex -= 1) {
    const prior = candles.slice(bIndex - ALGO_PARAMETERS.volumeLookback, bIndex)
    if (prior.length < ALGO_PARAMETERS.volumeLookback) continue
    const averageVolume = prior.reduce((sum, candle) => sum + candle.volume, 0) / ALGO_PARAMETERS.volumeLookback
    const prevHigh = Math.max(...prior.map(candle => candle.high))
    const breakout = candles[bIndex]
    if (!(Number.isFinite(averageVolume) && averageVolume > 0 && breakout.close > breakout.open && breakout.volume >= ALGO_PARAMETERS.volumeMultiplier * averageVolume && breakout.close > prevHigh)) continue
    const subsequent = candles.slice(bIndex + 1)
    if (!subsequent.length) continue
    const maxPriceAfter = Math.max(...subsequent.map(candle => candle.high))
    if (maxPriceAfter <= breakout.high) continue
    const midpoint = (breakout.high + breakout.low) / 2
    if (!(midpoint > 0)) continue
    const currentPrice = candles[lastIndex].close
    const distanceFromMidpoint = ((currentPrice - midpoint) / midpoint) * 100
    const daysSince = lastIndex - bIndex
    if (Math.abs(distanceFromMidpoint) > ALGO_PARAMETERS.midpointTolerance || daysSince > ALGO_PARAMETERS.maxBreakoutAge) continue
    return {
      symbol: stock.symbol,
      companyName: stock.companyName,
      instrumentToken: stock.instrumentToken,
      currentPrice,
      breakoutDate: breakout.date,
      bIndex,
      daysSince,
      breakoutLow: breakout.low,
      breakoutHigh: breakout.high,
      midpoint,
      distanceFromMidpoint,
      volMultiple: breakout.volume / averageVolume,
      prevHigh,
      maxPriceAfter,
      returnFromCloseToSubHigh: ((maxPriceAfter - breakout.close) / breakout.close) * 100,
      retracementHigh: ((maxPriceAfter - currentPrice) / maxPriceAfter) * 100,
      candles,
    }
  }
  return null
}

function signedPercent(value) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` }

function AlgoSignalsTab({ onReport, onLivePrices, onOhlcPrices, onLiveStatus, onPlacementRows }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [livePrices, setLivePrices] = useState({})
  const [ohlcPrices, setOhlcPrices] = useState({})
  const [liveStatus, setLiveStatus] = useState('Waiting for breakout results')
  const [selectedRow, setSelectedRow] = useState(null)
  const [running, setRunning] = useState(false)
  const [placementError, setPlacementError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadScanner() {
      setLoading(true); setError(''); setReport(null); setLivePrices({}); setOhlcPrices({}); setLiveStatus('Scanning breakouts…'); setSelectedRow(null)
      try {
        const response = await fetch(`${API}/api/scanner-data${reloadKey ? '?refresh=true' : ''}`)
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || `Scanner data request failed (${response.status}).`)
        if (!Array.isArray(body.stocks)) throw new Error('Scanner API response is missing its stocks list.')
        const stocks = body.stocks.map(normalizeScannerStock)
        const results = stocks.map(findBreakoutRetest).filter(Boolean).sort((a, b) => a.daysSince - b.daysSince || Math.abs(a.distanceFromMidpoint) - Math.abs(b.distanceFromMidpoint))
        if (!cancelled) {
          setReport({ metadata: body.metadata || {}, stocksScanned: stocks.length, results })
          onReport?.({ metadata: body.metadata || {}, stocksScanned: stocks.length, results })
          setLoading(false)
          setLiveStatus(results.length ? 'Connecting to live ticks…' : 'No active tick subscriptions')
        }
      } catch (err) {
        if (!cancelled) { setError(err.message || 'Unable to load scanner data.'); setLoading(false); setLiveStatus('Live ticks unavailable') }
      }
    }
    loadScanner()
    return () => { cancelled = true }
  }, [reloadKey])

  const resultKey = report?.results.map(result => `${result.symbol}:${result.instrumentToken}`).join(',') || ''
  useEffect(() => {
    if (!resultKey) return undefined
    const results = report.results
    const symbols = results.map(result => result.symbol)
    const tokenToSymbol = Object.fromEntries(results.map(result => [String(result.instrumentToken), result.symbol]))
    let active = true
    fetch(`${API}/api/scanner-ohlc?symbols=${encodeURIComponent(symbols.join(','))}`)
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'OHLC snapshot unavailable'); return body })
      .then(body => { if (active) { setOhlcPrices(body.prices || {}); onOhlcPrices?.(body.prices || {}) } })
      .catch(() => {})

    const socketUrl = `${API.replace(/^http/, 'ws').replace(/\/$/, '')}/ws/ticks?tokens=${encodeURIComponent(results.map(result => result.instrumentToken).join(','))}&mode=full`
    setLiveStatus('Connecting to live ticks…')
    const socket = new WebSocket(socketUrl)
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'status') {
          if (message.status === 'connected') { setLiveStatus('Live tick subscription active'); onLiveStatus?.('Live tick subscription active') }
          else if (message.status === 'error') { setLiveStatus('Live ticks interrupted · using fallback prices'); onLiveStatus?.('Live ticks interrupted · using fallback prices') }
          else if (message.status === 'disconnected') { setLiveStatus('Live ticks disconnected · using fallback prices'); onLiveStatus?.('Live ticks disconnected · using fallback prices') }
        }
        if (message.type === 'ticks') setLivePrices(previous => {
          const next = { ...previous }
          for (const tick of message.ticks || []) if (tokenToSymbol[String(tick.instrument_token)]) next[String(tick.instrument_token)] = Number(tick.last_price)
          onLivePrices?.(next)
          return next
        })
      } catch { /* Ignore malformed tick messages and keep the last known price. */ }
    }
    socket.onerror = () => setLiveStatus('Live ticks unavailable · using fallback prices')
    socket.onclose = () => { if (active) setLiveStatus(current => current.startsWith('Live tick subscription active') ? 'Live ticks disconnected · using fallback prices' : current) }
    return () => { active = false; socket.close() }
  }, [resultKey, report])

  const results = report?.results || []
  async function runLive() {
    setRunning(true); setPlacementError(''); onPlacementRows?.([])
    try {
      const response = await fetch(`${API}/api/scanner-data?refresh=true`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not refresh scanner data.')
      const stocks = (data.stocks || []).map(normalizeScannerStock)
      const fresh = stocks.map(findBreakoutRetest).filter(Boolean).sort((a, b) => a.daysSince - b.daysSince || Math.abs(a.distanceFromMidpoint) - Math.abs(b.distanceFromMidpoint))
      const nextReport = { metadata: data.metadata || {}, stocksScanned: stocks.length, results: fresh }
      setReport(nextReport); onReport?.(nextReport); setError('')
      const snapshotsResponse = fresh.length ? await fetch(`${API}/api/scanner-ohlc?symbols=${encodeURIComponent(fresh.map(row => row.symbol).join(','))}`) : null
      const snapshots = snapshotsResponse ? await snapshotsResponse.json() : { prices: {} }
      if (snapshotsResponse && !snapshotsResponse.ok) throw new Error(snapshots.detail || 'Could not load OHLC snapshot.')
      setOhlcPrices(snapshots.prices || {}); onOhlcPrices?.(snapshots.prices || {})
      const candidates = fresh.map(row => ({ symbol: row.symbol, quantity: 1, buy_price: row.breakoutLow ?? null, stoploss: row.breakoutLow != null ? row.breakoutLow * 0.95 : null, last_price: livePrices[String(row.instrumentToken)] ?? snapshots.prices?.[row.symbol] ?? null }))
      const stateResponse = await fetch(`${API}/api/algo-orders/gtt-state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orders: candidates }) })
      const stateBody = await stateResponse.json()
      if (!stateResponse.ok) throw new Error(stateBody.detail || 'Could not check Kite account state.')
      const stateRows = stateBody.orders || []
      const ready = stateRows.filter(row => row.buy_status === 'ready' && row.buy_price != null && row.stoploss != null && row.last_price != null)
      let placements = []
      if (ready.length) {
        const placeResponse = await fetch(`${API}/api/algo-orders/live-gtt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_live: true, orders: ready.map(row => candidates.find(candidate => candidate.symbol === row.symbol)) }) })
        const placeBody = await placeResponse.json()
        if (!placeResponse.ok) throw new Error(placeBody.detail || 'Could not create dummy GTT records.')
        placements = placeBody.orders || []
      }
      const bySymbol = Object.fromEntries(placements.map(row => [row.symbol, row]))
      onPlacementRows?.(stateRows.map(row => bySymbol[row.symbol] || row))
    } catch (err) { setPlacementError(err.message || 'GTT simulation failed.') }
    finally { setRunning(false) }
  }
  return <div className="algo-content">
    <div className="algo-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> ALGORITHMIC SCANNER</div><h1>High-volume breakout and retest setups</h1><p>Nifty stocks with volume-confirmed breakouts returning to their breakout midpoint.</p></div><div className="algo-actions"><button className="secondary-button algo-refresh" onClick={() => setReloadKey(key => key + 1)} disabled={loading || running}><RefreshCw size={14} className={loading ? 'spin-icon' : ''}/>{loading ? 'Scanning…' : 'Run scanner again'}</button><button className="primary-button algo-run-live" onClick={runLive} disabled={running || loading}>{running ? 'Running…' : 'Run Live'}</button></div></div>
    {placementError && <div className="algo-error" role="alert"><CircleHelp size={16}/><div><strong>GTT simulation unavailable</strong><span>{placementError}</span></div></div>}
    <div className="algo-parameter-row"><span><b>VOLUME</b> 20 candles · 3× average</span><span><b>PRICE RANGE</b> 20 candles</span><span><b>MAX AGE</b> 20 candles</span><span><b>MIDPOINT</b> ±1%</span></div>
    <div className="algo-summary panel"><div className="algo-stat"><strong>{loading ? '—' : String(results.length).padStart(2, '0')}</strong><span>TRIGGERED BREAKOUTS</span></div><div className="algo-stat"><strong>{loading ? '—' : report?.stocksScanned ?? 0}</strong><span>STOCKS SCANNED</span></div><div className="algo-live-status"><span className={liveStatus.includes('active') ? 'live-indicator active' : 'live-indicator'}/><div><strong>{liveStatus}</strong><span>Prices: live tick → OHLC snapshot → latest candle</span></div></div></div>
    {error && <div className="algo-error" role="alert"><CircleHelp size={16}/><div><strong>Scanner data unavailable</strong><span>{error}</span></div><button className="secondary-button" onClick={() => setReloadKey(key => key + 1)}><RefreshCw size={13}/> Try again</button></div>}
    <section className="panel algo-table-panel"><div className="algo-table-heading"><div><div className="results-eyebrow">NIFTY BREAKOUT SCANNER</div><h2>Triggered Breakouts</h2></div><div className="algo-table-context">SORTED BY AGE <ArrowUpRight size={13}/></div></div>
      {loading ? <div className="algo-state"><span className="spinner"/>Loading scanner cache...</div> : error ? <div className="algo-state muted">Scanner data could not be loaded. Resolve the API error above to view results.</div> : results.length === 0 ? <div className="algo-state muted">No breakout retest setups match the current parameters.</div> : <div className="algo-table-wrap"><table className="algo-table"><thead><tr><th>RANK</th><th>SYMBOL</th><th className="right">CURRENT PRICE</th><th>BREAKOUT DATE</th><th className="right">AGE</th><th className="right">BREAKOUT VOL</th><th className="right">RETEST DISTANCE</th><th className="right">PEAK GAINS</th><th className="right">RETRACEMENT</th></tr></thead><tbody>{results.map((result, index) => {
        const key = `${result.symbol}-${result.breakoutDate}`
        const live = livePrices[String(result.instrumentToken)]
        const price = live ?? ohlcPrices[result.symbol] ?? result.currentPrice
        return <tr key={key} className={selectedRow === key ? 'selected' : ''} onClick={() => setSelectedRow(key)} aria-selected={selectedRow === key}>
          <td><span className="algo-rank">{String(index + 1).padStart(2, '0')}</span></td><td><strong className="algo-symbol">{result.symbol}</strong><span className="algo-company" title={result.companyName}>{result.companyName}</span></td><td className="right algo-price">₹{Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{live != null && <i className="price-live-dot" title="Live websocket price"/>}</td><td className="algo-date">{result.breakoutDate}</td><td className="right"><span className="age-chip">{result.daysSince}</span></td><td className="right algo-multiple">{result.volMultiple.toFixed(2)}x</td><td className={`right ${result.distanceFromMidpoint >= 0 ? 'positive-number' : 'negative-number'}`}>{signedPercent(result.distanceFromMidpoint)}</td><td className="right positive-number">{signedPercent(result.returnFromCloseToSubHigh)}</td><td className="right neutral-number">{signedPercent(result.retracementHigh)}</td>
        </tr>
      })}</tbody></table></div>}
      <div className="algo-table-footer"><span>{report ? `${report.stocksScanned} stocks checked · ${results.length} matching setups` : 'Waiting for scanner data'}</span><span>{report?.metadata?.generated_at ? `CACHE UPDATED ${String(report.metadata.generated_at).replace('T', ' ').slice(0, 16)}` : 'DAILY CANDLES'}</span></div>
    </section>
  </div>
}

function StockOrderTab({ demoMode = false }) {
  const [side, setSide] = useState('BUY')
  const [product, setProduct] = useState('CNC')
  const [symbol, setSymbol] = useState('')
  const [manualSymbol, setManualSymbol] = useState(false)
  const [instruments, setInstruments] = useState([])
  const [instrumentsLoading, setInstrumentsLoading] = useState(!demoMode)
  const [instrumentsError, setInstrumentsError] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [outcomeUnknown, setOutcomeUnknown] = useState(false)
  const [order, setOrder] = useState(null)
  const quantityNumber = Number(quantity)
  const validQuantity = Number.isInteger(quantityNumber) && quantityNumber >= 1 && quantityNumber <= 100000
  const validSymbol = /^[A-Z0-9&._-]+$/.test(symbol.trim())
  useEffect(() => {
    if (demoMode) return
    let active = true
    fetch(`${API}/api/stock-instruments`)
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Could not load NSE stocks from Kite.')
        return body.instruments || []
      })
      .then(rows => { if (active) setInstruments(rows) })
      .catch(err => { if (active) setInstrumentsError(err.message || 'Could not load NSE stocks from Kite.') })
      .finally(() => { if (active) setInstrumentsLoading(false) })
    return () => { active = false }
  }, [demoMode])

  function changeSymbol(value) {
    setSymbol(value.toUpperCase())
    setReviewing(false)
    setError('')
    setOrder(null)
  }

  function review(event) {
    event.preventDefault()
    setError('')
    setOrder(null)
    setReviewing(true)
  }

  async function placeOrder() {
    if (demoMode) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/stock-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim(), transaction_type: side, product, quantity: quantityNumber, confirm_live: true }),
      })
      const body = await response.json()
      if (!response.ok) {
        if (response.status >= 500) setOutcomeUnknown(true)
        throw new Error(body.detail || 'Kite did not confirm the order request.')
      }
      setOrder(body)
      setReviewing(false)
    } catch (err) {
      if (err instanceof TypeError) setOutcomeUnknown(true)
      setError(err.message || 'Could not confirm the order result. Check your Kite order book before retrying.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="trade-content">
    <div className="algo-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> {demoMode ? 'DEMO ORDER PREVIEW' : 'LIVE KITE ORDER'}</div><h1>Buy / Sell</h1><p>{symbol || 'Choose an NSE stock'} · NSE · Equity delivery</p></div><div className="trade-market-tag"><span className="date-dot"/> {demoMode ? 'DEMO · DISCONNECTED' : 'LIVE ACCOUNT'}</div></div>
    <div className={`trade-warning ${demoMode ? 'demo-trade-warning' : ''}`}><ShieldCheck size={16}/><div><strong>{demoMode ? 'Demo mode · orders disabled' : 'Live market order'}</strong><span>{demoMode ? 'This preview is not connected to Zerodha. You can review a sample order, but nothing will be sent.' : 'A confirmed order is sent to Zerodha immediately. Market prices can move; order acceptance does not mean the shares have filled.'}</span></div></div>
    <form className="panel trade-panel" onSubmit={review}>
      <div className="trade-panel-heading"><div><span className="results-eyebrow">NSE · {product} · MARKET · DAY</span><h2>{symbol || 'Choose a stock'}</h2><p>Choose from the configured stock watchlist.</p></div><span className="trade-symbol">{symbol || 'NSE'}</span></div>
      <div className="trade-stock-field">
        <label className="trade-quantity-field"><span>STOCK <small>NSE EQUITY</small></span>
          {manualSymbol
            ? <input aria-label="NSE stock symbol" autoCapitalize="characters" autoComplete="off" maxLength="32" pattern="[A-Za-z0-9&._-]+" placeholder="Type a trading symbol" value={symbol} onChange={event => changeSymbol(event.target.value)} required/>
            : <select aria-label="Choose NSE stock" value={symbol} onChange={event => changeSymbol(event.target.value)} required disabled={instrumentsLoading || instruments.length === 0}>
              <option value="">{instrumentsLoading ? 'Loading NSE stocks…' : 'Choose a stock'}</option>
              {instruments.map(instrument => <option key={instrument.symbol} value={instrument.symbol}>{instrument.symbol}</option>)}
            </select>}
        </label>
        <label className="trade-manual-toggle"><input type="checkbox" checked={manualSymbol} onChange={event => { setManualSymbol(event.target.checked); setReviewing(false); setError('') }}/> Type symbol instead</label>
      </div>
      {instrumentsError && !manualSymbol && <div className="trade-error" role="alert">{instrumentsError} You can enter a symbol manually; Kite will verify it before placing an order.</div>}
      <div className="trade-form-grid">
        <fieldset className="trade-side-field"><legend>TRANSACTION</legend><div className="trade-side-control">
          <button type="button" className={side === 'BUY' ? 'trade-side buy selected' : 'trade-side buy'} aria-pressed={side === 'BUY'} onClick={() => { setSide('BUY'); setReviewing(false); setError(''); setOrder(null) }}><ArrowDownRight size={15}/> Buy</button>
          <button type="button" className={side === 'SELL' ? 'trade-side sell selected' : 'trade-side sell'} aria-pressed={side === 'SELL'} onClick={() => { setSide('SELL'); setReviewing(false); setError(''); setOrder(null) }}><ArrowUpRight size={15}/> Sell</button>
        </div></fieldset>
        <label className="trade-quantity-field"><span>QUANTITY <small>SHARES</small></span><input aria-label="Quantity in shares" type="number" min="1" max="100000" step="1" inputMode="numeric" value={quantity} onChange={event => { setQuantity(event.target.value); setReviewing(false); setOrder(null) }} required/></label>
        <label className="trade-quantity-field trade-product-field"><span>PRODUCT</span><select aria-label="Order product" value={product} onChange={event => { setProduct(event.target.value); setReviewing(false); setOrder(null) }}><option value="CNC">CNC · Delivery</option><option value="MIS">MIS · Intraday</option></select></label>
        <button className="primary-button trade-review-button" type="submit" disabled={!validQuantity || !validSymbol || busy || outcomeUnknown || reviewing}><ArrowRight size={15}/> Review {side.toLowerCase()} order</button>
      </div>
      {reviewing && <div className="trade-review" aria-live="polite"><div><span className="results-eyebrow">{demoMode ? 'SAMPLE ORDER' : 'CONFIRM BEFORE SENDING'}</span><strong>{side} {quantityNumber} {symbol} share{quantityNumber === 1 ? '' : 's'} at market</strong><span>NSE · {product === 'CNC' ? 'CNC delivery' : 'MIS intraday'} · Day validity</span><p>{demoMode ? 'Demo preview only. No order will be placed.' : 'This is a live order, not a simulation. Verify the stock, side, product, and quantity before placing it.'}</p></div><div className="trade-review-actions"><button className="secondary-button" type="button" onClick={() => setReviewing(false)} disabled={busy}>Back</button><button className={`primary-button trade-submit ${side === 'SELL' ? 'sell-submit' : ''}`} type="button" onClick={placeOrder} disabled={busy || demoMode}>{busy ? <><span className="spinner"/> Sending…</> : demoMode ? 'Disabled in demo mode' : <>Place live {side.toLowerCase()} order</>}</button></div></div>}
      {error && <div className="trade-error" role="alert">{error}</div>}
      {outcomeUnknown && <div className="trade-uncertain" role="alert"><strong>Check Orders before trying again.</strong><span>The request may have reached Kite, but this page could not confirm the result. Do not resubmit until you check your Kite order book.</span></div>}
      {order && <div className="trade-success" role="status"><ShieldCheck size={17}/><div><strong>Order submitted to Kite</strong><span>{order.transaction_type} {order.quantity} {order.tradingsymbol} shares · {order.product} · Order ID {order.order_id}</span><small>Submission is not a fill confirmation. Check Orders in Kite for execution status.</small></div></div>}
    </form>
    <div className="trade-footnote">Available symbols are managed in the backend/data/stock_watchlist.json file. Manually entered symbols must also be in that list.</div>
  </div>
}

function Placeholder({ name }) { return <div className="placeholder-panel panel"><div className="placeholder-icon"><Sparkles size={20}/></div><h2>{name} is on the way</h2><p>This space is ready for your next trading tools. Your Kite connection is active.</p></div> }

function GttPlacement({ report, prices, snapshots, rows, setRows, liveStatus }) {
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const results = report?.results || []
  const key = results.map(row => row.symbol).join(',')
  const waitingPriceKey = results.filter(signal => (rows || []).some(row => row.symbol === signal.symbol && row.buy_status === 'waiting_for_ltp') && (prices[String(signal.instrumentToken)] ?? snapshots[signal.symbol]) != null).map(signal => signal.symbol).join(',')
  useEffect(() => {
    let active = true
    if (!results.length) { setRows([]); return () => { active = false } }
    const candidates = results.map(row => ({ symbol: row.symbol, quantity: 1, buy_price: row.breakoutLow ?? null, stoploss: row.breakoutLow != null ? row.breakoutLow * 0.95 : null, last_price: prices[String(row.instrumentToken)] ?? snapshots[row.symbol] ?? null }))
    fetch(`${API}/api/algo-orders/gtt-state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orders: candidates }) })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Could not check GTT state.'); return body })
      .then(body => { if (active) { setRows(body.orders || []); setError('') } })
      .catch(err => { if (active) setError(err.message || 'Could not check GTT state.') })
    return () => { active = false }
  }, [key, snapshots, waitingPriceKey, setRows])
  const bySymbol = Object.fromEntries((rows || []).map(row => [row.symbol, row]))
  return <div className="gtt-content">
    <div className="algo-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> SIMULATED ORDER STATUS</div><h1>GTT Order Placement</h1><p>Read-only status from Algo Signals · Qty 1 · Buy GTT at breakout candle low · Stoploss 5% below buy · State from Kite orders, positions, holdings, and GTTs</p></div></div>
    <div className="algo-summary panel gtt-summary"><div className="algo-stat"><strong>{results.length}</strong><span>ALGO SIGNALS</span></div><div className="algo-stat"><strong>{rows?.filter(row => row.buy_status === 'success' || row.buy_status === 'already_active').length || 0}</strong><span>ACTIVE BUY GTT</span></div><div className="algo-live-status"><span className={liveStatus.includes('active') ? 'live-indicator active' : 'live-indicator'}/><div><strong>{liveStatus || 'Waiting for live ticks'}</strong><span>Read-only state · simulated records remain local</span></div></div></div>
    {error && <div className="algo-error" role="alert"><CircleHelp size={16}/><div><strong>GTT state unavailable</strong><span>{error}</span></div></div>}
    <section className="panel algo-table-panel"><div className="algo-table-heading"><div><div className="results-eyebrow">READ-ONLY ACCOUNT CHECK</div><h2>Kite GTT Placement</h2></div><div className="algo-table-context">SIMULATED · NO ORDER SENT</div></div>
      {!results.length ? <div className="algo-state muted">No current Algo Signals to display.</div> : <div className="algo-table-wrap"><table className="gtt-table"><thead><tr>{['Rank','Symbol','Qty','Buy','Stoploss','Last Price','Account State','Buy Status','Buy Trigger','Day Buy Order','Position Qty','Stoploss Status','Stoploss Trigger','Message'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{results.map((signal, index) => {
        const row = bySymbol[signal.symbol] || {}
        const price = prices[String(signal.instrumentToken)] ?? snapshots[signal.symbol]
        const statusText = row.message || (signal.breakoutLow == null ? 'Buy price is not available for this row.' : price == null ? 'Waiting for LTP.' : 'Checking Kite account state…')
        return <tr key={signal.symbol} className={selected === signal.symbol ? 'selected' : ''} onClick={() => setSelected(signal.symbol)} aria-selected={selected === signal.symbol}><td>{index + 1}</td><td><strong className="algo-symbol">{signal.symbol}</strong></td><td>1</td><td>{row.buy_price == null ? 'Unavailable' : `₹${Number(row.buy_price).toFixed(2)}`}</td><td>{row.stoploss == null ? 'Unavailable' : `₹${Number(row.stoploss).toFixed(2)}`}</td><td>{price == null ? 'Waiting' : `₹${Number(price).toFixed(2)}`}</td><td><span className={`gtt-pill ${row.account_state || 'checking'}`}>{row.account_state || 'checking'}</span></td><td>{row.buy_status || 'checking'}</td><td>{row.buy_trigger_id || row.active_buy_trigger_id || '—'}</td><td>{row.day_buy_order_id ? `${row.day_buy_order_id} · ${row.day_buy_order_status || ''}` : '—'}</td><td>{row.position_quantity ?? '—'}</td><td>{row.stoploss_status || 'planned_after_buy'}</td><td>{row.stoploss_trigger_id || row.active_stoploss_trigger_id || '—'}</td><td className="gtt-message">{statusText}</td></tr>
      })}</tbody></table></div>}
      <div className="algo-table-footer"><span>Derived from the current Algo Signals result set</span><span>{results.length} symbols · {liveStatus}</span></div>
    </section>
  </div>
}

const marketOptions = ['NIFTY', 'SENSEX']
const emptyStrategySection = () => ({ segment: 'Option', symbol: '', option_type: 'CE', week: 'Current week', lot_quantity: 1, strike_price: '', premium_price: '', action: 'BUY', stop_loss_percentage: '' })
const strikeOptions = ['OTM 1', 'OTM 2', 'OTM 3', 'ATM', 'ITM 1', 'ITM 2', 'ITM 3']

function StrategyBuilder({ strategies, loading, error, onSave, onDelete, onOpenLibrary }) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState('')
  const [draft, setDraft] = useState({ name: '', category: '', product: 'MIS', sections: [emptyStrategySection()] })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deletingId, setDeletingId] = useState('')

  async function deleteStrategy(strategy) {
    if (!window.confirm(`Delete "${strategy.name}"? This cannot be undone.`)) return
    setDeletingId(strategy.id)
    setDeleteError('')
    try {
      await onDelete(strategy.id)
      if (editingId === strategy.id) {
        setEditingId('')
        setDraft({ name: '', category: '', product: 'MIS', sections: [emptyStrategySection()] })
      }
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || 'Could not delete this strategy.')
    } finally {
      setDeletingId('')
    }
  }

  function startNew(strategy = null) {
    setEditingId('')
    setDraft(strategy
      ? { name: `Copy of ${strategy.name}`, category: strategy.category, product: strategy.product || 'MIS', sections: strategy.sections.map(section => ({ ...section, symbol: section.symbol || '', option_type: section.option_type || 'CE' })) }
      : { name: '', category: '', product: 'MIS', sections: [emptyStrategySection()] })
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function editStrategy(strategy) {
    setEditingId(strategy.id)
    setDraft({ name: strategy.name, category: strategy.category, product: strategy.product || 'MIS', sections: strategy.sections.map(section => ({ ...section, symbol: section.symbol || '', option_type: section.option_type || 'CE' })) })
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateSection(index, field, value) {
    setDraft(current => ({ ...current, sections: current.sections.map((section, sectionIndex) => {
      if (sectionIndex !== index) return section
      const updated = { ...section, [field]: value }
      if (field === 'strike_price' && value) updated.premium_price = ''
      if (field === 'premium_price' && value) updated.strike_price = ''
      if (field === 'segment') {
        updated.symbol = ''
        updated.strike_price = ''
        updated.premium_price = ''
      }
      return updated
    }) }))
  }

  async function submit(event) {
    event.preventDefault()
    setFormError('')
    if (!draft.sections.length || draft.sections.some(section => section.segment === 'Option' && Boolean(section.strike_price) === Boolean(section.premium_price) || section.segment === 'Share' && !section.symbol.trim())) {
      setFormError('Choose a strike or premium for every option section, and enter an NSE symbol for every share section.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...draft,
        sections: draft.sections.map(section => ({
          ...section,
          symbol: section.segment === 'Share' ? section.symbol.trim().toUpperCase() : null,
          lot_quantity: Number(section.lot_quantity),
          strike_price: section.segment === 'Option' ? section.strike_price || null : null,
          premium_price: section.segment === 'Option' && section.premium_price ? Number(section.premium_price) : null,
          stop_loss_percentage: section.stop_loss_percentage ? Number(section.stop_loss_percentage) : null,
        })),
      }
      await onSave(payload, editingId)
      setEditingId('')
      setDraft({ name: '', category: '', product: 'MIS', sections: [emptyStrategySection()] })
    } catch (saveError) {
      setFormError(saveError.message || 'Could not save this strategy.')
    } finally {
      setSaving(false)
    }
  }

  const matches = strategies
    .filter(strategy => strategy.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 5)

  return <div className="strategy-content">
    <div className="algo-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> STRATEGY WORKSPACE</div><h1>Strategy builder</h1><p>Create and manage strategies. Run sends the configured market orders after review; it does not wait for a signal.</p></div><button className="primary-button" type="button" onClick={() => startNew()}><Plus size={15}/> Create new strategy</button></div>
    {error && <div className="strategy-error" role="alert">{error}</div>}
    <form className="panel strategy-form" onSubmit={submit}>
      <div className="strategy-section-heading"><div><span className="results-eyebrow">{editingId ? 'EDIT STRATEGY' : 'NEW STRATEGY'}</span><h2>{editingId ? 'Update strategy' : 'Strategy details'}</h2></div>{editingId && <button className="secondary-button" type="button" onClick={() => startNew()}>Cancel edit</button>}</div>
      <div className="strategy-meta-grid">
        <label className="strategy-field"><span>STRATEGY NAME</span><input maxLength="80" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Nifty weekly breakout" required/></label>
        <label className="strategy-field"><span>MARKET</span><select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} required><option value="" disabled>Select market</option>{draft.category && !marketOptions.includes(draft.category) && <option value={draft.category}>{draft.category} (existing)</option>}{marketOptions.map(market => <option key={market} value={market}>{market}</option>)}</select></label>
        <label className="strategy-field"><span>PRODUCT / HOLDING</span><select value={draft.product} onChange={event => setDraft({ ...draft, product: event.target.value })}><option value="MIS">MIS · Intraday</option><option value="NRML">Carry forward · NRML options / CNC shares</option></select></label>
        <div className="strategy-created"><span>CREATED</span><strong>{editingId ? formatCreatedAt(strategies.find(strategy => strategy.id === editingId)?.created_at) : 'Generated automatically when saved'}</strong></div>
      </div>
      <div className="strategy-sections-title"><div><span className="results-eyebrow">RULES</span><h3>Strategy sections</h3></div><button className="secondary-button" type="button" onClick={() => setDraft(current => ({ ...current, sections: [...current.sections, emptyStrategySection()] }))}><Plus size={13}/> Add section</button></div>
      <div className="strategy-section-list">
        {draft.sections.map((section, index) => <div className="strategy-section-row" key={index}>
          <div className="strategy-row-title"><span>SECTION {index + 1}</span>{draft.sections.length > 1 && <button className="strategy-remove" type="button" onClick={() => setDraft(current => ({ ...current, sections: current.sections.filter((_, sectionIndex) => sectionIndex !== index) }))}>Remove</button>}</div>
          <label className="strategy-field"><span>SEGMENT</span><select value={section.segment} onChange={event => updateSection(index, 'segment', event.target.value)}><option>Option</option><option>Share</option></select></label>
          {section.segment === 'Option' ? <>
            <label className="strategy-field"><span>CE / PE</span><select value={section.option_type} onChange={event => updateSection(index, 'option_type', event.target.value)}><option value="CE">CE</option><option value="PE">PE</option></select></label>
            <label className="strategy-field"><span>EXPIRY</span><select value={section.week} onChange={event => updateSection(index, 'week', event.target.value)}><option>Current week</option><option>Next week</option><option>Monthly</option></select></label>
          </> : <label className="strategy-field"><span>NSE SYMBOL</span><input maxLength="32" value={section.symbol} onChange={event => updateSection(index, 'symbol', event.target.value.toUpperCase())} placeholder="e.g. RELIANCE" required/></label>}
          <label className="strategy-field"><span>LOT / QTY</span><input type="number" min="1" max="100000" step="1" value={section.lot_quantity} onChange={event => updateSection(index, 'lot_quantity', event.target.value)} required/></label>
          {section.segment === 'Option' && <>
            <label className="strategy-field"><span>STRIKE PRICE</span><select value={section.strike_price} onChange={event => updateSection(index, 'strike_price', event.target.value)}><option value="">Not used</option>{strikeOptions.map(option => <option key={option}>{option}</option>)}</select></label>
            <label className="strategy-field"><span>PREMIUM PRICE</span><input type="number" min="0.01" step="0.01" value={section.premium_price} disabled={Boolean(section.strike_price)} onChange={event => updateSection(index, 'premium_price', event.target.value)} placeholder={section.strike_price ? 'Using strike' : 'Enter price'}/></label>
          </>}
          <label className="strategy-field"><span>ACTION</span><select value={section.action} onChange={event => updateSection(index, 'action', event.target.value)}><option value="BUY">Buy</option><option value="SELL">Sell</option></select></label>
          <label className="strategy-field"><span>STOP LOSS % · OPTIONAL</span><input type="number" min="0.1" max="100" step="0.1" value={section.stop_loss_percentage ?? ''} onChange={event => updateSection(index, 'stop_loss_percentage', event.target.value)} placeholder="e.g. 10"/></label>
        </div>)}
      </div>
      {formError && <div className="strategy-error" role="alert">{formError}</div>}
      <div className="strategy-form-footer"><span>Choose one price reference per section: a strike or a premium.</span><button className="primary-button" type="submit" disabled={saving}>{saving ? <><span className="spinner"/> Saving…</> : editingId ? 'Save changes' : 'Save strategy'}</button></div>
    </form>
    <section className="panel strategy-latest">
      <div className="strategy-section-heading"><div><span className="results-eyebrow">RECENTLY CREATED</span><h2>Latest strategies</h2></div><button className="secondary-button" type="button" onClick={onOpenLibrary}>View all strategies <ArrowRight size={13}/></button></div>
      {deleteError && <div className="strategy-error" role="alert">{deleteError}</div>}
      <label className="strategy-search"><Search size={15}/><input aria-label="Search strategies by name" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search strategies by name…"/></label>
      {loading ? <div className="strategy-empty">Loading strategies…</div> : matches.length ? <div className="strategy-recent-list">{matches.map(strategy => <article className="strategy-recent-row" key={strategy.id}><div className="strategy-recent-info"><strong>{strategy.name}</strong><span>{strategy.category} · {strategy.sections.length} section{strategy.sections.length === 1 ? '' : 's'} · {formatCreatedAt(strategy.created_at)}</span></div><div className="strategy-card-actions"><button className="secondary-button" type="button" onClick={() => editStrategy(strategy)}><Pencil size={13}/> Edit</button><button className="secondary-button" type="button" onClick={() => startNew(strategy)}><Copy size={13}/> Duplicate</button><button className="secondary-button strategy-delete-button" type="button" disabled={Boolean(deletingId)} onClick={() => deleteStrategy(strategy)}><Trash2 size={13}/>{deletingId === strategy.id ? 'Deleting…' : 'Delete'}</button></div></article>)}</div> : <div className="strategy-empty">{query ? 'No strategy names match your search.' : 'No strategies saved yet. Create your first strategy above.'}</div>}
    </section>
  </div>
}

function formatCreatedAt(value) {
  if (!value) return 'Not saved yet'
  const created = new Date(value)
  if (Number.isNaN(created.getTime())) return 'Date unavailable'
  return created.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function StrategyLibrary({ strategies, loading, error, onToggleStar, demoMode = false }) {
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState(null)
  const [operation, setOperation] = useState('details')
  const [preview, setPreview] = useState(null)
  const [operationError, setOperationError] = useState('')
  const [operationResult, setOperationResult] = useState(null)
  const [operationBusy, setOperationBusy] = useState(false)
  const visible = strategies.filter(strategy => tab === 'all' || strategy.starred)
  async function open(strategy, nextOperation = 'details') {
    setSelected(strategy)
    setOperation(nextOperation)
    setPreview(null)
    setOperationError('')
    setOperationResult(null)
    if (nextOperation === 'details') return
    if (demoMode) {
      setOperationError('Connect a Kite account to review live strategy orders.')
      return
    }
    setOperationBusy(true)
    try {
      const response = await fetch(`${API}/api/strategies/${encodeURIComponent(strategy.id)}/${nextOperation === 'run' ? 'preview' : 'exit-preview'}`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Could not prepare this strategy action.')
      setPreview(body)
    } catch (previewError) {
      setOperationError(previewError.message || 'Could not prepare this strategy action.')
    } finally {
      setOperationBusy(false)
    }
  }
  async function confirmOperation() {
    if (!selected || !preview || !preview.orders?.length) return
    setOperationBusy(true)
    setOperationError('')
    try {
      const response = await fetch(`${API}/api/strategies/${encodeURIComponent(selected.id)}/${operation === 'run' ? 'run' : 'exit'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_live: true }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Kite did not confirm this strategy action.')
      setOperationResult(body)
    } catch (submitError) {
      setOperationError(submitError.message || 'Kite did not confirm this strategy action.')
    } finally {
      setOperationBusy(false)
    }
  }

  return <div className="strategy-content">
    <div className="algo-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> SAVED STRATEGIES</div><h1>Strategies</h1><p>Browse your strategies, star favorites, and review them before running.</p></div></div>
    {error && <div className="strategy-error" role="alert">{error}</div>}
    <section className="panel strategy-library">
      <div className="strategy-library-tabs" role="tablist" aria-label="Strategy filters"><button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'selected' : ''} onClick={() => setTab('all')}>All strategies <span>{strategies.length}</span></button><button type="button" role="tab" aria-selected={tab === 'starred'} className={tab === 'starred' ? 'selected' : ''} onClick={() => setTab('starred')}>Starred <span>{strategies.filter(strategy => strategy.starred).length}</span></button></div>
      {loading ? <div className="strategy-empty">Loading strategies…</div> : visible.length ? <div className="strategy-card-grid">{visible.map(strategy => <article className="strategy-card panel" key={strategy.id} onClick={() => open(strategy)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter') open(strategy) }}>
        <div className="strategy-card-top"><span className="strategy-category">{strategy.category}</span><button className={`strategy-star ${strategy.starred ? 'is-starred' : ''}`} type="button" aria-label={strategy.starred ? 'Remove from starred strategies' : 'Add to starred strategies'} aria-pressed={strategy.starred} onClick={event => { event.stopPropagation(); onToggleStar(strategy.id) }}><Star size={16} fill={strategy.starred ? 'currentColor' : 'none'}/></button></div>
        <h2>{strategy.name}</h2><p>{strategy.sections.length} section{strategy.sections.length === 1 ? '' : 's'} · {strategy.product || 'MIS'} · Created {formatCreatedAt(strategy.created_at)}</p>
        <div className="strategy-preview-tags">{strategy.sections.slice(0, 3).map((section, index) => <span key={index}>{section.action} · {section.segment}{section.segment === 'Option' ? ` · ${section.option_type || 'CE'}` : ` · ${section.symbol || 'Symbol required'}`}</span>)}{strategy.sections.length > 3 && <span>+{strategy.sections.length - 3}</span>}</div>
        <div className="strategy-card-actions"><button className="primary-button" type="button" disabled={demoMode} onClick={event => { event.stopPropagation(); open(strategy, 'run') }}><Play size={13}/> Run</button><button className="secondary-button" type="button" disabled={demoMode} onClick={event => { event.stopPropagation(); open(strategy, 'exit') }}>Exit</button><button className="secondary-button" type="button" onClick={event => { event.stopPropagation(); open(strategy) }}>Details</button></div>
      </article>)}</div> : <div className="strategy-empty">{tab === 'starred' ? 'No starred strategies yet. Star a strategy to find it here.' : 'No strategies saved yet. Build one to see it here.'}</div>}
    </section>
    {selected && <div className="preferences-backdrop" onClick={event => { if (event.target === event.currentTarget) setSelected(null) }}><section className="preferences-dialog strategy-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="strategy-detail-title">
      <header className="preferences-dialog-header"><div><span className="results-eyebrow">{operation === 'run' ? 'LIVE ORDER REVIEW' : operation === 'exit' ? 'EXIT REVIEW' : selected.category}</span><h2 id="strategy-detail-title">{operation === 'run' ? 'Review live orders' : operation === 'exit' ? 'Review strategy exit' : selected.name}</h2><p>{selected.category} · {selected.product || 'MIS'} · Created {formatCreatedAt(selected.created_at)}</p></div><button className="icon-button" type="button" aria-label="Close strategy details" onClick={() => setSelected(null)}><X size={17}/></button></header>
      {operation === 'details' ? <div className="strategy-detail-sections">{selected.sections.map((section, index) => <div className="strategy-detail-row" key={index}><strong>Section {index + 1}</strong><span>{section.action} · {section.segment} · {section.segment === 'Option' ? `${section.option_type || 'CE'} · ${section.week}` : section.symbol || 'NSE symbol required'}</span><span>{section.segment === 'Share' ? section.symbol || 'Symbol required' : section.strike_price || (section.premium_price ? `Premium ₹${Number(section.premium_price).toFixed(2)}` : 'Price reference required')} · Qty {section.lot_quantity}</span><span>{section.stop_loss_percentage == null ? 'No stop loss set' : `Stop loss ${section.stop_loss_percentage}% · not automatically submitted`}</span></div>)}</div> : <>
        <div className="strategy-run-notice"><ShieldCheck size={16}/><span>{operation === 'run' ? 'Run submits these market orders immediately after you confirm; no entry signal is monitored. Displayed prices are indicative, and stop-loss percentages are not submitted as orders.' : 'Only verified, filled quantity recorded for this strategy will be exited with market orders. Kite reports net positions, not strategy-owned lots; review every order before confirming.'}</span></div>
        {operationBusy && !preview ? <div className="strategy-empty">Preparing a live Kite review…</div> : null}
        {preview?.orders?.length ? <div className="strategy-detail-sections">{preview.orders.map((order, index) => <div className="strategy-detail-row" key={`${order.exchange}:${order.tradingsymbol}:${index}`}><strong>{order.transaction_type} · {order.exchange}:{order.tradingsymbol}</strong><span>Quantity {order.quantity} · {order.product}</span><span>{order.last_price == null ? 'Market price at execution' : `Indicative LTP ₹${Number(order.last_price).toFixed(2)}`}</span></div>)}</div> : preview && <div className="strategy-empty">No filled positions to exit for this strategy.</div>}
        {preview?.notice && <p className="strategy-action-note">{preview.notice}</p>}
        {operationResult && <div className="strategy-action-result" role="status">{operationResult.submitted?.length ? operationResult.submitted.map(order => <span key={order.order_id}>{order.transaction_type} {order.exchange}:{order.tradingsymbol} · {order.quantity} · order {order.order_id}</span>) : 'No orders were needed.'}</div>}
      </>}
      {operationError && <div className="strategy-error" role="alert">{operationError}</div>}
      <div className="strategy-detail-actions">
        <button className="secondary-button" type="button" onClick={() => setSelected(null)}>Close</button>
        {operation === 'details' ? <>
          <button className="primary-button" type="button" disabled={demoMode} onClick={() => open(selected, 'run')}><Play size={13}/> Run</button>
          <button className="secondary-button" type="button" disabled={demoMode} onClick={() => open(selected, 'exit')}>Exit</button>
        </> : preview && !operationResult && <button className="primary-button" type="button" disabled={operationBusy || !preview.orders?.length} onClick={confirmOperation}>{operationBusy ? <><span className="spinner"/> Sending…</> : operation === 'run' ? 'Confirm & place orders' : 'Confirm exit orders'}</button>}
      </div>
    </section></div>}
  </div>
}

function Dashboard({ initialProfile, onLogout, demoMode = false }) {
  const [activeTab, setActiveTab] = useState('Overview')
  const [profile, setProfile] = useState(initialProfile)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tabs, setTabs] = useState(initialTabs)
  const [toast, setToast] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [algoReport, setAlgoReport] = useState(null)
  const [algoLivePrices, setAlgoLivePrices] = useState({})
  const [algoOhlcPrices, setAlgoOhlcPrices] = useState({})
  const [algoLiveStatus, setAlgoLiveStatus] = useState('Waiting for breakout results')
  const [gttRows, setGttRows] = useState([])
  const [strategies, setStrategies] = useState([])
  const [strategiesLoading, setStrategiesLoading] = useState(true)
  const [strategiesError, setStrategiesError] = useState('')
  useEffect(() => {
    let active = true
    fetch(`${API}/api/strategies`)
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Could not load strategies.')
        return body.strategies
      })
      .then(items => { if (active) setStrategies(items) })
      .catch(loadError => { if (active) setStrategiesError(loadError.message || 'Could not load strategies.') })
      .finally(() => { if (active) setStrategiesLoading(false) })
    return () => { active = false }
  }, [])
  async function saveStrategy(draft, id) {
    const response = await fetch(`${API}/api/strategies${id ? `/${encodeURIComponent(id)}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.detail || 'Could not save this strategy.')
    setStrategies(current => [...current.filter(strategy => strategy.id !== body.strategy.id), body.strategy].sort((left, right) => new Date(right.created_at) - new Date(left.created_at)))
    setStrategiesError('')
    setToast(id ? 'Strategy updated' : 'Strategy saved')
  }
  async function toggleStrategyStar(id) {
    try {
      const response = await fetch(`${API}/api/strategies/${encodeURIComponent(id)}/star`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Could not update the starred status.')
      setStrategies(current => current.map(strategy => strategy.id === id ? body.strategy : strategy))
      setStrategiesError('')
    } catch (starError) {
      setStrategiesError(starError.message || 'Could not update the starred status.')
    }
  }
  async function deleteStrategy(id) {
    const response = await fetch(`${API}/api/strategies/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) {
      const body = await response.json()
      const deleteError = new Error(body.detail || 'Could not delete this strategy.')
      setStrategiesError(deleteError.message)
      throw deleteError
    }
    setStrategies(current => current.filter(strategy => strategy.id !== id))
    setStrategiesError('')
    setToast('Strategy deleted')
  }
  const fetchProfile = useCallback(async () => {
    if (demoMode) { setProfile(initialProfile); setLoading(false); setError(''); return }
    setLoading(true); setError('')
    try { const response = await fetch(`${API}/api/profile`); const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Could not load your profile.'); setProfile(body) }
    catch (err) { setError(err.message || 'Could not connect to the backend.') }
    finally { setLoading(false) }
  }, [demoMode, initialProfile])
  useEffect(() => { if (!demoMode) fetchProfile() }, [fetchProfile, demoMode])
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => {
    if (!settingsOpen) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSettingsOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [settingsOpen])
  const selectTab = (tab) => { setActiveTab(tab); setMobileOpen(false); if (tab === 'User' && !demoMode) fetchProfile() }
  const addTab = () => { const name = window.prompt('Name your new tab'); if (!name?.trim()) return; const clean = name.trim(); if (!tabs.includes(clean)) setTabs([...tabs, clean]); setActiveTab(clean) }
  const content = activeTab === 'Overview' ? <Overview profile={profile} onUser={() => selectTab('User')} demoMode={demoMode}/> : activeTab === 'User' ? <UserTab profile={profile} loading={loading} error={error} reload={fetchProfile}/> : activeTab === 'Signals' ? <SignalsTab demoMode={demoMode}/> : activeTab === 'GTT Placement' ? <GttPlacement report={algoReport} prices={algoLivePrices} snapshots={algoOhlcPrices} rows={gttRows} setRows={setGttRows} liveStatus={algoLiveStatus}/> : activeTab === 'Buy / Sell' ? <StockOrderTab demoMode={demoMode}/> : activeTab === 'Strategy Builder' ? <StrategyBuilder strategies={strategies} loading={strategiesLoading} error={strategiesError} onSave={saveStrategy} onDelete={deleteStrategy} onOpenLibrary={() => selectTab('Strategies')}/> : activeTab === 'Strategies' ? <StrategyLibrary strategies={strategies} loading={strategiesLoading} error={strategiesError} onToggleStar={toggleStrategyStar} demoMode={demoMode}/> : activeTab === 'Algo Signals' ? demoMode ? <Placeholder name="Algo Signals demo"/> : null : <Placeholder name={activeTab}/>
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}><div className="sidebar-top"><Brand/><IconButton label="Close menu" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={17}/></IconButton></div><div className="workspace-switcher"><span className="workspace-avatar">N</span><span className="workspace-name"><strong>Northstar desk</strong><small>Personal workspace</small></span><ChevronDown size={14}/></div><div className="side-label">WORKSPACE</div><nav className="nav-list"><button className={`nav-item ${activeTab === 'Overview' ? 'active' : ''}`} onClick={() => selectTab('Overview')}><LayoutDashboard size={17}/><span>Overview</span><span className="nav-indicator"/></button><button className={`nav-item ${activeTab === 'User' ? 'active' : ''}`} onClick={() => selectTab('User')}><UserRound size={17}/><span>User profile</span></button><button className={`nav-item ${activeTab === 'Signals' ? 'active' : ''}`} onClick={() => selectTab('Signals')}><Activity size={17}/><span>Signals</span></button><button className={`nav-item ${activeTab === 'Algo Signals' ? 'active' : ''}`} onClick={() => selectTab('Algo Signals')}><Activity size={17}/><span>Algo Signals</span></button><button className={`nav-item ${activeTab === 'GTT Placement' ? 'active' : ''}`} onClick={() => selectTab('GTT Placement')}><Activity size={17}/><span>GTT Placement</span></button><button className={`nav-item ${activeTab === 'Buy / Sell' ? 'active' : ''}`} onClick={() => selectTab('Buy / Sell')}><ArrowRight size={17}/><span>Buy / Sell</span></button><button className={`nav-item ${activeTab === 'Strategy Builder' ? 'active' : ''}`} onClick={() => selectTab('Strategy Builder')}><Plus size={17}/><span>Strategy builder</span></button><button className={`nav-item ${activeTab === 'Strategies' ? 'active' : ''}`} onClick={() => selectTab('Strategies')}><Star size={17}/><span>Strategies</span></button><button className={`nav-item ${activeTab === 'Holdings' ? 'active' : ''}`} onClick={() => selectTab('Holdings')}><Wallet size={17}/><span>Holdings</span><span className="nav-soon">SOON</span></button><button className={`nav-item ${activeTab === 'Orders' ? 'active' : ''}`} onClick={() => selectTab('Orders')}><Activity size={17}/><span>Orders</span><span className="nav-soon">SOON</span></button></nav><div className="sidebar-bottom"><div className="sidebar-divider"/><button className={`nav-item ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(true)}><Settings2 size={17}/><span>Preferences</span></button><button className="nav-item" onClick={() => setToast('Help center coming soon')}><CircleHelp size={17}/><span>Help & support</span></button><div className="account-switch"><div className="mini-avatar">{profile?.user_name?.charAt(0)?.toUpperCase() || 'K'}</div><span className="account-switch-name"><strong>{profile?.user_name || 'Kite account'}</strong><small>{profile?.user_id || 'Connected'}</small></span><button className="logout-button" onClick={onLogout} title="Sign out"><LogOut size={15}/></button></div></div></aside>
    {mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close menu"/>}
    <main className="main-area"><header className="topbar"><div className="topbar-left"><IconButton label="Open navigation" className="mobile-menu-button" onClick={() => setMobileOpen(true)}><Menu size={18}/></IconButton><IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="collapse-button" onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={16}/></IconButton><span className="breadcrumb">Workspace</span><span className="breadcrumb-slash">/</span><span className="breadcrumb-current">{activeTab}</span></div><div className="topbar-right"><div className={`connection-pill ${demoMode ? 'demo-connection-pill' : ''}`}><span className={demoMode ? '' : 'date-dot'}/>{demoMode ? 'Demo · disconnected' : 'Kite connected'}</div><IconButton label="Search" onClick={() => setSearchOpen(!searchOpen)}><Search size={17}/></IconButton><div className="notification-wrap"><IconButton label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={17}/></IconButton><span className="notification-dot"/>{notificationsOpen && <div className="popover notification-popover"><strong>You’re all caught up</strong><span>No new notifications</span></div>}</div><div className="topbar-avatar">{profile?.user_name?.charAt(0)?.toUpperCase() || 'K'}</div></div></header>
      {searchOpen && <div className="search-overlay"><Search size={16}/><input autoFocus placeholder="Search your workspace…" onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); if (e.key === 'Enter' && e.target.value.toLowerCase().includes('user')) { selectTab('User'); setSearchOpen(false) } }}/><span>ESC</span></div>}
      <section className="page-content"><div className="workspace-tabs" role="tablist" aria-label="Dashboard tabs">{tabs.map(tab => <button role="tab" aria-selected={activeTab === tab} key={tab} className={`workspace-tab ${activeTab === tab ? 'selected' : ''}`} onClick={() => selectTab(tab)}>{tab}{tab === 'Holdings' || tab === 'Orders' ? <span className="tab-soon">SOON</span> : null}</button>)}<button className="add-tab" onClick={addTab} aria-label="Add dashboard tab" title="Add tab"><Plus size={14}/></button></div>{!demoMode && <div style={{ display: activeTab === 'Algo Signals' ? 'contents' : 'none' }}><AlgoSignalsTab onReport={setAlgoReport} onLivePrices={setAlgoLivePrices} onOhlcPrices={setAlgoOhlcPrices} onLiveStatus={setAlgoLiveStatus} onPlacementRows={setGttRows}/></div>}{content}<footer className="app-footer"><span>© 2026 NORTHSTAR DESK</span><span>POWERED BY <b>KITE CONNECT</b></span></footer></section>
    </main>
    {settingsOpen && <div className="preferences-backdrop" onClick={event => { if (event.target === event.currentTarget) setSettingsOpen(false) }}><section className="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title"><header className="preferences-dialog-header"><div><span className="results-eyebrow">LOCAL WORKSPACE</span><h2 id="preferences-title">Preferences</h2><p>Workspace display and connection details.</p></div><button className="icon-button" type="button" aria-label="Close preferences" autoFocus onClick={() => setSettingsOpen(false)}><X size={17}/></button></header><div className="preferences-dialog-options"><div><strong>Dark mode</strong><span>ON</span></div><div><strong>Backend</strong><span>LOCAL</span></div></div></section></div>}
    {toast && <div className="toast"><ShieldCheck size={15}/>{toast}</div>}
  </div>
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(null)
  const [checking, setChecking] = useState(true)
  const [initialProfile, setInitialProfile] = useState(null)
  const [demoMode, setDemoMode] = useState(false)
  const [loginKey, setLoginKey] = useState(0)
  useEffect(() => { let active = true; fetch(`${API}/api/session`).then(r => r.json()).then(data => { if (active && data.authenticated) { setInitialProfile(data.profile); setDemoMode(false); setAuthenticated(true) } }).catch(() => {}).finally(() => { if (active) setChecking(false) }); return () => { active = false } }, [loginKey])
  if (checking) return <div className="boot-screen"><Brand/><span className="spinner"/></div>
  if (!authenticated) return <Login onLogin={(profile) => { setInitialProfile(profile); setDemoMode(false); setAuthenticated(true) }} onDemo={() => { setInitialProfile({ user_name: 'Demo Trader', user_id: 'DEMO', products: ['CNC'], exchanges: ['NSE'] }); setDemoMode(true); setAuthenticated(true) }}/>
  return <Dashboard key={`${loginKey}-${demoMode ? 'demo' : 'live'}`} initialProfile={initialProfile} demoMode={demoMode} onLogout={async () => { try { if (!demoMode) await fetch(`${API}/api/logout`, { method: 'POST' }) } finally { setAuthenticated(false); setInitialProfile(null); setDemoMode(false); setLoginKey(k => k + 1); setChecking(true) } }}/>
}
