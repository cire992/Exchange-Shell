// The Exchange core's API, through this shell's local service: /api/exchange/<route> is the core's
// /api/v1/<route>, with the core's token added by the service. Types are generated from the core's
// committed schema (npm run exchange:types).
import { api, desktopState } from '../desktop/client'
import type { Deletes, Posts, Routes } from './api.gen'

export type * from './api.gen'

type Get = { [K in keyof Routes]: Routes[K]['response'] extends Blob ? never : K }[keyof Routes]

const target = (route: string, path: Record<string, unknown> = {}) =>
  Object.entries(path).reduce((url, [name, value]) => url.replace(`{${name}}`, encodeURIComponent(String(value))), route)

export function exchangeGet<K extends Get>(route: K, params: { path?: Routes[K]['path']; query?: Routes[K]['query'] } = {}): Promise<Routes[K]['response']> {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(params.query || {})) if (value !== undefined && value !== null && value !== '') search.set(name, String(value))
  return api<Routes[K]['response']>(`/exchange/${target(route, params.path)}${search.size ? `?${search}` : ''}`)
}

// The core's edits (Roadmap phase 6e): POST with a JSON body, DELETE without one.
export function exchangePost<K extends keyof Posts>(route: K, params: { path?: Posts[K]['path']; body?: Posts[K]['body'] } = {}): Promise<Posts[K]['response']> {
  return api<Posts[K]['response']>(`/exchange/${target(route, params.path)}`, params.body ?? {})
}

export function exchangeDelete<K extends keyof Deletes>(route: K, params: { path?: Deletes[K]['path'] } = {}): Promise<Deletes[K]['response']> {
  return api<Deletes[K]['response']>(`/exchange/${target(route, params.path)}`, undefined, 'DELETE')
}

// For <img>: the service serves thumbnails under a per-launch path instead of the token.
export const thumbnailUrl = (uid: string) => `${desktopState().exchangeImages}/${encodeURIComponent(uid)}`
