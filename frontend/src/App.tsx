import './App.css'
import { useEffect, useMemo, useState } from 'react'
import type { Event, Session } from './api'
import { getSession, listSessionEvents, listSessions, summarizeSession } from './api'

function fmt(dt: string) {
  try {
    return new Date(dt).toLocaleString()
  } catch {
    return dt
  }
}

function durationMs(a: string, b: string) {
  const x = new Date(a).getTime()
  const y = new Date(b).getTime()
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return Math.max(0, y - x)
}

function humanDuration(ms: number) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m <= 0) return `${s}s`
  return `${m}m ${r}s`
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Session | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listSessions()
      .then((s) => {
        if (cancelled) return
        setSessions(s)
        if (!selectedId && s.length > 0) setSelectedId(s[0].id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setError(null)
    Promise.all([getSession(selectedId), listSessionEvents(selectedId)])
      .then(([sess, evs]) => {
        if (cancelled) return
        setSelected(sess)
        setEvents(evs)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const selectedDuration = useMemo(() => {
    if (!selected) return null
    const ms = durationMs(selected.started_at, selected.ended_at)
    return ms == null ? null : humanDuration(ms)
  }, [selected])

  async function onSummarize() {
    if (!selectedId) return
    setSummarizing(true)
    setError(null)
    try {
      const updated = await summarizeSession(selectedId)
      setSelected(updated)
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="title">AI Task Interruption Recovery</div>
          <div className="subtitle">Sessions, summaries, and a quick “resume” view</div>
        </div>
        <div className="actions">
          <button onClick={onSummarize} disabled={!selectedId || summarizing}>
            {summarizing ? 'Summarizing…' : 'Summarize session'}
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <main className="layout">
        <aside className="panel">
          <div className="panelTitle">
            Sessions {loading ? <span className="muted">(loading…)</span> : null}
          </div>
          <div className="list">
            {sessions.length === 0 && !loading ? (
              <div className="empty">
                No sessions yet. Start the collector and edit files, then refresh.
              </div>
            ) : null}
            {sessions.map((s) => {
              const isActive = s.id === selectedId
              const obj = s.objective || 'Untitled objective'
              return (
                <button
                  key={s.id}
                  className={`row ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="rowTitle">{obj}</div>
                  <div className="rowMeta">
                    {fmt(s.ended_at)} · {s.event_count} events
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="panel">
          <div className="panelTitle">Resume</div>
          {!selected ? (
            <div className="empty">Select a session.</div>
          ) : (
            <div className="resume">
              <div className="kv">
                <div className="k">Session</div>
                <div className="v">
                  {fmt(selected.started_at)} → {fmt(selected.ended_at)}
                  {selectedDuration ? (
                    <span className="muted"> · {selectedDuration}</span>
                  ) : null}
                </div>
              </div>
              <div className="kv">
                <div className="k">Objective</div>
                <div className="v">{selected.objective || '—'}</div>
              </div>

              <div className="sectionTitle">AI summary</div>
              <pre className="summary">
                {selected.ai_summary_markdown || 'No summary yet. Click “Summarize session”.'}
              </pre>

              <div className="sectionTitle">Suggested next steps</div>
              {selected.ai_suggested_next_steps && selected.ai_suggested_next_steps.length > 0 ? (
                <ol className="steps">
                  {selected.ai_suggested_next_steps.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ol>
              ) : (
                <div className="emptyTight">No next steps yet.</div>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panelTitle">Timeline</div>
          {events.length === 0 ? (
            <div className="empty">No events for this session.</div>
          ) : (
            <div className="timeline">
              {events.map((e) => (
                <div key={e.id} className="event">
                  <div className="eventTop">
                    <span className="pill">{e.event_type}</span>
                    <span className="muted">{fmt(e.ts)}</span>
                  </div>
                  {e.file_path ? <div className="mono">{e.file_path}</div> : null}
                  {e.git_branch || e.git_commit_hash ? (
                    <div className="mono muted">
                      {e.git_branch ? `branch: ${e.git_branch}` : null}
                      {e.git_branch && e.git_commit_hash ? ' · ' : null}
                      {e.git_commit_hash ? `commit: ${e.git_commit_hash.slice(0, 10)}` : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
