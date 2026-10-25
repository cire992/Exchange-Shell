import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type EndpointView } from '../api'
import { useDialogs } from './Dialogs'

// Settings › Endpoints (Roadmap phase 6i), the window's: where requisitions write in each
// environment, whether the user chose that folder, and the endpoint's visibility (publishable
// endpoints warn when content that cannot be redistributed flows in). Changed through the
// environment's settings (/environments/{id}/config).

interface Props { say: (text: string, error?: boolean) => void }

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function Endpoints({ say }: Props) {
  const dialogs = useDialogs()
  const [rows, setRows] = useState<EndpointView[] | null>(null)
  const [reads, setReads] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    exchangeGet('endpoints').then(value => { if (live) { setRows(value); setError('') } }).catch(problem => { if (live) setError(message(problem)) })
    return () => { live = false }
  }, [reads])
  const save = async (row: EndpointView, body: { endpoint?: string | null; visibility?: string }, done: string) => {
    try {
      await exchangePost('environments/{env_id}/config', { path: { env_id: row.environment_id }, body })
      say(done)
      setReads(n => n + 1)
    } catch (problem) { say(message(problem), true) }
  }
  const change = async (row: EndpointView) => {
    const folder = await dialogs.ask({ title: `Where requisitions write in ${row.environment}`, label: 'Folder', value: row.custom ? row.folder || '' : '', confirm: 'Use it' })
    if (folder) await save(row, { endpoint: folder }, `${row.environment} writes to ${folder}`)
  }

  return <div className="library-endpoints">
    {error && <p className="library-error" role="alert">{error}</p>}
    {rows === null && !error && <p className="library-muted">Reading the endpoints…</p>}
    {rows && !rows.length && <p className="library-muted">No environments yet.</p>}
    {rows && rows.length > 0 && <table className="library-files">
      <thead><tr><th>Environment</th><th>Requisitions write to</th><th>Visibility</th><th aria-label="Change" /></tr></thead>
      <tbody>{rows.map(row => <tr key={row.environment_id} aria-label={row.environment}>
        <td>{row.environment}</td>
        <td>{row.problem ? <span className="library-error">{row.problem}</span>
          : <><span>{row.label}</span>{row.label !== row.folder && <><br /><small>{row.folder}</small></>}{!row.custom && <small> · default</small>}</>}</td>
        <td><div className="library-group" role="group" aria-label={`Visibility of ${row.environment}`}>{['personal', 'publishable'].map(value =>
          <button key={value} type="button" aria-pressed={row.visibility === value} onClick={() => { if (row.visibility !== value) void save(row, { visibility: value }, `${row.environment} is ${value}`) }}>
            {value === 'personal' ? 'Personal' : 'Publishable'}</button>)}</div></td>
        <td className="library-endpoint-actions">
          <button type="button" className="library-link" onClick={() => void change(row)}>Change…</button>
          {row.custom && <button type="button" className="library-link" onClick={() => void save(row, { endpoint: null }, `${row.environment} writes to its default folder`)}>Use the default</button>}
        </td>
      </tr>)}</tbody>
    </table>}
    <p className="library-muted">Publishable endpoints warn when content that can’t be redistributed flows in.</p>
  </div>
}
