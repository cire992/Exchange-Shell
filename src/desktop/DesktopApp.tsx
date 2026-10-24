import { lazy, Suspense, useEffect } from 'react'
import { dismissError, startDesktop, surface, useDesktop } from './client'
import FilesRail, { FilePreview } from './FilesRail'
import { Icon } from './Icons'
import ExchangeMark from '../exchange/ExchangeMark'
import Workspace from '../exchange/Workspace'
import './desktop.css'

const Chats = lazy(() => import('./Chats'))

export default function DesktopApp() {
  const state = useDesktop()
  useEffect(() => { startDesktop() }, [])
  if (!state.ready) return <div className="desktop-boot"><ExchangeMark size={70} /><h1>Exchange</h1><p>{state.error || 'Opening your workspace…'}</p>{state.error && <button className="desk-secondary" onClick={() => startDesktop()}>Reconnect</button>}</div>
  return <div className={`desktop-root ${surface}-root`}>
    {surface === 'chats' ? <Suspense fallback={<div className="desktop-boot"><ExchangeMark size={50} /></div>}><Chats /></Suspense> : <><div className="workspace-surface"><Workspace />{state.preview && <FilePreview file={state.preview} />}</div><FilesRail /></>}
    {state.error && <div className="desktop-error" role="alert"><span>{state.error}</span><button onClick={dismissError} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
    {!state.connected && <div className="desktop-offline">Reconnecting to the local service…</div>}
  </div>
}
