import { useEffect, useState, type ReactNode } from 'react'
import { exchangeGet, thumbnailUrl, type Choices, type Collection, type DossierDetail, type DossierRef, type FieldValue } from '../api'
import type { LibraryActions } from './actions'
import { describeEvent, describeSuggestion, fieldLabel, fieldValue, fileSize, plural, shortDate, tagSource } from './format'

// The fields the About section shows and edits (and Details leaves out), as in the PySide6
// inspector: [title, the field an edit sets, the fields that may hold it].
const ABOUT: [string, string, string[]][] = [['Author', 'author', ['author', 'authors']], ['License', 'license', ['license']],
  ['Source', 'source', ['source', 'url', 'installed_by']], ['Version', 'version', ['version']]]
const HIDDEN = new Set(['preview', 'variant', 'authors', 'author', 'license', 'source', 'url', 'version', 'installed_by',
  'daz_compatibility', 'daz_categories', 'notes', 'name', 'type_id', 'user_created', 'enriched_hash', 'references', 'not_an_asset'])
const STATS: [string, string, (value: unknown) => string][] = [
  ['Polygons', 'mesh_triangles', v => Number(v).toLocaleString()], ['Polygons', 'mesh_polygons', v => Number(v).toLocaleString()],
  ['Vertices', 'mesh_vertices', v => Number(v).toLocaleString()], ['Size', 'mesh_size', v => `${Number(v).toFixed(2)} units`],
  ['Rig', 'mesh_skinned', v => v ? 'Skinned' : 'Static'],
]
const TABS = ['Overview', 'Files', 'Dependencies', 'History'] as const
type Tab = typeof TABS[number]

interface Props {
  uids: string[]
  revision: number // bumped after an edit, to read the asset again
  show: (ref: DossierRef) => void
  actions: LibraryActions
  choices: Choices | null
  collections: Collection[]
}

// The selected asset, editable as in the PySide6 window; several selected assets edit together.
export default function Inspector(props: Props) {
  const { uids } = props
  if (!uids.length) return <aside className="library-inspector empty" aria-label="Inspector"><p>Select an asset to see its ledgers, files and origin.</p></aside>
  if (uids.length > 1) return <Bulk {...props} />
  return <One {...props} uid={uids[0]} />
}

function One({ uid, revision, show, actions, choices, collections }: Props & { uid: string }) {
  const [read, setRead] = useState<{ key: string; detail?: DossierDetail; error?: string } | null>(null)
  const [tab, setTab] = useState<Tab>('Overview')
  const key = `${uid}|${revision}`
  useEffect(() => {
    let current = true
    exchangeGet('dossiers/{uid}', { path: { uid } })
      .then(detail => { if (current) setRead({ key, detail }) })
      .catch(error => { if (current) setRead({ key, error: error instanceof Error ? error.message : String(error) }) })
    return () => { current = false }
  }, [uid, key])
  // After an edit the asset shows as it was until it is read again, instead of flashing empty.
  const shown = read && (read.key === key || read.key.startsWith(`${uid}|`)) ? read : null
  if (!shown) return <aside className="library-inspector" aria-label="Inspector" aria-busy="true"><p className="library-muted">Loading…</p></aside>
  if (shown.error || !shown.detail) return <aside className="library-inspector" aria-label="Inspector"><p className="library-error" role="alert">{shown.error}</p></aside>
  const d = shown.detail
  const entries = d.ledgers.reduce((n, ledger) => n + ledger.entries.length, 0)
  const summary = [d.type_name, d.children.length ? plural(d.children.length, 'item') : '', plural(entries, 'entry', 'entries')].filter(Boolean).join(' · ')
  return <aside className="library-inspector" aria-label="Inspector">
    <header className="library-inspector-head">
      <div className="library-inspector-thumb">{d.thumbnail_url ? <img src={thumbnailUrl(d.uid)} alt="" /> : <span>{d.type_name}</span>}</div>
      <div>
        <h3>{d.name}</h3>
        <p>{summary}</p>
        {d.unidentified && <span className="library-chip warn">Unidentified · {d.confidence.toFixed(2)}</span>}
        {d.fields.not_an_asset?.value === true && <span className="library-chip warn">Not an asset</span>}
      </div>
    </header>
    <Stats detail={d} />
    <div className="library-tabs" role="tablist" aria-label="Asset details">
      {TABS.map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>)}
    </div>
    <div className="library-tab" role="tabpanel" aria-label={tab}>
      {tab === 'Overview' && <Overview detail={d} show={show} actions={actions} choices={choices} collections={collections} />}
      {tab === 'Files' && <Files detail={d} />}
      {tab === 'Dependencies' && <Dependencies detail={d} show={show} />}
      {tab === 'History' && <History detail={d} actions={actions} />}
    </div>
  </aside>
}

// The item card's stats panel: what it is, where it lives, when it was acquired.
function Stats({ detail: d }: { detail: DossierDetail }) {
  const rows: [string, string][] = []
  const seen = new Set<string>()
  for (const [label, key, format] of STATS) {
    const value = d.fields[key]
    if (value && value.value !== null && value.value !== undefined && !seen.has(label)) { rows.push([label, format(value.value)]); seen.add(label) }
  }
  rows.push(['Environments', d.ledgers.map(ledger => ledger.environment.name).join(', ') || 'none'])
  const acquired = d.ledgers.flatMap(ledger => ledger.entries.map(entry => entry.created_at)).filter((at): at is string => !!at).sort()[0]
  if (acquired) rows.push(['Acquired', acquired.slice(0, 10)])
  return <dl className="library-stats">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function pick(fields: Record<string, FieldValue>, keys: string[]) {
  const key = keys.find(k => fields[k]?.source === 'user') || keys.find(k => k in fields)
  return key ? { key, ...fields[key] } : undefined
}

// A text field that commits on Enter or when it loses focus, if its text changed. Emptying a
// value of the user's reverts it.
function TextEdit({ label, value, placeholder, mine, commit, multiline = false }: {
  label: string; value: string; placeholder?: string; mine: boolean; commit: (value: string | null) => void; multiline?: boolean
}) {
  const [draft, setDraft] = useState({ base: value, text: value })
  const text = draft.base === value ? draft.text : value // a new value from the library replaces the draft
  const done = () => {
    const next = text.trim()
    if (next === value.trim()) return
    // The draft becomes the committed text, so whatever the library says next (the new value, a
    // revert, or the old value after a failure) replaces it.
    setDraft({ base: next, text: next })
    if (!next) { if (mine) commit(null); return }
    commit(next)
  }
  const common = {
    'aria-label': label, value: text, placeholder, className: mine ? 'mine' : '',
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ base: value, text: event.target.value }),
    onBlur: done,
  }
  return multiline
    ? <textarea {...common} rows={3} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); done() } }} />
    : <input {...common} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); done() } if (event.key === 'Escape') setDraft({ base: value, text: value }) }} />
}

const Revert = ({ what, run }: { what: string; run: () => void }) =>
  <button type="button" className="library-revert" title={`Yours. Revert ${what} to what scans found`} aria-label={`Revert ${what}`} onClick={run}>↺</button>

function Row({ label, children, revert }: { label: string; children: ReactNode; revert?: ReactNode }) {
  return <div className="library-field-row editable"><dt>{label}</dt><dd>{children}</dd>{revert || <span />}</div>
}

function TagAdder({ tags, add, label = 'Add a tag' }: { tags: string[]; add: (tag: string) => void; label?: string }) {
  const [draft, setDraft] = useState('')
  return <form className="library-adder" onSubmit={event => { event.preventDefault(); if (draft.trim()) { add(draft.trim()); setDraft('') } }}>
    <input aria-label={label} placeholder={`${label}…`} list="library-tag-names" value={draft} onChange={event => setDraft(event.target.value)} />
    <datalist id="library-tag-names">{tags.map(tag => <option key={tag} value={tag} />)}</datalist>
  </form>
}

function CollectionAdder({ collections, add }: { collections: Collection[]; add: (uid: string) => void }) {
  if (!collections.length) return <p className="library-muted">Make a collection from the sidebar, then add assets here.</p>
  return <select aria-label="Add to collection" value="" onChange={event => event.target.value && add(event.target.value)}>
    <option value="">Add to collection…</option>
    {collections.map(c => <option key={c.uid} value={c.uid}>{c.name}</option>)}
  </select>
}

function Overview({ detail: d, show, actions, choices, collections }: { detail: DossierDetail; show: Props['show']; actions: LibraryActions; choices: Choices | null; collections: Collection[] }) {
  const inherited = d.parent_fields || {}
  const details = Object.entries(d.fields).filter(([key]) => !HIDDEN.has(key) && !key.startsWith('mesh_'))
  const signals = Array.isArray(d.signals) ? d.signals.join('; ') : ''
  const variants = d.variants.length ? d.variants : d.variant ? [String(d.variant)] : []
  const uids = [d.uid]
  const set = (field: string, value: unknown) => actions.setField(uids, field, value)
  const types = choices?.types || []
  const typeChoices = types.some(t => t.id === d.type_id) ? types : [...types, { id: d.type_id, name: d.type_name }]
  const notes = d.fields.notes
  const memberOf = new Set(d.collections.map(c => c.uid))
  return <>
    <section><h4>About</h4><dl className="library-fields">
      <Row label="Name" revert={d.name_overridden && <Revert what="the name" run={() => set('name', null)} />}>
        <TextEdit label="Name" value={d.name} mine={d.name_overridden} commit={value => set('name', value)} />
      </Row>
      <Row label="Type" revert={d.type_overridden && <Revert what="the type" run={() => set('type_id', null)} />}>
        <select aria-label="Type" className={d.type_overridden ? 'mine' : ''} value={d.type_id} onChange={event => set('type_id', event.target.value)}>
          {typeChoices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Row>
      {ABOUT.map(([label, fieldName, keys]) => {
        const own = pick(d.fields, keys), parent = pick(inherited, keys)
        const mine = own?.source === 'user'
        return <Row key={label} label={label} revert={mine && <Revert what={label.toLowerCase()} run={() => set(own!.key, null)} />}>
          <TextEdit label={label} value={own ? fieldValue(own.value) : ''} mine={mine}
            placeholder={parent ? `${fieldValue(parent.value)} (from its product)` : 'Unknown'} commit={value => set(mine ? own!.key : fieldName, value)} />
        </Row>
      })}
      <Row label="Notes" revert={notes?.source === 'user' && <Revert what="the notes" run={() => set('notes', null)} />}>
        <TextEdit label="Notes" multiline value={notes ? fieldValue(notes.value) : ''} mine={notes?.source === 'user'} placeholder="Notes (yours)" commit={value => set('notes', value)} />
      </Row>
    </dl></section>
    <section><h4>Tags</h4>
      {d.tag_sources.length > 0 && <div className="library-chips">{d.tag_sources.map(t => {
        const found = t.sources.map(tagSource).join(', ')
        if (t.user === 'remove') return <button key={t.tag} type="button" className="library-chip hidden" title={`Found from ${found}; you hid it. Click to show it again.`}
          onClick={() => actions.revertTag(d.uid, t.tag)}>{t.tag} ↺</button>
        if (t.user === 'add' && !t.sources.length) return <button key={t.tag} type="button" className="library-chip user" title="Yours. Click to remove."
          onClick={() => actions.revertTag(d.uid, t.tag)}>{t.tag} ×</button>
        return <button key={t.tag} type="button" className={`library-chip ${t.user ? 'user' : ''}`} title={`Found from ${found} (${t.confidence.toFixed(2)}). Click to hide it.`}
          onClick={() => actions.tag(uids, [], [t.tag])}>{t.tag} ×</button>
      })}</div>}
      <TagAdder tags={choices?.tags || []} add={tag => actions.tag(uids, [tag], [])} />
    </section>
    <section><h4>Collections</h4>
      {d.collections.length > 0 && <div className="library-chips">{d.collections.map(c => <button key={c.uid} type="button" className="library-chip"
        title="Click to remove it from this collection" onClick={() => actions.members(c.uid, uids, false)}>{c.name} ×</button>)}</div>}
      <CollectionAdder collections={collections.filter(c => !memberOf.has(c.uid))} add={c => actions.members(c, uids, true)} />
    </section>
    {d.suggestions.length > 0 && <section><h4>Suggestions ({d.suggestions.length})</h4>{d.suggestions.map(s => <div key={s.id} className="library-card-note">
      <p>{describeSuggestion(s.kind, s.payload)}</p>
      <div className="library-note-buttons">
        <button type="button" className="library-button" title="Don't suggest this again" onClick={() => actions.reject([s.id])}>Reject</button>
        <button type="button" className="library-button primary" title="Apply it (undoable)" onClick={() => actions.accept([s.id])}>Accept</button>
      </div>
    </div>)}</section>}
    {variants.length > 0 && <section><h4>Variants</h4><div className="library-chips">{variants.map(v => <span key={v} className="library-chip">{v.replace(/_/g, ' ')}</span>)}</div></section>}
    {d.aliases.length > 0 && <section><h4>Merged into this</h4>{d.aliases.map(a => <p key={a.uid} className="library-muted">{a.name || a.uid}</p>)}</section>}
    {d.parent && <section><h4>Part of</h4><button type="button" className="library-link" onClick={() => show(d.parent!)}>{d.parent.name || d.parent.uid}</button></section>}
    {d.children.length > 0 && <section><h4>Contains ({d.children.length.toLocaleString()})</h4>
      {d.children.slice(0, 30).map(c => <button key={c.uid} type="button" className="library-link" onClick={() => show(c)}>{c.name || c.uid}</button>)}
      {d.children.length > 30 && <p className="library-muted">… and {(d.children.length - 30).toLocaleString()} more</p>}</section>}
    <section><h4>Ledgers ({d.ledgers.length})</h4>{d.ledgers.map(ledger => <div key={ledger.environment.id} className="library-ledger">
      <header><strong>{ledger.environment.name}</strong><small>{plural(ledger.entries.length, 'entry', 'entries')}</small></header>
      {ledger.entries.map(entry => {
        const primary = entry.files.find(f => f.role === 'primary')
        return <div key={entry.id} className="library-entry">
          <span>{entry.container || '(root)'}{primary && <small title={primary.path}>{primary.rel_path}</small>}
            {entry.source_container && <small>from {entry.source_container}</small>}{entry.variant && <small>variant: {entry.variant}</small>}</span>
          <em>{entry.status === 'unknown' ? 'Unknown provenance' : entry.status.replace(/^./, c => c.toUpperCase())}</em>
        </div>
      })}
    </div>)}</section>
    {(details.length > 0 || signals) && <section><h4>Details</h4><dl className="library-fields">
      {details.map(([key, value]) => <div key={key} className="library-field-row"><dt>{fieldLabel(key)}</dt><dd>{fieldValue(value.value)}</dd></div>)}
      {signals && <div className="library-field-row"><dt>identified by</dt><dd>{signals} ({d.confidence.toFixed(2)})</dd></div>}
    </dl></section>}
  </>
}

// Several assets at once: type, about fields, notes, tags and collections. Names are edited one at a time.
function Bulk({ uids, actions, choices, collections }: Props) {
  const n = uids.length
  return <aside className="library-inspector" aria-label="Inspector">
    <header className="library-inspector-head"><div><h3>{n.toLocaleString()} assets selected</h3>
      <p>Changes here apply to all of them. Names are edited one at a time.</p></div></header>
    <div className="library-tab">
      <section><h4>About</h4><dl className="library-fields">
        <Row label="Type"><select aria-label="Type" value="" onChange={event => event.target.value && actions.setField(uids, 'type_id', event.target.value)}>
          <option value="">Keep each type</option>
          {(choices?.types || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></Row>
        {[...ABOUT.map(([label, fieldName]) => [label, fieldName] as const), ['Notes', 'notes'] as const].map(([label, fieldName]) =>
          <Row key={fieldName} label={label}><BulkText label={label} apply={value => actions.setField(uids, fieldName, value)} /></Row>)}
      </dl></section>
      <section><h4>Tags</h4>
        <TagAdder tags={choices?.tags || []} add={tag => actions.tag(uids, [tag], [])} label="Add a tag to all" />
        <TagAdder tags={choices?.tags || []} add={tag => actions.tag(uids, [], [tag])} label="Remove a tag from all" />
      </section>
      <section><h4>Collections</h4><CollectionAdder collections={collections} add={c => actions.members(c, uids, true)} /></section>
    </div>
  </aside>
}

function BulkText({ label, apply }: { label: string; apply: (value: string) => void }) {
  const [draft, setDraft] = useState('')
  return <input aria-label={label} placeholder="Keep each value · type one and press Enter" value={draft} onChange={event => setDraft(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter' && draft.trim()) { event.preventDefault(); apply(draft.trim()); setDraft('') } }} />
}

function Files({ detail: d }: { detail: DossierDetail }) {
  const rows = d.ledgers.flatMap(ledger => ledger.entries.flatMap(entry => entry.files.map(file => ({ file, container: entry.container }))))
  if (!rows.length) return <p className="library-muted">No files.</p>
  return <table className="library-files"><thead><tr><th>File</th><th>Role</th><th>Size</th><th>Container</th></tr></thead>
    <tbody>{rows.map(({ file, container }) => <tr key={`${file.id}-${container}`} className={file.state === 'gone' ? 'gone' : ''}>
      <td title={file.path}>{file.rel_path}</td><td>{file.role}</td><td>{fileSize(file.size)}</td><td>{container}</td></tr>)}</tbody></table>
}

function Dependencies({ detail: d, show }: { detail: DossierDetail; show: Props['show'] }) {
  const broken = d.dependencies.filter(x => x.status === 'broken')
  const sorted = [...d.dependencies].sort((a, b) => Number(a.status !== 'broken') - Number(b.status !== 'broken') || a.reference.localeCompare(b.reference))
  return <>
    <section><h4>{d.dependencies.length ? `Needs (${d.dependencies.length}, ${broken.length} broken)` : 'Needs'}</h4>
      {!d.dependencies.length && <p className="library-muted">No dependencies found.</p>}
      {sorted.map(dep => <div key={dep.reference} className={`library-dependency ${dep.status === 'broken' ? 'broken' : ''}`}>
        {dep.target ? <button type="button" className="library-link" onClick={() => show(dep.target!)}>{dep.target.name || dep.target.uid}</button> : <strong>Missing</strong>}
        <small>{dep.reference}</small>
      </div>)}</section>
    {d.required_by.length > 0 && <section><h4>Needed by ({d.required_by.length})</h4>
      {d.required_by.map(r => <button key={r.uid} type="button" className="library-link" onClick={() => show(r)}>{r.name || r.uid}</button>)}</section>}
  </>
}

function History({ detail: d, actions }: { detail: DossierDetail; actions: LibraryActions }) {
  if (!d.history.length) return <p className="library-muted">No history yet.</p>
  return <ol className="library-history">{[...d.history].reverse().map((event, i) => <li key={`${event.id ?? 'e'}-${i}`}>
    <span>{describeEvent(event.action, event.payload)}</span><small>{shortDate(event.at)}</small>
    {event.undoable && event.id != null && <button type="button" className="library-link" title="Undo this (it can be undone in turn)"
      onClick={() => actions.undoEntry(event.id!)}>Undo</button>}
  </li>)}</ol>
}
