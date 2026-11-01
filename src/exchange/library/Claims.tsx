import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type ClaimDetail, type ClaimList, type ClaimView, type ClaimWalked, type ResumeRequest } from '../api'
import { useDialogs } from './Dialogs'
import { claimNext as next, plural, RESUMES } from './format'
import WalkDialog from './WalkDialog'

// The Claims view (R5): one row per claim with its milestone gauge and whose turn it is, and the
// chosen claim's path, notes and requisitions, with what its turn asks for: walk it, release or
// resume its requisition, or set up a process. The core derives all of it; this only shows it, and
// reads again whenever the core says a claim may have moved. Anything that queues also runs: a
// requisition left queued with nothing running would read as Exchange's turn for ever.

const MILESTONES = ['claimed', 'acquired', 'converted', 'installed']
const LABELS: Record<string, string> = { claimed: 'Claimed', acquired: 'Acquired', converted: 'Converted', installed: 'Installed' }
const TURNS: Record<ClaimView['turn'], string> = { you: 'Your turn', exchange: 'Exchange', build: 'To build', none: 'Closed' }
const FILTERS = [['open', 'Open'], ['waiting', 'Waiting on you'], ['all', 'All']] as const
type Filter = typeof FILTERS[number][0]

interface Props {
  revision: number // grows when a claim may have moved
  focus: string | null // the claim to show first
  busy: boolean // a job writes the library
  setUp: () => void // go to Settings › Processes
  reveal: (path: string) => void // show a folder in Explorer
  say: (text: string, error?: boolean) => void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const matches = (claim: ClaimView, filter: Filter) => filter === 'all' || (filter === 'waiting' ? claim.turn === 'you' : !claim.closed)
const name = (claim: ClaimView) => claim.thing_name || claim.thing || claim.id

// Four milestones Exchange reaches, and In play, which is the user's step: always hollow.
export function Gauge({ claim, wide = false }: { claim: ClaimView; wide?: boolean }) {
  const reached = MILESTONES.indexOf(claim.milestone || '') + 1
  const label = LABELS[claim.milestone || ''] || claim.milestone || 'No milestone'
  return <span title={`${label}; In play is your step`}>
    <span className={`library-gauge ${wide ? 'wide' : ''} ${claim.closed ? 'closed' : ''}`} role="img" aria-label={`Milestone: ${label}`}>
      {MILESTONES.map((milestone, i) => <i key={milestone} className={i < reached ? 'on' : ''} />)}
      <i className="yours" />
    </span>
    <small className="library-gauge-label">{label}</small>
  </span>
}

export default function Claims({ revision, focus, busy, setUp, reveal, say }: Props) {
  const dialogs = useDialogs()
  const [list, setList] = useState<ClaimList | null>(null)
  const [filter, setFilter] = useState<Filter>(focus ? 'all' : 'open')
  const [chosen, setChosen] = useState(focus)
  const [detail, setDetail] = useState<ClaimDetail | null>(null)
  const [reads, setReads] = useState(0) // after an action here
  const [error, setError] = useState('')
  const [walking, setWalking] = useState<ClaimDetail | null>(null) // Walk with options…

  useEffect(() => {
    let live = true
    exchangeGet('claims', { query: { all: true } }).then(value => { if (live) { setList(value); setError('') } }).catch(problem => { if (live) setError(message(problem)) })
    return () => { live = false }
  }, [revision, reads])
  const shown = (list?.claims || []).filter(claim => matches(claim, filter))
  const selected = shown.find(claim => claim.id === chosen)?.id ?? shown[0]?.id ?? null
  useEffect(() => {
    if (selected === null) return
    let live = true
    exchangeGet('claims/{id}', { path: { id: selected } }).then(value => { if (live) setDetail(value) }).catch(() => { if (live) setDetail(null) })
    return () => { live = false }
  }, [selected, revision, reads])

  const close = async (claim: ClaimDetail) => {
    const reason = await dialogs.ask({ title: `Close the claim on ${name(claim)}?`, text: 'It keeps its milestone and leaves the open list.',
      label: 'Why (optional)', optional: true, confirm: 'Close claim' })
    if (reason === null) return
    try {
      await exchangePost('claims/{id}/close', { path: { id: claim.id }, body: { reason: reason || null } })
      say(`Closed the claim on ${name(claim)}`)
      setReads(n => n + 1)
    } catch (problem) { say(message(problem), true) }
  }
  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work()
      say(done)
      setReads(n => n + 1)
    } catch (problem) { say(message(problem), true) }
  }
  const run = (id: number) => exchangePost('jobs/requisitions', { body: { ids: [id] } })
  const walked = (claim: ClaimView, result: ClaimWalked) => {
    say(result.problem ? `Queued, not running: ${result.problem}` : `Walking ${name(claim)}`, !!result.problem)
    setReads(n => n + 1)
  }
  const walk = async (claim: ClaimView) => {
    try { walked(claim, await exchangePost('claims/{id}/walk', { path: { id: claim.id } })) } catch (problem) { say(message(problem), true) }
  }
  const release = (id: number) => void act(async () => {
    await exchangePost('requisitions/{requisition_id}/hold', { path: { requisition_id: id }, body: { held: false } })
    await run(id)
  }, 'Released · running')
  const resume = (id: number, onCollision: ResumeRequest['on_collision']) => void act(async () => {
    await exchangePost('requisitions/{requisition_id}/resume', { path: { requisition_id: id }, body: { on_collision: onCollision } })
    await run(id)
  }, 'Resumed · running')
  const resumeMenu = (id: number, x: number, y: number) => dialogs.menu(x, y, RESUMES.map(([collision, label]) => ({ label, run: () => resume(id, collision) })), 'Resume')
  const count = (value: Filter) => (list?.claims || []).filter(claim => matches(claim, value)).length

  return <div className="library-claims">
    <div className="library-claims-bar">
      <div className="library-group" role="group" aria-label="Show">
        {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
          {label} <small>{list ? count(value).toLocaleString() : ''}</small></button>)}
      </div>
    </div>
    {error && <p className="library-error" role="alert">{error}</p>}
    {list?.problems.map(problem => <p key={problem} className="library-error" role="alert">{problem}</p>)}
    <div className="library-claims-body">
      <div className="library-claims-list">
        {list && !shown.length && <p className="library-muted">{list.claims.length ? 'No claims here.' : 'No claims yet. Right-click an asset and choose Claim….'}</p>}
        {shown.length > 0 && <table className="library-files">
          <thead><tr><th>Claim</th><th>Place</th><th>Milestone</th><th>Turn</th><th>Next</th></tr></thead>
          <tbody>{shown.map(claim => <tr key={claim.id} className={`${claim.id === selected ? 'selected' : ''} ${claim.closed ? 'closed' : ''}`}
            aria-selected={claim.id === selected} onClick={() => setChosen(claim.id)}>
            <td>{name(claim)}{claim.as && <small>as {claim.as}</small>}</td>
            <td>{claim.place_name || claim.place}</td>
            <td><Gauge claim={claim} /></td>
            <td><span className={`library-turn ${claim.turn}`}>{TURNS[claim.turn]}</span></td>
            <td>{next(claim)}</td>
          </tr>)}</tbody>
        </table>}
      </div>
      {detail && detail.id === selected && <Detail claim={detail} busy={busy} close={() => void close(detail)} setUp={setUp} reveal={reveal}
        walk={() => void walk(detail)} walkOptions={() => setWalking(detail)} release={release} resume={resumeMenu}
        run={id => void act(() => run(id), 'Running')} />}
    </div>
    {walking && <WalkDialog id={walking.id} title={name(walking)} close={() => setWalking(null)} walked={result => walked(walking, result)} />}
  </div>
}

interface DetailProps {
  claim: ClaimDetail
  busy: boolean
  close: () => void
  setUp: () => void
  reveal: (path: string) => void
  walk: () => void
  walkOptions: () => void
  release: (id: number) => void
  resume: (id: number, x: number, y: number) => void
  run: (id: number) => void
}

function Detail({ claim, busy, close, setUp, reveal, walk, walkOptions, release, resume, run }: DetailProps) {
  const path = claim.path
  const latest = claim.requisitions[claim.requisitions.length - 1]
  const id = latest?.id ?? null, state = latest?.state ?? null
  const stopped = state === 'needs_attention' || state === 'failed' || state === 'partially_fulfilled'
  const open = !claim.closed
  const canWalk = open && path.status === 'ready' && claim.milestone !== 'installed' && !['queued', 'running', 'held', 'needs_attention'].includes(state || '')
  const [work, setWork] = useState<{ id: number; folder: string | null } | null>(null)
  useEffect(() => {
    if (!stopped || id === null) return
    let live = true
    exchangeGet('requisitions/{requisition_id}', { path: { requisition_id: id } }).then(value => { if (live) setWork({ id, folder: value.work_folder ?? null }) }).catch(() => {})
    return () => { live = false }
  }, [stopped, id])
  const folder = stopped && work && work.id === id ? work.folder : null
  const rows: [string, string][] = [['As', claim.as || 'No role'], ['Place', claim.place_name || claim.place || 'Unknown'],
    ['Folder', claim.folder || 'The place’s default'], ['Path', path.processes.join(' → ') || path.problem || 'None'], ['Made', claim.created || 'Unknown']]
  if (claim.closed) rows.push(['Closed', claim.closed])
  return <aside className="library-claims-detail" aria-label="Claim">
    <h3>{name(claim)}</h3>
    <Gauge claim={claim} wide />
    <p><span className={`library-turn ${claim.turn}`}>{TURNS[claim.turn]}</span></p>
    {next(claim) && <p>{next(claim)}</p>}
    <dl className="library-fields">{rows.map(([label, value]) => <div key={label} className="library-field-row"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {claim.notes.trim() && <><h4>Notes</h4><pre className="library-claims-notes">{claim.notes.trim()}</pre></>}
    {claim.requisitions.length > 0 && <>
      <h4>{plural(claim.requisitions.length, 'requisition')}</h4>
      <ul className="library-history">{claim.requisitions.map(r => <li key={r.uid ?? r.id}>
        {r.id === null ? <small>{r.uid}: no longer in the library</small> : <span>Requisition {r.id} <span className={`library-state ${r.state}`}>{(r.state || '').replace(/_/g, ' ')}</span></span>}
        {r.message && <small>{r.message}</small>}
      </li>)}</ul>
    </>}
    <div className="library-claims-actions">
      {canWalk && <button type="button" className="library-button primary" disabled={busy} onClick={walk}
        title={busy ? 'Wait for the running job' : 'With the options last used'}>{claim.requisitions.length ? 'Walk again' : 'Walk'}</button>}
      {canWalk && <button type="button" className="library-button" disabled={busy} onClick={walkOptions}>Walk with options…</button>}
      {open && id !== null && state === 'held' && <button type="button" className="library-button primary" disabled={busy} onClick={() => release(id)}>Release</button>}
      {open && id !== null && state === 'queued' && <button type="button" className="library-button primary" disabled={busy} onClick={() => run(id)}>Run it</button>}
      {open && id !== null && stopped && <button type="button" className="library-button primary" disabled={busy} aria-haspopup="menu"
        title="Continue after a checkpoint or a collision; failed items are retried" onClick={event => resume(id, event.clientX, event.clientY)}>Resume ▾</button>}
      {open && folder && <button type="button" className="library-button" title={folder} onClick={() => reveal(folder)}>Show the work folder</button>}
      {open && path.status === 'not_ready' && <button type="button" className="library-button primary" onClick={setUp}>Set up {path.process}</button>}
      {open && <button type="button" className="library-button" onClick={close}>Close…</button>}
    </div>
  </aside>
}
