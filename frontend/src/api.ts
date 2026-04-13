export type Session = {
  id: string
  project_id: string
  started_at: string
  ended_at: string
  objective: string | null
  ai_summary_markdown: string | null
  ai_summary_json: Record<string, unknown> | null
  ai_suggested_next_steps: string[] | null
  event_count: number
}

export type Project = {
  id: string
  name: string
  root_path: string
  created_at: string
}

export type Event = {
  id: string
  project_id: string
  session_id: string
  ts: string
  event_type: string
  file_path: string | null
  git_commit_hash: string | null
  git_branch: string | null
  event_metadata: Record<string, unknown> | null
}

export type ResumeBundle = {
  session: Session
  events: Event[]
  recent_files: string[]
  git_commits: string[]
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`${resp.status} ${resp.statusText}${text ? `: ${text}` : ''}`)
  }
  return (await resp.json()) as T
}

export function listSessions(): Promise<Session[]> {
  return apiFetch<Session[]>('/api/sessions')
}

export function listProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/api/projects')
}

export function listSessionsForProject(projectId: string): Promise<Session[]> {
  const qs = new URLSearchParams({ project_id: projectId })
  return apiFetch<Session[]>(`/api/sessions?${qs.toString()}`)
}

export function getSession(sessionId: string): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${sessionId}`)
}

export function listSessionEvents(sessionId: string): Promise<Event[]> {
  return apiFetch<Event[]>(`/api/sessions/${sessionId}/events`)
}

export function getResumeBundle(sessionId: string): Promise<ResumeBundle> {
  return apiFetch<ResumeBundle>(`/api/sessions/${sessionId}/resume`)
}

export function summarizeSession(sessionId: string): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${sessionId}/summarize`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

