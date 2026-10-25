import { useCallback, useEffect, useRef, useState } from 'react'
import { exchangeGet, exchangePost, type EditResult, type Session } from '../api'

export type Refresh = EditResult['refresh']

// Editing through the core's write API (Roadmap phase 6e), as the PySide6 window does: each edit
// is one undoable step; after it, the view refreshes what the edit can have changed, and the
// status line says what happened (or why it could not). Undo and Redo work on this service
// session's edits, like the window's Ctrl+Z and Ctrl+Y.
export interface Editing {
  session: Session
  status: { text: string; error: boolean } | null
  busy: boolean
  /** Make one edit; resolves to its result, or null when it failed (the reason is in the status line). */
  edit: (request: () => Promise<EditResult>) => Promise<EditResult | null>
  undo: () => Promise<void>
  redo: () => Promise<void>
  say: (text: string, error?: boolean) => void
}

export function useEditing(refresh: (scope: Refresh) => void): Editing {
  const [session, setSession] = useState<Session>({ undo: null, redo: null })
  const [status, setStatus] = useState<Editing['status']>(null)
  const [busy, setBusy] = useState(false)
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])
  useEffect(() => {
    let current = true
    exchangeGet('session').then(value => { if (current) setSession(value) }).catch(() => {})
    return () => { current = false }
  }, [])
  const say = useCallback((text: string, error = false) => setStatus({ text, error }), [])
  const fail = useCallback((error: unknown) => setStatus({ text: error instanceof Error ? error.message : String(error), error: true }), [])

  const edit = useCallback(async (request: () => Promise<EditResult>) => {
    setBusy(true)
    try {
      const result = await request()
      setSession(result.session)
      setStatus({ text: `Done: ${result.label} · Ctrl+Z undoes it`, error: false })
      refreshRef.current(result.refresh)
      return result
    } catch (error) { fail(error); return null } finally { setBusy(false) }
  }, [fail])

  const step = useCallback(async (which: 'undo' | 'redo') => {
    setBusy(true)
    try {
      const result = await exchangePost(which)
      setSession(result.session)
      setStatus(result.label ? { text: `${which === 'undo' ? 'Undone' : 'Redone'}: ${result.label}`, error: false }
        : { text: `Nothing to ${which}`, error: false })
      refreshRef.current(result.refresh)
    } catch (error) { fail(error) } finally { setBusy(false) }
  }, [fail])
  const undo = useCallback(() => step('undo'), [step])
  const redo = useCallback(() => step('redo'), [step])
  return { session, status, busy, edit, undo, redo, say }
}

// Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z), except while typing in a field, which has its own undo.
export function useUndoKeys(editing: Editing) {
  const { undo, redo } = editing
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const k = event.key.toLowerCase()
      if (k === 'z' && !event.shiftKey) { event.preventDefault(); void undo() }
      else if (k === 'y' || (k === 'z' && event.shiftKey)) { event.preventDefault(); void redo() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [undo, redo])
}
