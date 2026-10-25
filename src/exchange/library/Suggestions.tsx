import { useEffect, useState } from 'react'
import { exchangeGet, type DossierRef, type SuggestionItem } from '../api'
import type { LibraryActions } from './actions'
import { describeSuggestion, plural } from './format'

const PAGE = 300
const KINDS = [['', 'All suggestions'], ['texture_link', 'Texture links'], ['variant_group', 'Variant groups'], ['lexicon_word', 'Lexicon words']] as const

interface Props {
  revision: number // after any edit (a rejection changes nothing else)
  actions: LibraryActions
  show: (ref: DossierRef) => void
}

interface Loaded { key: string; rows: SuggestionItem[]; total: number; counts: Record<string, number>; error: string }

// The Unidentified desk's pending suggestions (the window's SuggestionsPanel): a checklist,
// accepted or rejected in batches, each batch one undoable step. A row shows what it is about in
// the inspector.
export default function Suggestions({ revision, actions, show }: Props) {
  const [kind, setKind] = useState('')
  // A new kind, or an edit, reads from the first page again; Show more reads the next.
  const key = `${kind}|${revision}`
  const [wanted, setWanted] = useState({ key: '', pages: 1 })
  const pages = wanted.key === key ? wanted.pages : 1
  const [loaded, setLoaded] = useState<Loaded>({ key: '', rows: [], total: 0, counts: {}, error: '' })
  const [checked, setChecked] = useState<{ key: string; ids: Set<number> }>({ key: '', ids: new Set() })
  const [current, setCurrent] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    const offset = (pages - 1) * PAGE
    exchangeGet('suggestions', { query: { kind: kind || null, offset, limit: PAGE } }).then(page => {
      if (!live) return
      setLoaded(previous => ({ key, rows: [...(previous.key === key ? previous.rows.slice(0, offset) : []), ...page.items], total: page.total, counts: page.counts, error: '' }))
    }).catch(error => { if (live) setLoaded({ key, rows: [], total: 0, counts: {}, error: error instanceof Error ? error.message : String(error) }) })
    return () => { live = false }
  }, [key, kind, pages])

  const fresh = loaded.key === key
  const rows = fresh ? loaded.rows : []
  const ids = checked.key === key ? checked.ids : new Set<number>()
  const all = rows.length > 0 && rows.every(row => ids.has(row.id))
  const check = (next: Set<number>) => setChecked({ key, ids: next })
  const toggle = (id: number) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); check(next) }
  const pending = Object.values(loaded.counts).reduce((n, c) => n + c, 0)
  const decide = async (accept: boolean) => {
    const chosen = rows.filter(row => ids.has(row.id)).map(row => row.id)
    if (!chosen.length) return
    setBusy(true)
    await (accept ? actions.accept(chosen) : actions.reject(chosen)) // the edit reads the list again
    setBusy(false)
  }
  const open = (row: SuggestionItem) => {
    setCurrent(row.id)
    if (row.subject) show({ uid: row.subject, name: row.subject_name })
  }

  return <div className="library-suggestions">
    <div className="library-suggestions-bar">
      <select aria-label="Kind of suggestion" value={kind} onChange={event => setKind(event.target.value)}>
        {KINDS.map(([value, label]) => <option key={value} value={value}>{label} ({(value ? loaded.counts[value] || 0 : pending).toLocaleString()})</option>)}
      </select>
      <label className="library-check"><input type="checkbox" checked={all} disabled={!rows.length} onChange={() => check(all ? new Set() : new Set(rows.map(row => row.id)))} />Select all shown</label>
      <span className="library-suggestions-summary" role="status">
        {!fresh ? 'Reading…' : loaded.total ? `${plural(loaded.total, 'pending suggestion')} · ${ids.size.toLocaleString()} checked` : 'No pending suggestions.'}
      </span>
      <button type="button" className="library-button" disabled={!ids.size || busy} onClick={() => void decide(false)}>Reject checked</button>
      <button type="button" className="library-button primary" disabled={!ids.size || busy} onClick={() => void decide(true)}>Accept checked</button>
    </div>
    {loaded.error && <p className="library-error" role="alert">{loaded.error}</p>}
    <div className="library-suggestions-list">
      <table className="library-files">
        <thead><tr><th aria-label="Checked" /><th>Suggestion</th><th>For</th><th className="library-number">Confidence</th></tr></thead>
        <tbody>
          {rows.map(row => {
            const text = describeSuggestion(row.kind, row.payload)
            return <tr key={row.id} className={row.id === current ? 'selected' : ''} aria-selected={row.id === current} onClick={() => open(row)}>
              <td><input type="checkbox" checked={ids.has(row.id)} aria-label={`Check: ${text}${row.subject_name ? ` (${row.subject_name})` : ''}`}
                onClick={event => event.stopPropagation()} onChange={() => toggle(row.id)} /></td>
              <td>{text}</td>
              <td>{row.subject_name || ''}</td>
              <td className="library-number">{row.confidence.toFixed(2)}</td>
            </tr>
          })}
        </tbody>
      </table>
      {fresh && rows.length < loaded.total && <button type="button" className="library-button library-more" onClick={() => setWanted({ key, pages: pages + 1 })}>
        Show more ({rows.length.toLocaleString()} of {loaded.total.toLocaleString()} shown)</button>}
    </div>
  </div>
}
