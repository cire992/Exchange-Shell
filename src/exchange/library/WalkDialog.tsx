import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type ClaimWalkRequest, type ClaimWalked, type PlanResult, type PresetView } from '../api'
import { plural } from './format'
import { COLLISIONS, OptionsSection, PlanTable, useForms } from './PlanParts'

// Walk with options… (R5): the path's options step. The core plans the claim's own path, so the role,
// the source and the folder are the claim's; what's left is the options, which items to leave out
// and what to do about files that exist. Options come from a preset or are those last used.

const REPLAN_DELAY = 300

interface Props {
  id: string
  title: string // what is walked, in words
  close: () => void
  walked: (result: ClaimWalked) => void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function WalkDialog({ id, title, close, walked }: Props) {
  const [presets, setPresets] = useState<PresetView[]>([])
  const [preset, setPreset] = useState('')
  const [collision, setCollision] = useState<NonNullable<ClaimWalkRequest['on_collision']>>('ask')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<{ key: string; result?: PlanResult; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const result = plan?.result
  const { options, setOptions, forms, value, set, planDone } = useForms(result, excluded)

  useEffect(() => {
    let live = true
    exchangeGet('presets').then(list => { if (live) setPresets(list) }).catch(() => {})
    return () => { live = false }
  }, [])

  const body: ClaimWalkRequest = { options, preset: preset || null, on_collision: collision, excluded: [...excluded] }
  const key = JSON.stringify(body)
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      exchangePost('claims/{id}/plan', { path: { id }, body: JSON.parse(key) as ClaimWalkRequest }).then(done => {
        if (!live) return
        setPlan({ key, result: done })
        planDone(done)
      }).catch(error => { if (live) setPlan({ key, error: message(error) }) })
    }, REPLAN_DELAY)
    return () => { live = false; clearTimeout(timer) }
    // planDone only keeps what the plan returned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key])

  const toggle = (uid: string, include: boolean) => setExcluded(previous => { const next = new Set(previous); if (include) next.delete(uid); else next.add(uid); return next })
  const choosePreset = (name: string) => { setPreset(name); setOptions({}) } // the preset's values replace the forms'
  const walk = async () => {
    setBusy(true)
    setProblem('')
    try {
      walked(await exchangePost('claims/{id}/walk', { path: { id }, body }))
      close()
    } catch (error) { setProblem(message(error)) } finally { setBusy(false) }
  }

  const current = plan?.key === key
  const included = current && result ? result.included : 0
  const firstPlan = result?.plans[0]
  return <div className="library-scrim">
    <div className="library-dialog library-requisition" role="dialog" aria-label="Walk with options"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <header className="library-wizard-head"><h3>Walk {title}</h3></header>
      <div className="library-requisition-body">
        <div className="library-requisition-choices">
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
            <OptionsSection result={result} forms={forms} value={value} set={set} />
            {firstPlan && <section aria-label="Endpoint">
              <h4>Endpoint</h4>
              <p className="library-muted">{firstPlan.endpoint.label} · {firstPlan.endpoint.visibility}<br /><code>{firstPlan.endpoint.folder}</code></p>
            </section>}
          </aside>
        </div>
        {problem && <p className="library-error" role="alert">{problem}</p>}
      </div>
      <footer className="library-wizard-foot">
        <span className="library-muted">{current ? `${plural(included, 'item')} included` : 'Planning…'}</span>
        <button type="button" className="library-button" onClick={close}>Cancel</button>
        <button type="button" className="library-button primary" disabled={!included || !current || busy} onClick={() => void walk()}>Walk</button>
      </footer>
    </div>
  </div>
}
