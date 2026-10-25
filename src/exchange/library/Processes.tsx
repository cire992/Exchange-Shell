import { useEffect, useState } from 'react'
import { pickFolder } from '../../desktop/client'
import { exchangeGet, exchangePost, type ProcessList, type ProcessView } from '../api'
import { useDialogs } from './Dialogs'

// Settings › Processes (Roadmap phase 6i), the window's: process packages, whether they are
// trusted and ready, their prerequisites (green, or red with how to fix them; a tool's path can be
// set here), their options, and installing and trusting a package. Only trusted packages with every
// prerequisite green are offered for requisitions. Trusting lets a package run its own code, so the
// user reads what it runs and where it writes first.

interface Props { say: (text: string, error?: boolean) => void }

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const STATE: Record<ProcessView['state'], string> = { ready: 'Ready', 'not trusted': 'Not trusted', 'needs setup': 'Needs setup' }

export default function Processes({ say }: Props) {
  const dialogs = useDialogs()
  const [list, setList] = useState<ProcessList | null>(null)
  const [tools, setTools] = useState<Record<string, string>>({})
  const [chosen, setChosen] = useState<string | null>(null)
  const [reads, setReads] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([exchangeGet('processes'), exchangeGet('tools')]).then(([processes, paths]) => {
      if (live) { setList(processes); setTools(paths); setError('') }
    }).catch(problem => { if (live) setError(message(problem)) })
    return () => { live = false }
  }, [reads])
  const process = list?.processes.find(p => p.id === chosen) || list?.processes[0] || null

  const act = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); say(done); setReads(n => n + 1) } catch (problem) { say(message(problem), true) }
  }
  const install = async () => {
    const folder = await dialogs.ask({ title: 'Install a process package', label: 'The package folder (it holds process.toml)', confirm: 'Install' })
    if (folder) await act(async () => { const made = await exchangePost('processes/install', { body: { folder } }); setChosen(made.id) }, 'Installed; trust it to use it')
  }
  const browseInstall = async () => {
    const folder = await pickFolder('Install a process package').catch(() => null)
    if (folder) await act(async () => { const made = await exchangePost('processes/install', { body: { folder } }); setChosen(made.id) }, 'Installed; trust it to use it')
  }
  const trust = async (p: ProcessView) => {
    const ok = await dialogs.confirm(`Trust ${p.name}?`, `${p.trust.join('\n')}\n\nA process runs its own code. Trust it?`, 'Trust')
    if (ok) await act(() => exchangePost('processes/{process_id}/trust', { path: { process_id: p.id } }), `${p.name} is trusted`)
  }
  const setTool = async (tool: string, label: string) => {
    const path = await dialogs.ask({ title: `Where is ${label}?`, label: 'The program file (e.g. C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe)',
      value: tools[tool] || '', confirm: 'Set' })
    if (path) await act(() => exchangePost('tools', { body: { tool, path } }), `${label} set`)
  }

  return <div className="library-lexicons">
    <div className="library-lexicon-list" role="listbox" aria-label="Processes">
      {error && <p className="library-error" role="alert">{error}</p>}
      {list === null && !error && <p className="library-muted">Reading the processes…</p>}
      {list?.processes.map(p => <button key={p.id} type="button" role="option" aria-selected={p.id === process?.id}
        className={`library-nav-item ${p.id === process?.id ? 'selected' : ''}`} onClick={() => setChosen(p.id)}>
        <span>{p.name}</span><small className={p.state === 'ready' ? '' : 'warn'}>{STATE[p.state]}</small>
      </button>)}
      <div className="library-process-install">
        <button type="button" className="library-button" onClick={() => void install()}>Install a package…</button>
        <button type="button" className="library-link" onClick={() => void browseInstall()}>Browse…</button>
      </div>
      {!!list?.problems.length && <p className="library-error">Could not read: {list.problems.join('; ')}</p>}
    </div>
    {process && <section className="library-lexicon" aria-label={process.name}>
      <header>
        <h3>{process.name}</h3>
        <small>{process.version} · {process.author || 'an unnamed author'}{process.builtin ? ' · built in' : ''} · {STATE[process.state]}</small>
        <p>{process.description}</p>
      </header>
      {!process.trusted && <div className="library-process-trust">
        <p>Not trusted: it will not run until you trust it.</p>
        <ul>{process.trust.map(line => <li key={line}>{line}</li>)}</ul>
        <button type="button" className="library-button primary" onClick={() => void trust(process)}>Trust this package…</button>
      </div>}
      <section aria-label="Prerequisites">
        <h4>Prerequisites</h4>
        {!process.prerequisites.length && <p className="library-muted">None: Python only.</p>}
        <ul className="library-process-checks">{process.prerequisites.map(p => <li key={p.id} className={p.ok ? 'ok' : 'missing'}>
          <span aria-hidden="true">{p.ok ? '✓' : '✗'}</span>
          <span><strong>{p.label}</strong><small>{p.detail}</small></span>
          {p.tool && <span className="library-process-tool">
            <button type="button" className="library-link" onClick={() => void setTool(p.tool!, p.label)}>{tools[p.tool] ? 'Change path…' : 'Set path…'}</button>
            {tools[p.tool] && <button type="button" className="library-link" onClick={() => void act(() => exchangePost('tools', { body: { tool: p.tool!, path: null } }), `${p.label}: path forgotten`)}>Forget</button>}
          </span>}
        </li>)}</ul>
      </section>
      {!!process.problems.length && <section aria-label="Problems"><h4>Problems</h4><ul>{process.problems.map(p => <li key={p} className="library-error">{p}</li>)}</ul></section>}
      <section aria-label="Options">
        <h4>Options</h4>
        {!process.parameters.length ? <p className="library-muted">No options.</p>
          : <table className="library-files"><thead><tr><th>Option</th><th>Type</th><th>Default</th></tr></thead>
            <tbody>{process.parameters.map(p => <tr key={p.id} title={p.help}><td>{p.label || p.id}</td>
              <td>{p.type}{p.choices?.length ? `: ${p.choices.join(', ')}` : ''}{(p.min ?? null) !== null || (p.max ?? null) !== null ? ` (${p.min ?? '…'} to ${p.max ?? '…'})` : ''}</td>
              <td>{String(p.default ?? '')}</td></tr>)}</tbody></table>}
      </section>
      <p className="library-muted">Takes {process.input_types.join(', ') || 'any asset'} · writes into {process.output_environment} · from <code>{process.path}</code></p>
    </section>}
  </div>
}
