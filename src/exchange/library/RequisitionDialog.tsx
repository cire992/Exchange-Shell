import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type Environment, type PlanRequest, type PlanResult, type PresetView, type RouteChoice } from '../api'
import { useDialogs } from './Dialogs'
import { plural } from './format'
import { COLLISIONS, OptionsSection, PlanTable, useForms, type Options } from './PlanParts'

// Requisition to… (Roadmap phase 6i), the PySide6 window's dialog: plan getting assets into an
// environment, set the options, and queue it. The plan is the core's (/requisitions/plan): each
// asset (a product's children too) with an include checkbox, the processes it goes through, the
// entry it starts from and any problem. Options are forms from the processes' parameters, filled
// from a preset if one is chosen, otherwise from the options last used with each process; what is
// typed wins. Several assets are planned and queued together with the same options.

const AUTO = ''
const REPLAN_DELAY = 300

interface Props {
  uids: string[]
  title: string // what is requisitioned, in words
  close: () => void
  queued: (ids: number[], run: boolean) => void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function RequisitionDialog({ uids, title, close, queued }: Props) {
  const dialogs = useDialogs()
  const [environments, setEnvironments] = useState<Environment[] | null>(null)
  const [environment, setEnvironment] = useState<number | null>(null)
  const [routes, setRoutes] = useState<RouteChoice[]>([])
  const [route, setRoute] = useState(AUTO)
  const [presets, setPresets] = useState<PresetView[]>([])
  const [preset, setPreset] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [collision, setCollision] = useState<typeof COLLISIONS[number][0]>('ask')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<{ key: string; result?: PlanResult; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const result = plan?.result
  const { options, setOptions, forms, value, set, planDone } = useForms(result, excluded)

  useEffect(() => {
    let live = true
    exchangeGet('environments').then(list => { if (live) { setEnvironments(list); setEnvironment(e => e ?? list[0]?.id ?? null) } }).catch(error => { if (live) setProblem(message(error)) })
    exchangeGet('presets').then(list => { if (live) setPresets(list) }).catch(() => {})
    return () => { live = false }
  }, [])
  // The chains that take these assets there (besides Automatic).
  useEffect(() => {
    if (environment === null) return
    let live = true
    exchangePost('requisitions/routes', { body: { uids, environment } }).then(list => { if (live) setRoutes(list) }).catch(() => { if (live) setRoutes([]) })
    return () => { live = false }
  }, [uids, environment])

  const request = (): PlanRequest | null => environment === null ? null : {
    uids, environment, processes: route ? route.split(',') : null, options, preset: preset || null,
    endpoint_folder: endpoint.trim() || null, on_collision: collision, excluded: [...excluded],
  }
  const key = JSON.stringify(request())
  // Plan again a moment after anything changes.
  useEffect(() => {
    const body = JSON.parse(key) as PlanRequest | null
    if (!body) return
    let live = true
    const timer = setTimeout(() => {
      exchangePost('requisitions/plan', { body }).then(result => {
        if (!live) return
        setPlan({ key, result })
        planDone(result)
      })
        .catch(error => { if (live) setPlan({ key, error: message(error) }) })
    }, REPLAN_DELAY)
    return () => { live = false; clearTimeout(timer) }
    // planDone only keeps what the plan returned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const current = plan?.key === key
  const choosePreset = (name: string) => { setPreset(name); setOptions({}) } // the preset's values replace the forms'
  const toggle = (uid: string, include: boolean) => setExcluded(previous => { const next = new Set(previous); if (include) next.delete(uid); else next.add(uid); return next })

  const savePreset = async () => {
    const name = await dialogs.ask({ title: 'Save as preset', label: 'Preset name (it holds these options for every process)', confirm: 'Save' })
    if (!name || !result) return
    const values: Options = {}
    for (const form of forms) values[form.process] = Object.fromEntries(form.parameters.map(p => [p.id, value(form.process, p, form.values)]))
    const type = environments?.find(e => e.id === environment)?.type_id
    try {
      await exchangePost('presets', { body: { name, options: values, environment: type || null } })
      setPresets(await exchangeGet('presets'))
      setPreset(name)
      setOptions({})
    } catch (error) { setProblem(message(error)) }
  }
  const queue = async (run: boolean) => {
    const body = request()
    if (!body) return
    setBusy(true)
    setProblem('')
    try {
      const made = await exchangePost('requisitions/queue', { body })
      queued(made.ids, run)
      close()
    } catch (error) { setProblem(message(error)) } finally { setBusy(false) }
  }

  const included = current && result ? result.included : 0
  const firstPlan = result?.plans[0]
  return <div className="library-scrim">
    <div className="library-dialog library-requisition" role="dialog" aria-label="Requisition to"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <header className="library-wizard-head"><h3>Requisition {title} to…</h3></header>
      <div className="library-requisition-body">
        <div className="library-requisition-choices">
          <label>Environment<select value={environment ?? ''} onChange={event => { setEnvironment(Number(event.target.value)); setRoute(AUTO) }}>
            {environments === null && <option value="">Reading…</option>}
            {(environments || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label>Route<select value={route} onChange={event => setRoute(event.target.value)}>
            <option value={AUTO}>Automatic: the best route for each asset</option>
            {routes.map(r => <option key={r.processes.join()} value={r.processes.join()}>{r.label}</option>)}</select></label>
          <label>Options<select value={preset} onChange={event => choosePreset(event.target.value)}>
            <option value="">Options last used with each process</option>
            {presets.map(p => <option key={p.name} value={p.name}>{p.name}{p.shipped ? ' (shipped)' : ''}</option>)}</select></label>
          <label>When files exist<select value={collision} onChange={event => setCollision(event.target.value as typeof collision)}>
            {COLLISIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
        </div>
        <div className="library-requisition-main">
          <section className="library-requisition-plan" aria-label="Plan">
            <h4>Plan</h4>
            {plan?.error && <p className="library-error" role="alert">{plan.error}</p>}
            {!result && !plan?.error && <p className="library-muted">Planning…</p>}
            {result && <PlanTable result={result} toggle={toggle} />}
          </section>
          <aside className="library-requisition-side">
            <OptionsSection result={result} forms={forms} value={value} set={set}>
              {!!forms.length && <button type="button" className="library-link" onClick={() => void savePreset()}>Save these options as a preset…</button>}
            </OptionsSection>
            <section aria-label="Endpoint">
              <h4>Endpoint</h4>
              {firstPlan && <p className="library-muted">{firstPlan.endpoint.label} · {firstPlan.endpoint.visibility}<br /><code>{firstPlan.endpoint.folder}</code></p>}
              <input aria-label="Write to another folder" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="Another folder (optional)" spellCheck={false} />
            </section>
          </aside>
        </div>
        {problem && <p className="library-error" role="alert">{problem}</p>}
      </div>
      <footer className="library-wizard-foot">
        <span className="library-muted">{current ? `${plural(included, 'item')} included` : 'Planning…'}</span>
        <button type="button" className="library-button" onClick={close}>Cancel</button>
        <button type="button" className="library-button" disabled={!included || !current || busy} onClick={() => void queue(false)}>
          {included ? `Add to queue (${included})` : 'Add to queue'}</button>
        <button type="button" className="library-button primary" disabled={!included || !current || busy} onClick={() => void queue(true)}>Add and run</button>
      </footer>
    </div>
  </div>
}
