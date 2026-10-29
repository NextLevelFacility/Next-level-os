import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isManager, isCoach, hours, fmtTime } from '../lib/supabase'
import { money } from '../lib/api'
import { sops } from '../lib/vault'
import { loadComp, saveComp, loadRetention, commissionFor, isBonusPerson, pct } from '../lib/comp'
import { roleMatches } from './Today.jsx'

const periods = {
  week: () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [d, new Date()] },
  lastweek: () => { const [s] = periods.week(); const e = new Date(s); const b = new Date(s); b.setDate(b.getDate() - 7); return [b, e] },
  month: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), new Date()] },
  lastmonth: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 1)] },
}

export default function Team() {
  const { role, locations, refresh, user, locationId } = useAuth()
  const manager = isManager(role)
  const [people, setPeople] = useState([])
  const [reads, setReads] = useState([])
  const [time, setTime] = useState([])
  const [sessions, setSessions] = useState([])
  const [goals, setGoals] = useState([])
  const [period, setPeriod] = useState('week')
  const [open, setOpen] = useState(null)
  const [tab, setTab] = useState('people')
  const [goalForm, setGoalForm] = useState(null)
  const [modsDone, setModsDone] = useState([])
  const [modsTotal, setModsTotal] = useState(0)
  const [invites, setInvites] = useState([])
  const [comp, setComp] = useState(null)
  const [ret, setRet] = useState(null)
  const [salesPeriod, setSalesPeriod] = useState([])
  const [compForm, setCompForm] = useState(null)
  const [inviteForm, setInviteForm] = useState(null)

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name'); setPeople(data || [])
    if (manager) {
      const [from, to] = periods[period]()
      const [{ data: r }, { data: t }, { data: s }, { data: g }, { data: mp }, { data: ms }] = await Promise.all([
        supabase.from('sop_reads').select('user_id, sop_path'),
        supabase.from('time_entries').select('*').gte('clock_in', from.toISOString()).lt('clock_in', to.toISOString()).order('clock_in', { ascending: false }),
        supabase.from('sessions').select('id, coach_id, session_date, duration_min, session_athletes(count)').gte('session_date', from.toISOString().slice(0, 10)).lt('session_date', to.toISOString().slice(0, 10)),
        supabase.from('kpi_goals').select('*').order('role').order('sort'),
        supabase.from('module_progress').select('user_id, module_id'),
        supabase.from('modules').select('id').eq('published', true),
      ])
      setReads(r || []); setTime(t || []); setSessions(s || []); setGoals(g || []); setModsDone(mp || []); setModsTotal((ms || []).length)
      const { data: inv } = await supabase.from('team_invites').select('*').is('claimed_by', null).order('created_at'); setInvites(inv || [])
      const c = await loadComp(); setComp(c); setCompForm(c)
      const current = period === 'week' || period === 'month'
      const toEx = current ? new Date(Date.now() + 864e5) : to
      const { data: sl } = await supabase.from('sales_log').select('user_id, kind, amount').gte('log_date', from.toISOString().slice(0, 10)).lt('log_date', toEx.toISOString().slice(0, 10))
      setSalesPeriod(sl || [])
      setRet(await loadRetention(c, { allLocations: role === 'owner', locationId }))
    }
  }
  useEffect(() => { load() }, [role, period])

  async function update(id, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) alert(error.message); else { load(); if (id === user.id) refresh() }
  }
  const locName = id => locations.find(l => l.id === id)?.name || '—'
  const hoursOf = uid => time.filter(t => t.user_id === uid).reduce((a, t) => a + ((t.clock_out ? new Date(t.clock_out) : new Date()) - new Date(t.clock_in)), 0) / 36e5
  const sessionsOf = uid => sessions.filter(s => s.coach_id === uid)
  const signedOf = uid => salesPeriod.filter(x => x.user_id === uid && x.kind === 'close').reduce((a, x) => a + (Number(x.amount) || 0), 0)
  const commissionOf = p => comp ? commissionFor(signedOf(p.id), p, comp) : 0
  const bonusOf = p => (comp && ret && ret.onTrack && isBonusPerson(p, comp) && period.startsWith('month')) ? Number(comp.churn_bonus) || 0 : 0
  const payOf = p => { const h = hoursOf(p.id), n = sessionsOf(p.id).length; return (Number(p.pay_hourly) || 0) * h + (Number(p.pay_per_session) || 0) * n + commissionOf(p) + bonusOf(p) }
  const totalPay = people.reduce((a, p) => a + payOf(p), 0)

  function exportCsv() {
    const rows = [['Name', 'Role', 'Hours', 'Sessions', 'Hourly rate', 'Per-session rate', 'Signed', 'Commission', 'Churn bonus', 'Pay'], ...people.map(p => [p.full_name, p.role, hoursOf(p.id).toFixed(2), sessionsOf(p.id).length, p.pay_hourly || '', p.pay_per_session || '', signedOf(p.id).toFixed(2), commissionOf(p).toFixed(2), bonusOf(p).toFixed(2), payOf(p).toFixed(2)])]
    const blob = new Blob([rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `next-level-pay-${period}.csv`; a.click()
  }
  async function saveInvite(e) {
    e.preventDefault()
    const { id, claimed_by, claimed_at, created_at, ...rest } = inviteForm
    const payload = { ...rest, email: rest.email ? rest.email.trim().toLowerCase() : null }
    const { error } = id ? await supabase.from('team_invites').update(payload).eq('id', id) : await supabase.from('team_invites').insert(payload)
    if (error) return alert(error.message); setInviteForm(null); load()
  }
  async function saveGoal(e) {
    e.preventDefault()
    const { id, ...rest } = goalForm
    const { error } = id ? await supabase.from('kpi_goals').update(rest).eq('id', id) : await supabase.from('kpi_goals').insert(rest)
    if (error) return alert(error.message); setGoalForm(null); load()
  }

  return (
    <>
      <h1>Team</h1>
      {manager && <div className="row" style={{ gap: 6, marginBottom: 12 }}>{[['people', 'People'], ['pay', 'Hours & pay'], ['goals', 'Daily goals']].map(([k, l]) => <button key={k} className={`btn small ${tab === k ? '' : 'ghost'}`} onClick={() => setTab(k)}>{l}</button>)}</div>}

      {tab === 'people' && <>
        <p className="muted">Every seat, who sits in it, and where. {manager && 'Tap a role or location to change it.'}</p>
        {people.map(p => {
          const need = sops().filter(n => roleMatches(n, [p.role, ...(p.roles || [])])).length, have = reads.filter(r => r.user_id === p.id).length
          const md = modsDone.filter(m => m.user_id === p.id).length
          return (
            <div className="card" key={p.id}>
              <div className="row between wrap">
                <div><div style={{ fontWeight: 600 }}>{p.full_name || p.email}</div><div className="small muted">{p.title ? p.title + ' · ' : ''}{p.email}{p.phone && ` · ${p.phone}`}</div></div>
                {manager ? (
                  <div className="row wrap" style={{ gap: 6 }}>
                    <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={p.role} onChange={e => update(p.id, { role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={p.location_id || ''} onChange={e => update(p.id, { location_id: e.target.value })}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                  </div>
                ) : <div className="row wrap" style={{ gap: 6 }}><span className="pill pink">{ROLES[p.role]}</span>{(p.roles || []).map(r => <span key={r} className="pill gold">+ {ROLES[r]}</span>)}<span className="pill">{locName(p.location_id)}</span></div>}
              </div>
              {manager && (
                <div className="row wrap" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <span className="small muted">Also does:</span>
                  {['coach', 'sales', 'frontdesk', 'director'].filter(r => r !== p.role).map(r => { const on = (p.roles || []).includes(r); return <button key={r} type="button" className={`chip gold ${on ? 'on' : ''}`} onClick={() => update(p.id, { roles: on ? (p.roles || []).filter(x => x !== r) : [...(p.roles || []), r] })}>{ROLES[r]}</button> })}
                </div>
              )}
              {manager && (
                <div className="row wrap small muted" style={{ gap: 14, marginTop: 8 }}>
                  {need > 0 && <span>SOPs read {Math.min(have, need)}/{need}</span>}
                  {isCoach([p.role, ...(p.roles || [])]) && modsTotal > 0 && <span>Method {md}/{modsTotal}</span>}
                  <span>{hoursOf(p.id).toFixed(1)} h this {period === 'week' ? 'week' : 'period'}</span>
                  {isCoach([p.role, ...(p.roles || [])]) && <span>{sessionsOf(p.id).length} sessions</span>}
                </div>
              )}
            </div>
          )
        })}
        {manager && (
          <div className="card" style={{ borderStyle: 'dashed' }}>
            <div className="row between"><h2 style={{ margin: 0 }}>Not signed up yet</h2><button className="btn small" onClick={() => setInviteForm({ full_name: '', email: '', role: 'coach', roles: [], title: '', location_id: locations[0]?.id || null })}>+ Add teammate</button></div>
            <p className="small muted">Send them the link. When they create an account with this name or email, their role is set automatically.</p>
            {inviteForm && (
              <form onSubmit={saveInvite} style={{ marginBottom: 10 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <label className="field" style={{ flex: 1, minWidth: 140 }}><span>Name</span><input className="input" value={inviteForm.full_name} onChange={e => setInviteForm({ ...inviteForm, full_name: e.target.value })} required /></label>
                  <label className="field" style={{ flex: 1, minWidth: 160 }}><span>Email (optional, more reliable)</span><input className="input" type="email" value={inviteForm.email || ''} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} /></label>
                  <label className="field"><span>Main role</span><select className="input" value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}>{Object.entries(ROLES).filter(([k]) => k !== 'owner').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                </div>
                <div className="row wrap" style={{ gap: 6, alignItems: 'center', marginBottom: 10 }}><span className="small muted">Also does:</span>{['coach', 'sales', 'frontdesk', 'director'].filter(r => r !== inviteForm.role).map(r => { const on = (inviteForm.roles || []).includes(r); return <button key={r} type="button" className={`chip gold ${on ? 'on' : ''}`} onClick={() => setInviteForm({ ...inviteForm, roles: on ? inviteForm.roles.filter(x => x !== r) : [...inviteForm.roles, r] })}>{ROLES[r]}</button> })}</div>
                <div className="row" style={{ gap: 8 }}><button className="btn small">Save</button><button type="button" className="btn ghost small" onClick={() => setInviteForm(null)}>Cancel</button>{inviteForm.id && <button type="button" className="btn danger small" onClick={async () => { await supabase.from('team_invites').delete().eq('id', inviteForm.id); setInviteForm(null); load() }}>Remove</button>}</div>
              </form>
            )}
            <ul className="list">
              {invites.map(i => <li key={i.id}><span className="grow"><div style={{ fontWeight: 600 }}>{i.full_name} <span className="small muted">{i.email ? `· ${i.email}` : '· no email yet'}</span></div><div className="row wrap" style={{ gap: 4, marginTop: 2 }}><span className="pill pink">{ROLES[i.role]}</span>{(i.roles || []).map(r => <span key={r} className="pill gold">+ {ROLES[r]}</span>)}</div></span><button className="btn ghost small" onClick={() => setInviteForm(i)}>Edit</button></li>)}
              {invites.length === 0 && <li className="muted small">Everyone has signed up.</li>}
            </ul>
          </div>
        )}
      </>}

      {tab === 'pay' && manager && <>
        <div className="row between wrap" style={{ marginBottom: 8 }}>
          <div className="row" style={{ gap: 6 }}>{[['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month']].map(([k, l]) => <button key={k} className={`btn small ${period === k ? '' : 'ghost'}`} onClick={() => setPeriod(k)}>{l}</button>)}</div>
          <button className="btn gold small" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="card accent"><div className="row between"><span>Total pay this period</span><span className="display" style={{ fontSize: '1.8rem', color: 'var(--gold)' }}>{money(totalPay)}</span></div><p className="small muted">Hours × hourly rate + sessions × per-session rate + {comp?.commission_pct ?? 12}% commission on what each person signed{period.startsWith('month') ? ', + the churn bonus when the month is under target' : ' (churn bonus counts on monthly views)'}.</p></div>
        {comp && ret && (
          <div className="card">
            <div className="row between wrap">
              <div><h3 style={{ margin: 0 }}>Churn this month</h3><div className="small muted">{ret.cancelCount} cancellation{ret.cancelCount === 1 ? '' : 's'} · {ret.active} active members ({ret.activeSource}) · target under {ret.target}%</div></div>
              <div className="row" style={{ gap: 8 }}><span className="display" style={{ fontSize: '1.8rem', color: ret.onTrack == null ? 'var(--muted)' : ret.onTrack ? 'var(--good)' : 'var(--pink)' }}>{pct(ret.churn)}</span><span className={`pill ${ret.onTrack == null ? '' : ret.onTrack ? 'good' : 'pink'}`}>{ret.onTrack == null ? 'set member count' : ret.onTrack ? 'bonus on track' : 'over target'}</span></div>
            </div>
            {compForm && (
              <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
                <label className="field" style={{ margin: 0 }}><span>Commission %</span><input className="input" type="number" style={{ width: 90, minHeight: 36, padding: '6px 10px' }} value={compForm.commission_pct} onChange={e => setCompForm({ ...compForm, commission_pct: Number(e.target.value) })} /></label>
                <label className="field" style={{ margin: 0 }}><span>Churn target %</span><input className="input" type="number" style={{ width: 90, minHeight: 36, padding: '6px 10px' }} value={compForm.churn_target_pct} onChange={e => setCompForm({ ...compForm, churn_target_pct: Number(e.target.value) })} /></label>
                <label className="field" style={{ margin: 0 }}><span>Churn bonus $ (each)</span><input className="input" type="number" style={{ width: 110, minHeight: 36, padding: '6px 10px' }} value={compForm.churn_bonus} onChange={e => setCompForm({ ...compForm, churn_bonus: Number(e.target.value) })} /></label>
                <label className="field" style={{ margin: 0 }}><span>Bonus people</span><input className="input" style={{ width: 160, minHeight: 36, padding: '6px 10px' }} value={(compForm.bonus_people || []).join(', ')} onChange={e => setCompForm({ ...compForm, bonus_people: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></label>
                {!ret.ppConnected && <label className="field" style={{ margin: 0 }}><span>Active members (until PushPress is connected)</span><input className="input" type="number" style={{ width: 120, minHeight: 36, padding: '6px 10px' }} value={compForm.active_members_manual} onChange={e => setCompForm({ ...compForm, active_members_manual: Number(e.target.value) })} /></label>}
                <button className="btn small" onClick={async () => { const { error } = await saveComp(compForm); if (error) alert(error.message); else load() }}>Save</button>
              </div>
            )}
            {ret.cancels.length > 0 && <ul className="list" style={{ marginTop: 8 }}>{ret.cancels.map(c => <li key={c.id}><span className="grow small"><div>{c.name} <span className="muted">· {c.program || ''}{c.amount ? ` · -${money(c.amount)}/mo` : ''}</span></div><div className="muted">{c.note} · {c.log_date} · logged by {c.profiles?.full_name}</div></span></li>)}</ul>}
          </div>
        )}
        {people.map(p => {
          const h = hoursOf(p.id), ss = sessionsOf(p.id), entries = time.filter(t => t.user_id === p.id)
          return (
            <div className="card" key={p.id}>
              <div className="row between wrap">
                <div><div style={{ fontWeight: 600 }}>{p.full_name}</div><div className="small muted">{ROLES[p.role]} · {h.toFixed(1)} h · {ss.length} sessions{entries.some(t => !t.clock_out) && <span className="pill good" style={{ marginLeft: 6 }}>on the clock</span>}</div></div>
                <div style={{ textAlign: 'right' }}><div className="display" style={{ fontSize: '1.5rem', color: 'var(--pink)' }}>{money(payOf(p))}</div>{(commissionOf(p) > 0 || bonusOf(p) > 0) && <div className="small muted">{commissionOf(p) > 0 ? `${money(commissionOf(p))} commission on ${money(signedOf(p.id))}` : ''}{bonusOf(p) > 0 ? ` + ${money(bonusOf(p))} churn bonus` : ''}</div>}</div>
              </div>
              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                <label className="field" style={{ margin: 0 }}><span>$ / hour</span><input className="input" type="number" style={{ width: 110, minHeight: 36, padding: '6px 10px' }} defaultValue={p.pay_hourly ?? ''} onBlur={e => e.target.value !== String(p.pay_hourly ?? '') && update(p.id, { pay_hourly: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                <label className="field" style={{ margin: 0 }}><span>$ / session</span><input className="input" type="number" style={{ width: 110, minHeight: 36, padding: '6px 10px' }} defaultValue={p.pay_per_session ?? ''} onBlur={e => e.target.value !== String(p.pay_per_session ?? '') && update(p.id, { pay_per_session: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                {[p.role, ...(p.roles || [])].includes('sales') && <label className="field" style={{ margin: 0 }}><span>Commission % (blank = {comp?.commission_pct ?? 12})</span><input className="input" type="number" style={{ width: 110, minHeight: 36, padding: '6px 10px' }} defaultValue={p.pay_commission_pct ?? ''} onBlur={e => e.target.value !== String(p.pay_commission_pct ?? '') && update(p.id, { pay_commission_pct: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
                <button className="btn ghost small" style={{ alignSelf: 'flex-end' }} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide' : 'Clock-ins'}</button>
              </div>
              {open === p.id && (
                <ul className="list" style={{ marginTop: 8 }}>
                  {entries.map(t => <li key={t.id}><span className="grow small">{new Date(t.clock_in).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(t.clock_in)} → {t.clock_out ? fmtTime(t.clock_out) : <span style={{ color: 'var(--good)' }}>now</span>}</span><span className="pill">{hours((t.clock_out ? new Date(t.clock_out) : new Date()) - new Date(t.clock_in))} h</span>{manager && t.clock_out == null && <button className="btn ghost small" onClick={async () => { await supabase.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', t.id); load() }}>Clock out</button>}</li>)}
                  {entries.length === 0 && <li className="muted small">No clock-ins this period.</li>}
                  {ss.length > 0 && <li className="small muted">Sessions: {ss.map(s => s.session_date).join(', ')}</li>}
                </ul>
              )}
            </div>
          )
        })}
      </>}

      {tab === 'goals' && manager && <>
        <p className="muted">The daily goals each role sees at the top of Today. Hit = green check.</p>
        <button className="btn small" style={{ marginBottom: 10 }} onClick={() => setGoalForm({ role: 'sales', metric: '', label: '', kind: 'count', goal: 1, stretch: null, step: 1, sort: 10, active: true })}>+ Add goal</button>
        {goalForm && (
          <form className="card accent" onSubmit={saveGoal}>
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="field"><span>Role</span><select className="input" value={goalForm.role} onChange={e => setGoalForm({ ...goalForm, role: e.target.value })}>{Object.keys(ROLES).map(k => <option key={k} value={k}>{ROLES[k]}</option>)}</select></label>
              <label className="field" style={{ flex: 1 }}><span>Label</span><input className="input" value={goalForm.label} onChange={e => setGoalForm({ ...goalForm, label: e.target.value, metric: goalForm.id ? goalForm.metric : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') })} required /></label>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="field"><span>Type</span><select className="input" value={goalForm.kind} onChange={e => setGoalForm({ ...goalForm, kind: e.target.value })}><option value="count">Number</option><option value="check">Yes / no</option></select></label>
              <label className="field"><span>Goal</span><input className="input" type="number" value={goalForm.goal} onChange={e => setGoalForm({ ...goalForm, goal: Number(e.target.value) })} /></label>
              <label className="field"><span>Stretch</span><input className="input" type="number" value={goalForm.stretch ?? ''} onChange={e => setGoalForm({ ...goalForm, stretch: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <label className="field"><span>+ button</span><input className="input" type="number" value={goalForm.step} onChange={e => setGoalForm({ ...goalForm, step: Number(e.target.value) || 1 })} /></label>
            </div>
            <div className="row" style={{ gap: 8 }}><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setGoalForm(null)}>Cancel</button>{goalForm.id && <button type="button" className="btn danger small" onClick={async () => { await supabase.from('kpi_goals').delete().eq('id', goalForm.id); setGoalForm(null); load() }}>Delete</button>}</div>
          </form>
        )}
        {Object.keys(ROLES).map(r => { const gs = goals.filter(g => g.role === r); if (!gs.length) return null; return (
          <div className="card" key={r}><h3>{ROLES[r]}</h3><ul className="list">{gs.map(g => <li key={g.id}><span className="grow">{g.label} <span className="muted small">· {g.kind === 'check' ? 'yes/no' : `goal ${g.goal}${g.stretch ? ` (stretch ${g.stretch})` : ''}`}{!g.active && ' · off'}</span></span><button className="btn ghost small" onClick={() => setGoalForm(g)}>Edit</button></li>)}</ul></div>
        ) })}
      </>}
    </>
  )
}
