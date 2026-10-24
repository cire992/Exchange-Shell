import { useState } from 'react'
import { api, reportError, useDesktop } from '../desktop/client'

// The Exchange core's service as this shell runs it, while it is not connected: why, where, and
// Retry. Once it is connected the Workspace shows the library instead.
export default function ServiceStatus() {
  const { exchange } = useDesktop()
  const [busy, setBusy] = useState(false)
  const retry = async () => { setBusy(true); try { await api('/exchange/restart', {}) } catch (error) { reportError(error) } finally { setBusy(false) } }
  return <section className={`exchange-service ${exchange.status}`} aria-label="Exchange service" aria-live="polite">
    <header><i aria-hidden="true" /><strong>{{ off: 'Not set up', starting: 'Starting', ready: 'Connected', error: 'Not running', stopped: 'Stopped' }[exchange.status]}</strong>
      {exchange.status === 'ready' && <small>core {exchange.version} · API v{exchange.api}</small>}</header>
    <p className="exchange-service-message">{exchange.message || 'Starting the Exchange service…'}</p>
    {(exchange.core || exchange.dataDir) && <dl>
      {exchange.core && <><dt>Core</dt><dd title={exchange.core}>{exchange.core}</dd></>}
      <dt>Library</dt><dd>{exchange.dataDir || 'Default data folder (%LOCALAPPDATA%\\Exchange)'}</dd>
    </dl>}
    {(exchange.status === 'error' || exchange.status === 'stopped') && <button type="button" className="exchange-button" disabled={busy} onClick={() => void retry()}>{busy ? 'Starting…' : 'Retry'}</button>}
    {exchange.status === 'off' && <p className="exchange-service-hint">Open Settings in the rail on the right and choose the Exchange core folder.</p>}
  </section>
}
