import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, LogOut, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import type { StudyDoubt, StudyRoom, StudyRoomDetail } from '../types';
import * as studyRoomApi from './studyroom/studyRoomApi';
import { StudyRoomDoubtsPanel } from './studyroom/StudyRoomDoubtsPanel';
import { StudyRoomFocusPanel } from './studyroom/StudyRoomFocusPanel';
import { StudyRoomPeoplePanel } from './studyroom/StudyRoomPeoplePanel';

const inputClass =
  'w-full rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-2.5 text-xs text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#7A7480] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors';
const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#A9A3AE] mb-1.5';
const primaryButtonClass =
  'w-full bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg p-2.5 text-xs font-medium tracking-wider transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2';
const secondaryButtonClass =
  'rounded-lg border border-[#6D28D9] dark:border-[#8B5CF6] bg-white dark:bg-[#17151A] text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] px-3 py-2 text-xs font-medium tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5';

const EMPTY_CREATE_FORM = {
  name: '',
  subject: '',
  topic: '',
  description: '',
  visibility: 'PUBLIC' as 'PUBLIC' | 'PRIVATE',
  maxParticipants: '15',
};

interface Props {
  currentUserId: string;
}

/**
 * Study Room: find or host a room, then study in it together.
 *
 * The room screen is three tabs - focus, doubts, people - rather than a chat feed. Polling keeps the
 * shared timer and the roster fresh, but nothing here auto-scrolls or raises notifications: the
 * point is to be studying alongside other people, not to keep reading messages.
 */
export const StudyRoomView: React.FC<Props> = ({ currentUserId }) => {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [filters, setFilters] = useState({ subject: '', topic: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [detail, setDetail] = useState<StudyRoomDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [tab, setTab] = useState<'FOCUS' | 'DOUBTS' | 'PEOPLE'>('FOCUS');

  const [selectedDoubt, setSelectedDoubt] = useState<StudyDoubt | null>(null);
  const [doubtLoading, setDoubtLoading] = useState(false);

  // Last focus-session id seen for the open room, so polling can tell "still the same session"
  // apart from "a session just started or ended" and reload the room when it matters.
  const knownSessionId = useRef<string | null>(null);

  const applyDetail = useCallback((next: StudyRoomDetail) => {
    setDetail(next);
    knownSessionId.current = next.focusSession?.id ?? null;
  }, []);

  const loadRooms = useCallback(async () => {
    setRoomsError('');
    try {
      setRooms(await studyRoomApi.listStudyRooms(filters));
    } catch (error) {
      setRoomsError((error as Error).message);
    } finally {
      setRoomsLoading(false);
    }
  }, [filters]);

  const reloadDetail = useCallback(
    async (roomId: string) => {
      applyDetail(await studyRoomApi.getStudyRoom(roomId));
    },
    [applyDetail]
  );

  useEffect(() => {
    setRoomsLoading(true);
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!selectedRoomId) {
      setDetail(null);
      knownSessionId.current = null;
      return undefined;
    }
    setDetailLoading(true);
    void reloadDetail(selectedRoomId).catch((error: Error) => setDetailError(error.message))
      .finally(() => setDetailLoading(false));
    return undefined;
  }, [selectedRoomId, reloadDetail]);

  useEffect(() => {
    if (!selectedRoomId) return undefined;
    let cancelled = false;
    const sync = async () => {
      try {
        const session = await studyRoomApi.getCurrentFocusSession(selectedRoomId);
        if (cancelled) return;
        if ((session?.id ?? null) !== knownSessionId.current) {
          // A session started, ended, or expired: the roster and counts need a full refresh.
          await reloadDetail(selectedRoomId);
          return;
        }
        setDetail((current) => (current ? { ...current, focusSession: session } : current));
      } catch {
        // A failed poll must not interrupt a running session.
      }
    };
    const interval = window.setInterval(() => void sync(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedRoomId, reloadDetail]);

  // The list entry is the fallback while a room detail is still loading; the loaded detail always
  // wins. `useMemo` has to run on every render: calling it inside the `??` below skipped the hook
  // as soon as `detail` existed, which React reported as a hook-count mismatch and unmounted the
  // whole screen the moment a room finished loading.
  const listedRoom = useMemo(
    () => rooms.find((item) => item.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );
  const room = detail?.room ?? listedRoom;

  const runInRoom = async (operation: () => Promise<void>) => {
    setBusy(true);
    setDetailError('');
    try {
      await operation();
    } catch (error) {
      setDetailError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const afterSessionChange = (sessionId: string) => {
    knownSessionId.current = sessionId;
  };

  const createRoom = (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');
    if (!createForm.name.trim()) {
      setCreateError('Room name is required.');
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const maxParticipants = Number(createForm.maxParticipants);
        const created = await studyRoomApi.createStudyRoom({
          name: createForm.name.trim(),
          subject: createForm.subject.trim(),
          topic: createForm.topic.trim(),
          description: createForm.description.trim(),
          visibility: createForm.visibility,
          maxParticipants: Number.isInteger(maxParticipants) ? maxParticipants : 15,
        });
        setCreateForm(EMPTY_CREATE_FORM);
        setShowCreate(false);
        await loadRooms();
        setSelectedRoomId(created.id);
      } catch (error) {
        setCreateError((error as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  };

  const joinRoom = (roomId: string) =>
    void (async () => {
      setBusy(true);
      setDetailError('');
      try {
        await studyRoomApi.joinStudyRoom(roomId);
        await loadRooms();
        setSelectedRoomId(roomId);
      } catch (error) {
        setDetailError((error as Error).message);
      } finally {
        setBusy(false);
      }
    })();

  const leaveRoom = () =>
    void runInRoom(async () => {
      await studyRoomApi.leaveStudyRoom(selectedRoomId);
      setSelectedRoomId('');
      setSelectedDoubt(null);
      await loadRooms();
    });

  const closeRoom = () =>
    void runInRoom(async () => {
      await studyRoomApi.closeStudyRoom(selectedRoomId);
      await reloadDetail(selectedRoomId);
      await loadRooms();
    });

  const openDoubt = (doubtId: string) =>
    void (async () => {
      setDoubtLoading(true);
      setDetailError('');
      try {
        setSelectedDoubt(await studyRoomApi.getStudyDoubt(doubtId));
      } catch (error) {
        setDetailError((error as Error).message);
      } finally {
        setDoubtLoading(false);
      }
    })();

  const afterDoubtChange = async (doubt: StudyDoubt) => {
    setSelectedDoubt(doubt);
    await reloadDetail(selectedRoomId);
  };

  const tabs = [
    { id: 'FOCUS' as const, label: 'Focus', badge: detail?.focusSession ? detail.focusSession.currentParticipantCount : 0 },
    { id: 'DOUBTS' as const, label: 'Doubts', badge: detail?.doubts.length ?? 0 },
    { id: 'PEOPLE' as const, label: 'People', badge: detail?.members.length ?? 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">
      <div className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">Study Room</h1>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-1.5 font-sans">
            Host or join a room, focus together, and keep the questions that come up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="rounded-lg border border-[#6D28D9] dark:border-[#8B5CF6] bg-white dark:bg-[#17151A] text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] px-3 py-2 text-xs font-medium tracking-wider transition-colors flex items-center gap-1.5"
          >
            {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showCreate ? 'Cancel' : 'Create room'}
          </button>
          <button
            type="button"
            onClick={() => {
              setRoomsLoading(true);
              void loadRooms();
            }}
            className="rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] p-2.5 hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] text-[#6D28D9] dark:text-[#8B5CF6] transition-colors shadow-2xs"
            aria-label="Refresh rooms"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {(roomsError || createError) && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-xs font-mono text-red-800 dark:text-red-300">
          {roomsError || createError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="space-y-5">
          {showCreate && (
            <form onSubmit={createRoom} className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-5 space-y-3 shadow-2xs">
              <h2 className="font-sans text-sm font-semibold text-[#17151A] dark:text-[#F5F3F7]">Create a room</h2>

              <div>
                <label className={labelClass} htmlFor="room-name">Room name *</label>
                <input
                  id="room-name"
                  required
                  maxLength={120}
                  value={createForm.name}
                  onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                  placeholder="DSP Endsem Prep"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="room-subject">Subject</label>
                  <input
                    id="room-subject"
                    value={createForm.subject}
                    onChange={(event) => setCreateForm({ ...createForm, subject: event.target.value })}
                    placeholder="DSP"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="room-topic">Topic</label>
                  <input
                    id="room-topic"
                    value={createForm.topic}
                    onChange={(event) => setCreateForm({ ...createForm, topic: event.target.value })}
                    placeholder="Fourier Transform"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="room-description">Description</label>
                <textarea
                  id="room-description"
                  rows={2}
                  maxLength={500}
                  value={createForm.description}
                  onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
                  placeholder="What are you working through?"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="room-visibility">Visibility</label>
                  <select
                    id="room-visibility"
                    value={createForm.visibility}
                    onChange={(event) => setCreateForm({ ...createForm, visibility: event.target.value as 'PUBLIC' | 'PRIVATE' })}
                    className={inputClass}
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="room-max">Max participants</label>
                  <input
                    id="room-max"
                    type="number"
                    min={2}
                    max={100}
                    value={createForm.maxParticipants}
                    onChange={(event) => setCreateForm({ ...createForm, maxParticipants: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <button type="submit" disabled={busy} className={primaryButtonClass}>
                <Plus className="w-4 h-4 text-white/80" />{busy ? 'Creating...' : 'Create room'}
              </button>
            </form>
          )}

          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-5 space-y-4 shadow-2xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7B7484] dark:text-[#7A7480] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={filters.subject}
                onChange={(event) => setFilters({ ...filters, subject: event.target.value })}
                placeholder="Search by subject..."
                aria-label="Search rooms by subject"
                className={`${inputClass} pl-8`}
              />
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7B7484] dark:text-[#7A7480] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={filters.topic}
                onChange={(event) => setFilters({ ...filters, topic: event.target.value })}
                placeholder="Search by topic..."
                aria-label="Search rooms by topic"
                className={`${inputClass} pl-8`}
              />
            </div>

            {roomsLoading ? (
              <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans py-6 text-center animate-pulse-soft">Loading rooms...</p>
            ) : rooms.length === 0 ? (
              <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans py-6 text-center">
                No rooms match yet. Create one to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {rooms.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 space-y-2 bg-[#FAF8FC] dark:bg-[#1D1A21] transition-colors ${
                      item.id === selectedRoomId
                        ? 'border-[#6D28D9] dark:border-[#8B5CF6]'
                        : 'border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#3E344A]'
                    }`}
                  >
                    <div className="flex justify-between gap-3">
                      <strong className="text-xs text-[#17151A] dark:text-[#F5F3F7] truncate">{item.name}</strong>
                      <span className="text-[10px] text-[#6D28D9] dark:text-[#A78BFA] font-medium shrink-0">
                        {item.memberCount} / {item.maxParticipants}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans truncate">
                      {[item.subject, item.topic].filter(Boolean).join(' · ') || 'General study'}
                    </p>
                    <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-[#C4BDD0] dark:bg-[#4B4454]'}`} />
                      {item.status === 'ACTIVE' ? 'Active' : 'Closed'}
                      {item.visibility === 'PRIVATE' && ' · Private'}
                    </p>
                    <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans">Hosted by {item.ownerName}</p>
                    {item.joined ? (
                      <button type="button" onClick={() => setSelectedRoomId(item.id)} className={`${secondaryButtonClass} w-full justify-center`}>
                        Enter room
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || item.status !== 'ACTIVE'}
                        onClick={() => joinRoom(item.id)}
                        className={`${primaryButtonClass} py-2`}
                      >
                        {item.status !== 'ACTIVE' ? 'Room closed' : 'Join room'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-2 bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-6 shadow-2xs">
          {!room ? (
            <div className="py-24 text-center space-y-2">
              <Users className="w-8 h-8 text-[#6D28D9]/40 dark:text-[#8B5CF6]/40 mx-auto" />
              <p className="text-xs text-[#7B7484] dark:text-[#7A7480]">Join a room to start studying together.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
                <div>
                  <h2 className="font-serif text-3xl italic text-[#17151A] dark:text-[#F5F3F7]">{room.name}</h2>
                  <p className="text-xs text-[#7B7484] dark:text-[#7A7480] mt-1 font-sans">
                    {[room.subject, room.topic].filter(Boolean).join(' · ') || 'General study'}
                    {room.description ? ` — ${room.description}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {room.ownerId === currentUserId && room.status === 'ACTIVE' && (
                    <button type="button" disabled={busy} onClick={closeRoom} className={secondaryButtonClass}>
                      Close room
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={leaveRoom} className={secondaryButtonClass}>
                    <LogOut className="w-3.5 h-3.5" />Leave
                  </button>
                </div>
              </div>

              {detailError && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-xs font-mono text-red-800 dark:text-red-300">
                  {detailError}
                </div>
              )}

              <div className="flex gap-1.5 border-b border-[#EDE7F3] dark:border-[#302B35]">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      if (item.id !== 'DOUBTS') setSelectedDoubt(null);
                    }}
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                      tab === item.id && !selectedDoubt
                        ? 'border-[#6D28D9] dark:border-[#8B5CF6] text-[#6D28D9] dark:text-[#A78BFA]'
                        : 'border-transparent text-[#7B7484] dark:text-[#7A7480] hover:text-[#6D28D9] dark:hover:text-[#8B5CF6]'
                    }`}
                  >
                    {item.id === 'DOUBTS' && <HelpCircle className="w-3 h-3" />}
                    {item.label}
                    <span className="font-mono opacity-70">{item.badge}</span>
                  </button>
                ))}
              </div>

              {detailLoading && !detail ? (
                <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans py-10 text-center animate-pulse-soft">Loading room...</p>
              ) : !detail ? null : (
                <>
                  {tab === 'FOCUS' && (
                    <StudyRoomFocusPanel
                      room={detail.room}
                      session={detail.focusSession}
                      busy={busy}
                      onStart={(input) =>
                        runInRoom(async () => {
                          const session = await studyRoomApi.startFocusSession(detail.room.id, input);
                          afterSessionChange(session.id);
                          await reloadDetail(detail.room.id);
                        })
                      }
                      onJoin={() =>
                        runInRoom(async () => {
                          if (!detail.focusSession) return;
                          afterSessionChange(detail.focusSession.id);
                          await studyRoomApi.joinFocusSession(detail.room.id, detail.focusSession.id);
                          await reloadDetail(detail.room.id);
                        })
                      }
                      onLeave={() =>
                        runInRoom(async () => {
                          if (!detail.focusSession) return;
                          afterSessionChange(detail.focusSession.id);
                          await studyRoomApi.leaveFocusSession(detail.room.id, detail.focusSession.id);
                          await reloadDetail(detail.room.id);
                        })
                      }
                    />
                  )}

                  {tab === 'PEOPLE' && <StudyRoomPeoplePanel room={detail.room} members={detail.members} session={detail.focusSession} />}

                  {(tab === 'DOUBTS' || selectedDoubt) && (
                    <StudyRoomDoubtsPanel
                      doubts={detail.doubts}
                      currentUserId={currentUserId}
                      canPost={detail.room.status === 'ACTIVE'}
                      busy={busy}
                      selectedDoubt={selectedDoubt}
                      detailLoading={doubtLoading}
                      onSelectDoubt={openDoubt}
                      onClearDoubt={() => setSelectedDoubt(null)}
                      onCreate={(input) =>
                        runInRoom(async () => {
                          await studyRoomApi.createStudyDoubt(detail.room.id, input);
                          await reloadDetail(detail.room.id);
                        })
                      }
                      onAnswer={(content) =>
                        runInRoom(async () => {
                          if (!selectedDoubt) return;
                          await afterDoubtChange(await studyRoomApi.answerStudyDoubt(selectedDoubt.id, content));
                        })
                      }
                      onAcceptAnswer={(answerId) =>
                        runInRoom(async () => {
                          if (!selectedDoubt) return;
                          await afterDoubtChange(await studyRoomApi.acceptStudyDoubtAnswer(selectedDoubt.id, answerId));
                        })
                      }
                      onResolve={() =>
                        runInRoom(async () => {
                          if (!selectedDoubt) return;
                          await afterDoubtChange(await studyRoomApi.resolveStudyDoubt(selectedDoubt.id));
                        })
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
