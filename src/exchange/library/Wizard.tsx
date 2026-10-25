import { useEffect, useState } from 'react'
import { pickFolder } from '../../desktop/client'
import { exchangeGet, exchangePost, type EnvironmentType, type FoundSource, type Job } from '../api'
import { describeFinished, describeProgress, type Jobs } from './jobs'
import { plural } from './format'

// The add-environment wizard (Roadmap phase 6h), as the PySide6 window's: Sources → Review
// detection → Configure → Scan. Nothing in a folder is read until the last step: detection only
// lists folders, in a worker (the core's /jobs/detect), and registering writes to the library only.

const STEPS = ['Sources', 'Review detection', 'Configure', 'Scan']
const ABOUT: Record<string, string> = {
  mo2: 'Exchange reads and writes this game only through MO2, so every mod is a container.',
  daz: 'Every content directory is a container; products come from Daz’s install manifests.',
  unreal: 'Content packs under Content/ and plugins are containers.',
  folder: 'No mod manager or manifests here: folders are grouped by guesswork, at low confidence.',
}
const LAYER: Record<string, string> = { mo2: 'MO2', daz: 'Manifests', unreal: 'Unreal project', folder: 'Folders' }

interface Candidate {
  key: string
  path: string
  type_id: string
  confidence: number
  signals: string[]
  files: number | null
  origin: string // the added folder it was detected in, or how it was found on this PC
  foundOnPc: boolean
  registered: boolean
  selected: boolean
  name: string
}
interface Plan {
  key: string
  type_id: string
  roots: Candidate[]
  name: string
  profile: string | null
  endpoint: string
  visibility: 'personal' | 'publishable'
  ignore: string
}
interface Detection { job?: Job; error?: string }

interface Props {
  jobs: Jobs
  close: () => void
  reviewUnidentified: () => void
}

const fold = (path: string) => path.replace(/[\\/]+$/, '').toLowerCase()
const confidence = (value: number) => value >= 0.8 ? ['High confidence', 'high'] : value >= 0.5 ? ['Medium confidence', 'medium'] : ['Low confidence', 'low']
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function Wizard({ jobs, close, reviewUnidentified }: Props) {
  const [step, setStep] = useState(0)
  const [types, setTypes] = useState<EnvironmentType[]>([])
  const [found, setFound] = useState<FoundSource[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [folders, setFolders] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [detections, setDetections] = useState<Record<string, Detection>>({})
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [current, setCurrent] = useState(0)
  const [profiles, setProfiles] = useState<Record<string, { profiles: string[]; selected: string | null }>>({})
  const [scan, setScan] = useState<{ job?: Job; error?: string; ids: number[] } | null>(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    let live = true
    exchangeGet('environment-types').then(value => { if (live) setTypes(value) }).catch(error => { if (live) setProblem(message(error)) })
    exchangeGet('environments/discover').then(value => { if (live) setFound(value) }).catch(() => { if (live) setFound([]) })
    return () => { live = false }
  }, [])
  const typeOf = (id: string) => types.find(t => t.id === id)

  // Step 1: sources ------------------------------------------------------------------------------
  const addFolder = (value: string) => {
    const folder = value.trim().replace(/^"(.*)"$/, '$1')
    if (!folder) return
    setFolders(previous => previous.some(f => fold(f) === fold(folder)) ? previous : [...previous, folder])
    setDraft('')
  }
  const browse = async () => {
    const folder = await pickFolder('Add a folder of assets').catch(() => null)
    if (folder) addFolder(folder)
  }
  const chosenFound = (found || []).filter(f => picked.has(f.path))

  // Step 2: detection, in workers; every added folder at once.
  const detect = () => {
    setStep(1)
    setDetections(Object.fromEntries(folders.map(folder => [folder, {}])))
    setCandidates(chosenFound.map(f => ({ key: `pc:${f.path}`, path: f.path, type_id: f.type_id || '', confidence: f.confidence ?? 0, signals: f.signals || [],
      files: null, origin: f.via, foundOnPc: true, registered: !!f.registered, selected: true, name: f.name })))
    for (const folder of folders) {
      exchangePost('jobs/detect', { body: { folder } })
        .then(job => jobs.until(job))
        .then(job => {
          setDetections(previous => ({ ...previous, [folder]: { job } }))
          const rows = (job.report?.environments || []).flatMap(env => env.roots.map(root => ({
            key: `${folder}:${root.path}`, path: root.path, type_id: env.type_id, confidence: root.confidence, signals: root.signals, files: root.files ?? null,
            origin: folder, foundOnPc: false, registered: root.registered, selected: true, name: env.name })))
          setCandidates(previous => [...previous.filter(c => c.origin !== folder || c.foundOnPc), ...rows])
          if (job.state !== 'done') setDetections(previous => ({ ...previous, [folder]: { job, error: job.error || 'Detection stopped' } }))
        })
        .catch(error => setDetections(previous => ({ ...previous, [folder]: { error: message(error) } })))
    }
  }
  const detecting = folders.some(folder => !detections[folder]?.job && !detections[folder]?.error)
  const update = (key: string, change: Partial<Candidate>) => setCandidates(previous => previous.map(c => c.key === key ? { ...c, ...change } : c))

  // Step 3: plans, from the selected candidates (every root of a multi-root type forms one).
  const configure = () => {
    const made: Plan[] = []
    const byType = new Map<string, Plan>()
    for (const c of [...candidates].filter(c => c.selected && c.type_id).sort((a, b) => a.path.length - b.path.length)) {
      const type = typeOf(c.type_id)
      if (type?.multi_root && byType.has(c.type_id)) { byType.get(c.type_id)!.roots.push(c); continue }
      if (made.some(plan => plan.roots.some(root => fold(root.path) === fold(c.path)))) continue // picked twice
      const plan: Plan = { key: c.key, type_id: c.type_id, roots: [c], name: c.name, profile: null, endpoint: '', visibility: 'personal', ignore: '' }
      made.push(plan)
      if (type?.multi_root) byType.set(c.type_id, plan)
    }
    setPlans(made)
    setCurrent(0)
    setStep(2)
    for (const plan of made.filter(p => typeOf(p.type_id)?.handler === 'mo2')) {
      exchangeGet('environments/mo2-profiles', { query: { folder: plan.roots[0].path } }).then(value => {
        setProfiles(previous => ({ ...previous, [plan.key]: { profiles: value.profiles, selected: value.selected ?? null } }))
        setPlans(previous => previous.map(p => p.key === plan.key && !p.profile ? { ...p, profile: value.selected ?? (value.profiles.length === 1 ? value.profiles[0] : null) } : p))
      }).catch(() => setProfiles(previous => ({ ...previous, [plan.key]: { profiles: [], selected: null } })))
    }
  }
  const planProblem = (plan: Plan) => {
    if (!plan.name.trim()) return 'needs a name'
    if (typeOf(plan.type_id)?.handler === 'mo2' && (profiles[plan.key]?.profiles.length ?? 0) > 0 && !plan.profile) return 'needs a profile'
    return null
  }
  const problems = plans.map(planProblem).filter(Boolean)
  const edit = (key: string, change: Partial<Plan>) => setPlans(previous => previous.map(p => p.key === key ? { ...p, ...change } : p))

  // Step 4: register, then rescan what was registered.
  const addAndScan = async () => {
    setProblem('')
    const environments = plans.map(plan => ({
      type_id: plan.type_id, name: plan.name.trim(), roots: plan.roots.map(r => ({ path: r.path, confidence: r.confidence, signals: r.signals })),
      config: { visibility: plan.visibility, mo2_profile: plan.profile, endpoint: plan.endpoint.trim() || null,
        ignore: plan.ignore.split('\n').map(line => line.trim()).filter(Boolean) },
    }))
    // Unticked folders found inside an added folder are never indexed.
    const exclude = candidates.filter(c => !c.selected && !c.registered && !c.foundOnPc && fold(c.path) !== fold(c.origin)).map(c => c.path)
    let ids: number[] = []
    try {
      const made = await exchangePost('environments/register', { body: { environments, exclude } })
      ids = [...new Set(made.environments.map(e => e.id))]
    } catch (error) { setProblem(message(error)); return } // still on Configure: fix and try again
    setStep(3)
    setScan({ ids })
    try {
      const job = await exchangePost('jobs/rescan', { body: { environments: ids } })
      setScan({ job, ids })
      setScan({ job: await jobs.until(job, value => setScan({ job: value, ids })), ids })
    } catch (error) { setScan({ ids, error: `Added, but the scan did not start: ${message(error)}` }) }
  }

  const summary = (() => {
    if (step === 0) return `${plural(folders.length + chosenFound.length, 'source')} · nothing is read until you scan`
    if (step === 1) return detecting ? 'Detecting… nothing is read until you scan' : `${plural(candidates.filter(c => c.selected && c.type_id).length, 'folder')} chosen · nothing is read until you scan`
    if (step === 2) return `${plans.length - problems.length} of ${plans.length} ready${problems.length ? ` · ${plans.find(p => planProblem(p))?.name || ''} ${problems[0]}` : ''}`
    const job = scan?.job
    if (scan?.error) return scan.error
    if (!job) return 'Adding…'
    if (job.state === 'running') return describeProgress(job)
    return describeFinished(job)?.text || ''
  })()

  const ready = step === 0 ? folders.length + chosenFound.length > 0
    : step === 1 ? !detecting && candidates.some(c => c.selected && c.type_id)
      : step === 2 ? plans.length > 0 && !problems.length : false
  const next = () => { if (step === 0) detect(); else if (step === 1) configure(); else if (step === 2) void addAndScan() }
  const scanning = scan?.job?.state === 'running'
  const plan = plans[current]

  return <div className="library-scrim">
    <div className="library-dialog library-wizard" role="dialog" aria-label="Add environments"
      onKeyDown={event => { if (event.key === 'Escape' && step < 3) { event.stopPropagation(); close() } }}>
      <header className="library-wizard-head">
        <h3>Add environments</h3>
        <ol className="library-wizard-steps" aria-label="Steps">
          {STEPS.map((name, i) => <li key={name} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : ''}>{name}</li>)}
        </ol>
      </header>
      <div className="library-wizard-body">
        {step === 0 && <div className="library-wizard-sources">
          <section>
            <h4>Folders to add</h4>
            <p className="library-muted">A game, a Daz library, an Unreal project, or any folder of assets. Exchange detects what each holds.</p>
            <form className="library-wizard-add" onSubmit={event => { event.preventDefault(); addFolder(draft) }}>
              <input aria-label="Folder path" value={draft} onChange={event => setDraft(event.target.value)} placeholder="D:\Assets" spellCheck={false} />
              <button type="submit" className="library-button" disabled={!draft.trim()}>Add</button>
              <button type="button" className="library-button" onClick={() => void browse()}>Browse…</button>
            </form>
            <ul className="library-wizard-list" aria-label="Folders to add">
              {folders.map(folder => <li key={folder}><code>{folder}</code>
                <button type="button" className="library-link" aria-label={`Remove ${folder}`} onClick={() => setFolders(previous => previous.filter(f => f !== folder))}>Remove</button></li>)}
            </ul>
          </section>
          <section>
            <h4>Found on this PC</h4>
            {found === null ? <p className="library-muted">Looking for games and libraries…</p>
              : !found.length ? <p className="library-muted">Nothing found.</p>
                : <ul className="library-wizard-list" aria-label="Found on this PC">
                  {found.map(f => <li key={f.path} className={!f.type_id || f.registered ? 'muted' : ''}>
                    <label><input type="checkbox" checked={picked.has(f.path)} disabled={!f.type_id || !!f.registered}
                      onChange={event => setPicked(previous => { const next = new Set(previous); if (event.target.checked) next.add(f.path); else next.delete(f.path); return next })} />
                      <span><strong>{f.name}</strong><small>{f.registered ? 'already added' : f.type_id ? `${typeOf(f.type_id)?.name || f.type_id} · via ${f.via}` : `no definition yet · via ${f.via}`}</small>
                        <code>{f.path}</code></span></label>
                  </li>)}
                </ul>}
          </section>
        </div>}
        {step === 1 && <div className="library-wizard-review">
          {folders.map(folder => {
            const state = detections[folder] || {}
            const rows = candidates.filter(c => c.origin === folder && !c.foundOnPc)
            return <section key={folder} aria-label={folder}>
              <header><code>{folder}</code>{state.job?.state === 'done' && <strong>holds {plural(rows.length, 'environment')}</strong>}</header>
              {state.error ? <p className="library-error" role="alert">{state.error}</p>
                : !state.job ? <p className="library-muted">Detecting environments in {folder} …</p>
                  : rows.map(c => <CandidateRow key={c.key} candidate={c} types={types} update={change => update(c.key, change)} />)}
            </section>
          })}
          {candidates.some(c => c.foundOnPc) && <section aria-label="Found on this PC">
            <header><strong>Also adding · found on this PC</strong></header>
            {candidates.filter(c => c.foundOnPc).map(c => <CandidateRow key={c.key} candidate={c} types={types} update={change => update(c.key, change)} />)}
          </section>}
          <p className="library-muted">Each becomes its own environment. Change a type if Exchange guessed wrong; untick anything you don’t want indexed.</p>
        </div>}
        {step === 2 && plan && <div className="library-wizard-configure">
          <div className="library-wizard-plans" role="listbox" aria-label="Environments to add">
            {plans.map((p, i) => {
              const issue = planProblem(p)
              const type = typeOf(p.type_id)
              return <button key={p.key} type="button" role="option" aria-selected={i === current} className={`library-nav-item ${i === current ? 'selected' : ''}`} onClick={() => setCurrent(i)}>
                <span>{p.name || type?.name}</span><small className={issue ? 'warn' : ''}>{LAYER[type?.handler || ''] || ''}{p.roots.length > 1 ? ` · ${p.roots.length} folders` : ''} · {issue ? `⚠ ${issue}` : 'Ready'}</small>
              </button>
            })}
          </div>
          <PlanForm plan={plan} type={typeOf(plan.type_id)} profiles={profiles[plan.key]} edit={change => edit(plan.key, change)} />
        </div>}
        {step === 3 && <div className="library-wizard-scan">
          {plans.map(p => <div key={p.key} className="library-wizard-scanrow">
            <strong>{p.name}</strong>
            <small>{typeOf(p.type_id)?.name} · {plural(p.roots.length, 'folder')}{p.profile ? ` · profile ${p.profile}` : ''}</small>
          </div>)}
          {scan?.job && <div className="library-jobbar inline" role="status">
            <span>{summary}</span>
            {scanning && <progress max={scan.job.progress?.total || undefined} value={scan.job.progress?.total ? scan.job.progress.done : undefined} />}
          </div>}
        </div>}
        {problem && <p className="library-error" role="alert">{problem}</p>}
      </div>
      <footer className="library-wizard-foot">
        <span className="library-muted">{step < 3 ? summary : scanning ? 'The scan goes on if you close this.' : ''}</span>
        {step < 3 && <>
          <button type="button" className="library-button" onClick={close}>Cancel</button>
          {step > 0 && <button type="button" className="library-button" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="button" className="library-button primary" disabled={!ready} onClick={next}>
            {step === 0 ? 'Detect' : step === 1 ? 'Configure' : 'Add and scan'}</button>
        </>}
        {step === 3 && <>
          {scan?.job && scan.job.state !== 'running' && <button type="button" className="library-button" onClick={() => { reviewUnidentified(); close() }}>Review Unidentified</button>}
          <button type="button" className="library-button primary" onClick={close}>{scanning ? 'Close' : 'Done'}</button>
        </>}
      </footer>
    </div>
  </div>
}

function CandidateRow({ candidate: c, types, update }: { candidate: Candidate; types: EnvironmentType[]; update: (change: Partial<Candidate>) => void }) {
  const [label, level] = confidence(c.confidence)
  return <div className={`library-wizard-candidate ${c.selected ? '' : 'off'}`}>
    <label><input type="checkbox" checked={c.selected} disabled={!c.type_id} onChange={event => update({ selected: event.target.checked })} aria-label={`Add ${c.path}`} />
      <span><strong>{c.name}</strong><code>{c.path}</code></span></label>
    <select aria-label={`Type of ${c.path}`} value={c.type_id} onChange={event => update({ type_id: event.target.value })}>
      {!c.type_id && <option value="">Choose a type…</option>}
      {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
    <span className={`library-confidence ${level}`} title={c.signals.join(', ')}>{label}</span>
    <small>{c.registered ? 'already added' : c.files !== null ? plural(c.files, 'file') : c.origin}</small>
  </div>
}

function PlanForm({ plan, type, profiles, edit }: { plan: Plan; type?: EnvironmentType; profiles?: { profiles: string[]; selected: string | null }; edit: (change: Partial<Plan>) => void }) {
  const handler = type?.handler || 'folder'
  return <section className="library-wizard-form" aria-label={`Settings of ${plan.name || type?.name}`}>
    <h4>{type?.name}</h4>
    <p className="library-muted">{ABOUT[handler] || ''}</p>
    <label>Name<input value={plan.name} onChange={event => edit({ name: event.target.value })} /></label>
    {handler === 'mo2' && <label>MO2 profile
      <select value={plan.profile || ''} onChange={event => edit({ profile: event.target.value || null })}>
        <option value="">{profiles ? profiles.profiles.length ? 'Choose a profile…' : 'No profiles found' : 'Reading profiles…'}</option>
        {(profiles?.profiles || []).map(p => <option key={p} value={p}>{p}</option>)}
      </select></label>}
    <div className="library-wizard-field"><span>{plan.roots.length > 1 ? 'Folders' : 'Folder'}</span>{plan.roots.map(r => <code key={r.path}>{r.path}</code>)}</div>
    <label>Endpoint · where requisitions write<input value={plan.endpoint} onChange={event => edit({ endpoint: event.target.value })}
      placeholder={handler === 'daz' ? 'Default: an Exchange Conversions content directory' : handler === 'mo2' ? 'Default: a new mod for each requisition'
        : handler === 'unreal' ? 'Default: Content/Exchange' : 'Default: an Exchange Conversions folder'} spellCheck={false} /></label>
    <div className="library-wizard-field" role="group" aria-label="Endpoint visibility"><span>Endpoint visibility</span>
      <div className="library-group">{(['personal', 'publishable'] as const).map(value => <button key={value} type="button" aria-pressed={plan.visibility === value}
        onClick={() => edit({ visibility: value })}>{value === 'personal' ? 'Personal' : 'Publishable'}</button>)}</div>
      <small className="library-muted">Publishable endpoints warn when content that can’t be redistributed flows in.</small></div>
    <label>Ignore rules (one per line)<textarea value={plan.ignore} onChange={event => edit({ ignore: event.target.value })} rows={3}
      placeholder={'e.g. *.bak\nBodySlide/ShapeData/**'} spellCheck={false} /></label>
    {!!type?.ignore_globs.length && <small className="library-muted">Always ignored: {type.ignore_globs.join(', ')}</small>}
  </section>
}
