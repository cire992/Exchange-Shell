import { useCallback, useEffect, useRef, useState } from 'react'
import { exchangeGet, type DeskFile, type DeskRoot, type DossierRef } from '../api'
import type { LibraryActions } from './actions'
import { useDialogs } from './Dialogs'
import { fileSize, plural } from './format'

const MAX_FOLDER_FILES = 5000 // the core's limit: more files than this under one folder is a category, not an asset
const PREVIEW = 50

interface Props {
  revision: number // after edits that can change what is unattached
  actions: LibraryActions
  show: (ref: DossierRef) => void
}

interface Folder {
  key: string
  root: DeskRoot
  path: string // root-relative, '/' separators; '' is the root
  name: string
  count: number | null // unattached files under it (all levels); null until counted
  state: 'unloaded' | 'loading' | 'loaded' | 'error'
  children: string[]
  files: number // directly in it
  error?: string
}

const keyOf = (root: number, path: string) => `${root}:${path.toLowerCase()}`
const parentPath = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const rootLabel = (root: DeskRoot) => `${root.environment} · ${root.path}`

// The Unidentified desk's unattached files (the window's UnattachedPanel): files no asset holds, by
// folder, with what to do about a folder. Counting a level takes seconds near the top of a big
// library (1.5M files in the real Daz one), so a folder is counted when it is expanded, and after
// an edit only the chosen folder's parent is counted again; the folders above move by as much.
export default function Unattached({ revision, actions, show }: Props) {
  const dialogs = useDialogs()
  const [generation, setGeneration] = useState(0) // Count again
  const [folders, setFolders] = useState(new Map<string, Folder>())
  const [top, setTop] = useState<string[] | null>(null)
  const [rootsError, setRootsError] = useState('')
  const [expanded, setExpanded] = useState(new Set<string>())
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ key: string; count: number | null; files?: DeskFile[]; error?: string }>({ key: '', count: null })
  const foldersRef = useRef(folders), chosenRef = useRef<string | null>(null), selectedRef = useRef<string | null>(null)
  useEffect(() => { foldersRef.current = folders })

  useEffect(() => {
    let current = true
    exchangeGet('desk/roots').then(roots => {
      if (!current) return
      const next = new Map<string, Folder>()
      for (const root of roots) {
        const key = keyOf(root.id, '')
        next.set(key, { key, root, path: '', name: rootLabel(root), count: null, state: 'unloaded', children: [], files: 0 })
      }
      setFolders(next)
      setTop([...next.keys()])
      setRootsError('')
      setExpanded(new Set(roots.length === 1 ? next.keys() : [])) // one root: count it at once
      setSelected(null)
    }).catch(error => { if (current) { setTop([]); setRootsError(message(error)) } })
    return () => { current = false }
  }, [generation])

  const count = useCallback((key: string) => {
    const node = foldersRef.current.get(key)
    if (!node || node.state === 'loading') return
    foldersRef.current = new Map(foldersRef.current).set(key, { ...node, state: 'loading' }) // counted once
    setFolders(previous => { const old = previous.get(key); return old ? new Map(previous).set(key, { ...old, state: 'loading' }) : previous })
    exchangeGet('desk/folders', { query: { root: node.root.id, folder: node.path } }).then(level => setFolders(previous => {
      const old = previous.get(key)
      if (!old) return previous
      const next = new Map(previous)
      const children = level.folders.map(folder => {
        const childKey = keyOf(old.root.id, folder.path), had = next.get(childKey)
        // A folder whose count did not change keeps what was counted below it.
        if (!(had && had.state === 'loaded' && had.count === folder.count)) {
          next.set(childKey, { key: childKey, root: old.root, path: folder.path, name: folder.name, count: folder.count, state: 'unloaded', children: [], files: 0 })
        }
        return childKey
      })
      next.set(key, { ...old, count: level.total, state: 'loaded', children, files: level.files, error: undefined })
      const delta = old.count === null ? 0 : level.total - old.count
      for (let path = old.path; delta && path;) {
        path = parentPath(path)
        const above = next.get(keyOf(old.root.id, path))
        if (above && above.count !== null) next.set(above.key, { ...above, count: above.count + delta })
      }
      return next
    })).catch(error => setFolders(previous => {
      const old = previous.get(key)
      return old ? new Map(previous).set(key, { ...old, state: 'error', error: message(error) }) : previous
    }))
  }, [])

  // Rows as shown: expanded folders' children below them (kept while the folder is counted again).
  const rows: { node: Folder; depth: number }[] = []
  const walk = (key: string, depth: number) => {
    const node = folders.get(key)
    if (!node) return
    rows.push({ node, depth })
    if (expanded.has(key)) for (const child of node.children) walk(child, depth + 1)
  }
  for (const key of top || []) walk(key, 0)

  // An expanded folder is counted (again, when an edit changed its count).
  useEffect(() => {
    for (const { node } of rows) if (expanded.has(node.key) && node.state === 'unloaded') count(node.key)
  })
  // While the chosen folder is gone (an edit took its files), the nearest folder above it is.
  const isShown = (key: string) => rows.some(row => row.node.key === key)
  let chosen = selected && isShown(selected) ? selected : null
  if (selected && !chosen) {
    const gone = folders.get(selected)
    for (let path = gone?.path || ''; gone && path && !chosen;) {
      path = parentPath(path)
      if (isShown(keyOf(gone.root.id, path))) chosen = keyOf(gone.root.id, path)
    }
  }
  const current = chosen ? folders.get(chosen) : undefined
  useEffect(() => { chosenRef.current = chosen; selectedRef.current = selected })

  // After an edit, count the chosen folder's parent again (the window's reload_folder): the parent
  // of the one chosen even when an edit took it away, so Undo brings it back.
  const seen = useRef(revision)
  useEffect(() => {
    if (seen.current === revision) return
    seen.current = revision
    for (const key of [selectedRef.current, chosenRef.current]) {
      const node = key ? foldersRef.current.get(key) : undefined
      const parent = node && (node.path ? keyOf(node.root.id, parentPath(node.path)) : node.key)
      if (parent && foldersRef.current.get(parent)?.state === 'loaded') { count(parent); return }
    }
  }, [revision, count])

  // A few of the chosen folder's files.
  const previewKey = current && current.count ? current.key : ''
  useEffect(() => {
    if (!previewKey) return
    const node = foldersRef.current.get(previewKey)
    if (!node) return
    let live = true
    exchangeGet('desk/files', { query: { root: node.root.id, folder: node.path, limit: PREVIEW } })
      .then(files => { if (live) setPreview({ key: previewKey, count: node.count, files }) })
      .catch(error => { if (live) setPreview({ key: previewKey, count: node.count, error: message(error) }) })
    return () => { live = false }
  }, [previewKey, current?.count])

  const toggle = (key: string, open = !expanded.has(key)) => setExpanded(previous => {
    const next = new Set(previous)
    if (open) next.add(key); else next.delete(key)
    return next
  })
  const keys = (event: React.KeyboardEvent) => {
    const at = rows.findIndex(row => row.node.key === chosen)
    const node = at >= 0 ? rows[at].node : null
    const move = (index: number) => { const row = rows[Math.max(0, Math.min(rows.length - 1, index))]; if (row) setSelected(row.node.key) }
    if (event.key === 'ArrowDown') move(at + 1)
    else if (event.key === 'ArrowUp') move(at < 0 ? 0 : at - 1)
    else if (event.key === 'ArrowRight' && node) {
      if (!expanded.has(node.key)) toggle(node.key, true)
      else if (node.state === 'loaded' && node.children.length) setSelected(node.children[0])
    } else if (event.key === 'ArrowLeft' && node) {
      if (expanded.has(node.key)) toggle(node.key, false)
      else if (node.path || rows[at].depth) { const parent = keyOf(node.root.id, parentPath(node.path)); if (folders.has(parent)) setSelected(parent) }
    } else if (event.key === 'Enter' && node) toggle(node.key)
    else return
    event.preventDefault()
  }
  useEffect(() => {
    if (chosen) document.getElementById(`desk-${chosen}`)?.scrollIntoView({ block: 'nearest' })
  }, [chosen])

  const folder = current ?? null
  const n = folder?.count ?? null
  const actionable = !!folder?.path && n !== null && n > 0 && n <= MAX_FOLDER_FILES
  const where = folder ? folder.path || rootLabel(folder.root) : ''
  const makeProduct = async () => {
    if (!folder || n === null) return
    const name = await dialogs.ask({ title: 'New product', text: `A product holding the ${plural(n, 'file')} in ${folder.path}.`, label: 'Name', value: folder.name, confirm: 'Create' })
    if (!name) return
    const made = await actions.productFromFolder(name, { root: folder.root.id, path: folder.path })
    if (made?.new_uid) show({ uid: made.new_uid, name })
  }
  const link = async () => {
    if (!folder || n === null) return
    const target = await dialogs.pick(`Link the ${plural(n, 'file')} in ${folder.path} to…`)
    if (target && await actions.linkFolder(target.uid, { root: folder.root.id, path: folder.path })) show(target)
  }
  const ignore = () => { if (folder?.path) void actions.ignoreFolder(folder.root.environment_id, folder.path) }

  let about: string
  if (!folder) about = 'Files no asset holds yet, by folder. Expand a folder to count it; near the top of a big library that takes a few seconds.'
  else if (n === null) about = folder.state === 'error' ? `Could not count: ${folder.error}` : 'Expand it to count its files.'
  else about = `${plural(n, 'file')} no asset holds${n > MAX_FOLDER_FILES ? `. More than ${MAX_FOLDER_FILES.toLocaleString()}: pick a smaller folder to make a product or link.` : ''}`
  const files = folder && preview.key === folder.key && preview.count === folder.count ? preview : null
  const relative = (rel: string) => folder?.path && rel.toLowerCase().startsWith(`${folder.path.toLowerCase()}/`) ? rel.slice(folder.path.length + 1) : rel

  return <div className="library-desk">
    <div className="library-desk-tree">
      <div className="library-desk-head">
        <span>Folder</span><span>Files</span>
        <button type="button" className="library-link" onClick={() => setGeneration(g => g + 1)} title="Count every folder again (after a scan)">Count again</button>
      </div>
      {rootsError && <p className="library-error" role="alert">{rootsError}</p>}
      {top === null ? <p className="library-muted">Reading the roots…</p>
        : !top.length && !rootsError ? <p className="library-muted">No online roots. Unattached files are counted in the roots of online environments.</p>
          : <div className="library-tree" role="tree" aria-label="Unattached files by folder" tabIndex={0} onKeyDown={keys}>
            {rows.map(({ node, depth }) => {
              const open = expanded.has(node.key)
              const notes: string[] = []
              if (open && node.state === 'error') notes.push(`Could not count: ${node.error}`)
              else if (open && node.state !== 'loaded' && !node.children.length) notes.push('Counting…')
              else if (open) {
                if (node.files) notes.push(`${plural(node.files, 'file')} directly in ${node.path ? node.name : 'the root'}`)
                if (node.state === 'loaded' && !node.count) notes.push('Nothing unattached here')
              }
              return <div key={node.key} role="none">
                <div id={`desk-${node.key}`} role="treeitem" aria-level={depth + 1} aria-expanded={open} aria-selected={node.key === chosen}
                  className={`library-tree-row ${node.key === chosen ? 'selected' : ''}`} style={{ paddingLeft: 6 + depth * 16 }}
                  onClick={() => setSelected(node.key)} onDoubleClick={() => toggle(node.key)}>
                  <button type="button" className="library-caret" tabIndex={-1} aria-hidden="true" onClick={event => { event.stopPropagation(); toggle(node.key) }}>{open ? '▾' : '▸'}</button>
                  <span className="library-tree-name">{node.name}</span>
                  <small>{node.state === 'loading' ? 'counting…' : node.count === null ? '' : node.count.toLocaleString()}</small>
                </div>
                {notes.map(note => <p key={note} className="library-tree-note" style={{ paddingLeft: 30 + (depth + 1) * 16 }}>{note}</p>)}
              </div>
            })}
          </div>}
    </div>
    <aside className="library-desk-folder" aria-label="Folder">
      <h3>{folder ? where : 'Choose a folder'}</h3>
      <p>{about}</p>
      {files?.error && <p className="library-error">Could not list the files: {files.error}</p>}
      {files?.files && <ul className="library-desk-preview" aria-label="Some of its files">
        {files.files.map(f => <li key={f.id}><span>{relative(f.rel_path)}</span><small>{fileSize(f.size)}</small></li>)}
        {n !== null && n > files.files.length && <li className="library-muted">and {plural(n - files.files.length, 'more file')}</li>}
      </ul>}
      <div className="library-desk-actions">
        <button type="button" className="library-button primary" disabled={!actionable} onClick={() => void makeProduct()}>Make a product from this folder…</button>
        <button type="button" className="library-button" disabled={!actionable} onClick={() => void link()}>Link these files to an asset…</button>
        <button type="button" className="library-button" disabled={!folder?.path} onClick={ignore}
          title="From now on, including at rescans. You can undo it.">Not assets: ignore this folder</button>
      </div>
    </aside>
  </div>
}
