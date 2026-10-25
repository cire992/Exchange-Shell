import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { thumbnailUrl, type Brick } from '../api'
import type { Pages } from './pages'

const CARD = 164 // the narrowest card; cards stretch to fill each row
const GAP = 12
const ROW = 226

interface Props {
  pages: Pages
  selected: number | null
  select: (index: number, brick: Brick) => void
  open: (brick: Brick) => void
  empty: string
}

// A virtualized grid of item cards: only the rows in view are rendered, and pages of 200 are
// fetched as they scroll into view, so libraries of 200k+ assets stay fast.
export default function Browser({ pages, selected, select, open, empty }: Props) {
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
  useEffect(() => { if (selected !== null) virtualizer.scrollToIndex(Math.floor(selected / columns), { align: 'auto' }) }, [selected, columns, virtualizer])

  const move = (event: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, PageDown: columns * 3, PageUp: -columns * 3 }[event.key]
    if (event.key === 'Enter' && selected !== null) {
      const brick = pages.brick(selected)
      if (brick) open(brick)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const index = event.key === 'Home' ? 0 : total - 1
      pages.ensure(index, index)
      const brick = pages.brick(index)
      if (brick) select(index, brick)
      return
    }
    if (step === undefined || !total) return
    event.preventDefault()
    const index = Math.min(total - 1, Math.max(0, (selected ?? -step) + step))
    const brick = pages.brick(index)
    if (brick) select(index, brick)
  }

  if (pages.error) return <div className="library-empty" role="alert">{pages.error}</div>
  if (pages.total === 0) return <div className="library-empty">{empty}</div>
  return <div className="library-grid" ref={scroller} tabIndex={0} role="listbox" aria-label="Assets" aria-busy={pages.total === null}
    aria-activedescendant={selected !== null ? `brick-${selected}` : undefined} onKeyDown={move}>
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {items.map(row => <div key={row.key} className="library-row" style={{ transform: `translateY(${row.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, column) => {
          const index = row.index * columns + column
          if (index >= total) return null
          const brick = pages.brick(index)
          return brick
            ? <Card key={brick.uid} index={index} brick={brick} selected={selected === index} select={select} open={open} />
            : <div key={index} className="library-card loading" aria-hidden="true" />
        })}
      </div>)}
    </div>
  </div>
}

function Card({ index, brick, selected, select, open }: { index: number; brick: Brick; selected: boolean; select: Props['select']; open: Props['open'] }) {
  const [broken, setBroken] = useState(false)
  const set = brick.children > 0
  return <div id={`brick-${index}`} role="option" aria-selected={selected}
    className={`library-card ${selected ? 'selected' : ''} ${brick.unidentified ? 'unidentified' : ''} ${set ? 'set' : ''}`}
    title={`${brick.name}\n${brick.type_name}${set ? ` · ${brick.children} items` : ''}${brick.unidentified ? `\nUnidentified (confidence ${brick.confidence.toFixed(2)})` : ''}${set ? '\nDouble-click to open the set' : ''}`}
    onClick={() => select(index, brick)} onDoubleClick={() => set && open(brick)}>
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
