import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
    setBusy(false)
    if (error) setMsg(error.message)
    else if (mode === 'signup') setMsg('Account created. If email confirmation is on, check your inbox, then sign in.')
  }

  return (
    <div className="auth">
      <div className="card">
        <h1>NEXT LEVEL <span>OS</span></h1>
        <p className="muted">Discipline Over Everything.</p>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label className="field"><span>Your name</span><input className="input" value={name} onChange={e => setName(e.target.value)} required /></label>
          )}
          <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label className="field"><span>Password</span><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></label>
          <button className="btn block" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        {msg && <p className="small" style={{ color: 'var(--gold)' }}>{msg}</p>}
        <p className="small muted" style={{ marginTop: 16 }}>
          {mode === 'signin' ? <>New here? <a href="#" onClick={e => { e.preventDefault(); setMode('signup') }}>Create an account</a></> : <>Have an account? <a href="#" onClick={e => { e.preventDefault(); setMode('signin') }}>Sign in</a></>}
        </p>
      </div>
    </div>
  )
}
