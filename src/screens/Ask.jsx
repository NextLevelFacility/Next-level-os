import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { useAuth } from '../lib/auth.jsx'
import { callFn } from '../lib/api'

const STARTERS = [
  'How do I handle a parent complaint?',
  'What do I do if a lead asks for pricing?',
  'What is the closing checklist?',
  'How should I run an evaluation?',
  'What are the eight core beliefs?',
]

export default function Ask() {
  const { profile } = useAuth()
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem('nl-ask') || '[]') } catch { return [] } })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)

  useEffect(() => { try { sessionStorage.setItem('nl-ask', JSON.stringify(msgs.slice(-20))) } catch {} ; end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send(text) {
    const content = (text || q).trim(); if (!content || busy) return
    const next = [...msgs, { role: 'user', content }]
    setMsgs(next); setQ(''); setBusy(true)
    const r = await callFn('ask', { messages: next.slice(-12) })
    setMsgs([...next, { role: 'assistant', content: r.answer || r.error || 'No answer came back.' }])
    setBusy(false)
  }

  return (
    <>
      <h1>Ask Next Level</h1>
      <p className="muted">Ask anything about how we do things. It answers from the Playbook: every SOP, standard and belief. {profile.full_name ? `Hey ${profile.full_name.split(' ')[0]}.` : ''}</p>
      {msgs.length === 0 && (
        <div className="card">
          <h3>Try one</h3>
          <div className="chips">{STARTERS.map(s => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}</div>
        </div>
      )}
      <div className="chat">
        {msgs.map((m, i) => m.role === 'user'
          ? <div key={i} className="msg me">{m.content}</div>
          : <div key={i} className="msg ai md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content, { gfm: true }) }} />)}
        {busy && <div className="msg ai muted">Thinking…</div>}
        <div ref={end} />
      </div>
      <form className="askbar" onSubmit={e => { e.preventDefault(); send() }}>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask a question…" />
        <button className="btn" disabled={busy || !q.trim()}>Send</button>
        {msgs.length > 0 && <button type="button" className="btn ghost small" onClick={() => setMsgs([])}>Clear</button>}
      </form>
    </>
  )
}
