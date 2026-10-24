import ExchangeMark from './ExchangeMark'
import ServiceStatus from './ServiceStatus'
import { isDesktop, windowAction } from '../desktop/client'
import './exchange.css'

// The Workspace window until roadmap phase 6 rebuilds it on the Exchange service API.
const phases = [
  { phase: 5, name: 'Chats online', state: 'done' },
  { phase: 6, name: 'Service and Workspace', state: 'current' },
  { phase: 7, name: 'Project homes' },
  { phase: 8, name: 'Agents connected' },
  { phase: 9, name: 'Benchmark' },
]

export default function WorkspacePlaceholder() {
  return <main className="exchange-placeholder">
    <section className="exchange-panel" aria-labelledby="exchange-placeholder-title">
      <ExchangeMark size={72} />
      <span className="exchange-eyebrow">Exchange · Workspace</span>
      <h1 id="exchange-placeholder-title">Mission control is not wired up yet</h1>
      <p>The library, project homes and requisition queue will appear here as roadmap phase 6 builds them on the Exchange service. Until then, use the Chats window for agent sessions and the rail on the right for files, skills, MCP servers and settings.</p>
      {isDesktop && <ServiceStatus />}
      <ol className="exchange-gauge" aria-label="Roadmap">
        {phases.map(item => <li key={item.phase} className={item.state || ''}><span>{item.phase}</span>{item.name}</li>)}
      </ol>
      {isDesktop && <button type="button" className="exchange-button" onClick={() => windowAction('chats')}>Open Chats</button>}
    </section>
  </main>
}
