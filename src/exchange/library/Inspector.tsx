import { useEffect, useState } from 'react'
import { exchangeGet, thumbnailUrl, type DossierDetail, type DossierRef, type FieldValue } from '../api'
import { describeEvent, describeSuggestion, fieldLabel, fieldValue, fileSize, plural, shortDate, tagSource } from './format'

// The fields the About section shows (and Details leaves out), as in the PySide6 inspector.
const ABOUT: [string, string[]][] = [['Author', ['author', 'authors']], ['License', ['license']], ['Source', ['source', 'url', 'installed_by']], ['Version', ['version']]]
const HIDDEN = new Set(['preview', 'variant', 'authors', 'author', 'license', 'source', 'url', 'version', 'installed_by',
  'daz_compatibility', 'daz_categories', 'notes', 'name', 'type_id', 'user_created', 'enriched_hash', 'references'])
const STATS: [string, string, (value: unknown) => string][] = [
  ['Polygons', 'mesh_triangles', v => Number(v).toLocaleString()], ['Polygons', 'mesh_polygons', v => Number(v).toLocaleString()],
  ['Vertices', 'mesh_vertices', v => Number(v).toLocaleString()], ['Size', 'mesh_size', v => `${Number(v).toFixed(2)} units`],
  ['Rig', 'mesh_skinned', v => v ? 'Skinned' : 'Static'],
]
const TABS = ['Overview', 'Files', 'Dependencies', 'History'] as const
type Tab = typeof TABS[number]

interface Props { uid: string | null; show: (ref: DossierRef) => void }

// The selected asset, read-only: editing arrives with 6f.
export default function Inspector({ uid, show }: Props) {
  const [read, setRead] = useState<{ uid: string; detail?: DossierDetail; error?: string } | null>(null)
  const [tab, setTab] = useState<Tab>('Overview')
  useEffect(() => {
    if (!uid) return
    let current = true
    exchangeGet('dossiers/{uid}', { path: { uid } })
      .then(detail => { if (current) setRead({ uid, detail }) })
      .catch(error => { if (current) setRead({ uid, error: error instanceof Error ? error.message : String(error) }) })
    return () => { current = false }
  }, [uid])
  const shown = read && read.uid === uid ? read : null
  if (!uid) return <aside className="library-inspector empty" aria-label="Inspector"><p>Select an asset to see its ledgers, files and origin.</p></aside>
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
      </div>
    </header>
    <Stats detail={d} />
    <div className="library-tabs" role="tablist" aria-label="Asset details">
      {TABS.map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>)}
    </div>
    <div className="library-tab" role="tabpanel" aria-label={tab}>
      {tab === 'Overview' && <Overview detail={d} show={show} />}
      {tab === 'Files' && <Files detail={d} />}
      {tab === 'Dependencies' && <Dependencies detail={d} show={show} />}
      {tab === 'History' && <History detail={d} />}
    </div>
  </aside>
}

// The item card's stats panel: what it is, where it lives, when it was acquired.
function Stats({ detail: d }: { detail: DossierDetail }) {
  const rows: [string, string][] = []
  const seen = new Set<string>()
  for (const [label, key, format] of STATS) {
    const field = d.fields[key]
    if (field && field.value !== null && field.value !== undefined && !seen.has(label)) { rows.push([label, format(field.value)]); seen.add(label) }
  }
  rows.push(['Environments', d.ledgers.map(ledger => ledger.environment.name).join(', ') || 'none'])
  const acquired = d.ledgers.flatMap(ledger => ledger.entries.map(entry => entry.created_at)).filter((at): at is string => !!at).sort()[0]
  if (acquired) rows.push(['Acquired', acquired.slice(0, 10)])
  return <dl className="library-stats">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function field(fields: Record<string, FieldValue>, keys: string[]) {
  const key = keys.find(k => fields[k]?.source === 'user') || keys.find(k => k in fields)
  return key ? fields[key] : undefined
}

function Overview({ detail: d, show }: { detail: DossierDetail; show: Props['show'] }) {
  const inherited = d.parent_fields || {}
  const details = Object.entries(d.fields).filter(([key]) => !HIDDEN.has(key) && !key.startsWith('mesh_'))
  const signals = Array.isArray(d.signals) ? d.signals.join('; ') : ''
  const variants = d.variants.length ? d.variants : d.variant ? [String(d.variant)] : []
  return <>
    <section><h4>About</h4><dl className="library-fields">
      {d.name_overridden && <div className="library-field-row"><dt>Name</dt><dd>{d.name} <small>(yours)</small></dd></div>}
      <div className="library-field-row"><dt>Type</dt><dd>{d.type_name}{d.type_overridden && <small> (yours)</small>}</dd></div>
      {ABOUT.map(([label, keys]) => {
        const own = field(d.fields, keys), parent = own ? undefined : field(inherited, keys)
        const value = own || parent
        return value ? <div key={label} className="library-field-row"><dt>{label}</dt><dd>{fieldValue(value.value)}{parent && <small> (from its product)</small>}{own?.source === 'user' && <small> (yours)</small>}</dd></div> : null
      })}
      {d.fields.notes && <div className="library-field-row"><dt>Notes</dt><dd>{fieldValue(d.fields.notes.value)}</dd></div>}
    </dl></section>
    <section><h4>Tags</h4>{d.tag_sources.length
      ? <div className="library-chips">{d.tag_sources.map(t => <span key={t.tag} className={`library-chip ${t.user === 'remove' ? 'hidden' : t.user ? 'user' : ''}`}
        title={t.user === 'remove' ? `Found from ${t.sources.map(tagSource).join(', ')}; you hid it` : t.user === 'add' && !t.sources.length ? 'Yours' : `Found from ${t.sources.map(tagSource).join(', ')} (${t.confidence.toFixed(2)})`}>{t.tag}</span>)}</div>
      : <p className="library-muted">No tags.</p>}</section>
    {d.collections.length > 0 && <section><h4>Collections</h4><div className="library-chips">{d.collections.map(c => <span key={c.uid} className="library-chip">{c.name}</span>)}</div></section>}
    {d.suggestions.length > 0 && <section><h4>Suggestions ({d.suggestions.length})</h4>{d.suggestions.map(s => <p key={s.id} className="library-card-note">{describeSuggestion(s.kind, s.payload)}</p>)}<p className="library-muted">Accept or reject them in the PySide6 window until curation reaches the Workspace (6f).</p></section>}
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

function History({ detail: d }: { detail: DossierDetail }) {
  if (!d.history.length) return <p className="library-muted">No history yet.</p>
  return <ol className="library-history">{[...d.history].reverse().map((event, i) => <li key={`${event.id ?? 'e'}-${i}`}>
    <span>{describeEvent(event.action, event.payload)}</span><small>{shortDate(event.at)}</small></li>)}</ol>
}
