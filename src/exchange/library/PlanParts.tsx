import { useState, type ReactNode } from 'react'
import type { OptionForm, ParameterView, PlanResult } from '../api'

// What Requisition to… and Walk with options… share: the plan's table, the processes' option forms,
// and the choice of what happens when files already exist.

export type Options = Record<string, Record<string, unknown>>

// eslint-disable-next-line react-refresh/only-export-components -- the dialogs' shared choices belong with their parts
export const COLLISIONS: ['ask' | 'overwrite' | 'rename' | 'skip', string][] = [['ask', 'Stop and ask'], ['overwrite', 'Overwrite (old files kept in the recycle folder)'],
  ['rename', 'Rename the new files'], ['skip', 'Skip those files']]

/** The option values typed so far and the forms to show for a plan. The core sends forms for included
 *  items only; an option value it refuses leaves its item out, so the last form of each process is
 *  kept to fix the value in. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with the parts it feeds
export function useForms(result: PlanResult | undefined, excluded: Set<string>) {
  const [options, setOptions] = useState<Options>({}) // typed in the forms
  const [lastForms, setLastForms] = useState<Record<string, OptionForm>>({})
  const planned = [...new Set((result?.plans || []).flatMap(p => p.items.filter(i => !excluded.has(i.dossier_uid)).flatMap(i => i.processes)))]
  const forms = planned.map(process => result?.forms.find(f => f.process === process) || lastForms[process]).filter((f): f is OptionForm => !!f)
  const value = (process: string, parameter: ParameterView, shown: Record<string, unknown>) => options[process]?.[parameter.id] ?? shown[parameter.id] ?? parameter.default
  const set = (process: string, id: string, v: unknown) => setOptions(previous => ({ ...previous, [process]: { ...previous[process], [id]: v } }))
  const planDone = (done: PlanResult) => setLastForms(previous => ({ ...previous, ...Object.fromEntries(done.forms.map(form => [form.process, form])) }))
  return { options, setOptions, forms, value, set, planDone }
}

export function PlanTable({ result, toggle }: { result: PlanResult; toggle: (uid: string, include: boolean) => void }) {
  return <>
    <table className="library-files">
      <thead><tr><th>Asset</th><th>How</th><th>From</th><th>Problems</th></tr></thead>
      <tbody>{result.plans.flatMap(p => p.items.map((item, n) => <tr key={`${p.name}:${item.dossier_uid}`} className={item.include ? '' : 'off'}>
        <td><label className={`library-check ${n ? 'child' : ''}`}><input type="checkbox" checked={item.include} disabled={!item.processes.length}
          onChange={event => toggle(item.dossier_uid, event.target.checked)} aria-label={`Include ${item.name}`} />{item.name}</label></td>
        <td>{item.process_names.join(' → ') || '—'}</td>
        <td>{item.source}</td>
        <td className="library-requisition-problem">{item.problems.join('; ')}</td>
      </tr>))}</tbody>
    </table>
    {!!result.problems.length && <ul className="library-requisition-warnings" aria-label="Warnings">
      {result.problems.map(p => <li key={p}>{p}</li>)}</ul>}
  </>
}

export function OptionsSection({ result, forms, value, set, children }: {
  result: PlanResult | undefined
  forms: OptionForm[]
  value: ReturnType<typeof useForms>['value']
  set: ReturnType<typeof useForms>['set']
  children?: ReactNode
}) {
  return <section aria-label="Options">
    <h4>Options</h4>
    {result && !forms.length && <p className="library-muted">{result.included ? 'These processes have no options.' : 'Nothing is included.'}</p>}
    {forms.map(form => <fieldset key={form.process} className="library-requisition-form">
      <legend>{form.name}</legend>
      {form.parameters.map(p => <Editor key={p.id} parameter={p} value={value(form.process, p, form.values)} set={v => set(form.process, p.id, v)} />)}
      {!form.parameters.length && <p className="library-muted">No options.</p>}
    </fieldset>)}
    {children}
  </section>
}

// One option's editor, by its type (the window's make_editor).
function Editor({ parameter: p, value, set }: { parameter: ParameterView; value: unknown; set: (value: unknown) => void }) {
  const label = p.label || p.id
  if (p.type === 'bool') return <label className="library-check" title={p.help}><input type="checkbox" checked={!!value} onChange={event => set(event.target.checked)} />{label}</label>
  if (p.type === 'choice') return <label title={p.help}>{label}<select value={String(value ?? '')} onChange={event => set(event.target.value)}>
    {(p.choices || []).map(c => <option key={c} value={c}>{c}</option>)}</select></label>
  if (p.type === 'int' || p.type === 'float') {
    return <label title={p.help}>{label}<input type="number" value={value === null || value === undefined ? '' : String(value)}
      step={p.type === 'int' ? 1 : 'any'} min={p.min ?? undefined} max={p.max ?? undefined}
      onChange={event => set(event.target.value === '' ? null : p.type === 'int' ? Math.trunc(Number(event.target.value)) : Number(event.target.value))} /></label>
  }
  return <label title={p.help}>{label}<input value={String(value ?? '')} onChange={event => set(event.target.value)} spellCheck={false} /></label>
}
