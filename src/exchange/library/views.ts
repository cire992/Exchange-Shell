import type { Query } from './pages'

// What the browser lists: a sidebar choice, optionally a product opened from it, a search and a
// grouping. The core lists everything (no product grouping) for searches, dossier types,
// collections and Unidentified, as the PySide6 window does.
export type View =
  | { kind: 'all' }
  | { kind: 'unidentified' }
  | { kind: 'collection'; uid: string; name: string }
  | { kind: 'environment'; id: number; name: string }
  | { kind: 'container'; id: number; name: string; environment: string }
  | { kind: 'type'; type: string; name: string; environmentId: number; environment: string }

export type Group = 'product' | 'type'

export interface Listing {
  view: View
  parent: { uid: string; name: string } | null
  search: string
  group: Group
}

export const viewKey = (view: View) => {
  switch (view.kind) {
    case 'collection': return `collection:${view.uid}`
    case 'environment': return `environment:${view.id}`
    case 'container': return `container:${view.id}`
    case 'type': return `type:${view.environmentId}:${view.type}`
    default: return view.kind
  }
}

export function effectiveGroup({ view, search, group }: Listing): Group | 'all' {
  return search.trim() || view.kind === 'type' || view.kind === 'collection' || view.kind === 'unidentified' ? 'all' : group
}

export function listingQuery(listing: Listing): Query {
  const { view, parent, search } = listing
  const query: Query = { query: search.trim() || undefined, group: parent ? 'all' : effectiveGroup(listing) }
  if (parent) query.parent = parent.uid
  switch (view.kind) {
    case 'unidentified': query.unidentified = true; break
    case 'collection': query.collection = view.uid; break
    case 'environment': query.environment = view.id; break
    case 'container': query.container = view.id; break
    case 'type': query.environment = view.environmentId; query.type = view.type; break
  }
  return query
}

export function viewTitle(view: View): { crumb: string; title: string } {
  switch (view.kind) {
    case 'unidentified': return { crumb: 'Unidentified desk', title: 'Low confidence' }
    case 'collection': return { crumb: 'Collection', title: view.name }
    case 'environment': return { crumb: 'Environments', title: view.name }
    case 'container': return { crumb: view.environment, title: view.name }
    case 'type': return { crumb: `${view.environment} › Dossier type`, title: view.name }
    default: return { crumb: 'Library', title: 'All assets' }
  }
}
