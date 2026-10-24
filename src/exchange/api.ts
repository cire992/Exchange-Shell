// The Exchange core's API, through this shell's local service: /api/exchange/<route> is the core's
// /api/v1/<route>, with the core's token added by the service. Types are generated from the core's
// committed schema (npm run exchange:types).
import { api, desktopState } from '../desktop/client'
import type { Routes } from './api.gen'

export type * from './api.gen'

type Get = { [K in keyof Routes]: Routes[K]['response'] extends Blob ? never : K }[keyof Routes]

export function exchangeGet<K extends Get>(route: K, params: { path?: Routes[K]['path']; query?: Routes[K]['query'] } = {}): Promise<Routes[K]['response']> {
  let target: string = route
  for (const [name, value] of Object.entries(params.path || {})) target = target.replace(`{${name}}`, encodeURIComponent(String(value)))
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(params.query || {})) if (value !== undefined && value !== null && value !== '') search.set(name, String(value))
  return api<Routes[K]['response']>(`/exchange/${target}${search.size ? `?${search}` : ''}`)
}

// For <img>: the service serves thumbnails under a per-launch path instead of the token.
export const thumbnailUrl = (uid: string) => `${desktopState().exchangeImages}/${encodeURIComponent(uid)}`
