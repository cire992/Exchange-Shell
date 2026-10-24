import { useState } from 'react'
import { api, useDesktop } from '../desktop/client'

// Settings › Exchange core: where the core repository is, and optionally which data folder
// (library database, thumbnails) its service uses.
export default function CoreSettings() {
  const { settings, exchange } = useDesktop()
  // An unedited field shows the saved setting; an edit is a draft until it is saved.
  const [draftCore, setCore] = useState<string | null>(null)
  const [draftData, setDataDir] = useState<string | null>(null)
  const core = draftCore ?? settings.exchangeCore ?? '', dataDir = draftData ?? settings.exchangeDataDir ?? ''
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const changed = core.trim() !== (settings.exchangeCore || '') || dataDir.trim() !== (settings.exchangeDataDir || '')
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await api('/settings', { exchangeCore: core.trim() || null, exchangeDataDir: dataDir.trim() || null }); setCore(null); setDataDir(null) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }
  return <section><h3>Exchange core</h3>
    <form className="exchange-core-settings" onSubmit={event => void save(event)}>
      <label>Core folder<input value={core} onChange={event => setCore(event.target.value)} placeholder="C:\path\to\3dExchange" spellCheck={false} /></label>
      <label>Data folder <small>optional</small><input value={dataDir} onChange={event => setDataDir(event.target.value)} placeholder="Default: %LOCALAPPDATA%\Exchange" spellCheck={false} /></label>
      <p>The shell runs the core's <code>.venv</code> Python (<code>exchange serve</code>, with the <code>service</code> extra). The data folder holds the library database and thumbnails.</p>
      <p className="exchange-core-state">Service: {exchange.status}{exchange.status !== 'ready' && exchange.message ? ` · ${exchange.message.split('\n')[0]}` : ''}</p>
      {error && <p className="desk-error-inline" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save and restart the service'}</button>
    </form>
  </section>
}
