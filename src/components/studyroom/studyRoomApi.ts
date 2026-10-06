import type { FocusPhase, FocusSession, StudyDoubt, StudyRoom, StudyRoomDetail } from '../../types';

// The global fetch wrapper (see `api.ts`) attaches the bearer token and resolves the backend
// origin, so components keep using root-relative '/api/...' paths.
async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error || 'Something went wrong. Please try again.');
  return data as T;
}

export function listStudyRooms(filters: { subject?: string; topic?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.subject) params.set('subject', filters.subject);
  if (filters.topic) params.set('topic', filters.topic);
  const query = params.toString();
  return request<{ rooms: StudyRoom[] }>(`/api/study-rooms${query ? `?${query}` : ''}`).then((data) => data.rooms);
}

export interface CreateStudyRoomInput {
  name: string;
  subject?: string;
  topic?: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  maxParticipants: number;
}

export function createStudyRoom(input: CreateStudyRoomInput) {
  return request<{ room: StudyRoom }>('/api/study-rooms', { method: 'POST', body: input }).then((data) => data.room);
}

export function joinStudyRoom(roomId: string) {
  return request<{ room: StudyRoom }>(`/api/study-rooms/${roomId}/join`, { method: 'POST' }).then((data) => data.room);
}

export function leaveStudyRoom(roomId: string) {
  return request<{ ok: boolean }>(`/api/study-rooms/${roomId}/leave`, { method: 'POST' });
}

export function closeStudyRoom(roomId: string) {
  return request<{ ok: boolean }>(`/api/study-rooms/${roomId}/close`, { method: 'POST' });
}

export function getStudyRoom(roomId: string) {
  return request<StudyRoomDetail>(`/api/study-rooms/${roomId}`).then((data) => ({
    ...data,
    members: Array.isArray(data.members) ? data.members : [],
    focusSession: data.focusSession ?? null,
    doubts: Array.isArray(data.doubts) ? data.doubts : [],
  }));
}

export function startFocusSession(roomId: string, input: { durationSeconds: number; phase: FocusPhase }) {
  return request<{ session: FocusSession }>(`/api/study-rooms/${roomId}/sessions`, { method: 'POST', body: input }).then((data) => data.session);
}

export function getCurrentFocusSession(roomId: string) {
  return request<{ session: FocusSession | null }>(`/api/study-rooms/${roomId}/sessions/current`).then((data) => data.session);
}

export function joinFocusSession(roomId: string, sessionId: string) {
  return request<{ session: FocusSession }>(`/api/study-rooms/${roomId}/sessions/${sessionId}/join`, { method: 'POST' }).then((data) => data.session);
}

export function leaveFocusSession(roomId: string, sessionId: string) {
  return request<{ session: FocusSession }>(`/api/study-rooms/${roomId}/sessions/${sessionId}/leave`, { method: 'POST' }).then((data) => data.session);
}

export function createStudyDoubt(roomId: string, input: { title: string; content: string }) {
  return request<{ doubt: StudyDoubt }>(`/api/study-rooms/${roomId}/doubts`, { method: 'POST', body: input }).then((data) => data.doubt);
}

export function getStudyDoubt(doubtId: string) {
  return request<{ doubt: StudyDoubt }>(`/api/study-doubts/${doubtId}`).then((data) => data.doubt);
}

export function answerStudyDoubt(doubtId: string, content: string) {
  return request<{ doubt: StudyDoubt }>(`/api/study-doubts/${doubtId}/answers`, { method: 'POST', body: { content } }).then((data) => data.doubt);
}

export function acceptStudyDoubtAnswer(doubtId: string, answerId: string) {
  return request<{ doubt: StudyDoubt }>(`/api/study-doubts/${doubtId}/accept-answer`, { method: 'POST', body: { answerId } }).then((data) => data.doubt);
}

export function resolveStudyDoubt(doubtId: string) {
  return request<{ doubt: StudyDoubt }>(`/api/study-doubts/${doubtId}/resolve`, { method: 'POST' }).then((data) => data.doubt);
}