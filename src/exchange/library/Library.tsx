import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useDesktop } from '../../desktop/client'
import { exchangeGet, type Brick, type Collection, type DossierRef, type Sidebar as SidebarData } from '../api'
import Browser from './Browser'
import Inspector from './Inspector'
import Sidebar from './Sidebar'
import { Pages } from './pages'
import { plural } from './format'
import { effectiveGroup, listingQuery, viewTitle, type Group, type Listing, type View } from './views'
import './library.css'

const SEARCH_DELAY = 300

// The Workspace's library view (Roadmap phase 6d): the PySide6 window's layout, read-only.
// Sidebar | item-card grid | inspector, with the search language on top.
export default function Library() {
  const { exchange } = useDesktop()
  const [listing, setListing] = useState<Listing>({ view: { kind: 'all' }, parent: null, search: '', group: 'product' })
  const [draft, setDraft] = useState('')
  const [generation, setGeneration] = useState(0)
  const [side, setSide] = useState<{ generation: number; sidebar?: SidebarData; collections?: Collection[]; error?: string }>({ generation: -1 })
  const query = listingQuery(listing)
  const key = `${generation}|${JSON.stringify(query)}`
  // A new Pages for each listing; the key holds everything it depends on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pages = useMemo(() => new Pages(query), [key])
  useEffect(() => () => pages.close(), [pages])
  useSyncExternalStore(pages.subscribe, pages.getVersion) // the heading shows its total
  const [selection, setSelection] = useState<{ key: string; index: number | null; uid: string | null }>({ key: '', index: null, uid: null })
  const selected = selection.key === key ? selection : { key, index: null, uid: null }

  // The sidebar counts the whole library (about 2 s on 235k assets): loaded once, and on Refresh.
  useEffect(() => {
    let current = true
    const merge = (value: Partial<typeof side>) => { if (current) setSide(previous => ({ ...(previous.generation === generation ? previous : {}), generation, ...value })) }
    exchangeGet('sidebar').then(sidebar => merge({ sidebar })).catch(error => merge({ error: error instanceof Error ? error.message : String(error) }))
    exchangeGet('collections').then(collections => merge({ collections })).catch(() => merge({ collections: [] }))
    return () => { current = false }
  }, [generation])
  const shownSide = side.generation === generation ? side : { generation }

  // The search applies a moment after typing stops, or at once on Enter.
  useEffect(() => {
    if (draft === listing.search) return
    const timer = setTimeout(() => setListing(previous => ({ ...previous, search: draft })), SEARCH_DELAY)
    return () => clearTimeout(timer)
  }, [draft, listing.search])

  const choose = (view: View) => setListing(previous => ({ ...previous, view, parent: null }))
  const openSet = (brick: Brick) => setListing(previous => ({ ...previous, parent: { uid: brick.uid, name: brick.name } }))
  const show = (ref: DossierRef) => setSelection({ key, index: null, uid: ref.uid })
  const group = (value: Group) => setListing(previous => ({ ...previous, group: value }))
  const grouping = effectiveGroup(listing)
  const { crumb, title } = viewTitle(listing.view)
  const total = pages.total
  const [one, many] = grouping === 'product' && !listing.parent
    ? ['product or standalone asset', 'products and standalone assets'] : ['asset', 'assets']
  const empty = shownSide.sidebar && !shownSide.sidebar.environments.length
    ? 'No environments yet. Add one in the PySide6 window or with exchange scan.'
    : listing.view.kind === 'collection' && !listing.search ? 'This collection is empty.' : 'Nothing here matches.'

  return <div className="library">
    <header className="library-top">
      <form className="library-search" role="search" onSubmit={event => { event.preventDefault(); setListing(previous => ({ ...previous, search: draft })) }}>
        <input value={draft} onChange={event => setDraft(event.target.value)} aria-label="Search the library" spellCheck={false}
          placeholder="Search: donut env:starfield tag:food -tag:damaged type:mesh" />
        {draft && <button type="button" className="library-clear" aria-label="Clear the search" onClick={() => { setDraft(''); setListing(previous => ({ ...previous, search: '' })) }}>×</button>}
      </form>
      <span className="library-connection" title={exchange.core || undefined}><i aria-hidden="true" />Connected · core {exchange.version} · API v{exchange.api}</span>
      <button type="button" className="library-button" onClick={() => setGeneration(n => n + 1)} title="Read the library again (after a scan or edits in the PySide6 window)">Refresh</button>
    </header>
    <div className="library-body">
      <Sidebar data={shownSide.sidebar ?? null} collections={shownSide.collections ?? null} error={shownSide.error || ''} view={listing.view} choose={choose} />
      <section className="library-browser" aria-label="Browser">
        <header className="library-heading">
          <div>
            {listing.parent
              ? <button type="button" className="library-crumb library-link" onClick={() => setListing(previous => ({ ...previous, parent: null }))}>‹ {title}</button>
              : <span className="library-crumb">{crumb}</span>}
            <h2>{listing.parent ? listing.parent.name : title}</h2>
            <p>{total === null ? 'Loading…' : `${plural(total, one, many)}${listing.search ? ` matching “${listing.search}”` : ''}`}</p>
          </div>
          <div className="library-group" role="group" aria-label="Group by">
            {(['product', 'type'] as const).map(value => <button key={value} type="button" aria-pressed={listing.group === value}
              disabled={!!listing.parent || grouping !== listing.group} onClick={() => group(value)}
              title={grouping === 'all' ? 'Searches, dossier types, collections and Unidentified list every asset' : undefined}>
              {value === 'product' ? 'By product' : 'By type'}</button>)}
          </div>
        </header>
        <Browser key={key} pages={pages} selected={selected.index} empty={empty}
          select={(index, brick) => setSelection({ key, index, uid: brick.uid })} open={openSet} />
      </section>
      <Inspector uid={selected.uid} show={show} />
    </div>
  </div>
}
