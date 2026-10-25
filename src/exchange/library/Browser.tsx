import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { thumbnailUrl, type Brick } from '../api'
import type { Pages } from './pages'

const CARD = 164 // the narrowest card; cards stretch to fill each row
const GAP = 12
const ROW = 226
export const DRAG_TYPE = 'application/x-exchange-assets' // dragged cards' uids, as JSON

export type SelectMode = 'single' | 'toggle' | 'range'

interface Props {
  pages: Pages
  selected: ReadonlySet<string> // uids, so edits that move cards keep the right ones selected
  focus: number | null // the card keys move from (the last one clicked)
  select: (index: number, brick: Brick, mode: SelectMode) => void
  selectAll: () => void
  open: (brick: Brick) => void
  menu: (x: number, y: number, brick: Brick) => void
  dragged: (index: number, brick: Brick) => string[] // what dragging this card carries
  drop: (target: Brick, uids: string[], x: number, y: number) => void
  empty: string
}

const modeOf = (event: React.MouseEvent | React.KeyboardEvent): SelectMode =>
  event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'single'

// A virtualized grid of item cards: only the rows in view are rendered, and pages of 200 are
// fetched as they scroll into view, so libraries of 200k+ assets stay fast. Cards select like
// files (Ctrl and Shift), open their menu on right-click, and drop onto each other.
export default function Browser({ pages, selected, focus, select, selectAll, open, menu, dragged, drop, empty }: Props) {
  useSyncExternalStore(pages.subscribe, pages.getVersion)
  const scroller = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(4)
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setColumns(Math.max(1, Math.floor((entry.contentRect.width - GAP + GAP) / (CARD + GAP)))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const total = pages.total ?? 0
  const rows = Math.ceil(total / columns)
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer is read during render by design
  const virtualizer = useVirtualizer({ count: rows, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 3 })
  const items = virtualizer.getVirtualItems()
  const first = items[0]?.index ?? 0, last = items[items.length - 1]?.index ?? 0
  useEffect(() => { pages.ensure(first * columns, (last + 1) * columns - 1) }, [pages, first, last, columns, pages.total])
  useEffect(() => { if (focus !== null) virtualizer.scrollToIndex(Math.floor(focus / columns), { align: 'auto' }) }, [focus, columns, virtualizer])

  const move = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); return }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, PageDown: columns * 3, PageUp: -columns * 3 }[event.key]
    if (event.key === 'Enter' && focus !== null) {
      const brick = pages.brick(focus)
      if (brick) open(brick)
      return
    }
    if (event.key === 'ContextMenu' && focus !== null) {
      const brick = pages.brick(focus), card = document.getElementById(`brick-${focus}`)?.getBoundingClientRect()
      if (brick && card) { event.preventDefault(); menu(card.left + 20, card.top + 20, brick) }
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const index = event.key === 'Home' ? 0 : total - 1
      pages.ensure(index, index)
      const brick = pages.brick(index)
      if (brick) select(index, brick, event.shiftKey ? 'range' : 'single')
      return
    }
    if (step === undefined || !total) return
    event.preventDefault()
    const index = Math.min(total - 1, Math.max(0, (focus ?? -step) + step))
    const brick = pages.brick(index)
    if (brick) select(index, brick, event.shiftKey ? 'range' : 'single')
  }

  if (pages.error) return <div className="library-empty" role="alert">{pages.error}</div>
  if (pages.total === 0) return <div className="library-empty">{empty}</div>
  return <div className="library-grid" ref={scroller} tabIndex={0} role="listbox" aria-label="Assets" aria-multiselectable="true"
    aria-busy={pages.total === null} aria-activedescendant={focus !== null ? `brick-${focus}` : undefined} onKeyDown={move}>
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {items.map(row => <div key={row.key} className="library-row" style={{ transform: `translateY(${row.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, column) => {
          const index = row.index * columns + column
          if (index >= total) return null
          const brick = pages.brick(index)
          return brick
            ? <Card key={brick.uid} index={index} brick={brick} selected={selected.has(brick.uid)} select={select} open={open} menu={menu} dragged={dragged} drop={drop} />
            : <div key={index} className="library-card loading" aria-hidden="true" />
        })}
      </div>)}
    </div>
  </div>
}

type CardProps = Pick<Props, 'select' | 'open' | 'menu' | 'dragged' | 'drop'> & { index: number; brick: Brick; selected: boolean }

function Card({ index, brick, selected, select, open, menu, dragged, drop }: CardProps) {
  const [broken, setBroken] = useState(false)
  const [over, setOver] = useState(false)
  const set = brick.children > 0
  const carries = (event: React.DragEvent) => event.dataTransfer.types.includes(DRAG_TYPE)
  return <div id={`brick-${index}`} role="option" aria-selected={selected} draggable
    className={`library-card ${selected ? 'selected' : ''} ${brick.unidentified ? 'unidentified' : ''} ${set ? 'set' : ''} ${over ? 'drop' : ''}`}
    title={`${brick.name}\n${brick.type_name}${set ? ` · ${brick.children} items` : ''}${brick.unidentified ? `\nUnidentified (confidence ${brick.confidence.toFixed(2)})` : ''}${set ? '\nDouble-click to open the set' : ''}\nRight-click for actions · drag onto another asset or a collection`}
    onClick={event => select(index, brick, modeOf(event))} onDoubleClick={() => set && open(brick)}
    onContextMenu={event => { event.preventDefault(); if (!selected) select(index, brick, 'single'); menu(event.clientX, event.clientY, brick) }}
    onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragged(index, brick))); event.dataTransfer.effectAllowed = 'link' }}
    onDragOver={event => { if (carries(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'link'; setOver(true) } }}
    onDragLeave={() => setOver(false)}
    onDrop={event => {
      setOver(false)
      if (!carries(event)) return
      event.preventDefault()
      const uids = (JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as string[]).filter(uid => uid !== brick.uid)
      if (uids.length) drop(brick, uids, event.clientX, event.clientY)
    }}>
    <div className="library-thumb">
      {brick.thumbnail_url && !broken
        ? <img src={thumbnailUrl(brick.uid)} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
        : <span className="library-format">{brick.format ? brick.format.replace('.', '').toUpperCase() : brick.type_name}</span>}
      {set && <span className="library-set" aria-label={`${brick.children} items`}>{brick.children.toLocaleString()}</span>}
    </div>
    <strong>{brick.name}</strong>
    <small>{brick.type_name}</small>
    <span className="library-envs">{brick.environments.map(name => <i key={name}>{name}</i>)}</span>
  </div>
}
