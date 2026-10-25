import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { exchangeGet, type Brick, type DossierRef } from '../api'

// Small prompts the library's actions need (a name, a variant, a confirmation, an asset), and pop-up
// menus. Each prompt resolves to the answer, or null when cancelled.

export interface MenuItem { label: string; run?: () => void; disabled?: boolean; title?: string; items?: MenuItem[] }
interface Ask { title: string; label?: string; value?: string; confirm?: string; choices?: { label: string; value: string }[]; text?: string }
interface Dialogs {
  ask: (options: Ask) => Promise<string | null>
  confirm: (title: string, text: string, confirm?: string) => Promise<boolean>
  menu: (x: number, y: number, items: MenuItem[], label?: string) => void
  /** Search the library for one asset (the window's AssetPicker). */
  pick: (title: string) => Promise<DossierRef | null>
}

const DialogContext = createContext<Dialogs | null>(null)
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export const useDialogs = () => {
  const dialogs = useContext(DialogContext)
  if (!dialogs) throw new Error('useDialogs outside DialogProvider')
  return dialogs
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<(Ask & { resolve: (value: string | null) => void }) | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; label: string } | null>(null)
  const ask = useCallback((options: Ask) => new Promise<string | null>(resolve => setPrompt({ ...options, resolve })), [])
  const confirm = useCallback((title: string, text: string, label = 'OK') =>
    ask({ title, text, confirm: label }).then(answer => answer !== null), [ask])
  const openMenu = useCallback((x: number, y: number, items: MenuItem[], label = 'Actions') => setMenu({ x, y, items, label }), [])
  const [picking, setPicking] = useState<{ title: string; resolve: (value: DossierRef | null) => void } | null>(null)
  const pick = useCallback((title: string) => new Promise<DossierRef | null>(resolve => setPicking({ title, resolve })), [])
  return <DialogContext.Provider value={{ ask, confirm, menu: openMenu, pick }}>
    {children}
    {prompt && <Prompt {...prompt} done={value => { prompt.resolve(value); setPrompt(null) }} />}
    {menu && <Menu {...menu} close={() => setMenu(null)} />}
    {picking && <AssetPicker title={picking.title} done={value => { picking.resolve(value); setPicking(null) }} />}
  </DialogContext.Provider>
}

function Prompt({ title, label, value = '', confirm = 'OK', choices, text, done }: Ask & { done: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value || choices?.[0]?.value || '')
  const asksText = label !== undefined && !choices
  return <div className="library-scrim" onClick={() => done(null)}>
    <form className="library-dialog" role="dialog" aria-label={title} onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); done(null) } }}
      onSubmit={event => { event.preventDefault(); if (!asksText || draft.trim()) done(asksText || choices ? draft.trim() : '') }}>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {asksText && <label>{label}<input autoFocus value={draft} onChange={event => setDraft(event.target.value)} /></label>}
      {choices && <label>{label}<select autoFocus value={draft} onChange={event => setDraft(event.target.value)}>
        {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>}
      <div className="library-dialog-buttons">
        <button type="button" className="library-button" onClick={() => done(null)}>Cancel</button>
        <button type="submit" className="library-button primary" autoFocus={!asksText && !choices} disabled={asksText && !draft.trim()}>{confirm}</button>
      </div>
    </form>
  </div>
}

function Menu({ x, y, items, label, close }: { x: number; y: number; items: MenuItem[]; label: string; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    const away = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) close() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('mousedown', away); window.addEventListener('keydown', key)
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [close])
  const left = Math.min(x, window.innerWidth - 260), top = Math.min(y, window.innerHeight - 40 * items.length - 16)
  return <div ref={ref} className="library-menu" role="menu" aria-label={label} style={{ left, top: Math.max(8, top) }}>
    {items.map((item, i) => item.label === '-' ? <hr key={i} /> : <div key={i} className="library-menu-row">
      <button type="button" role="menuitem" disabled={item.disabled} title={item.title} aria-haspopup={item.items ? 'menu' : undefined}
        aria-expanded={item.items ? open === i : undefined}
        onClick={() => { if (item.items) setOpen(open === i ? null : i); else { close(); item.run?.() } }}>
        {item.label}{item.items && <span aria-hidden="true">›</span>}
      </button>
      {item.items && open === i && <div className="library-submenu" role="menu" aria-label={item.label}>
        {item.items.map((sub, j) => sub.label === '-' ? <hr key={j} /> : <button key={j} type="button" role="menuitem" disabled={sub.disabled}
          onClick={() => { close(); sub.run?.() }}>{sub.label}</button>)}
      </div>}
    </div>)}
  </div>
}

const PICK_DELAY = 250

function AssetPicker({ title, done }: { title: string; done: (value: DossierRef | null) => void }) {
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<{ items: Brick[]; error: string }>({ items: [], error: '' })
  const [chosen, setChosen] = useState(0)
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      exchangeGet('dossiers', { query: { query: search.trim(), group: 'all', limit: 100 } })
        .then(page => { if (current) { setFound({ items: page.items, error: '' }); setChosen(0) } })
        .catch(error => { if (current) setFound({ items: [], error: error instanceof Error ? error.message : String(error) }) })
    }, PICK_DELAY)
    return () => { current = false; clearTimeout(timer) }
  }, [search])
  const choose = (brick: Brick | undefined) => { if (brick) done({ uid: brick.uid, name: brick.name, type_id: brick.type_id }) }
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setChosen(i => Math.max(0, Math.min(found.items.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))))
    }
  }
  return <div className="library-scrim" onClick={() => done(null)}>
    <form className="library-dialog library-picker" role="dialog" aria-label={title} onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); done(null) } }}
      onSubmit={event => { event.preventDefault(); choose(found.items[chosen]) }}>
      <h3>{title}</h3>
      <input autoFocus value={search} onChange={event => setSearch(event.target.value)} onKeyDown={keys} aria-label="Search for the asset"
        placeholder="Search, e.g. barrel type:mesh" spellCheck={false} />
      {found.error && <p className="library-error" role="alert">{found.error}</p>}
      <div className="library-picker-list" role="listbox" aria-label="Assets found">
        {found.items.map((brick, i) => <div key={brick.uid} role="option" aria-selected={i === chosen}
          onClick={() => setChosen(i)} onDoubleClick={() => choose(brick)}>
          <strong>{brick.name}</strong><small>{brick.type_name}</small>
        </div>)}
        {!found.items.length && !found.error && <p className="library-muted">Nothing found yet.</p>}
      </div>
      <div className="library-dialog-buttons">
        <button type="button" className="library-button" onClick={() => done(null)}>Cancel</button>
        <button type="submit" className="library-button primary" disabled={!found.items[chosen]}>Choose</button>
      </div>
    </form>
  </div>
}
