import { exchangeGet, type Brick, type Routes } from '../api'

export const PAGE_SIZE = 200

export type Query = Routes['dossiers']['query']

// One listing's pages of item cards, fetched as they scroll into view and kept while the listing
// is shown. Components read it through useSyncExternalStore (subscribe / version).
export class Pages {
  total: number | null = null
  error = ''
  version = 0
  private pages = new Map<number, Brick[]>()
  private loading = new Set<number>()
  private listeners = new Set<() => void>()
  private closed = false
  private readonly query: Query

  constructor(query: Query) {
    this.query = query
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getVersion = () => this.version
  close() { this.closed = true; this.listeners.clear() }

  private changed() { if (this.closed) return; this.version++; for (const listener of this.listeners) listener() }

  brick(index: number): Brick | undefined {
    return this.pages.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE]
  }

  // Fetch the pages holding items first..last (inclusive) that are not loaded or loading.
  ensure(first: number, last: number) {
    if (this.error) return
    const end = this.total === null ? first : Math.min(last, this.total - 1)
    for (let page = Math.floor(first / PAGE_SIZE); page <= Math.floor(Math.max(first, end) / PAGE_SIZE); page++) {
      if (this.pages.has(page) || this.loading.has(page)) continue
      this.loading.add(page)
      exchangeGet('dossiers', { query: { ...this.query, offset: page * PAGE_SIZE, limit: PAGE_SIZE } })
        .then(result => { this.pages.set(page, result.items); this.total = result.total })
        .catch(error => { this.error = error instanceof Error ? error.message : String(error) })
        .finally(() => { this.loading.delete(page); this.changed() })
    }
  }
}
