import { useEffect, useMemo, useState } from 'react'
import { exchangeGet, type LexiconView } from '../api'
import type { LibraryActions } from './actions'
import { plural } from './format'

interface Props {
  revision: number // after any edit (Undo of a word included)
  actions: LibraryActions
  say: (text: string, error?: boolean) => void
  apply: (regroup: boolean) => void // classify the library again now (a job)
  busy: boolean // a job writes the library: Apply waits
}

// What each kind of lexicon does, as the window's Settings › Lexicons says it.
const ABOUT: Record<string, string> = {
  category: 'Words that tag an asset when they appear in its name, its folders or its source’s categories.',
  variant: 'Words that make two assets variants of one (Donut01_Pink, Donut01_Blue).',
  texture_channel: 'Texture suffixes that link images to a mesh (Barrel01_N.png is Barrel01’s normal map).',
  structural: 'LOD and collision meshes, kept out of sight unless you search is:structural.',
  index: 'Words that number a series (Barrel01, Barrel02, Rock_A); numbers always count.',
  ignore: 'Noise dropped from names before matching (Barrel_final_v2 is Barrel).',
  theme: 'Genres and settings people sort content by. A folder named only with these words (or with category names) is a category folder, never a hand-installed Daz product.',
  author: 'Vendors. Scans add the artists in Daz manifests and the vendor folders under data/. A folder named after an author is a vendor folder, and the products below it get that author. Removing a found author keeps scans from adding it back.',
}
const UNVALUED = ['ignore', 'index'] // their words stand for nothing but themselves
const REGROUP = ['category', 'theme', 'author'] // edits to these change how hand-installed Daz products are grouped

const words = (lexicon: LexiconView) => lexicon.terms.reduce((n, t) => n + t.words.length + (t.found?.length || 0), 0)

interface Row { value: string; word: string; from: 'list' | 'found' | 'pattern' }

// The lexicons that drive tags, variants and grouping (the window's Settings › Lexicons). Each word
// added or removed is an undoable edit written to the user's copy of the lexicon; it applies to the
// next scan.
export default function Lexicons({ revision, actions, say, apply, busy }: Props) {
  const [lexicons, setLexicons] = useState<LexiconView[] | null>(null)
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [value, setValue] = useState('')
  const [word, setWord] = useState('')
  const [edited, setEdited] = useState<Set<string>>(new Set()) // kinds edited here, for Apply's regroup
  const done = (kind: string) => setEdited(previous => new Set(previous).add(kind))

  useEffect(() => {
    let live = true
    exchangeGet('lexicons').then(list => { if (live) { setLexicons(list); setError('') } })
      .catch(problem => { if (live) setError(problem instanceof Error ? problem.message : String(problem)) })
    return () => { live = false }
  }, [revision])

  const sorted = useMemo(() => [...(lexicons || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [lexicons])
  const lexicon = sorted.find(l => l.id === chosen) || sorted[0] || null
  const valued = !!lexicon && !UNVALUED.includes(lexicon.kind)
  const rows = useMemo(() => {
    if (!lexicon) return []
    const out: Row[] = []
    for (const term of lexicon.terms) {
      for (const w of term.words) out.push({ value: term.value, word: w, from: 'list' })
      for (const w of term.found || []) out.push({ value: term.value, word: w, from: 'found' })
      for (const p of term.patterns) out.push({ value: term.value, word: p, from: 'pattern' })
    }
    const needle = filter.trim().toLowerCase()
    return needle ? out.filter(row => row.word.toLowerCase().includes(needle) || row.value.toLowerCase().includes(needle)) : out
  }, [lexicon, filter])
  const values = useMemo(() => [...new Set((lexicon?.terms || []).map(t => t.value).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), [lexicon])

  const add = async () => {
    if (!lexicon) return
    const w = word.trim(), v = valued ? value.trim() : ''
    if (!w || (valued && !v)) { say(valued ? 'Type a word, and the value it stands for (e.g. Food).' : 'Type a word.', true); return }
    if (await actions.lexiconWord(lexicon.id, v, w, true)) { setWord(''); done(lexicon.kind) }
  }
  const remove = async (row: Row) => { if (lexicon && await actions.lexiconWord(lexicon.id, row.value, row.word, false)) done(lexicon.kind) }
  const allow = async (w: string) => { if (lexicon && await actions.lexiconWord(lexicon.id, w, w, true)) done(lexicon.kind) }
  const regroup = [...edited].some(kind => REGROUP.includes(kind))

  return <div className="library-lexicons">
    <div className="library-lexicon-list" role="listbox" aria-label="Lexicons">
      {error && <p className="library-error" role="alert">{error}</p>}
      {lexicons === null && !error && <p className="library-muted">Reading the lexicons…</p>}
      {sorted.map(l => <button key={l.id} type="button" role="option" aria-selected={l.id === lexicon?.id}
        className={`library-nav-item ${l.id === lexicon?.id ? 'selected' : ''}`} onClick={() => { setChosen(l.id); setFilter('') }}>
        <span>{l.name}</span><small>{plural(words(l), 'word')}</small>
      </button>)}
    </div>
    {lexicon && <section className="library-lexicon" aria-label={lexicon.name}>
      <header>
        <h3>{lexicon.name}</h3>
        <small>{lexicon.kind.replace(/_/g, ' ')}{lexicon.generated ? ' · scans add to it' : ''}</small>
        <p>{ABOUT[lexicon.kind] || ''}</p>
      </header>
      <form className="library-lexicon-add" onSubmit={event => { event.preventDefault(); void add() }}>
        {valued && <>
          <input aria-label="Value" list="library-lexicon-values" value={value} onChange={event => setValue(event.target.value)}
            placeholder={lexicon.kind === 'author' ? 'Author' : 'Value, e.g. Food'} spellCheck={false} />
          <datalist id="library-lexicon-values">{values.map(v => <option key={v} value={v} />)}</datalist>
        </>}
        <input aria-label="Word" value={word} onChange={event => setWord(event.target.value)} placeholder="Word or phrase (plurals match by themselves)" spellCheck={false} />
        <button type="submit" className="library-button primary">Add</button>
      </form>
      <input className="library-lexicon-filter" aria-label="Filter" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter" spellCheck={false} />
      <div className="library-lexicon-words">
        <table className="library-files">
          <thead><tr>{valued && <th>Value</th>}<th>Word</th><th>From</th><th aria-label="Remove" /></tr></thead>
          <tbody>
            {rows.map(row => <tr key={`${row.from}|${row.value}|${row.word}`} className={row.from === 'pattern' ? 'readonly' : ''}>
              {valued && <td>{row.value || '—'}</td>}
              <td>{row.word}</td>
              <td>{row.from === 'list' ? 'list' : row.from === 'found' ? 'found by scans' : 'pattern (read-only)'}</td>
              <td>{row.from !== 'pattern' && <button type="button" className="library-link" aria-label={`Remove ${row.word}`} onClick={() => void remove(row)}>Remove</button>}</td>
            </tr>)}
          </tbody>
        </table>
        {!rows.length && <p className="library-muted">{filter ? 'No word matches the filter.' : 'No words yet.'}</p>}
      </div>
      {lexicon.generated && !!lexicon.exclude?.length && <section className="library-lexicon-excluded">
        <h4>Removed found words ({lexicon.exclude.length.toLocaleString()}): scans never add these back</h4>
        <div className="library-chips">{lexicon.exclude.map(w => <button key={w} type="button" className="library-chip hidden"
          title="Allow it again: scans may add it" onClick={() => void allow(w)}>{w} ↺</button>)}</div>
      </section>}
      <div className="library-lexicon-apply">
        <p className="library-muted">Edits apply to the next scan; Ctrl+Z undoes them. Apply to library re-tags what is already scanned now, in the background{regroup ? ', and regroups hand-installed Daz products (minutes on a big library)' : ''}.</p>
        <button type="button" className="library-button primary" disabled={busy} onClick={() => apply(regroup)}
          title={busy ? 'Wait for the scan to finish' : 'Classify the library again with the lexicons as they are now'}>Apply to library</button>
      </div>
    </section>}
  </div>
}
