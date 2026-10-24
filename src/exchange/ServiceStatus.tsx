import { useEffect, useState } from 'react'
import { api, reportError, useDesktop } from '../desktop/client'
import { exchangeGet, type Environment } from './api'

// The Exchange core's service as this shell runs it, and a first look at the library through it.
export default function ServiceStatus() {
  const { exchange } = useDesktop()
  // What was read, for the connection it was read from; a new connection shows nothing stale.
  const connection = `${exchange.status}|${exchange.core}|${exchange.dataDir}`
  const [read, setRead] = useState<{ connection: string; environments?: Environment[]; assets?: number; error?: string }>({ connection: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (exchange.status !== 'ready') return
    let current = true
    const merge = (value: Partial<typeof read>) => { if (current) setRead(previous => ({ ...(previous.connection === connection ? previous : {}), connection, ...value })) }
    exchangeGet('environments').then(environments => merge({ environments })).catch(error => merge({ error: String(error.message || error) }))
    // The sidebar counts the whole library; on a large one it takes a couple of seconds.
    exchangeGet('sidebar').then(value => merge({ assets: value.all })).catch(() => {})
    return () => { current = false }
  }, [exchange.status, connection])
  const shown = read.connection === connection ? read : { connection }
  const environments = shown.environments || null, assets = shown.assets ?? null, readError = shown.error || ''
  const retry = async () => { setBusy(true); try { await api('/exchange/restart', {}) } catch (error) { reportError(error) } finally { setBusy(false) } }
  return <section className={`exchange-service ${exchange.status}`} aria-label="Exchange service" aria-live="polite">
    <header><i aria-hidden="true" /><strong>{{ off: 'Not set up', starting: 'Starting', ready: 'Connected', error: 'Not running', stopped: 'Stopped' }[exchange.status]}</strong>
      {exchange.status === 'ready' && <small>core {exchange.version} · API v{exchange.api}</small>}</header>
    {exchange.status === 'ready'
      ? <p>{assets === null ? 'Counting assets…' : `${assets.toLocaleString()} assets`}{environments && ` in ${environments.length} ${environments.length === 1 ? 'environment' : 'environments'}`}{environments?.length ? `: ${environments.map(item => item.name).join(', ')}` : ''}.</p>
      : <p className="exchange-service-message">{exchange.message || 'Starting the Exchange service…'}</p>}
    {readError && <p className="exchange-service-message" role="alert">{readError}</p>}
    {(exchange.core || exchange.dataDir) && <dl>
      {exchange.core && <><dt>Core</dt><dd title={exchange.core}>{exchange.core}</dd></>}
      <dt>Library</dt><dd>{exchange.dataDir || 'Default data folder (%LOCALAPPDATA%\\Exchange)'}</dd>
    </dl>}
    {(exchange.status === 'error' || exchange.status === 'stopped') && <button type="button" className="exchange-button" disabled={busy} onClick={() => void retry()}>{busy ? 'Starting…' : 'Retry'}</button>}
    {exchange.status === 'off' && <p className="exchange-service-hint">Open Settings in the rail on the right and choose the Exchange core folder.</p>}
  </section>
}
