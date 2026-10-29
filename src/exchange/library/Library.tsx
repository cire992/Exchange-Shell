import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { api, useDesktop } from '../../desktop/client'
import { exchangeGet, exchangePost, type Brick, type Choices, type Collection, type DossierRef, type Sidebar as SidebarData, type SidebarEnvironment } from '../api'
import { libraryActions } from './actions'
import { fileRefs, mainFile } from './files'
import Browser, { type SelectMode } from './Browser'
import { DialogProvider, useDialogs, type MenuItem } from './Dialogs'
import { useEditing, useUndoKeys, type Refresh } from './editing'
import Endpoints from './Endpoints'
import EnvironmentSettings from './EnvironmentSettings'
import Inspector from './Inspector'
import { describeFinished, describeProgress, Jobs } from './jobs'
import Lexicons from './Lexicons'
import Processes from './Processes'
import Queue from './Queue'
import RequisitionDialog from './RequisitionDialog'
import Sidebar from './Sidebar'
import Suggestions from './Suggestions'
import Unattached from './Unattached'
import Wizard from './Wizard'
import { Pages } from './pages'
import { plural } from './format'
import { effectiveGroup, isPage, listingQuery, PILES, viewTitle, type Group, type Listing, type Pile, type View } from './views'
import './library.css'

const SEARCH_DELAY = 300

// The Workspace's library view (Roadmap phases 6d and 6f): the PySide6 window's layout, with its
// editing. Sidebar | item-card grid | inspector, with the search language on top, Undo and Redo,
// and a status line saying what the last edit did. Unidentified is the window's desk, with its three
// piles (low confidence, unattached files, suggestions); Lexicons is its lexicon editor. Environments
// are added (the wizard) and scanned in the core's worker processes (6h): the scan bar follows the
// running job, and changes the core notices since the last scan offer a rescan. Requisition to…
// plans and queues conversions; the queue and Settings › Processes and Endpoints are pages (6i).
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
  const [revisions, setRevisions] = useState({ side: 0, collections: 0, detail: 0, edits: 0 }) // after edits
  const [pile, setPile] = useState<Pile>('low')
  const [pending, setPending] = useState<number | null>(null) // suggestions, for the desk's pile buttons
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
  // The desk's suggestions and the lexicons are read again after any edit (a rejection or a lexicon
  // word changes nothing else).
  const refresh = useCallback((scope: Refresh) => {
    if (scope === 'none') { setRevisions(r => ({ ...r, edits: r.edits + 1 })); return }
    pages.reload()
    setRevisions(r => ({ edits: r.edits + 1, detail: r.detail + 1, collections: scope === 'detail' ? r.collections : r.collections + 1, side: scope === 'all' ? r.side + 1 : r.side }))
  }, [pages])
  const editing = useEditing(refresh)
  useUndoKeys(editing)
  const { edit } = editing
  const actions = useMemo(() => libraryActions(edit), [edit])

  // Scans and other long jobs, and change notices, followed while the view is open.
  const jobs = useMemo(() => new Jobs(), [])
  useEffect(() => () => jobs.close(), [jobs])
  useSyncExternalStore(jobs.subscribe, jobs.getVersion)
  const [wizard, setWizard] = useState(false)
  const [settingsOf, setSettingsOf] = useState<number | null>(null)
  const [requisition, setRequisition] = useState<{ uids: string[]; title: string } | null>(null)
  const [queueReads, setQueueReads] = useState(0) // the queue changed (queued, acted on, a job ended)
  const [queueCount, setQueueCount] = useState<number | null>(null)
  const latest = useRef({ refresh, say: editing.say })
  useEffect(() => { latest.current = { refresh, say: editing.say } })
  useEffect(() => {
    const identified = new Set<number>()
    const progress = jobs.onProgress(job => {
      // Products can be shown once identification is done (phase 3), as in the window.
      if (job.writes && job.progress?.phase === 3 && !identified.has(job.id)) { identified.add(job.id); latest.current.refresh('all') }
    })
    const finished = jobs.onFinished(job => {
      if (job.writes) latest.current.refresh('all')
      setQueueReads(n => n + 1)
      const said = describeFinished(job)
      if (said && job.kind !== 'detect') latest.current.say(said.text, said.error)
    })
    return () => { progress(); finished() }
  }, [jobs])
  const writer = jobs.writer
  const changed = useMemo(() => new Set(jobs.changes.environments), [jobs.changes.environments])
  const startJob = async (start: () => Promise<unknown>) => {
    try { await start() } catch (error) { editing.say(error instanceof Error ? error.message : String(error), true) }
  }
  const rescan = (ids: number[] = []) => void startJob(() => exchangePost('jobs/rescan', { body: { environments: ids } }))
  const stopJob = () => { if (writer) void startJob(() => exchangePost('jobs/{job_id}/stop', { path: { job_id: writer.id } })) }
  const applyLexicons = (regroup: boolean) => void startJob(() => exchangePost('jobs/classify', { body: { regroup } }))
  const runQueue = (ids?: number[]) => void startJob(() => exchangePost('jobs/requisitions', { body: { ids: ids || null } }))
  const removeOutput = (id: number) => void startJob(() => exchangePost('jobs/remove-output', { body: { requisition: id } }))
  // Ctrl+F searches and F5 rescans, as in the window. F5 never reloads the Workspace.
  const searchBox = useRef<HTMLInputElement>(null)
  const dialogOpen = wizard || requisition !== null || settingsOf !== null
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'F5') {
        event.preventDefault()
        if (!writer && !dialogOpen) rescan(changed.size ? [...changed] : [])
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchBox.current?.focus()
        searchBox.current?.select()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  const queued = (ids: number[], run: boolean) => {
    editing.say(`Queued ${ids.length} requisition${ids.length === 1 ? '' : 's'}${run ? ' · running' : ' · run it from Requisitions'}`)
    setQueueReads(n => n + 1)
    if (run) runQueue()
  }
  useEffect(() => {
    let current = true
    exchangeGet('requisitions').then(rows => {
      if (current) setQueueCount(rows.filter(r => ['queued', 'held', 'running', 'needs_attention'].includes(r.state)).length)
    }).catch(() => {})
    return () => { current = false }
  }, [generation, queueReads])
  const environmentMenu = (x: number, y: number, env: SidebarEnvironment) => dialogs.menu(x, y, [
    { label: `Rescan ${env.name}`, disabled: !!writer, run: () => rescan([env.id]) },
    { label: 'Settings…', run: () => setSettingsOf(env.id) },
  ], env.name)

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

  const desk = listing.view.kind === 'unidentified' && !listing.parent
  useEffect(() => {
    if (!desk) return
    let current = true
    exchangeGet('suggestions', { query: { limit: 1 } }).then(page => { if (current) setPending(page.total) }).catch(() => {})
    return () => { current = false }
  }, [desk, generation, revisions.edits])

  // The search applies a moment after typing stops, or at once on Enter. It lists assets: from the
  // lexicons it goes to All assets, and in the desk to its low-confidence pile.
  const search = useCallback((text: string) => {
    setListing(previous => ({ ...previous, view: isPage(previous.view) ? { kind: 'all' } : previous.view, search: text }))
    setPile('low')
  }, [])
  useEffect(() => {
    if (draft === listing.search) return
    const timer = setTimeout(() => search(draft), SEARCH_DELAY)
    return () => clearTimeout(timer)
  }, [draft, listing.search, search])

  const choose = (view: View) => { setListing(previous => ({ ...previous, view, parent: null })); setPile('low') }
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
  const failed = (error: unknown) => editing.say(error instanceof Error ? error.message : String(error), true)
  // Explorer and the file's Windows app, through the shell's service (outside the core).
  const showInFolder = (path: string) => void api('/reveal', { path }).catch(failed)
  const openInApp = (path: string) => void api('/open-file', { path }).catch(failed)
  // The dragged assets' files onto the target (e.g. textures onto a mesh), as the window's files_of.
  const linkFiles = async (target: Brick, uids: string[]) => {
    const details = await Promise.all(uids.map(uid => exchangeGet('dossiers/{uid}', { path: { uid } }).catch(() => null)))
    if (details.some(detail => !detail)) return editing.say('Could not read the dragged assets; Refresh and try again.', true)
    const files = fileRefs(details.filter(detail => detail !== null))
    if (!files.length) return editing.say(`${uids.length > 1 ? 'They have' : 'It has'} no files on disk to link`, true)
    await actions.linkFiles(target.uid, files)
  }
  const cardMenu = async (x: number, y: number, clicked: Brick) => {
    const uids = selectedUids.has(clicked.uid) && selectedUids.size ? [...selectedUids] : [clicked.uid]
    const many = uids.length > 1
    const view = listing.view
    const items: MenuItem[] = [{ label: 'Requisition to…', run: () => setRequisition({ uids, title: many ? `${uids.length} assets` : clicked.name }) }, { label: '-' }]
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
    // Split, variants and the asset's file need its entries.
    const detail = many ? null : await exchangeGet('dossiers/{uid}', { path: { uid: clicked.uid } }).catch(() => null)
    if (many) {
      items.push({ label: `Merge the others into “${clicked.name}”`, run: () => void merge(uids.filter(u => u !== clicked.uid), clicked.uid) })
    } else {
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
    if (!many) {
      const file = detail && mainFile(detail)
      const why = detail ? 'It has no file on disk' : 'Could not read the asset'
      items.push({ label: '-' },
        { label: 'Show in folder', disabled: !file, title: file ? file.path : why, run: () => { if (file) showInFolder(file.path) } },
        { label: 'Open in app', disabled: !file, title: file ? file.path : why, run: () => { if (file) openInApp(file.path) } })
    }
    dialogs.menu(x, y, items, `Actions for ${many ? `${uids.length} assets` : clicked.name}`)
  }
  // What dropping cards on another card can mean (the window's drop menu).
  const drop = (target: Brick, uids: string[], x: number, y: number) => {
    const n = plural(uids.length, 'asset')
    const items: MenuItem[] = []
    if (target.type_id === 'product') items.push({ label: `Put ${n} into “${target.name}”`, run: () => void actions.setParent(uids, target.uid) })
    items.push({ label: `Link their files to “${target.name}”`, run: () => void linkFiles(target, uids) })
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
    ? 'No environments yet. Add one with Add environment… above.'
    : listing.view.kind === 'collection' && !listing.search ? 'This collection is empty.' : 'Nothing here matches.'
  const { session, status, busy } = editing
  type Page = 'lexicons' | 'requisitions' | 'processes' | 'endpoints'
  const page = isPage(listing.view) ? listing.view.kind as Page : null
  const shown: Pile | Page = page || (desk ? pile : 'low')
  const pileCount = (value: Pile) => value === 'low' ? sidebar?.unidentified_dossiers : value === 'files' ? sidebar?.unattached_files : pending
  let heading: { title: string; text: string }
  if (shown === 'files') heading = { title: 'Unattached files', text: sidebar ? `${plural(sidebar.unattached_files, 'file')} no asset holds, as of the last scans` : 'Counting…' }
  else if (shown === 'suggestions') heading = { title: 'Suggestions', text: pending === null ? 'Counting…' : `${plural(pending, 'pending suggestion')}: accept or reject them in batches` }
  else if (shown === 'lexicons') heading = { title, text: 'The word lists scans tag, group and name assets with' }
  else if (shown === 'requisitions') heading = { title, text: queueCount === null ? 'Reading…' : `${plural(queueCount, 'requisition')} waiting, running or needing attention` }
  else if (shown === 'processes') heading = { title, text: 'What converts assets for requisitions, and what each needs' }
  else if (shown === 'endpoints') heading = { title, text: 'Where requisitions write in each environment' }
  else heading = { title: listing.parent ? listing.parent.name : title,
    text: total === null ? 'Loading…' : `${plural(total, one, many)}${listing.search ? ` matching “${listing.search}”` : ''}${selectedUids.size > 1 ? ` · ${selectedUids.size.toLocaleString()} selected` : ''}` }

  return <div className="library">
    <header className="library-top">
      <form className="library-search" role="search" onSubmit={event => { event.preventDefault(); search(draft) }}>
        <input ref={searchBox} value={draft} onChange={event => setDraft(event.target.value)} aria-label="Search the library" spellCheck={false} title="Ctrl+F"
          placeholder="Search: donut env:starfield tag:food -tag:damaged type:mesh" />
        {draft && <button type="button" className="library-clear" aria-label="Clear the search" onClick={() => { setDraft(''); search('') }}>×</button>}
      </form>
      <div className="library-undo" role="group" aria-label="Undo and Redo">
        <button type="button" className="library-button" disabled={!session.undo || busy} onClick={() => void editing.undo()}
          title={session.undo ? `Undo: ${session.undo} (Ctrl+Z)` : 'Nothing to undo'}>Undo</button>
        <button type="button" className="library-button" disabled={!session.redo || busy} onClick={() => void editing.redo()}
          title={session.redo ? `Redo: ${session.redo} (Ctrl+Y)` : 'Nothing to redo'}>Redo</button>
      </div>
      <button type="button" className="library-button" onClick={() => setWizard(true)} disabled={!!writer}
        title={writer ? 'Wait for the scan to finish' : 'Add games, libraries and folders of assets'}>Add environment…</button>
      <button type="button" className={`library-button ${changed.size ? 'primary' : ''}`} disabled={!!writer}
        onClick={() => rescan(changed.size ? [...changed] : [])}
        title={changed.size ? 'Rescan the environments that changed since they were last scanned (F5)' : 'Rescan every environment (F5)'}>
        {changed.size ? `Rescan changed (${changed.size})` : 'Rescan'}</button>
      <span className="library-connection" title={exchange.core || undefined}><i aria-hidden="true" />Connected · core {exchange.version} · API v{exchange.api}</span>
      <button type="button" className="library-button" onClick={() => setGeneration(n => n + 1)} title="Read the library again (after a scan or edits from the CLI)">Refresh</button>
    </header>
    {writer && <div className="library-jobbar" role="status" aria-label="Running job">
      <span>{describeProgress(writer)}</span>
      <progress max={writer.progress?.total || undefined} value={writer.progress?.total ? writer.progress.done : undefined} />
      <button type="button" className="library-button" onClick={stopJob}
        title={writer.kind === 'classify' ? 'Stop: nothing of it is saved' : 'Stop: everything finished so far is saved'}>Stop</button>
    </div>}
    <div className={`library-body ${page ? 'wide' : ''}`}>
      <Sidebar data={sidebar} collections={collections} error={side.error || ''} view={listing.view} choose={choose}
        newCollection={() => void newCollection()} collectionMenu={collectionMenu}
        changed={changed} environmentMenu={environmentMenu} addEnvironment={() => setWizard(true)} queue={queueCount}
        dropOnCollection={(collection, uids) => void actions.members(collection.uid, uids, true)} />
      <section className="library-browser" aria-label="Browser">
        <header className="library-heading">
          <div>
            {listing.parent
              ? <button type="button" className="library-crumb library-link" onClick={() => setListing(previous => ({ ...previous, parent: null }))}>‹ {title}</button>
              : <span className="library-crumb">{crumb}</span>}
            <h2>{heading.title}</h2>
            <p>{heading.text}</p>
          </div>
          {desk ? <div className="library-group library-piles" role="group" aria-label="Unidentified desk">
            {PILES.map(({ pile: value, label }) => <button key={value} type="button" aria-pressed={pile === value} onClick={() => setPile(value)}>
              {label} <small>{pileCount(value)?.toLocaleString() ?? ''}</small></button>)}
          </div> : !page && <div className="library-group" role="group" aria-label="Group by">
            {(['product', 'type'] as const).map(value => <button key={value} type="button" aria-pressed={listing.group === value}
              disabled={!!listing.parent || grouping !== listing.group} onClick={() => group(value)}
              title={grouping === 'all' ? 'Searches, dossier types, collections and Unidentified list every asset' : undefined}>
              {value === 'product' ? 'By product' : 'By type'}</button>)}
          </div>}
        </header>
        {shown === 'lexicons' ? <Lexicons key={generation} revision={revisions.edits} actions={actions} say={editing.say}
          apply={applyLexicons} busy={!!writer} />
          : shown === 'requisitions' ? <Queue key={generation} revision={revisions.edits + queueReads} busy={!!writer} changed={() => setQueueReads(n => n + 1)}
            say={editing.say} run={runQueue} removeOutput={removeOutput} />
          : shown === 'processes' ? <Processes key={generation} say={editing.say} />
          : shown === 'endpoints' ? <Endpoints key={generation} say={editing.say} />
          : shown === 'files' ? <Unattached key={generation} revision={revisions.side} actions={actions} show={show} />
            : shown === 'suggestions' ? <Suggestions key={generation} revision={revisions.edits} actions={actions} show={show} />
              : <Browser key={key} pages={pages} selected={selectedUids} focus={selected.focus} empty={empty}
                select={select} selectAll={selectAll} open={openSet} menu={(x, y, brick) => void cardMenu(x, y, brick)} dragged={dragged} drop={drop} />}
      </section>
      {!page && <Inspector uids={[...selectedUids]} revision={revisions.detail} show={show} actions={actions} choices={choices} collections={manual} />}
    </div>
    <footer className={`library-statusline ${status?.error ? 'error' : ''}`} role="status" aria-live="polite">
      {status?.text || (changed.size && sidebar ? `Changes detected in ${sidebar.environments.filter(e => changed.has(e.id)).map(e => e.name).join(', ')} · Rescan changed when you’re ready`
        : 'Right-click assets for actions; drag them onto another asset or a collection. Ctrl+Z undoes.')}
    </footer>
    {wizard && <Wizard jobs={jobs} close={() => setWizard(false)} reviewUnidentified={() => choose({ kind: 'unidentified' })} />}
    {requisition && <RequisitionDialog uids={requisition.uids} title={requisition.title} close={() => setRequisition(null)} queued={queued} />}
    {settingsOf !== null && <EnvironmentSettings id={settingsOf} close={() => setSettingsOf(null)} say={editing.say} />}
  </div>
}
