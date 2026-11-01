import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type ClaimView, type Environment } from '../api'
import { plural } from './format'

// Claim… (R5): "this thing, as this, in that place". Choose the role and the place and see, before
// anything is written, the path each thing would take and whose turn it would be: the core's own
// preview, the code a real claim goes through. Several things become separate claims.

const PREVIEW_DELAY = 300
const PREVIEWED = 20 // more than this are claimed the same way, with no preview each

export interface Thing { uid: string; name: string }
interface Preview { thing: Thing; claim?: ClaimView; error?: string }

interface Props {
  things: Thing[]
  close: () => void
  claimed: (text: string) => void
}

let lastPlace: number | null = null // the place chosen last, for the next claim

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function ClaimDialog({ things, close, claimed }: Props) {
  const [environments, setEnvironments] = useState<Environment[] | null>(null)
  const [environment, setEnvironment] = useState<number | null>(lastPlace)
  const [roles, setRoles] = useState<string[]>([])
  const [names, setNames] = useState<Record<string, string>>({}) // process id -> its name
  const [role, setRole] = useState('')
  const [folder, setFolder] = useState('')
  const [note, setNote] = useState('')
  const [read, setRead] = useState<{ key: string; previews: Preview[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    let live = true
    exchangeGet('environments').then(list => {
      if (!live) return
      setEnvironments(list)
      setEnvironment(chosen => list.some(e => e.id === chosen) ? chosen : list[0]?.id ?? null)
    }).catch(error => { if (live) setProblem(message(error)) })
    exchangeGet('processes').then(list => {
      if (!live) return
      setRoles([...new Set(list.processes.flatMap(p => p.roles))].sort())
      setNames(Object.fromEntries(list.processes.map(p => [p.id, p.name])))
    }).catch(() => {})
    return () => { live = false }
  }, [])

  const choice = { environment, as: role.trim() || null, folder: folder.trim() || null }
  const key = JSON.stringify(choice)
  const shown = things.slice(0, PREVIEWED)
  // Ask again a moment after anything changes.
  useEffect(() => {
    const body = JSON.parse(key) as typeof choice
    if (body.environment === null) return
    const place = body.environment
    let live = true
    const timer = setTimeout(() => {
      void Promise.all(shown.map(thing => exchangePost('claims/preview', { body: { ...body, environment: place, uid: thing.uid } })
        .then((claim): Preview => ({ thing, claim }), (error): Preview => ({ thing, error: message(error) }))))
        .then(previews => { if (live) setRead({ key, previews }) })
    }, PREVIEW_DELAY)
    return () => { live = false; clearTimeout(timer) }
    // The things stay the same while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const current = read?.key === key
  const refused = current && read.previews.some(p => p.error)
  const place = environments?.find(e => e.id === environment)
  const claim = async () => {
    if (environment === null || !place) return
    setBusy(true)
    setProblem('')
    let made = 0
    try {
      for (const thing of things) {
        await exchangePost('claims', { body: { uid: thing.uid, environment, as: choice.as, folder: choice.folder, note: note.trim() } })
        made++
      }
      lastPlace = environment
      claimed(`Claimed ${things.length === 1 ? things[0].name : plural(things.length, 'asset')} for ${place.name}`)
      close()
    } catch (error) {
      setProblem(made ? `${plural(made, 'claim')} made, then: ${message(error)}` : message(error))
    } finally { setBusy(false) }
  }

  return <div className="library-scrim">
    <form className="library-dialog library-claim" role="dialog" aria-label="Claim"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}
      onSubmit={event => { event.preventDefault(); if (current && !refused && !busy) void claim() }}>
      <h3>Claim {things.length === 1 ? things[0].name : plural(things.length, 'asset')}</h3>
      <div className="library-claim-choices">
        <label>As<input autoFocus list="library-claim-roles" value={role} onChange={event => setRole(event.target.value)} placeholder="No role" spellCheck={false} />
          <datalist id="library-claim-roles">{roles.map(r => <option key={r} value={r} />)}</datalist></label>
        <label>Place<select value={environment ?? ''} onChange={event => setEnvironment(Number(event.target.value))}>
          {environments === null && <option value="">Reading…</option>}
          {(environments || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>Folder<input value={folder} onChange={event => setFolder(event.target.value)} placeholder="The place’s default" spellCheck={false} /></label>
        <label>Note<input value={note} onChange={event => setNote(event.target.value)} placeholder="Optional" /></label>
      </div>
      <section aria-label="Path">
        {!current && <p className="library-muted">Finding the path…</p>}
        {read && <table className="library-files">
          <thead><tr><th>Asset</th><th>Path</th><th>Next</th></tr></thead>
          <tbody>{read.previews.map(({ thing, claim: preview, error }) => <tr key={thing.uid}>
            <td>{thing.name}</td>
            <td>{preview?.path.processes.map(p => names[p] || p).join(' → ') || '—'}</td>
            <td>{error ? <span className="library-error-text">{error}</span> : preview?.turn_line}
              {preview?.already_there && <small className="library-claim-note">This place already holds it: walking writes a second copy</small>}</td>
          </tr>)}</tbody>
        </table>}
        {things.length > shown.length && <p className="library-muted">And {plural(things.length - shown.length, 'more asset')}, claimed the same way.</p>}
      </section>
      {problem && <p className="library-error" role="alert">{problem}</p>}
      <div className="library-dialog-buttons">
        <button type="button" className="library-button" onClick={close}>Cancel</button>
        <button type="submit" className="library-button primary" disabled={!current || refused || busy}>{things.length > 1 ? `Claim ${things.length.toLocaleString()}` : 'Claim'}</button>
      </div>
    </form>
  </div>
}
