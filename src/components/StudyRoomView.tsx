import React, { useState } from 'react';
import { PeerUser, StudyRoomMessage } from '../types';
import { Users, ThumbsUp, Send, Share2 } from 'lucide-react';

interface StudyRoomViewProps {
  peers: PeerUser[];
  messages: StudyRoomMessage[];
  onSendMessage: (msg: StudyRoomMessage) => void;
}

export const StudyRoomView: React.FC<StudyRoomViewProps> = ({ peers, messages, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const [selectedTopicTag, setSelectedTopicTag] = useState('Graph Algorithms');
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: StudyRoomMessage = {
      id: `msg-${Date.now()}`,
      senderName: 'You',
      senderAvatar: '',
      timestamp: 'Just now',
      text: inputText,
      isQuestion: isAskingQuestion,
      topicTag: selectedTopicTag,
      upvotes: 0,
    };

    onSendMessage(newMsg);
    setInputText('');
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-black pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Collaborative Peer Sanctuary</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            Study Room Prototype
          </h1>
          <p className="text-xs text-black/70 mt-2 max-w-xl font-sans">
            Connect with classmates, share practice solutions, solve conceptual bottlenecks, and run synchronized group focus timers.
          </p>
        </div>

        <button 
          onClick={() => alert('Study Room Invite Link copied: https://lazylift.ai/room/cs301-algorithms')}
          className="border border-black bg-black text-white hover:bg-white hover:text-black px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors self-start md:self-auto flex items-center space-x-2"
        >
          <Share2 className="w-3.5 h-3.5 text-white group-hover:text-black" />
          <span>Invite Classmate</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Active Peers Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Active Room Members */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-black pb-3">
              <h3 className="font-serif text-2xl italic font-normal text-black">
                Active Peers ({peers.length})
              </h3>
              <span className="w-2.5 h-2.5 bg-black"></span>
            </div>

            <div className="space-y-3">
              {peers.map((p) => (
                <div key={p.id} className="bg-white border border-black p-4 flex items-center space-x-3">
                  <img
                    src={p.avatarUrl}
                    alt={p.name}
                    className="w-10 h-10 border border-black object-cover"
                  />
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-serif italic text-black truncate">{p.name}</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest border border-black px-1.5 py-0.5 text-black">
                        {p.status}
                      </span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-black/60 truncate">{p.currentTopic}</div>
                    <div className="text-[9px] text-black/40 font-mono mt-0.5">{p.focusDurationMin}m deep streak</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shared Synchronized Group Focus Timer */}
          <div className="bg-black text-white border border-black p-8 text-center space-y-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/70 font-bold">
              Prototype Shared Timer
            </div>
            <div className="font-serif text-5xl italic font-normal tracking-tight text-white">
              25:00
            </div>
            <p className="text-[10px] text-white/60 font-mono pt-1">
              {peers.length} peer{peers.length === 1 ? '' : 's'} currently listed
            </p>
          </div>
        </div>

        {/* Discussion Board & Answer Feed (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Messages list */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-6">
            <h3 className="font-serif text-3xl italic font-normal text-black border-b border-black pb-4">
              Peer Discussion &amp; Query Board
            </h3>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-5 border space-y-3 transition-all ${
                    m.isQuestion
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={m.senderAvatar}
                        alt={m.senderName}
                        className="w-8 h-8 object-cover border border-current"
                      />
                      <div>
                        <span className="text-xs font-serif italic font-normal">{m.senderName}</span>
                        <span className="text-[9px] opacity-60 ml-2 font-mono uppercase tracking-widest">{m.timestamp}</span>
                      </div>
                    </div>

                    {m.topicTag && (
                      <span className={`text-[8px] font-bold uppercase tracking-widest border px-2 py-0.5 ${
                        m.isQuestion ? 'border-white text-white' : 'border-black text-black'
                      }`}>
                        {m.topicTag}
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed font-sans">
                    {m.text}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-current/20">
                    <button
                      onClick={() => alert(`Upvoted discussion response from ${m.senderName}`)}
                      className="inline-flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-widest opacity-80 hover:opacity-100 transition-opacity"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{m.upvotes || 0} Upvotes</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Post message/query form */}
            <form onSubmit={handleSend} className="space-y-4 pt-4 border-t border-black">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <label className="flex items-center space-x-2 cursor-pointer text-[10px] font-bold uppercase tracking-[0.2em] text-black">
                  <input
                    type="checkbox"
                    checked={isAskingQuestion}
                    onChange={(e) => setIsAskingQuestion(e.target.checked)}
                    className="accent-black"
                  />
                  <span>Mark as Question / Need Help</span>
                </label>

                <select
                  value={selectedTopicTag}
                  onChange={(e) => setSelectedTopicTag(e.target.value)}
                  className="bg-white border border-black/40 px-3 py-1.5 text-xs text-black font-sans focus:outline-none focus:border-black"
                >
                  <option value="Graph Algorithms">Graph Algorithms</option>
                  <option value="Dynamic Programming">Dynamic Programming</option>
                  <option value="Big O Analysis">Big O Analysis</option>
                  <option value="Heap Operations">Heap Operations</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Share a solution, ask a question, or discuss a past paper problem..."
                  className="flex-1 bg-white border border-black/30 px-4 py-3 text-xs text-black focus:outline-none focus:border-black font-sans"
                />
                <button
                  type="submit"
                  className="bg-black text-white hover:bg-white hover:text-black border border-black px-6 py-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center space-x-2 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post</span>
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>

    </div>
  );
};

