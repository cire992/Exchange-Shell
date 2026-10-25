import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useDesktop } from '../../desktop/client'
import { exchangeGet, type Brick, type Choices, type Collection, type DossierRef, type Sidebar as SidebarData } from '../api'
import { libraryActions } from './actions'
import Browser, { type SelectMode } from './Browser'
import { DialogProvider, useDialogs, type MenuItem } from './Dialogs'
import { useEditing, useUndoKeys, type Refresh } from './editing'
import Inspector from './Inspector'
import Sidebar from './Sidebar'
import { Pages } from './pages'
import { plural } from './format'
import { effectiveGroup, listingQuery, viewTitle, type Group, type Listing, type View } from './views'
import './library.css'

const SEARCH_DELAY = 300

// The Workspace's library view (Roadmap phases 6d and 6f): the PySide6 window's layout, with its
// editing. Sidebar | item-card grid | inspector, with the search language on top, Undo and Redo,
// and a status line saying what the last edit did.
export default function Library() {
  return <DialogProvider><LibraryView /></DialogProvider>
}

interface Selection { key: string; focus: number | null; anchor: number | null; picked: Map<string, number> }

function LibraryView() {
  const { exchange } = useDesktop()
  const dialogs = useDialogs()
  const [listing, setListing] = useState<Listing>({ view: { kind: 'all' }, parent: null, search: '', group: 'product' })
  const [draft, setDraft] = useState('')
  const [generation, setGeneration] = useState(0) // Refresh: everything is read again
  const [revisions, setRevisions] = useState({ side: 0, collections: 0, detail: 0 }) // after edits
  const [side, setSide] = useState<{ key: string; sidebar?: SidebarData; error?: string }>({ key: '' })
  const [shelf, setShelf] = useState<{ key: string; collections?: Collection[] }>({ key: '' })
  const [choices, setChoices] = useState<Choices | null>(null)
  const query = listingQuery(listing)
  const key = `${generation}|${JSON.stringify(query)}`
  // A new Pages for each listing; the key holds everything it depends on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pages = useMemo(() => new Pages(query), [key])
  useEffect(() => () => pages.close(), [pages])
  useSyncExternalStore(pages.subscribe, pages.getVersion) // the heading shows its total
  const [selection, setSelection] = useState<Selection>({ key: '', focus: null, anchor: null, picked: new Map() })
  const selected = selection.key === key ? selection : { key, focus: null, anchor: null, picked: new Map<string, number>() }
  const selectedUids = useMemo(() => new Set(selected.picked.keys()), [selected.picked])

  // After an edit, read again what it can have changed (the window's refresh scopes).
  const refresh = useCallback((scope: Refresh) => {
    if (scope === 'none') return
    pages.reload()
    setRevisions(r => ({ detail: r.detail + 1, collections: scope === 'detail' ? r.collections : r.collections + 1, side: scope === 'all' ? r.side + 1 : r.side }))
  }, [pages])
  const editing = useEditing(refresh)
  useUndoKeys(editing)
  const { edit } = editing
  const actions = useMemo(() => libraryActions(edit), [edit])

  // The sidebar counts the whole library (about 2 s on 235k assets): loaded once, after edits that
  // change counts, and on Refresh.
  const sideKey = `${generation}|${revisions.side}`, shelfKey = `${sideKey}|${revisions.collections}`
  useEffect(() => {
    let current = true
    exchangeGet('sidebar').then(sidebar => { if (current) setSide({ key: sideKey, sidebar }) })
      .catch(error => { if (current) setSide({ key: sideKey, error: error instanceof Error ? error.message : String(error) }) })
    return () => { current = false }
  }, [sideKey])
  useEffect(() => {
    let current = true
    exchangeGet('collections').then(collections => { if (current) setShelf({ key: shelfKey, collections }) })
      .catch(() => { if (current) setShelf({ key: shelfKey, collections: [] }) })
    return () => { current = false }
  }, [shelfKey])
  useEffect(() => {
    let current = true
    exchangeGet('choices').then(value => { if (current) setChoices(value) }).catch(() => {})
    return () => { current = false }
  }, [generation])
  // Counts and collections stay shown while they are read again.
  const sidebar = side.sidebar ?? null, collections = shelf.collections ?? null
  const manual = (collections || []).filter(c => !c.smart)

  // The search applies a moment after typing stops, or at once on Enter.
  useEffect(() => {
    if (draft === listing.search) return
    const timer = setTimeout(() => setListing(previous => ({ ...previous, search: draft })), SEARCH_DELAY)
    return () => clearTimeout(timer)
  }, [draft, listing.search])

  const choose = (view: View) => setListing(previous => ({ ...previous, view, parent: null }))
  const openSet = (brick: Brick) => setListing(previous => ({ ...previous, parent: { uid: brick.uid, name: brick.name } }))
  const show = (ref: DossierRef) => setSelection({ key, focus: null, anchor: null, picked: new Map([[ref.uid, -1]]) })
  const group = (value: Group) => setListing(previous => ({ ...previous, group: value }))

  const select = (index: number, brick: Brick, mode: SelectMode) => setSelection(previous => {
    const current = previous.key === key ? previous : { key, focus: null, anchor: null, picked: new Map<string, number>() }
    if (mode === 'toggle') {
      const picked = new Map(current.picked)
      if (picked.has(brick.uid)) picked.delete(brick.uid); else picked.set(brick.uid, index)
      return { key, focus: index, anchor: index, picked }
    }
    if (mode === 'range' && current.anchor !== null) {
      const picked = new Map<string, number>()
      for (let i = Math.min(current.anchor, index); i <= Math.max(current.anchor, index); i++) {
        const b = pages.brick(i)
        if (b) picked.set(b.uid, i)
      }
      return { key, focus: index, anchor: current.anchor, picked }
    }
    return { key, focus: index, anchor: index, picked: new Map([[brick.uid, index]]) }
  })
  const selectAll = () => {
    const picked = new Map<string, number>()
    for (let i = 0; i < (pages.total ?? 0); i++) { const b = pages.brick(i); if (b) picked.set(b.uid, i) }
    setSelection({ key, focus: selected.focus, anchor: selected.anchor, picked })
    if (picked.size < (pages.total ?? 0)) editing.say(`Selected the ${picked.size.toLocaleString()} assets read so far; scroll to read more.`)
  }
  const dragged = (_index: number, brick: Brick) => selectedUids.has(brick.uid) ? [...selectedUids] : [brick.uid]

  const newCollection = async (members: string[] = [], query?: string) => {
    const name = await dialogs.ask({ title: query ? 'Save the search as a smart collection' : 'New collection', label: 'Name', confirm: 'Create' })
    if (!name) return
    const made = await actions.newCollection(name, query)
    if (made?.new_uid && members.length) await actions.members(made.new_uid, members, true)
  }
  const merge = async (uids: string[], into: string) => {
    for (const uid of uids) if (!(await actions.merge(uid, into))) break // one undo step each, as in the window
  }
  const cardMenu = async (x: number, y: number, clicked: Brick) => {
    const uids = selectedUids.has(clicked.uid) && selectedUids.size ? [...selectedUids] : [clicked.uid]
    const many = uids.length > 1
    const view = listing.view
    const items: MenuItem[] = []
    if (!many) items.push({ label: 'Rename…', run: async () => {
      const name = await dialogs.ask({ title: 'Rename', label: 'Name', value: clicked.name, confirm: 'Rename' })
      if (name && name !== clicked.name) await actions.setField([clicked.uid], 'name', name)
    } })
    items.push({ label: 'Add to collection', items: [...manual.map(c => ({ label: c.name, run: () => void actions.members(c.uid, uids, true) })),
      { label: '-' }, { label: 'New collection…', run: () => void newCollection(uids) }] })
    if (view.kind === 'collection' && manual.some(c => c.uid === view.uid)) {
      items.push({ label: `Remove from “${view.name}”`, run: () => void actions.members(view.uid, uids, false) })
    }
    items.push({ label: 'Put into a new product…', run: async () => {
      const name = await dialogs.ask({ title: 'New product', label: 'Name', confirm: 'Create' })
      if (name) await actions.newProduct(name, uids)
    } })
    if (listing.parent) {
      const parent = listing.parent
      items.push({ label: `Take out of “${parent.name}”`, run: () => void actions.setParent(uids, null) })
    }
    if (many) {
      items.push({ label: `Merge the others into “${clicked.name}”`, run: () => void merge(uids.filter(u => u !== clicked.uid), clicked.uid) })
    } else {
      // Split and variants need the asset's entries.
      const detail = await exchangeGet('dossiers/{uid}', { path: { uid: clicked.uid } }).catch(() => null)
      const live = detail ? detail.ledgers.flatMap(ledger => ledger.entries.filter(e => e.status !== 'retired').map(e => ({ e, env: ledger.environment.name }))) : []
      if (live.length > 1) items.push({ label: 'Split…', run: async () => {
        const entry = await dialogs.ask({ title: `Split ${clicked.name}`, label: 'The entry that becomes an asset of its own', confirm: 'Split',
          choices: live.map(({ e, env }) => ({ label: `${env} · ${e.container || '(root)'}${e.files[0] ? ` · ${e.files[0].rel_path}` : ''}`, value: String(e.id) })) })
        if (!entry) return
        const name = await dialogs.ask({ title: 'The new asset', label: 'Name', value: `${clicked.name} (split)`, confirm: 'Split' })
        if (name) await actions.split(clicked.uid, [Number(entry)], name)
      } })
      for (const variant of detail?.variants || []) {
        items.push({ label: `Make variant “${variant}” its own asset`, run: () => void actions.promote(clicked.uid, variant) })
      }
    }
    const dismissed = /\bis:dismissed\b/i.test(listing.search)
    items.push({ label: dismissed ? 'Count as an asset again' : 'Not an asset', run: () => void actions.dismiss(uids, !dismissed) })
    dialogs.menu(x, y, items, `Actions for ${many ? `${uids.length} assets` : clicked.name}`)
  }
  // What dropping cards on another card can mean (the window's drop menu).
  const drop = (target: Brick, uids: string[], x: number, y: number) => {
    const n = plural(uids.length, 'asset')
    const items: MenuItem[] = []
    if (target.type_id === 'product') items.push({ label: `Put ${n} into “${target.name}”`, run: () => void actions.setParent(uids, target.uid) })
    items.push({ label: `Merge ${n} into “${target.name}” (the same asset)`, run: () => void merge(uids, target.uid) })
    if (uids.length === 1) items.push({ label: `Fold in as a variant of “${target.name}”…`, run: async () => {
      const variant = await dialogs.ask({ title: `A variant of ${target.name}`, label: 'Variant name (e.g. blue)', confirm: 'Fold in' })
      if (variant) await actions.fold(uids[0], target.uid, variant)
    } })
    items.push({ label: '-' }, { label: 'Cancel' })
    dialogs.menu(x, y, items, `Drop onto ${target.name}`)
  }
  const collectionMenu = (x: number, y: number, collection: Collection | null) => {
    const search = listing.search.trim()
    const items: MenuItem[] = [{ label: 'New collection…', run: () => void newCollection() },
      { label: 'Save this search as a smart collection…', disabled: !search, title: search ? undefined : 'Search first',
        run: () => void newCollection([], search) }]
    if (collection) items.push({ label: '-' }, { label: `Delete “${collection.name}”`, run: async () => {
      if (await actions.deleteCollection(collection.uid) && listing.view.kind === 'collection' && listing.view.uid === collection.uid) choose({ kind: 'all' })
    } })
    dialogs.menu(x, y, items, collection ? collection.name : 'Collections')
  }

  const grouping = effectiveGroup(listing)
  const { crumb, title } = viewTitle(listing.view)
  const total = pages.total
  const [one, many] = grouping === 'product' && !listing.parent
    ? ['product or standalone asset', 'products and standalone assets'] : ['asset', 'assets']
  const empty = sidebar && !sidebar.environments.length
    ? 'No environments yet. Add one in the PySide6 window or with exchange scan.'
    : listing.view.kind === 'collection' && !listing.search ? 'This collection is empty.' : 'Nothing here matches.'
  const { session, status, busy } = editing

  return <div className="library">
    <header className="library-top">
      <form className="library-search" role="search" onSubmit={event => { event.preventDefault(); setListing(previous => ({ ...previous, search: draft })) }}>
        <input value={draft} onChange={event => setDraft(event.target.value)} aria-label="Search the library" spellCheck={false}
          placeholder="Search: donut env:starfield tag:food -tag:damaged type:mesh" />
        {draft && <button type="button" className="library-clear" aria-label="Clear the search" onClick={() => { setDraft(''); setListing(previous => ({ ...previous, search: '' })) }}>×</button>}
      </form>
      <div className="library-undo" role="group" aria-label="Undo and Redo">
        <button type="button" className="library-button" disabled={!session.undo || busy} onClick={() => void editing.undo()}
          title={session.undo ? `Undo: ${session.undo} (Ctrl+Z)` : 'Nothing to undo'}>Undo</button>
        <button type="button" className="library-button" disabled={!session.redo || busy} onClick={() => void editing.redo()}
          title={session.redo ? `Redo: ${session.redo} (Ctrl+Y)` : 'Nothing to redo'}>Redo</button>
      </div>
      <span className="library-connection" title={exchange.core || undefined}><i aria-hidden="true" />Connected · core {exchange.version} · API v{exchange.api}</span>
      <button type="button" className="library-button" onClick={() => setGeneration(n => n + 1)} title="Read the library again (after a scan or edits in the PySide6 window)">Refresh</button>
    </header>
    <div className="library-body">
      <Sidebar data={sidebar} collections={collections} error={side.error || ''} view={listing.view} choose={choose}
        newCollection={() => void newCollection()} collectionMenu={collectionMenu}
        dropOnCollection={(collection, uids) => void actions.members(collection.uid, uids, true)} />
      <section className="library-browser" aria-label="Browser">
        <header className="library-heading">
          <div>
            {listing.parent
              ? <button type="button" className="library-crumb library-link" onClick={() => setListing(previous => ({ ...previous, parent: null }))}>‹ {title}</button>
              : <span className="library-crumb">{crumb}</span>}
            <h2>{listing.parent ? listing.parent.name : title}</h2>
            <p>{total === null ? 'Loading…' : `${plural(total, one, many)}${listing.search ? ` matching “${listing.search}”` : ''}`}
              {selectedUids.size > 1 && ` · ${selectedUids.size.toLocaleString()} selected`}</p>
          </div>
          <div className="library-group" role="group" aria-label="Group by">
            {(['product', 'type'] as const).map(value => <button key={value} type="button" aria-pressed={listing.group === value}
              disabled={!!listing.parent || grouping !== listing.group} onClick={() => group(value)}
              title={grouping === 'all' ? 'Searches, dossier types, collections and Unidentified list every asset' : undefined}>
              {value === 'product' ? 'By product' : 'By type'}</button>)}
          </div>
        </header>
        <Browser key={key} pages={pages} selected={selectedUids} focus={selected.focus} empty={empty}
          select={select} selectAll={selectAll} open={openSet} menu={(x, y, brick) => void cardMenu(x, y, brick)} dragged={dragged} drop={drop} />
      </section>
      <Inspector uids={[...selectedUids]} revision={revisions.detail} show={show} actions={actions} choices={choices} collections={manual} />
    </div>
    <footer className={`library-statusline ${status?.error ? 'error' : ''}`} role="status" aria-live="polite">
      {status?.text || 'Right-click assets for actions; drag them onto another asset or a collection. Ctrl+Z undoes.'}
    </footer>
  </div>
}
