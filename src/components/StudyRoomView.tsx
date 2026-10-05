import React, { useEffect, useMemo, useState } from 'react';
import { Send, Users, Play, Pause, LogOut, Plus, RefreshCw } from 'lucide-react';
import { StudyRoom, StudyRoomMember, StudyRoomMessage, StudyRoomSession } from '../types';

type RoomMessage = StudyRoomMessage & { senderId: string; createdAt: string };
type RoomDetails = { room: StudyRoom; members: StudyRoomMember[]; messages: RoomMessage[]; session: StudyRoomSession | null };

export const StudyRoomView: React.FC = () => {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [details, setDetails] = useState<RoomDetails | null>(null);
  const [roomName, setRoomName] = useState('');
  const [roomTopic, setRoomTopic] = useState('Algorithms');
  const [message, setMessage] = useState('');
  const [isQuestion, setIsQuestion] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionSeconds, setSessionSeconds] = useState(0);

  const loadRooms = async () => {
    const response = await fetch('/api/study-rooms');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load study rooms.');
    setRooms(data.rooms || []);
  };

  const loadDetails = async (roomId: string) => {
    if (!roomId) return;
    const response = await fetch(`/api/study-rooms/${roomId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load room.');
    setDetails(data);
  };

  useEffect(() => {
    void loadRooms().catch((loadError: any) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!selectedRoomId) return undefined;
    void loadDetails(selectedRoomId).catch((loadError: any) => setError(loadError.message));
    const interval = window.setInterval(() => { void loadDetails(selectedRoomId).catch(() => undefined); }, 3000);
    return () => window.clearInterval(interval);
  }, [selectedRoomId]);

  useEffect(() => {
    const session = details?.session;
    const update = () => {
      if (!session || session.status !== 'active') return;
      const elapsed = Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000);
      setSessionSeconds(Math.max(0, Math.min(session.durationMinutes * 60, elapsed)));
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [details?.session]);

  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId), [rooms, selectedRoomId]);
  const run = (operation: () => Promise<void>) => void operation().catch((operationError: any) => setError(operationError.message));
  const minutes = Math.floor(sessionSeconds / 60);
  const seconds = sessionSeconds % 60;

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/study-rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: roomName, topic: roomTopic }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create room.');
      setRoomName('');
      await loadRooms();
      setSelectedRoomId(data.room.id);
    } catch (createError: any) { setError(createError.message); } finally { setLoading(false); }
  };

  const joinRoom = async (roomId: string) => {
    const response = await fetch(`/api/study-rooms/${roomId}/join`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to join room.');
    await loadRooms();
    setSelectedRoomId(roomId);
  };

  const leaveRoom = async () => {
    if (!selectedRoomId) return;
    const response = await fetch(`/api/study-rooms/${selectedRoomId}/leave`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to leave room.');
    setSelectedRoomId('');
    setDetails(null);
    await loadRooms();
  };

  const updateSession = async (status: 'active' | 'paused' | 'stopped') => {
    if (!selectedRoomId) return;
    const response = await fetch(`/api/study-rooms/${selectedRoomId}/session`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, durationMinutes: 25 }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update shared timer.');
    setDetails((current) => current ? { ...current, session: data.session } : current);
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRoomId || !message.trim()) return;
    const response = await fetch(`/api/study-rooms/${selectedRoomId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message, isQuestion, topicTag: roomTopic }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to send message.');
    setMessage('');
    setIsQuestion(false);
    await loadDetails(selectedRoomId);
  };

  return <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">
    <div className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">Collaborative Focus Rooms</h1>
        <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-1.5 font-sans">Rooms, membership, reflections, and shared timers saved to your workspace.</p>
      </div>
      <button
        onClick={() => run(loadRooms)}
        className="rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] p-2.5 hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] text-[#6D28D9] dark:text-[#8B5CF6] transition-colors shadow-2xs"
        aria-label="Refresh rooms"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>

    {error && <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-xs font-mono text-red-800 dark:text-red-300">{error}</div>}

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-6 shadow-2xs">
        <div>
          <h2 className="font-sans text-sm font-semibold text-[#17151A] dark:text-[#F5F3F7]">Create a room</h2>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-1 font-sans">Host a focused session with peers</p>
        </div>
        <form onSubmit={createRoom} className="space-y-3">
          <input
            required
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="Room name"
            className="w-full rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-3 text-xs text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#7A7480] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors"
          />
          <input
            value={roomTopic}
            onChange={(event) => setRoomTopic(event.target.value)}
            placeholder="Topic"
            className="w-full rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-3 text-xs text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#7A7480] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors"
          />
          <button
            disabled={loading}
            className="w-full bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg p-2.5 text-xs font-medium tracking-wider transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-white/80" />Create room
          </button>
        </form>

        <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-5 space-y-3">
          <h2 className="font-sans text-sm font-semibold text-[#17151A] dark:text-[#F5F3F7]">Browse rooms</h2>
          {rooms.length === 0 && <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans">No rooms yet.</p>}
          {rooms.map((room) => (
            <div key={room.id} className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-4 space-y-2 bg-[#FAF8FC] dark:bg-[#1D1A21] hover:border-[#D8CCE8] dark:hover:border-[#3E344A] transition-colors">
              <div className="flex justify-between gap-3">
                <strong className="text-xs text-[#17151A] dark:text-[#F5F3F7] truncate">{room.name}</strong>
                <span className="text-[10px] text-[#6D28D9] dark:text-[#A78BFA] font-medium shrink-0">{room.memberCount} member{room.memberCount === 1 ? '' : 's'}</span>
              </div>
              <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans">{room.topic} · hosted by {room.ownerName}</p>
              {room.joined ? (
                <button
                  onClick={() => setSelectedRoomId(room.id)}
                  className="w-full rounded-lg border border-[#6D28D9] dark:border-[#8B5CF6] bg-white dark:bg-[#17151A] text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] p-2 text-xs font-medium tracking-wider transition-colors"
                >
                  Enter room
                </button>
              ) : (
                <button
                  onClick={() => run(() => joinRoom(room.id))}
                  className="w-full rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white p-2 text-xs font-medium tracking-wider transition-colors shadow-2xs"
                >
                  Join room
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="lg:col-span-2 bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-6 shadow-2xs">
        {!selectedRoom || !details ? (
          <div className="py-24 text-center text-xs text-[#7B7484] dark:text-[#7A7480]">
            <Users className="w-8 h-8 text-[#6D28D9]/40 dark:text-[#8B5CF6]/40 mx-auto mb-3" />
            Create or join a room on the left to begin studying together.
          </div>
        ) : <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
            <div>
              <h2 className="font-serif text-3xl italic text-[#17151A] dark:text-[#F5F3F7]">{selectedRoom.name}</h2>
              <p className="text-xs text-[#7B7484] dark:text-[#7A7480] mt-1 font-sans">{selectedRoom.topic} · {details.members.length} participant{details.members.length === 1 ? '' : 's'}</p>
            </div>
            <button
              onClick={() => run(leaveRoom)}
              className="rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] px-3 py-1.5 text-xs text-[#7B7484] dark:text-[#7A7480] hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/50 transition-colors self-start sm:self-auto flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />Leave
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">Participants</div>
              <div className="mt-3 space-y-2">
                {details.members.map((member) => (
                  <div key={member.id} className="text-xs flex justify-between items-center py-1">
                    <span className="text-[#17151A] dark:text-[#F5F3F7] font-medium">{member.displayName || member.email}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium ${member.id === selectedRoom.ownerId ? 'bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA]' : 'text-[#7B7484] dark:text-[#7A7480]'}`}>
                      {member.id === selectedRoom.ownerId ? 'Host' : 'Member'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#6D28D9] dark:border-[#8B5CF6] bg-[#6D28D9] dark:bg-[#1D1A21] text-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/80 dark:text-[#A78BFA]">Shared focus timer</div>
                <div className="font-mono text-4xl mt-3 font-bold tracking-tight text-white">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div>
              </div>
              <div className="flex gap-2 mt-4">
                {details.session?.status === 'active' ? (
                  <button
                    onClick={() => run(() => updateSession('paused'))}
                    className="rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 px-3.5 py-1.5 text-xs font-medium tracking-wider text-white transition-colors flex items-center gap-1"
                  >
                    <Pause className="w-3 h-3" />Pause
                  </button>
                ) : (
                  <button
                    onClick={() => run(() => updateSession('active'))}
                    className="rounded-lg bg-white text-[#6D28D9] hover:bg-[#FAF8FC] px-3.5 py-1.5 text-xs font-medium tracking-wider transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <Play className="w-3 h-3 fill-current" />Start
                  </button>
                )}
                <button
                  onClick={() => run(() => updateSession('stopped'))}
                  className="rounded-lg border border-white/20 hover:bg-white/10 px-3.5 py-1.5 text-xs font-medium tracking-wider text-white/80 transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-4 bg-white dark:bg-[#17151A]">
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {details.messages.map((item) => (
                <div key={item.id} className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-3 last:border-0">
                  <div className="flex justify-between text-[10px] font-medium">
                    <span className="text-[#6D28D9] dark:text-[#A78BFA]">{item.senderName}</span>
                    <span className="text-[#7B7484] dark:text-[#7A7480]">{new Date(item.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs mt-1 text-[#17151A] dark:text-[#F5F3F7]">
                    {item.isQuestion && <span className="inline-block bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA] px-1.5 py-0.5 rounded text-[9px] font-medium mr-2 uppercase tracking-wide">Question</span>}
                    {item.text}
                  </p>
                </div>
              ))}
              {details.messages.length === 0 && <p className="text-xs text-[#7B7484] dark:text-[#7A7480] py-4 text-center font-sans">No messages yet. Say hello!</p>}
            </div>

            <form onSubmit={sendMessage} className="border-t border-[#EDE7F3] dark:border-[#302B35] mt-4 pt-4 space-y-3">
              <label className="text-[10px] font-medium uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480] flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isQuestion}
                  onChange={(event) => setIsQuestion(event.target.checked)}
                  className="mr-2 accent-[#6D28D9] dark:accent-[#8B5CF6] rounded"
                />
                Mark as question
              </label>
              <div className="flex gap-2">
                <input
                  required
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Send a room message..."
                  className="flex-1 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-2.5 text-xs text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#7A7480] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors"
                />
                <button
                  className="bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg px-4 flex items-center justify-center transition-colors shadow-xs"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </form>
          </div>
        </>}
      </section>
    </div>
  </div>;
};
