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

export type ClearSessionsResult = {
  deleted_sessions: number
  deleted_events: number
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
  if (resp.status === 204) {
    return undefined as T
  }
  return (await resp.json()) as T
}

export function health(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/health')
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

export function patchSession(
  sessionId: string,
  patch: { objective?: string | null },
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function summarizeMissingSessions(opts?: {
  projectId?: string
  limit?: number
}): Promise<Session[]> {
  const qs = new URLSearchParams()
  if (opts?.projectId) qs.set('project_id', opts.projectId)
  if (opts?.limit != null) qs.set('limit', String(opts.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch<Session[]>(`/api/sessions/summarize_missing${suffix}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function patchProject(
  projectId: string,
  patch: { name?: string | null },
): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteProject(projectId: string): Promise<void> {
  return apiFetch<void>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  })
}

export function removeSession(sessionId: string): Promise<void> {
  return apiFetch<void>(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

export function clearSessions(opts?: {
  projectId?: string
}): Promise<ClearSessionsResult> {
  const qs = new URLSearchParams()
  if (opts?.projectId) qs.set('project_id', opts.projectId)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch<ClearSessionsResult>(`/api/sessions${suffix}`, {
    method: 'DELETE',
  })
}

