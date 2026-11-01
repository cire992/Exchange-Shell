import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type ClaimDetail, type ClaimList, type ClaimView } from '../api'
import { useDialogs } from './Dialogs'
import { claimNext as next, plural } from './format'

// The Claims view (R5): one row per claim with its milestone gauge and whose turn it is, and the
// chosen claim's path, notes and requisitions. The core derives all of it; this only shows it, and
// reads again whenever the core says a claim may have moved.

const MILESTONES = ['claimed', 'acquired', 'converted', 'installed']
const LABELS: Record<string, string> = { claimed: 'Claimed', acquired: 'Acquired', converted: 'Converted', installed: 'Installed' }
const TURNS: Record<ClaimView['turn'], string> = { you: 'Your turn', exchange: 'Exchange', build: 'To build', none: 'Closed' }
const FILTERS = [['open', 'Open'], ['waiting', 'Waiting on you'], ['all', 'All']] as const
type Filter = typeof FILTERS[number][0]

interface Props {
  revision: number // grows when a claim may have moved
  focus: string | null // the claim to show first
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

export default function Claims({ revision, focus, say }: Props) {
  const dialogs = useDialogs()
  const [list, setList] = useState<ClaimList | null>(null)
  const [filter, setFilter] = useState<Filter>(focus ? 'all' : 'open')
  const [chosen, setChosen] = useState(focus)
  const [detail, setDetail] = useState<ClaimDetail | null>(null)
  const [reads, setReads] = useState(0) // after an action here
  const [error, setError] = useState('')

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
      {detail && detail.id === selected && <Detail claim={detail} close={() => void close(detail)} />}
    </div>
  </div>
}

function Detail({ claim, close }: { claim: ClaimDetail; close: () => void }) {
  const path = claim.path
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
    {!claim.closed && <div className="library-claims-actions"><button type="button" className="library-button" onClick={close}>Close…</button></div>}
  </aside>
}
