import './App.css'
import { useEffect, useMemo, useState } from 'react'
import type { Event, Project, Session } from './api'
import {
  clearSessions,
  getSession,
  getResumeBundle,
  health,
  listProjects,
  removeSession,
  listSessionEvents,
  listSessions,
  listSessionsForProject,
  patchSession,
  summarizeMissingSessions,
  summarizeSession,
} from './api'

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
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('all')
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Session | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [gitCommits, setGitCommits] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [batchSummarizing, setBatchSummarizing] = useState(false)
  const [copying, setCopying] = useState(false)
  const [deletingSession, setDeletingSession] = useState(false)
  const [clearingSessions, setClearingSessions] = useState(false)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [objectiveDraft, setObjectiveDraft] = useState('')
  const [savingObjective, setSavingObjective] = useState(false)

  async function refreshSessions(nextProjectId?: string) {
    const pid = nextProjectId ?? projectId
    setLoading(true)
    setError(null)
    try {
      const s =
        pid === 'all' ? await listSessions() : await listSessionsForProject(pid)
      setSessions(s)
      if (s.length === 0) {
        setSelectedId(null)
        setSelected(null)
        setEvents([])
      } else if (!selectedId || !s.some((x) => x.id === selectedId)) {
        setSelectedId(s[0].id)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setError(null)
    ;(async () => {
      try {
        const h = await health()
        if (!cancelled) setBackendOk(Boolean(h.ok))
      } catch {
        if (!cancelled) setBackendOk(false)
      }
      try {
        const p = await listProjects()
        if (cancelled) return
        setProjects(p)
      } catch (e: unknown) {
        // non-fatal; sessions still work without this.
      }
      await refreshSessions('all')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const t = window.setInterval(() => {
      refreshSessions().catch(() => {})
    }, 10_000)
    return () => window.clearInterval(t)
  }, [autoRefresh, projectId, selectedId])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setError(null)
    Promise.all([getSession(selectedId), listSessionEvents(selectedId), getResumeBundle(selectedId)])
      .then(([sess, evs, bundle]) => {
        if (cancelled) return
        setSelected(sess)
        setEvents(evs)
        setRecentFiles(bundle.recent_files || [])
        setGitCommits(bundle.git_commits || [])
        setObjectiveDraft(sess.objective || '')
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

  async function onSummarizeMissing() {
    setBatchSummarizing(true)
    setError(null)
    try {
      const updated = await summarizeMissingSessions({
        projectId: projectId === 'all' ? undefined : projectId,
        limit: 10,
      })
      if (updated.length > 0) {
        setSessions((prev) => {
          const map = new Map(prev.map((s) => [s.id, s]))
          for (const u of updated) map.set(u.id, u)
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime(),
          )
        })
        if (selectedId && updated.some((u) => u.id === selectedId)) {
          const u = updated.find((x) => x.id === selectedId)
          if (u) setSelected(u)
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBatchSummarizing(false)
    }
  }

  async function onCopyResume() {
    if (!selected) return
    setCopying(true)
    setError(null)
    try {
      const lines: string[] = []
      lines.push('## Resume bundle')
      lines.push('')
      lines.push(`- Session: ${fmt(selected.started_at)} → ${fmt(selected.ended_at)}`)
      if (selected.objective) lines.push(`- Objective: ${selected.objective}`)
      lines.push(`- Events: ${selected.event_count}`)
      if (recentFiles.length > 0) {
        lines.push('')
        lines.push('### Recent files')
        for (const f of recentFiles) lines.push(`- ${f}`)
      }
      if (gitCommits.length > 0) {
        lines.push('')
        lines.push('### Git commits')
        for (const c of gitCommits) lines.push(`- ${c}`)
      }
      lines.push('')
      lines.push('### AI summary')
      lines.push(selected.ai_summary_markdown || '(no summary yet)')
      lines.push('')
      lines.push('### Suggested next steps')
      if (selected.ai_suggested_next_steps && selected.ai_suggested_next_steps.length > 0) {
        selected.ai_suggested_next_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
      } else {
        lines.push('(none)')
      }
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCopying(false)
    }
  }

  async function onSaveObjective() {
    if (!selectedId) return
    setSavingObjective(true)
    setError(null)
    try {
      const updated = await patchSession(selectedId, {
        objective: objectiveDraft,
      })
      setSelected(updated)
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingObjective(false)
    }
  }

  async function onRemoveSession() {
    if (!selectedId) return
    const ok = window.confirm('Delete this session and all its timeline events?')
    if (!ok) return

    setDeletingSession(true)
    setError(null)
    try {
      await removeSession(selectedId)
      setSelectedId(null)
      setSelected(null)
      setEvents([])
      setRecentFiles([])
      setGitCommits([])
      await refreshSessions()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingSession(false)
    }
  }

  async function onClearSessions() {
    const target = projectId === 'all' ? 'all sessions' : 'sessions in this project'
    const ok = window.confirm(`Clear ${target}? This cannot be undone.`)
    if (!ok) return

    setClearingSessions(true)
    setError(null)
    try {
      const result = await clearSessions({
        projectId: projectId === 'all' ? undefined : projectId,
      })
      setSelectedId(null)
      setSelected(null)
      setEvents([])
      setRecentFiles([])
      setGitCommits([])
      await refreshSessions()
      window.alert(
        `Cleared ${result.deleted_sessions} sessions and ${result.deleted_events} events.`,
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setClearingSessions(false)
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
          <div className={`status ${backendOk ? 'ok' : backendOk === false ? 'bad' : ''}`}>
            {backendOk ? 'Backend: OK' : backendOk === false ? 'Backend: offline' : 'Backend: …'}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            onClick={() => refreshSessions()}
            disabled={loading}
            className="secondary"
          >
            Refresh
          </button>
          <button
            onClick={onCopyResume}
            disabled={!selected || copying}
            className="secondary"
          >
            {copying ? 'Copying…' : 'Copy resume'}
          </button>
          <button onClick={onSummarize} disabled={!selectedId || summarizing}>
            {summarizing ? 'Summarizing…' : 'Summarize session'}
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <main className="layout">
        <aside className="panel">
          <div className="panelTitleRow">
            <div className="panelTitleText">
              Sessions {loading ? <span className="muted">(loading…)</span> : null}
            </div>
            <select
              className="select"
              value={projectId}
              onChange={(e) => {
                const next = e.target.value
                setProjectId(next)
                refreshSessions(next)
              }}
              aria-label="Project filter"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="panelActions">
            <button
              onClick={onSummarizeMissing}
              disabled={batchSummarizing || backendOk === false}
              className="secondary miniAction"
              title="Summarize up to 10 sessions that are missing summaries"
            >
              {batchSummarizing ? 'Summarizing…' : 'Summarize missing'}
            </button>
            <button
              onClick={onClearSessions}
              disabled={clearingSessions || sessions.length === 0 || backendOk === false}
              className="danger miniAction"
              title={
                projectId === 'all'
                  ? 'Delete all sessions and events'
                  : 'Delete all sessions and events for selected project'
              }
            >
              {clearingSessions
                ? 'Clearing…'
                : projectId === 'all'
                  ? 'Clear all sessions'
                  : 'Clear project sessions'}
            </button>
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
                <div className="v">
                  <div className="objectiveRow">
                    <input
                      className="objectiveInput"
                      value={objectiveDraft}
                      onChange={(e) => setObjectiveDraft(e.target.value)}
                      placeholder="Set the session objective (optional)"
                    />
                    <button
                      className="miniButton"
                      onClick={onSaveObjective}
                      disabled={savingObjective || backendOk === false}
                      title="Save objective"
                    >
                      {savingObjective ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="sectionTitle">AI summary</div>
              <pre className="summary">
                {selected.ai_summary_markdown || 'No summary yet. Click “Summarize session”.'}
              </pre>

              <div className="sectionTitle">Session actions</div>
              <button
                className="danger inlineDanger"
                onClick={onRemoveSession}
                disabled={deletingSession || backendOk === false}
                title="Delete this session and all its events"
              >
                {deletingSession ? 'Removing…' : 'Remove this session'}
              </button>

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

              {recentFiles.length > 0 ? (
                <>
                  <div className="sectionTitle">Recent files</div>
                  <ul className="compactList">
                    {recentFiles.slice(0, 10).map((f) => (
                      <li key={f} className="mono muted">
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
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
