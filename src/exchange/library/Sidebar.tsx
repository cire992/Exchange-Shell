import { useState } from 'react'
import type { Collection, Sidebar as SidebarData, SidebarEnvironment } from '../api'
import { DRAG_TYPE } from './Browser'
import { viewKey, type View } from './views'

interface Props {
  data: SidebarData | null
  collections: Collection[] | null
  error: string
  view: View
  choose: (view: View) => void
  newCollection: () => void
  collectionMenu: (x: number, y: number, collection: Collection | null) => void
  dropOnCollection: (collection: Collection, uids: string[]) => void
  changed: Set<number> // environments with changes since their last scan
  environmentMenu: (x: number, y: number, env: SidebarEnvironment) => void
  addEnvironment: () => void
}

const count = (n: number | null | undefined) => n === null || n === undefined ? '' : n.toLocaleString()

// The library, collections, then environments › containers or dossier types, as in the PySide6
// window's sidebar; then the lexicons (the window's Settings › Lexicons).
export default function Sidebar({ data, collections, error, view, choose, newCollection, collectionMenu, dropOnCollection, changed, environmentMenu, addEnvironment }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setOpen(previous => ({ ...previous, [key]: !previous[key] }))
  const current = viewKey(view)
  const [over, setOver] = useState<string | null>(null)
  const item = (target: View, label: string, n?: number | null, extra = '', collection?: Collection, env?: SidebarEnvironment) => {
    const key = viewKey(target)
    // Manual collections take dropped cards; any collection has a menu.
    const drops = collection && !collection.smart ? {
      onDragOver: (event: React.DragEvent) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'link'; setOver(key) } },
      onDragLeave: () => setOver(null),
      onDrop: (event: React.DragEvent) => {
        setOver(null)
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
        event.preventDefault()
        dropOnCollection(collection, JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as string[])
      },
    } : {}
    return <button type="button" key={key} className={`library-nav-item ${extra} ${current === key ? 'selected' : ''} ${over === key ? 'drop' : ''}`}
      aria-current={current === key ? 'true' : undefined} onClick={() => choose(target)}
      onContextMenu={collection ? event => { event.preventDefault(); collectionMenu(event.clientX, event.clientY, collection) }
        : env ? event => { event.preventDefault(); environmentMenu(event.clientX, event.clientY, env) } : undefined} {...drops}>
      <span>{label}{env && changed.has(env.id) && <em className="library-changed" title="Changed since it was last scanned">changed</em>}</span><small>{count(n)}</small>
    </button>
  }
  const environment = (env: SidebarEnvironment) => {
    const key = `env:${env.id}`
    const containers = `${key}:containers`, types = `${key}:types`
    return <div className="library-env" key={env.id}>
      <div className="library-env-row">
        <button type="button" className="library-caret" aria-expanded={!!open[key]} aria-label={`${open[key] ? 'Collapse' : 'Expand'} ${env.name}`} onClick={() => toggle(key)}>{open[key] ? '▾' : '▸'}</button>
        <i className={`library-status ${env.status}`} title={env.status === 'online' ? 'Online' : env.status === 'offline' ? 'Offline: its folders are not reachable' : 'Some of its folders are offline'} />
        {item({ kind: 'environment', id: env.id, name: env.name }, env.name, env.count, 'library-env-name', undefined, env)}
      </div>
      {open[key] && <div className="library-env-children">
        <button type="button" className="library-subhead" aria-expanded={!!open[containers]} onClick={() => toggle(containers)}>{open[containers] ? '▾' : '▸'} Containers <small>{env.containers.length.toLocaleString()}</small></button>
        {open[containers] && env.containers.map(c => item({ kind: 'container', id: c.id, name: c.name, environment: env.name }, c.name, c.count, 'library-leaf'))}
        <button type="button" className="library-subhead" aria-expanded={!!open[types]} onClick={() => toggle(types)}>{open[types] ? '▾' : '▸'} Dossier types <small>{env.types.length.toLocaleString()}</small></button>
        {open[types] && env.types.map(t => item({ kind: 'type', type: t.type_id, name: t.name, environmentId: env.id, environment: env.name }, t.name, t.count, 'library-leaf'))}
      </div>}
    </div>
  }
  return <nav className="library-sidebar" aria-label="Library">
    <h2>Library</h2>
    {item({ kind: 'all' }, 'All assets', data?.all)}
    {item({ kind: 'unidentified' }, 'Unidentified', data?.unidentified_dossiers, 'warn')}
    <div className="library-sidebar-head" onContextMenu={event => { event.preventDefault(); collectionMenu(event.clientX, event.clientY, null) }}>
      <h2>Collections</h2>
      <button type="button" className="library-icon-button" title="New collection (right-click for a smart one from the search)" aria-label="New collection" onClick={newCollection}>+</button>
    </div>
    {collections === null ? <p className="library-muted">Loading…</p>
      : collections.length ? collections.map(c => item({ kind: 'collection', uid: c.uid, name: c.name }, c.smart ? `${c.name} ⌕` : c.name, c.count, '', c))
        : <p className="library-muted">No collections yet.</p>}
    <h2>Environments</h2>
    {error && <p className="library-error" role="alert">{error}</p>}
    {data === null && !error ? <p className="library-muted">Counting the library…</p>
      : data?.environments.length ? data.environments.map(environment)
        : !error && <><p className="library-muted">No environments yet.</p>
          <button type="button" className="library-link library-sidebar-add" onClick={addEnvironment}>Add environment…</button></>}
    <h2>Definitions</h2>
    {item({ kind: 'lexicons' }, 'Lexicons')}
  </nav>
}
