import { exchangeDelete, exchangePost } from '../api'
import type { Editing } from './editing'

// Every edit the library view makes, through the core's write API. Each returns the edit's result,
// or null when it failed (the status line says why).
export function libraryActions(edit: Editing['edit']) {
  return {
    setField: (uids: string[], field: string, value: unknown) => edit(() => exchangePost('edits/fields', { body: { uids, field, value } })),
    tag: (uids: string[], add: string[], remove: string[]) => edit(() => exchangePost('edits/tags', { body: { uids, add, remove } })),
    revertTag: (uid: string, tag: string) => edit(() => exchangePost('edits/tags/revert', { body: { uid, tag } })),
    setParent: (uids: string[], parent: string | null) => edit(() => exchangePost('edits/parent', { body: { uids, parent } })),
    merge: (uid: string, into: string) => edit(() => exchangePost('edits/merge', { body: { uid, into } })),
    fold: (uid: string, into: string, variant: string) => edit(() => exchangePost('edits/fold-variant', { body: { uid, into, variant } })),
    split: (uid: string, entries: number[], name?: string) => edit(() => exchangePost('edits/split', { body: { uid, entries, name: name || null } })),
    promote: (uid: string, variant: string) => edit(() => exchangePost('edits/promote-variant', { body: { uid, variant } })),
    newProduct: (name: string, children: string[]) => edit(() => exchangePost('edits/products', { body: { name, children } })),
    dismiss: (uids: string[], dismissed: boolean) => edit(() => exchangePost('edits/dismiss', { body: { uids, dismissed } })),
    newCollection: (name: string, query?: string | null) => edit(() => exchangePost('collections', { body: { name, query: query || null } })),
    deleteCollection: (uid: string) => edit(() => exchangeDelete('collections/{uid}', { path: { uid } })),
    members: (collection: string, uids: string[], present: boolean) =>
      edit(() => exchangePost('collections/{uid}/members', { path: { uid: collection }, body: { uids, present } })),
    accept: (ids: number[]) => edit(() => exchangePost('suggestions/accept', { body: { ids } })),
    reject: (ids: number[]) => edit(() => exchangePost('suggestions/reject', { body: { ids } })),
    undoEntry: (id: number) => edit(() => exchangePost('history/{log_id}/undo', { path: { log_id: id } })),
  }
}

export type LibraryActions = ReturnType<typeof libraryActions>
