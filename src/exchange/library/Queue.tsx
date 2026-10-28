import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type RequisitionDetail, type RequisitionRow, type ResumeRequest } from '../api'
import { useDialogs } from './Dialogs'
import { shortDate } from './format'

// The requisition queue (Roadmap phase 6i), the PySide6 window's queue view: waiting and running
// requisitions in order, then finished ones; the chosen one's items, outputs and files; and what
// to do with it. Running the queue and removing output are the core's jobs (one writing job at a
// time); the other actions wait while one runs.

const STATES: Record<string, string> = { queued: 'Queued', held: 'Held', running: 'Running', needs_attention: 'Needs attention', fulfilled: 'Fulfilled',
  partially_fulfilled: 'Partly fulfilled', failed: 'Failed', stale: 'Stale', removed: 'Removed', replaced: 'Replaced' }
const RESUMES: [ResumeRequest['on_collision'], string][] = [[null, 'Resume'], ['overwrite', 'Resume, overwriting'], ['rename', 'Resume, renaming new files'], ['skip', 'Resume, skipping those files']]

interface Props {
  revision: number // after jobs end and other edits
  busy: boolean // a job writes the library
  changed: () => void // the queue changed: counts elsewhere follow
  say: (text: string, error?: boolean) => void
  run: (ids?: number[]) => void
  removeOutput: (id: number) => void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function Queue({ revision, busy, changed, say, run, removeOutput }: Props) {
  const dialogs = useDialogs()
  const [rows, setRows] = useState<RequisitionRow[] | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [detail, setDetail] = useState<RequisitionDetail | null>(null)
  const [reads, setReads] = useState(0) // after an action here
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    exchangeGet('requisitions').then(list => { if (live) { setRows(list); setError('') } }).catch(problem => { if (live) setError(message(problem)) })
    return () => { live = false }
  }, [revision, reads])
  const selected = chosen ?? rows?.[0]?.id ?? null
  useEffect(() => {
    if (selected === null) return
    let live = true
    exchangeGet('requisitions/{requisition_id}', { path: { requisition_id: selected } }).then(value => { if (live) setDetail(value) }).catch(() => { if (live) setDetail(null) })
    return () => { live = false }
  }, [selected, revision, reads])

  const act = async (work: () => Promise<unknown>, done?: string) => {
    try {
      await work()
      if (done) say(done)
      setReads(n => n + 1)
      changed()
    } catch (problem) { say(message(problem), true) }
  }
  const row = rows?.find(r => r.id === selected)
  const state = row?.state
  const waiting = (rows || []).filter(r => r.state === 'queued' || r.state === 'held')
  const place = waiting.findIndex(r => r.id === selected) + 1 // 1-based
  const id = selected ?? 0
  const can = {
    hold: state === 'queued', release: state === 'held', up: place > 1, down: place > 0 && place < waiting.length,
    resume: state === 'needs_attention' || state === 'failed' || state === 'partially_fulfilled',
    rebuild: state === 'stale' || state === 'fulfilled' || state === 'partially_fulfilled',
    remove: ['fulfilled', 'partially_fulfilled', 'stale', 'needs_attention', 'failed'].includes(state || ''),
  }
  const resume = (x: number, y: number) => dialogs.menu(x, y, RESUMES.map(([collision, label]) => ({ label, run: () => void act(
    () => exchangePost('requisitions/{requisition_id}/resume', { path: { requisition_id: id }, body: { on_collision: collision } }),
    'Queued again · Run queue to continue') })), 'Resume')
  const remove = async () => {
    if (await dialogs.confirm('Remove its output?', 'Everything this requisition wrote moves to Exchange’s recycle folder, and files it overwrote are put back.', 'Remove output')) removeOutput(id)
  }
  const written = (detail?.writes || []).filter(w => w.action !== 'sidecar' && !w.removed_at).length

  return <div className="library-queue">
    <div className="library-queue-bar" role="toolbar" aria-label="Queue">
      <button type="button" className="library-button primary" disabled={busy || !(rows || []).some(r => r.state === 'queued')} onClick={() => run()}>
        {busy ? 'Running…' : 'Run queue'}</button>
      <button type="button" className="library-button" disabled={busy || !can.hold} title="Keep it from running"
        onClick={() => void act(() => exchangePost('requisitions/{requisition_id}/hold', { path: { requisition_id: id }, body: { held: true } }))}>Hold</button>
      <button type="button" className="library-button" disabled={busy || !can.release} title="Let it run again"
        onClick={() => void act(() => exchangePost('requisitions/{requisition_id}/hold', { path: { requisition_id: id }, body: { held: false } }))}>Release</button>
      <button type="button" className="library-button" disabled={busy || !can.up}
        onClick={() => void act(() => exchangePost('requisitions/{requisition_id}/move', { path: { requisition_id: id }, body: { position: place - 1 } }))}>Move up</button>
      <button type="button" className="library-button" disabled={busy || !can.down}
        onClick={() => void act(() => exchangePost('requisitions/{requisition_id}/move', { path: { requisition_id: id }, body: { position: place + 1 } }))}>Move down</button>
      <button type="button" className="library-button" disabled={busy || !can.resume} aria-haspopup="menu"
        title="Continue after a checkpoint or a collision; failed items are retried" onClick={event => resume(event.clientX, event.clientY)}>Resume ▾</button>
      <button type="button" className="library-button" disabled={busy || !can.rebuild} title="Queue it again with the current processes, overwriting its output"
        onClick={() => void act(async () => { const made = await exchangePost('requisitions/{requisition_id}/rebuild', { path: { requisition_id: id } }); setChosen(made.id) },
          'Rebuild queued · Run queue to run it')}>Rebuild</button>
      <button type="button" className="library-button" disabled={busy || !can.remove} title="Move what it wrote to the recycle folder; put back what it overwrote"
        onClick={() => void remove()}>Remove output…</button>
      <span />
      <button type="button" className="library-button" disabled={busy} title="Find requisitions whose source or process changed since"
        onClick={() => void act(async () => {
          const found = await exchangePost('requisitions/check-stale')
          say(found.length ? `${found.length} requisition${found.length === 1 ? '' : 's'} stale: ${found.map(f => f.why).join('; ')}` : 'Nothing is stale')
        })}>Check stale</button>
    </div>
    {error && <p className="library-error" role="alert">{error}</p>}
    <div className="library-queue-body">
      <div className="library-queue-list">
        {rows && !rows.length && <p className="library-muted">Nothing requisitioned yet. Right-click assets and choose Requisition to….</p>}
        {rows && rows.length > 0 && <table className="library-files">
          <thead><tr><th>Requisition</th><th>Into</th><th>State</th><th className="library-number">Items</th><th>Queued</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id} className={r.id === selected ? 'selected' : ''} aria-selected={r.id === selected} onClick={() => setChosen(r.id)}>
            <td>{r.name}</td><td>{r.environment}</td>
            <td><span className={`library-state ${r.state}`}>{STATES[r.state] || r.state}</span></td>
            <td className="library-number">{r.done}/{r.items}</td><td>{shortDate(r.created_at)}</td>
          </tr>)}</tbody>
        </table>}
      </div>
      {detail && detail.id === selected && <aside className="library-queue-detail" aria-label="Requisition">
        <h3>{detail.name}</h3>
        <p><span className={`library-state ${detail.state}`}>{STATES[detail.state] || detail.state}</span> · requisition {detail.id}</p>
        {detail.message && <p className={detail.state === 'needs_attention' || detail.state === 'failed' ? 'library-error' : 'library-muted'}>{detail.message}</p>}
        <dl className="library-fields">
          <div className="library-field-row"><dt>Writes to</dt><dd>{detail.endpoint.label}<br /><small>{detail.endpoint.folder}</small></dd></div>
          <div className="library-field-row"><dt>Visibility</dt><dd>{detail.endpoint.visibility}</dd></div>
          <div className="library-field-row"><dt>When files exist</dt><dd>{detail.on_collision}</dd></div>
          <div className="library-field-row"><dt>Files written</dt><dd>{written.toLocaleString()}</dd></div>
        </dl>
        <h4>Items</h4>
        <ul className="library-history">{detail.items.map(item => <li key={item.id}>
          <span>{item.name} <small>· {item.processes.map(p => String(p.id)).join(' → ') || '—'} · {item.include ? item.state : 'left out'}</small></span>
          {item.message && <small>{item.message}</small>}
          {item.outputs.length > 0 && <small>{item.outputs.length} output{item.outputs.length === 1 ? '' : 's'}</small>}
        </li>)}</ul>
      </aside>}
    </div>
  </div>
}
