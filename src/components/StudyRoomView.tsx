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

  return <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-8 animate-fade-in">
    <div className="border-b border-black pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div><div className="inline-flex items-center gap-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold"><Users className="w-3.5 h-3.5" /> Persistent Study Room</div><h1 className="font-serif text-5xl italic mt-3">Study together, for real.</h1><p className="text-xs text-black/60 mt-2">Rooms, membership, chat, and shared focus state are saved to your account.</p></div>
      <button onClick={() => run(loadRooms)} className="border border-black p-3 hover:bg-black hover:text-white" aria-label="Refresh rooms"><RefreshCw className="w-4 h-4" /></button>
    </div>
    {error && <div className="border border-red-400 bg-red-50 p-4 text-xs text-red-800">{error}</div>}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="border border-black p-5 space-y-5">
        <h2 className="font-serif text-2xl italic">Create a room</h2>
        <form onSubmit={createRoom} className="space-y-3"><input required value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" className="w-full border border-black p-3 text-xs" /><input value={roomTopic} onChange={(event) => setRoomTopic(event.target.value)} placeholder="Topic" className="w-full border border-black p-3 text-xs" /><button disabled={loading} className="w-full bg-black text-white p-3 text-[10px] font-bold uppercase tracking-widest"><Plus className="inline w-4 h-4 mr-2" />Create room</button></form>
        <div className="border-t border-black pt-5 space-y-3"><h2 className="font-serif text-2xl italic">Browse rooms</h2>{rooms.length === 0 && <p className="text-xs text-black/50">No rooms yet.</p>}{rooms.map((room) => <div key={room.id} className="border border-black p-3 space-y-2"><div className="flex justify-between gap-3"><strong className="text-xs">{room.name}</strong><span className="text-[10px]">{room.memberCount} member{room.memberCount === 1 ? '' : 's'}</span></div><p className="text-[10px] text-black/60">{room.topic} · hosted by {room.ownerName}</p>{room.joined ? <button onClick={() => setSelectedRoomId(room.id)} className="w-full border border-black p-2 text-[10px] font-bold uppercase">Enter room</button> : <button onClick={() => run(() => joinRoom(room.id))} className="w-full bg-black text-white p-2 text-[10px] font-bold uppercase">Join room</button>}</div>)}</div>
      </section>
      <section className="lg:col-span-2 border border-black p-5 space-y-5">
        {!selectedRoom || !details ? <div className="py-20 text-center text-xs text-black/50">Create or join a room to begin.</div> : <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black pb-4"><div><h2 className="font-serif text-3xl italic">{selectedRoom.name}</h2><p className="text-xs text-black/60">{selectedRoom.topic} · {details.members.length} participant{details.members.length === 1 ? '' : 's'}</p></div><button onClick={() => run(leaveRoom)} className="border border-black px-3 py-2 text-[10px] font-bold uppercase"><LogOut className="inline w-3.5 h-3.5 mr-1" />Leave</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="border border-black bg-[#F8F7F2] p-4"><div className="text-[10px] font-bold uppercase tracking-widest">Participants</div><div className="mt-3 space-y-2">{details.members.map((member) => <div key={member.id} className="text-xs flex justify-between"><span>{member.displayName || member.email}</span><span className="text-black/40">{member.id === selectedRoom.ownerId ? 'Host' : 'Member'}</span></div>)}</div></div><div className="border border-black bg-black text-white p-4"><div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Shared focus timer</div><div className="font-mono text-4xl mt-3">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div><div className="flex gap-2 mt-3">{details.session?.status === 'active' ? <button onClick={() => run(() => updateSession('paused'))} className="border border-white px-3 py-2 text-[10px] uppercase"><Pause className="inline w-3 h-3 mr-1" />Pause</button> : <button onClick={() => run(() => updateSession('active'))} className="border border-white px-3 py-2 text-[10px] uppercase"><Play className="inline w-3 h-3 mr-1" />Start</button>}<button onClick={() => run(() => updateSession('stopped'))} className="border border-white/50 px-3 py-2 text-[10px] uppercase">Stop</button></div></div></div>
          <div className="border border-black p-4"><div className="space-y-3 max-h-80 overflow-y-auto">{details.messages.map((item) => <div key={item.id} className="border-b border-black/10 pb-3"><div className="flex justify-between text-[10px] font-bold"><span>{item.senderName}</span><span className="text-black/40">{new Date(item.createdAt).toLocaleTimeString()}</span></div><p className="text-xs mt-1">{item.isQuestion && <strong className="mr-2">Question</strong>}{item.text}</p></div>)}{details.messages.length === 0 && <p className="text-xs text-black/50">No messages yet.</p>}</div><form onSubmit={sendMessage} className="border-t border-black mt-4 pt-4 space-y-3"><label className="text-[10px] font-bold uppercase tracking-widest"><input type="checkbox" checked={isQuestion} onChange={(event) => setIsQuestion(event.target.checked)} className="mr-2" />Mark as question</label><div className="flex gap-2"><input required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Send a room message" className="flex-1 border border-black p-3 text-xs" /><button className="bg-black text-white px-4" aria-label="Send message"><Send className="w-4 h-4" /></button></div></form></div>
        </>}
      </section>
    </div>
  </div>;
};
