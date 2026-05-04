import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  getSession,
  health,
  listProjects,
  listSessionEvents,
  listSessions,
  listSessionsForProject,
  removeSession,
  summarizeMissingSessions,
  clearSessions,
  patchSession,
  summarizeSession,
  patchProject,
  deleteProject,
  createProject,
} from './api'
import type { Event, Project, Session } from './api'

// --- Icons ---
const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1-1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
)
const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
)
const BotIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
)
const FolderIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
)
const SaveIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
)
const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
)
const ExecutionPathIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/><path d="M3 12h12"/><path d="M21 12h.01"/></svg>
)
const LightningIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
)
const EditIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
)
const FileCodeIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 13 2 2-2 2"/><path d="m15 13-2 2 2 2"/></svg>
)
const WarningIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
)
const RefreshIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
)

function fmt(dt: string) {
  try {
    return new Date(dt).toISOString().slice(0, 19).replace('T', ' ')
  } catch {
    return dt
  }
}

function timeAgo(dt: string) {
  const t = new Date(dt).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return 'now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function shortId(id: string) {
  return `#session-${id.slice(0, 4)}`
}

function parseMarkdownToSections(md: string) {
  if (!md) return []
  const cleanMd = md.replace(/^#\s+Coding Session Summary\s*/i, '').trim()
  const segments = cleanMd.split(/##\s+/).filter(Boolean)
  const BLACKLIST = ['immediate next steps', 'coding session summary', 'changed files', 'risks']
  
  return segments.map(seg => {
    const lines = seg.trim().split('\n')
    const title = lines[0].trim()
    const content = lines.slice(1).join('\n').trim()
    return { title, content }
  }).filter(sec => !BLACKLIST.some(b => sec.title.toLowerCase().includes(b)))
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-white/10 px-1 rounded font-mono text-[13px] text-[#00f5ff]">{part.slice(1, -1)}</code>
    }
    return part
  })
}

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Session | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const [batchSummarizing, setBatchSummarizing] = useState(false)
  const [clearingSessions, setClearingSessions] = useState(false)
  const [summarizingActive, setSummarizingActive] = useState(false)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [isEditingObjective, setIsEditingObjective] = useState(false)
  const [editingObjValue, setEditingObjValue] = useState('')
  const [autoReload, setAutoReload] = useState(true)

  const refreshSessions = useCallback(async (nextProjectId?: string, forceSelectFirst = false) => {
    const pid = nextProjectId ?? projectId
    if (!pid) return
    try {
      const s = pid === 'all' ? await listSessions() : await listSessionsForProject(pid)
      setSessions(s)
      if (s.length > 0 && (forceSelectFirst || !selectedId)) {
        setSelectedId(s[0].id)
      }
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message)
    }
  }, [projectId, selectedId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const h = await health()
        if (!cancelled) setBackendOk(Boolean(h.ok))
      } catch { if (!cancelled) setBackendOk(false) }
      try {
        const p = await listProjects()
        if (!cancelled) {
          setProjects(p)
          if (p.length > 0) {
            setProjectId(p[0].id)
            const s = await listSessionsForProject(p[0].id)
            if (!cancelled) {
              setSessions(s)
              if (s.length > 0) setSelectedId(s[0].id)
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error) setError(e.message)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!projectId || !autoReload) return
    const t = setInterval(() => refreshSessions(), 10_000)
    return () => clearInterval(t)
  }, [refreshSessions, projectId, autoReload])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    Promise.all([getSession(selectedId), listSessionEvents(selectedId)])
      .then(([sess, evs]) => {
        if (cancelled) return
        setSelected(sess)
        setEvents(evs)
        setEditingObjValue(sess.objective || '')
      })
      .catch((e: unknown) => { if (e instanceof Error) setError(e.message) })
    return () => { cancelled = true }
  }, [selectedId])

  const sessionDuration = useMemo(() => {
    if (!selected) return '0h 0m'
    const x = new Date(selected.started_at).getTime()
    const y = new Date(selected.ended_at).getTime()
    if (Number.isNaN(x) || Number.isNaN(y)) return '0h 0m'
    const s = Math.round((y - x) / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${h}h ${m}m`
  }, [selected])

  const onSummarizeMissing = async () => {
    setBatchSummarizing(true)
    try {
      await summarizeMissingSessions({ projectId: projectId === 'all' ? undefined : projectId, limit: 10 })
      await refreshSessions()
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
    finally { setBatchSummarizing(false) }
  }

  const onSummarizeActive = async () => {
    if (!selectedId) return
    setSummarizingActive(true)
    try {
      await summarizeSession(selectedId)
      const sess = await getSession(selectedId)
      setSelected(sess)
      await refreshSessions()
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
    finally { setSummarizingActive(false) }
  }

  const onClearSessions = async () => {
    if (!projectId || projectId === 'all') return
    if (!window.confirm(`Clear ALL sessions for this project?`)) return
    
    setClearingSessions(true)
    try {
      await clearSessions({ projectId })
      setSelectedId(null)
      setSelected(null)
      setEvents([])
      await refreshSessions()
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
    finally { setClearingSessions(false) }
  }

  const onDeleteProject = async () => {
    if (!projectId || projectId === 'all') return
    if (!window.confirm(`Delete this project completely? All sessions and events will be lost.`)) return

    try {
      await deleteProject(projectId)
      const p = await listProjects()
      setProjects(p)
      if (p.length > 0) {
        setProjectId(p[0].id)
        refreshSessions(p[0].id, true)
      } else {
        setProjectId('')
        setSessions([])
      }
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
  }

  const onRenameProject = async () => {
    if (!projectId || projectId === 'all') return
    const currentName = projects.find(p => p.id === projectId)?.name || ''
    const newName = window.prompt("Enter new project name:", currentName)
    if (!newName || newName.trim() === '' || newName === currentName) return

    try {
      const updated = await patchProject(projectId, { name: newName.trim() })
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p))
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
  }

  const onRemoveSession = async () => {
    if (!selectedId || !window.confirm('Delete this session?')) return
    try {
      await removeSession(selectedId)
      setSelectedId(null)
      setSelected(null)
      await refreshSessions()
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
  }

  const onSaveObjective = async () => {
    if (!selectedId) return
    try {
      await patchSession(selectedId, { objective: editingObjValue })
      setIsEditingObjective(false)
      const sess = await getSession(selectedId)
      setSelected(sess)
      await refreshSessions()
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
  }

  const onCopyResume = async () => {
    if (!selected) return
    try {
      const text = `Session: ${selected.objective}\nAI Summary: ${selected.ai_summary_markdown}\nEvents: ${selected.event_count}`
      await navigator.clipboard.writeText(text)
      window.alert('Resume bundle copied!')
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
  }

  const onCreateProject = async () => {
    const root_path = window.prompt("Enter new Project's root path (e.g. /home/user/my-repo):")
    if (!root_path || !root_path.trim()) return

    const name = window.prompt("Enter new Project name (optional):")
    
    try {
      const created = await createProject({ root_path: root_path.trim(), name: name?.trim() || null })
      setProjects(prev => [created, ...prev])
      setProjectId(created.id)
      refreshSessions(created.id, true)
    } catch (e: unknown) { if (e instanceof Error) setError(e.message) }
  }

  const sections = useMemo(() => parseMarkdownToSections(selected?.ai_summary_markdown || ''), [selected])
  
  const structuredFileDetails = useMemo(() => {
    const details = selected?.ai_summary_json?.file_details
    if (Array.isArray(details)) return details as { file_path: string; what_changed: string; why_it_matters: string; recommended_check: string }[]
    return null
  }, [selected])

  const structuredRisks = useMemo(() => {
    const risks = selected?.ai_summary_json?.risks_or_unknowns
    if (Array.isArray(risks)) return risks as string[]
    return null
  }, [selected])

  const orderedReportContent = useMemo(() => {
    const objective = sections.find(s => s.title.toLowerCase().includes('session objective'))
    const rest = sections.filter(s => !s.title.toLowerCase().includes('session objective'))
    return { objective, rest }
  }, [sections])

  return (
    <div className="flex min-h-screen w-full bg-[#0a0c10] text-[#e1e1e1] selection:bg-[#00f5ff]/30 font-sans overflow-x-hidden">
      <aside className="fixed inset-y-0 left-0 flex w-[280px] flex-col border-r border-[#00f5ff]/10 bg-[#050608] z-20">
        <div className="p-4 border-b border-white/5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative group flex-1">
              <select
                  className="w-full appearance-none rounded-lg border border-[#00f5ff]/20 bg-[#111418] py-2.5 pr-10 pl-4 text-[12px] font-bold text-[#00f5ff] uppercase tracking-wider outline-none transition hover:border-[#00f5ff]/40 focus:border-[#00f5ff]/60"
                  value={projectId}
                  onChange={(e) => { 
                    const nextId = e.target.value;
                    setProjectId(nextId); 
                    refreshSessions(nextId, true); 
                  }}
              >
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#00f5ff]/40 group-hover:text-[#00f5ff]/60">
                <ChevronDownIcon />
              </div>
            </div>
            
          </div>
          {projectId && projectId !== 'all' && (
            <div className="flex gap-2 mb-2">
              <button onClick={onRenameProject} className="flex-1 rounded border border-white/10 bg-white/5 py-1 px-2 text-[10px] font-bold text-white/50 uppercase hover:bg-white/10 hover:text-white transition">
                Rename
              </button>
              <button onClick={onDeleteProject} className="flex-1 rounded border border-red-500/20 bg-red-500/5 py-1 px-2 text-[10px] font-bold text-red-500/60 uppercase hover:bg-red-500/10 hover:text-red-500 transition">
                Delete
              </button>
            </div>
          )}
          <div className="flex gap-2 mb-2">
              <button onClick={onCreateProject} className="flex-1 rounded border border-[#00f5ff]/20 bg-[#00f5ff]/5 py-1 px-2 text-[10px] font-bold text-[#00f5ff]/80 uppercase hover:bg-[#00f5ff]/10 hover:text-[#00f5ff] transition">
                + Create Project
              </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => refreshSessions()}
              title="Manual Sync"
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 hover:text-[#00f5ff] hover:border-[#00f5ff]/40 transition-all hover:bg-[#00f5ff]/5"
            >
              <RefreshIcon />
            </button>
          </div>
          
          <button 
            onClick={() => setAutoReload(!autoReload)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border transition-all ${autoReload ? 'border-[#00ff9d]/30 bg-[#00ff9d]/5 text-[#00ff9d]' : 'border-white/5 bg-white/[0.02] text-white/20'}`}
          >
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${autoReload ? 'bg-[#00ff9d] animate-pulse' : 'bg-white/20'}`} />
              <span className="text-[9px] font-black uppercase tracking-tighter">{autoReload ? 'Auto_Sync_Active' : 'Auto_Sync_Paused'}</span>
            </div>
            <div className={`text-[8px] font-mono px-1 rounded ${autoReload ? 'bg-[#00ff9d]/20' : 'bg-white/10'}`}>10s</div>
          </button>
        </div>
        <div className="px-5 py-4">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-[#6b7280] uppercase">Recent Sessions</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-20 custom-scrollbar">
          <div className="space-y-1">
            {sessions.map((s) => {
              const isActive = s.id === selectedId
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`group relative w-full rounded-xl p-3 text-left transition-all duration-300 border ${
                    isActive ? 'border-[#00f5ff]/40 bg-[#00f5ff]/5' : 'border-transparent hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className={`text-[14px] font-bold leading-tight truncate flex-1 ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white'}`}>
                      {s.objective || 'Untitled Session'}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium text-white/20 pt-0.5">{timeAgo(s.ended_at)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                      isActive ? 'border-[#00f5ff]/30 bg-[#00f5ff]/10 text-[#00f5ff]' : 'border-white/10 bg-white/5 text-white/30'
                    }`}>
                      <LightningIcon className={isActive ? 'text-[#00f5ff]' : 'text-white/20'} />
                      <span>{s.event_count} Events</span>
                    </div>
                    <span className={`text-[10px] font-bold font-mono tracking-tight transition-colors ${isActive ? 'text-[#00f5ff]/80' : 'text-white/50'}`}>
                      {shortId(s.id)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-auto p-4 border-t border-white/5 bg-[#050608] flex flex-col gap-2">
             <button
                onClick={onSummarizeMissing}
                disabled={batchSummarizing}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#00f5ff]/20 bg-[#111418] py-2.5 text-[11px] font-bold text-[#00f5ff] uppercase tracking-wider transition hover:bg-[#00f5ff]/10 hover:border-[#00f5ff]/40 disabled:opacity-50"
              >
                <SparklesIcon /> {batchSummarizing ? 'Processing' : 'Summarize Missing'}
              </button>
              <button
                onClick={onClearSessions}
                disabled={clearingSessions}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-[#111418] py-2 text-[10px] font-bold text-red-500/60 uppercase tracking-widest transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
              >
                <TrashIcon /> {clearingSessions ? '...' : 'Clear Project Sessions'}
              </button>
        </div>
      </aside>

      <div className="ml-[280px] grid grid-cols-[1fr_320px] flex-1 min-h-screen min-w-0">
        <main className="flex flex-col p-8 gap-8 min-w-0">
          {selected ? (
            <>
              <header className="flex items-end justify-between gap-6 pb-2 border-b border-white/5">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] text-[#00f5ff] uppercase mb-1">
                    Active Context <span className="text-white/20">//</span> <span>{projectId.toUpperCase()}</span>
                  </div>
                  <div className="mt-4 min-h-[64px] flex items-center">
                    {isEditingObjective ? (
                      <div className="flex items-center gap-3 animate-fade-in w-full h-full">
                        <input 
                          className="bg-[#111418] text-4xl font-bold tracking-tight text-[#00f5ff] border-b-2 border-[#00f5ff] outline-none flex-1 py-1 px-2 rounded-t-lg h-full"
                          value={editingObjValue}
                          onChange={(e) => setEditingObjValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveObjective()
                            if (e.key === 'Escape') setIsEditingObjective(false)
                          }}
                        />
                        <button onClick={onSaveObjective} className="rounded bg-[#00f5ff] px-4 py-2 h-full text-[12px] font-black text-black uppercase shadow-[0_0_15px_rgba(0,245,255,0.3)] min-w-[100px]">Save</button>
                      </div>
                    ) : (
                      <div 
                        className="group cursor-pointer inline-flex items-center gap-4 rounded-lg px-2 -ml-2 transition-all hover:bg-white/[0.03] w-full"
                        onClick={() => setIsEditingObjective(true)}
                      >
                        <h1 className="text-4xl font-bold tracking-tight text-white leading-tight border-b-2 border-dashed border-white/10 group-hover:border-[#00f5ff] transition-all duration-300">
                          {selected.objective || 'Untitled Context'}
                        </h1>
                        <div className="flex flex-col items-center">
                          <EditIcon className="text-[#00f5ff] opacity-40 group-hover:opacity-100 transition-opacity" />
                          <span className="text-[9px] font-black text-[#00f5ff] opacity-0 group-hover:opacity-100 uppercase tracking-tighter mt-1">Edit</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="pb-1">
                  <button 
                    onClick={onSummarizeActive}
                    disabled={summarizingActive}
                    className="flex items-center justify-center gap-3 rounded border border-[#00f5ff]/50 bg-[#00f5ff] px-10 h-[40px] text-[14px] font-black tracking-[0.2em] text-black uppercase shadow-[0_0_20px_rgba(0,245,255,0.2)] hover:shadow-[0_0_40px_rgba(0,245,255,0.4)] transition-all active:scale-95 disabled:opacity-50"
                  >
                    <SparklesIcon className="scale-125" /> {summarizingActive ? '...' : 'Summarize'}
                  </button>
                </div>
              </header>

              <section className="flex flex-col gap-6">
                <div className="flex items-center gap-3 text-[11px] font-bold text-white/20 uppercase tracking-widest">
                  <SparklesIcon /> System_Audit_Report
                </div>
                
                <div className="grid gap-6">
                  {/* Phase 1: Session Objective (Hero Style) */}
                  {orderedReportContent.objective && (
                    <div className="group relative overflow-hidden rounded-xl border border-[#00f5ff]/20 bg-[#00f5ff]/[0.02] p-8 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 bg-gradient-to-r from-[#00f5ff]/5 to-transparent transition-all">
                       <div className="absolute top-0 right-0 p-6 opacity-5"><SparklesIcon className="w-24 h-24" /></div>
                       <div className="text-[12px] font-bold text-[#00f5ff] mb-4 flex items-center gap-3 italic capitalize">
                          <span className="h-0.5 w-6 bg-[#00f5ff]" /> {orderedReportContent.objective.title}
                       </div>
                       <h2 className="text-2xl font-bold text-white leading-tight pr-12">
                          {renderInlineMarkdown(orderedReportContent.objective.content)}
                       </h2>
                    </div>
                  )}

                  {/* Phase 2: Risks (Persistent Hero Rendering - Always below objective) */}
                  <div className={`rounded-xl border transition-all duration-500 overflow-hidden ${structuredRisks && structuredRisks.length > 0 ? 'border-red-500/20 bg-red-500/[0.02] p-6' : 'border-white/5 bg-white/[0.01] p-5 opacity-40'}`}>
                    <div className={`flex items-center gap-3 font-bold text-[12px] mb-4 uppercase italic ${structuredRisks && structuredRisks.length > 0 ? 'text-red-500' : 'text-white/20'}`}>
                       <WarningIcon /> {structuredRisks && structuredRisks.length > 0 ? 'Risks / Unknowns Detected' : 'Technical Risks Evaluated'}
                    </div>
                    {structuredRisks && structuredRisks.length > 0 ? (
                      <div className="grid gap-3">
                         {structuredRisks.map((risk, idx) => (
                           <div key={idx} className="flex items-start gap-4 animate-fade-in">
                              <div className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                              <span className="text-[14px] font-medium text-white/70 leading-relaxed">{renderInlineMarkdown(risk)}</span>
                           </div>
                         ))}
                      </div>
                    ) : (
                      <div className="text-[13px] font-medium text-white/20 italic">
                        No critical technical hazards or blocking unknowns identified for this path.
                      </div>
                    )}
                  </div>

                  {/* Phase 3: Other Sections (What Changed, etc.) */}
                  {orderedReportContent.rest.map((sec, i) => {
                    const isChanged = sec.title.toLowerCase().includes('what changed')

                    if (isChanged) {
                      return (
                        <div key={i} className="rounded-xl border border-white/5 bg-[#111418] overflow-hidden">
                           <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                              <h3 className="text-[14px] font-bold text-white/50 capitalize">{sec.title}</h3>
                              <div className="h-2 w-2 rounded-full bg-[#00f5ff] animate-pulse" />
                           </div>
                           <div className="divide-y divide-white/5">
                            {sec.content.split('\n').filter(Boolean).map((line, li) => (
                              <div key={li} className="group/item flex items-center gap-4 px-6 py-5 hover:bg-white/[0.02] transition-colors">
                                 <div className="font-mono text-[9px] font-bold text-[#00f5ff] w-12 shrink-0 opacity-30 group-hover/item:opacity-100">Item_{li+1}</div>
                                 <div className="h-px w-6 bg-white/5" />
                                 <div className="text-[15px] font-medium text-white/60 group-hover/item:text-white transition-colors pl-4">
                                    {renderInlineMarkdown(line.replace(/^[*-]\s*/, ''))}
                                 </div>
                              </div>
                            ))}
                           </div>
                        </div>
                      )
                    }
                    
                    return (
                        <div key={i} className="relative p-6 rounded-2xl border border-white/5 bg-white/[0.01]">
                          <h3 className="text-[14px] font-bold text-white/30 capitalize mb-4">{sec.title}</h3>
                          <div className="text-[14px] font-medium text-white/60 whitespace-pre-wrap">
                            {renderInlineMarkdown(sec.content)}
                          </div>
                        </div>
                    )
                  })}

                  {/* Phase 4: File Detail Hub */}
                  {structuredFileDetails && structuredFileDetails.length > 0 && (
                     <div className="space-y-6 pt-4">
                        <h3 className="text-[14px] font-bold text-white/30 capitalize flex items-center gap-4 px-2">
                           <span className="h-px w-10 bg-white/10" /> Changed files in detail
                        </h3>
                        <div className="grid gap-5">
                           {structuredFileDetails.map((f, fi) => (
                              <div key={fi} className="group/file relative rounded-2xl border border-white/10 bg-[#050608] transition-all hover:border-[#00f5ff]/40 hover:shadow-[0_0_40px_rgba(0,245,255,0.04)]">
                                 <div className="flex items-center gap-4 bg-white/5 p-5 border-b border-white/5">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00f5ff]/10 text-[#00f5ff]">
                                       <FileCodeIcon className="scale-110" />
                                    </div>
                                    <span className="font-mono text-[14px] font-bold text-[#00f5ff] truncate tracking-tight">{f.file_path}</span>
                                 </div>
                                 <div className="p-6 grid gap-5">
                                    {[
                                       { label: 'What Changed', value: f.what_changed },
                                       { label: 'Why It Matters', value: f.why_it_matters },
                                       { label: 'Manual Check', value: f.recommended_check }
                                    ].map((d, di) => (
                                       <div key={di} className="flex flex-col gap-2 relative">
                                          <div className="text-[11px] font-bold text-white/20 capitalize">{d.label}</div>
                                          <div className="text-[14px] font-medium text-white/50 leading-relaxed pl-5 border-l-2 border-white/5 group-hover/file:border-[#00f5ff]/40 transition-all">{renderInlineMarkdown(d.value)}</div>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-5">
                <div className="flex items-center gap-2.5 text-[11px] font-black tracking-[0.1em] text-white/40 uppercase">
                  <ExecutionPathIcon /> Expected Execution Path
                </div>
                <div className="grid gap-3">
                  {selected.ai_suggested_next_steps?.map((step, i) => (
                    <div key={i} className="flex items-start gap-4 rounded-lg border border-white/5 bg-[#111418] p-5 group hover:border-[#00f5ff]/20 transition-all">
                      <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/20 bg-white/5">
                        <div className="h-1.5 w-1.5 rounded-sm bg-[#00f5ff] scale-0 group-hover:scale-100 transition-all" />
                      </div>
                      <div>
                        <div className="text-[14px] font-bold text-white/90 mb-1">{step.split('\n')[0]}</div>
                        {step.includes('\n') && <div className="text-[11px] font-medium text-white/30">{step.split('\n').slice(1).join('\n')}</div>}
                      </div>
                    </div>
                  )) || <div className="text-white/20 italic text-[13px] p-5 border border-dashed border-white/5 rounded-lg">No execution path identified.</div>}
                </div>
              </section>

              <footer className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.1em]">
                  Purge Context Logic // ID: {selected.id.slice(0, 16)}
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={onCopyResume}
                    className="flex items-center gap-2.5 rounded border border-white/10 bg-[#111418] px-6 py-2.5 text-[11px] font-black text-white/70 uppercase tracking-widest hover:bg-white/5 hover:border-white/20 transition-all"
                  >
                    <SaveIcon /> Copy Bundle
                  </button>
                  <button 
                    onClick={onRemoveSession}
                    className="flex items-center gap-2.5 rounded border border-red-500/30 bg-red-500/10 px-6 py-2.5 text-[11px] font-black text-red-500 uppercase tracking-widest hover:bg-red-500/20 transition-all"
                  >
                    <TrashIcon /> Clear Session
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/5 bg-white/[0.01]">
              <div className="text-center">
                 <BotIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                 <h3 className="text-white/20 font-bold uppercase tracking-widest">Awaiting Context Selection</h3>
              </div>
            </div>
          )}
        </main>
        <aside className="border-l border-[#00f5ff]/10 bg-[#050608] flex flex-col p-6 gap-8 overflow-hidden flex-1">
          <header className="flex items-center justify-between">
             <div className={`flex items-center gap-2 text-[10px] font-black tracking-widest uppercase transition-colors ${backendOk ? 'text-[#00ff9d]' : 'text-[#ff4b4b]'}`}>
                <div className={`h-3 w-3 rounded-sm ${backendOk ? 'bg-[#00ff9d]' : 'bg-[#ff4b4b]'}`} /> 
                {backendOk ? 'Daemon_Synced' : 'Daemon_Offline'}
             </div>
             <div className="flex items-center gap-3 text-white/30">
                <SparklesIcon className="w-4 h-4 cursor-pointer hover:text-white" />
                <FolderIcon className="w-4 h-4 cursor-pointer hover:text-white" />
             </div>
          </header>
          <div className="grid grid-cols-2 gap-6 text-left">
            <div>
              <div className="text-[9px] font-black text-white/20 uppercase mb-1 tracking-widest">Duration</div>
              <div className="text-[14px] font-bold text-white tracking-tight tabular-nums">{sessionDuration}</div>
            </div>
            <div>
              <div className="text-[9px] font-black text-white/20 uppercase mb-1 tracking-widest">Branch</div>
              <div className="text-[13px] font-bold text-[#00f5ff] truncate">main</div>
            </div>
            <div className="col-span-2">
              <div className="text-[9px] font-black text-white/20 uppercase mb-1 tracking-widest">Start Time</div>
              <div className="text-[12px] font-bold text-white/60 tabular-nums">{selected ? fmt(selected.started_at) : '--'} UTC</div>
            </div>
          </div>
          <div className="flex flex-col gap-4 overflow-hidden flex-1">
              <div className="flex items-center gap-2.5 text-[10px] font-black tracking-widest text-white/40 uppercase">
                <ExecutionPathIcon className="scale-75" /> Event Log
              </div>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
                {events.map((ev, idx) => (
                  <div key={idx} className="relative">
                    <div className={`absolute -left-[19px] top-1 h-3 w-3 rounded-full border-2 border-[#050608] ${idx === 0 ? 'bg-[#ff4b4b]' : 'bg-[#00ff9d]'}`} />
                    <div className="text-[10px] font-bold text-white/20 tabular-nums mb-1">
                      {new Date(ev.ts).toLocaleTimeString('en-GB')}
                    </div>
                    <div className={`rounded border border-white/5 bg-[#111418] p-3 text-[11px] leading-tight ${idx === 0 ? 'border-[#ff4b4b]/40 shadow-[0_0_15px_rgba(255,75,75,0.05)]' : ''}`}>
                       <div className="font-bold text-white/80 mb-1">{ev.event_type}</div>
                       <div className="text-white/40 text-[10px] break-all whitespace-pre-wrap">{ev.file_path || ev.git_commit_hash || 'Context captured.'}</div>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </aside>
      </div>
      {error && (
        <div className="fixed bottom-6 right-[340px] z-50">
          <div className="rounded border border-[#ff4b4b]/50 bg-[#ff4b4b]/10 p-4 text-[11px] font-black text-[#ff4b4b] uppercase tracking-widest backdrop-blur-md">
            [System_Error] // {error}
            <button onClick={() => setError(null)} className="ml-4 opacity-50 hover:opacity-100">×</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
