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

  return <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">
    <div className="border-b border-[#EDE7F3] pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[9px] uppercase tracking-[0.2em] font-bold text-[#461599]">
          <Users className="w-3.5 h-3.5 text-[#5E35B1]" /> Persistent Study Room
        </div>
        <h1 className="font-serif text-5xl italic mt-3 text-[#1C1B1F]">Study together, for real.</h1>
        <p className="text-xs text-[#7B7484] mt-2">Rooms, membership, chat, and shared focus state are saved to your account.</p>
      </div>
      <button
        onClick={() => run(loadRooms)}
        className="rounded-xl border border-[#EDE7F3] bg-white p-3 hover:bg-[#FAF8FC] text-[#5E35B1] transition-colors shadow-2xs"
        aria-label="Refresh rooms"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-mono text-red-800">{error}</div>}

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-6 shadow-2xs">
        <div>
          <h2 className="font-serif text-2xl italic text-[#1C1B1F]">Create a room</h2>
          <p className="text-xs text-[#7B7484] mt-1">Host a dedicated session with peers</p>
        </div>
        <form onSubmit={createRoom} className="space-y-3">
          <input
            required
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="Room name"
            className="w-full rounded-xl border border-[#EDE7F3] bg-white p-3 text-xs text-[#1C1B1F] placeholder-[#A49AA9] focus:outline-none focus:border-[#5E35B1] focus:ring-2 focus:ring-[#5E35B1]/10 transition-all"
          />
          <input
            value={roomTopic}
            onChange={(event) => setRoomTopic(event.target.value)}
            placeholder="Topic"
            className="w-full rounded-xl border border-[#EDE7F3] bg-white p-3 text-xs text-[#1C1B1F] placeholder-[#A49AA9] focus:outline-none focus:border-[#5E35B1] focus:ring-2 focus:ring-[#5E35B1]/10 transition-all"
          />
          <button
            disabled={loading}
            className="w-full bg-[#5E35B1] hover:bg-[#461599] text-white rounded-xl p-3 text-[10px] font-bold uppercase tracking-widest transition-all shadow-xs hover:shadow active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-[#CEB8FF]" />Create room
          </button>
        </form>

        <div className="border-t border-[#EDE7F3] pt-5 space-y-3">
          <h2 className="font-serif text-2xl italic text-[#1C1B1F]">Browse rooms</h2>
          {rooms.length === 0 && <p className="text-xs text-[#7B7484]">No rooms yet.</p>}
          {rooms.map((room) => (
            <div key={room.id} className="rounded-xl border border-[#EDE7F3] p-4 space-y-2 bg-[#FAF8FC] hover:border-[#D8CCE8] transition-colors">
              <div className="flex justify-between gap-3">
                <strong className="text-xs text-[#1C1B1F] truncate">{room.name}</strong>
                <span className="text-[10px] text-[#5E35B1] font-bold shrink-0">{room.memberCount} member{room.memberCount === 1 ? '' : 's'}</span>
              </div>
              <p className="text-[10px] text-[#7B7484]">{room.topic} · hosted by {room.ownerName}</p>
              {room.joined ? (
                <button
                  onClick={() => setSelectedRoomId(room.id)}
                  className="w-full rounded-lg border border-[#5E35B1] bg-white text-[#5E35B1] hover:bg-[#EDE7F6] p-2 text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  Enter room
                </button>
              ) : (
                <button
                  onClick={() => run(() => joinRoom(room.id))}
                  className="w-full rounded-lg bg-[#5E35B1] hover:bg-[#461599] text-white p-2 text-[10px] font-bold uppercase tracking-wider transition-colors shadow-2xs"
                >
                  Join room
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="lg:col-span-2 bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-6 shadow-2xs">
        {!selectedRoom || !details ? (
          <div className="py-24 text-center text-xs text-[#7B7484]">
            <Users className="w-8 h-8 text-[#D8CCE8] mx-auto mb-3" />
            Create or join a room on the left to begin studying together.
          </div>
        ) : <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDE7F3] pb-4">
            <div>
              <h2 className="font-serif text-3xl italic text-[#1C1B1F]">{selectedRoom.name}</h2>
              <p className="text-xs text-[#7B7484] mt-1">{selectedRoom.topic} · {details.members.length} participant{details.members.length === 1 ? '' : 's'}</p>
            </div>
            <button
              onClick={() => run(leaveRoom)}
              className="rounded-xl border border-[#EDE7F3] bg-white px-3 py-2 text-[10px] font-bold uppercase text-[#7B7484] hover:text-red-700 hover:border-red-200 transition-colors self-start sm:self-auto flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />Leave
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484]">Participants</div>
              <div className="mt-3 space-y-2">
                {details.members.map((member) => (
                  <div key={member.id} className="text-xs flex justify-between items-center py-1">
                    <span className="text-[#1C1B1F] font-medium">{member.displayName || member.email}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${member.id === selectedRoom.ownerId ? 'bg-[#EDE7F6] text-[#461599]' : 'text-[#7B7484]'}`}>
                      {member.id === selectedRoom.ownerId ? 'Host' : 'Member'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#461599] bg-[#461599] text-white p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#CEB8FF]">Shared focus timer</div>
                <div className="font-mono text-4xl mt-3 font-bold tracking-tight text-white">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div>
              </div>
              <div className="flex gap-2 mt-4">
                {details.session?.status === 'active' ? (
                  <button
                    onClick={() => run(() => updateSession('paused'))}
                    className="rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 px-3.5 py-1.5 text-[10px] uppercase font-bold tracking-wider text-white transition-colors flex items-center gap-1"
                  >
                    <Pause className="w-3 h-3" />Pause
                  </button>
                ) : (
                  <button
                    onClick={() => run(() => updateSession('active'))}
                    className="rounded-lg bg-white text-[#461599] hover:bg-[#EDE7F6] px-3.5 py-1.5 text-[10px] uppercase font-bold tracking-wider transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <Play className="w-3 h-3 fill-current" />Start
                  </button>
                )}
                <button
                  onClick={() => run(() => updateSession('stopped'))}
                  className="rounded-lg border border-white/20 hover:bg-white/10 px-3.5 py-1.5 text-[10px] uppercase font-bold tracking-wider text-[#EDE7F6] transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#EDE7F3] p-4 bg-white">
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {details.messages.map((item) => (
                <div key={item.id} className="border-b border-[#EDE7F3] pb-3 last:border-0">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-[#461599]">{item.senderName}</span>
                    <span className="text-[#7B7484]">{new Date(item.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs mt-1 text-[#1C1B1F]">
                    {item.isQuestion && <span className="inline-block bg-[#EDE7F6] text-[#461599] px-1.5 py-0.5 rounded text-[9px] font-bold mr-2 uppercase tracking-wide">Question</span>}
                    {item.text}
                  </p>
                </div>
              ))}
              {details.messages.length === 0 && <p className="text-xs text-[#7B7484] py-4 text-center">No messages yet. Say hello!</p>}
            </div>

            <form onSubmit={sendMessage} className="border-t border-[#EDE7F3] mt-4 pt-4 space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isQuestion}
                  onChange={(event) => setIsQuestion(event.target.checked)}
                  className="mr-2 accent-[#5E35B1] rounded"
                />
                Mark as question
              </label>
              <div className="flex gap-2">
                <input
                  required
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Send a room message..."
                  className="flex-1 rounded-xl border border-[#EDE7F3] bg-white p-3 text-xs text-[#1C1B1F] placeholder-[#A49AA9] focus:outline-none focus:border-[#5E35B1] focus:ring-2 focus:ring-[#5E35B1]/10 transition-all"
                />
                <button
                  className="bg-[#5E35B1] hover:bg-[#461599] text-white rounded-xl px-4 flex items-center justify-center transition-all shadow-xs active:scale-95"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4 text-[#CEB8FF]" />
                </button>
              </div>
            </form>
          </div>
        </>}
      </section>
    </div>
  </div>;
};
