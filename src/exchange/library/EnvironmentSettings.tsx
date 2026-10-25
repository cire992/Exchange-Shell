import { useEffect, useState } from 'react'
import { exchangeGet, exchangePost, type EnvironmentDetail } from '../api'

interface Props {
  id: number
  close: () => void
  say: (text: string, error?: boolean) => void
}

const listOf = (value: unknown) => Array.isArray(value) ? value.map(String) : []
const text = (value: unknown) => typeof value === 'string' ? value : ''

// An environment's settings (``exchange env config``): ignore rules, the MO2 profile, where
// requisitions write and the endpoint's visibility. Not undoable; ignore rules apply from the next
// rescan.
export default function EnvironmentSettings({ id, close, say }: Props) {
  const [env, setEnv] = useState<EnvironmentDetail | null>(null)
  const [error, setError] = useState('')
  const [ignore, setIgnore] = useState('')
  const [profile, setProfile] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [visibility, setVisibility] = useState('personal')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    exchangeGet('environments/{env_id}', { path: { env_id: id } }).then(value => {
      if (!live) return
      const config = value.user_config
      setEnv(value)
      setIgnore(listOf(config.ignore).join('\n'))
      setProfile(text(config.mo2_profile))
      // The window's wizard wrote {mode, value}; only a folder is shown and changed here.
      setEndpoint(text(config.endpoint))
      setVisibility(text(config.visibility) || 'personal')
    }).catch(problem => { if (live) setError(problem instanceof Error ? problem.message : String(problem)) })
    return () => { live = false }
  }, [id])

  const profiles = listOf(env?.layer_config.profiles)
  const legacyEndpoint = env && typeof env.user_config.endpoint === 'object' && env.user_config.endpoint !== null
  const save = async () => {
    if (!env) return
    setSaving(true)
    setError('')
    const body = { ignore: ignore.split('\n').map(line => line.trim()).filter(Boolean), visibility,
      ...(profiles.length ? { mo2_profile: profile || null } : {}),
      ...(legacyEndpoint && !endpoint.trim() ? {} : { endpoint: endpoint.trim() || null }) }
    try {
      await exchangePost('environments/{env_id}/config', { path: { env_id: id }, body })
      say(`Saved the settings of ${env.name}${ignore.trim() !== listOf(env.user_config.ignore).join('\n').trim() ? ' · ignore rules apply from the next rescan' : ''}`)
      close()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally { setSaving(false) }
  }

  return <div className="library-scrim" onClick={close}>
    <form className="library-dialog library-env-settings" role="dialog" aria-label={`Settings of ${env?.name || 'environment'}`}
      onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}
      onSubmit={event => { event.preventDefault(); void save() }}>
      <h3>{env ? env.name : 'Environment settings'}</h3>
      {env && <p>{env.roots.map(r => r.path).join(' · ')}</p>}
      {env && <>
        {profiles.length > 0 && <label>MO2 profile<select value={profile} onChange={event => setProfile(event.target.value)}>
          <option value="">Choose a profile…</option>{profiles.map(p => <option key={p} value={p}>{p}</option>)}</select></label>}
        <label>Ignore rules (one per line, from the next rescan)<textarea rows={4} value={ignore} onChange={event => setIgnore(event.target.value)}
          placeholder={'e.g. *.bak\nBodySlide/ShapeData/**'} spellCheck={false} /></label>
        <label>Endpoint · where requisitions write<input value={endpoint} onChange={event => setEndpoint(event.target.value)} spellCheck={false}
          placeholder={legacyEndpoint ? 'As the add-environment wizard set it' : 'Default for its type'} /></label>
        <div className="library-wizard-field" role="group" aria-label="Endpoint visibility"><span>Endpoint visibility</span>
          <div className="library-group">{['personal', 'publishable'].map(value => <button key={value} type="button" aria-pressed={visibility === value}
            onClick={() => setVisibility(value)}>{value === 'personal' ? 'Personal' : 'Publishable'}</button>)}</div></div>
      </>}
      {error && <p className="library-error" role="alert">{error}</p>}
      <div className="library-dialog-buttons">
        <button type="button" className="library-button" onClick={close}>Cancel</button>
        <button type="submit" className="library-button primary" disabled={!env || saving}>Save</button>
      </div>
    </form>
  </div>
}
