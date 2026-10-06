import React, { useState } from 'react';
import { Check, CheckCircle2, ChevronLeft, HelpCircle, Send } from 'lucide-react';
import type { StudyDoubt } from '../../types';
import { formatRelativeTime } from './studyRoomFormat';

const inputClass =
  'w-full rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-2.5 text-xs text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#7A7480] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors';
const primaryButtonClass =
  'bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg px-4 py-2.5 text-xs font-medium tracking-wider transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2';
const secondaryButtonClass =
  'rounded-lg border border-[#6D28D9] dark:border-[#8B5CF6] bg-white dark:bg-[#17151A] text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] px-4 py-2.5 text-xs font-medium tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2';
const ghostButtonClass =
  'rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] px-3 py-1.5 text-xs text-[#7B7484] dark:text-[#7A7480] hover:border-[#D8CCE8] dark:hover:border-[#3E344A] transition-colors disabled:opacity-50 flex items-center gap-1.5';

interface Props {
  doubts: StudyDoubt[];
  currentUserId: string;
  canPost: boolean;
  busy: boolean;
  selectedDoubt: StudyDoubt | null;
  detailLoading: boolean;
  onSelectDoubt: (doubtId: string) => void;
  onClearDoubt: () => void;
  onCreate: (input: { title: string; content: string }) => Promise<void>;
  onAnswer: (content: string) => Promise<void>;
  onAcceptAnswer: (answerId: string) => Promise<void>;
  onResolve: () => Promise<void>;
}

const DoubtCard: React.FC<{ doubt: StudyDoubt; onOpen: () => void }> = ({ doubt, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="w-full text-left rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-4 space-y-2 hover:border-[#D8CCE8] dark:hover:border-[#3E344A] transition-colors"
  >
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${
        doubt.status === 'OPEN' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${doubt.status === 'OPEN' ? 'bg-red-500' : 'bg-emerald-500'}`} />
      {doubt.status === 'OPEN' ? 'Open' : 'Resolved'}
    </span>
    <p className="text-sm font-medium text-[#17151A] dark:text-[#F5F3F7] leading-snug">{doubt.title}</p>
    <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans">
      {doubt.authorName} · {doubt.answerCount} {doubt.answerCount === 1 ? 'answer' : 'answers'} · {formatRelativeTime(doubt.createdAt)}
    </p>
  </button>
);

/**
 * Doubts are the room's discussion surface: one question, a small set of answers, and a single
 * accepted answer. There is no chat stream here on purpose - a room should hold the questions that
 * are actually blocking someone.
 */
export const StudyRoomDoubtsPanel: React.FC<Props> = ({
  doubts,
  currentUserId,
  canPost,
  busy,
  selectedDoubt,
  detailLoading,
  onSelectDoubt,
  onClearDoubt,
  onCreate,
  onAnswer,
  onAcceptAnswer,
  onResolve,
}) => {
  const [asking, setAsking] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [answer, setAnswer] = useState('');

  if (selectedDoubt) {
    const isAuthor = selectedDoubt.userId === currentUserId;
    return (
      <div className="space-y-5">
        <button type="button" onClick={onClearDoubt} className={ghostButtonClass}>
          <ChevronLeft className="w-3.5 h-3.5" />All doubts
        </button>

        <div className="space-y-2">
          <span
            className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${
              selectedDoubt.status === 'OPEN' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${selectedDoubt.status === 'OPEN' ? 'bg-red-500' : 'bg-emerald-500'}`} />
            {selectedDoubt.status === 'OPEN' ? 'Open' : 'Resolved'}
          </span>
          <h3 className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7] leading-snug">{selectedDoubt.title}</h3>
          <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans">
            Asked by {selectedDoubt.authorName} · {formatRelativeTime(selectedDoubt.createdAt)}
          </p>
          <p className="text-xs text-[#17151A] dark:text-[#F5F3F7] whitespace-pre-wrap leading-relaxed pt-1">{selectedDoubt.content}</p>
          {isAuthor && selectedDoubt.status === 'OPEN' && (
            <button type="button" disabled={busy} onClick={() => void onResolve()} className={ghostButtonClass}>
              <Check className="w-3.5 h-3.5" />Mark resolved
            </button>
          )}
        </div>

        <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">
            Answers ({selectedDoubt.answerCount})
          </p>
          {detailLoading ? (
            <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans">Loading answers...</p>
          ) : selectedDoubt.answers.length === 0 ? (
            <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans">No answers yet. Be the first to help.</p>
          ) : (
            <ul className="space-y-3">
              {selectedDoubt.answers.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-xl border p-4 space-y-1.5 ${
                    item.isAccepted
                      ? 'border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20'
                      : 'border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-[#17151A] dark:text-[#F5F3F7]">{item.authorName}</span>
                    {item.isAccepted ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />Accepted answer
                      </span>
                    ) : isAuthor && canPost ? (
                      <button type="button" disabled={busy} onClick={() => void onAcceptAnswer(item.id)} className="text-[9px] uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480] hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50">
                        Accept
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-[#17151A] dark:text-[#F5F3F7] whitespace-pre-wrap leading-relaxed">{item.content}</p>
                  <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans">{formatRelativeTime(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canPost ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!answer.trim()) return;
              void onAnswer(answer).then(() => setAnswer(''));
            }}
            className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4 space-y-2"
          >
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={3}
              placeholder="Write an answer..."
              aria-label="Your answer"
              className={inputClass}
            />
            <button type="submit" disabled={busy || !answer.trim()} className={primaryButtonClass}>
              <Send className="w-3.5 h-3.5" />{busy ? 'Posting...' : 'Post answer'}
            </button>
          </form>
        ) : (
          <p className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4 text-xs text-[#7B7484] dark:text-[#7A7480] font-sans">
            This room is closed, so new answers are turned off.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">
          Doubts ({doubts.length})
        </p>
        {canPost && !asking && (
          <button type="button" onClick={() => setAsking(true)} className={secondaryButtonClass}>
            <HelpCircle className="w-3.5 h-3.5" />Ask a doubt
          </button>
        )}
      </div>

      {asking && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate({ title, content }).then(() => {
              setAsking(false);
              setTitle('');
              setContent('');
            });
          }}
          className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-4 space-y-2"
        >
          <input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            aria-label="Doubt title"
            className={inputClass}
          />
          <textarea
            required
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            placeholder="What are you stuck on?"
            aria-label="Your question"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !title.trim() || !content.trim()} className={primaryButtonClass}>
              {busy ? 'Posting...' : 'Post doubt'}
            </button>
            <button type="button" onClick={() => setAsking(false)} className={ghostButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {doubts.length === 0 ? (
        <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans py-10 text-center">
          No doubts here yet. Ask the first one when something does not click.
        </p>
      ) : (
        <div className="space-y-3">
          {doubts.map((doubt) => (
            <DoubtCard key={doubt.id} doubt={doubt} onOpen={() => onSelectDoubt(doubt.id)} />
          ))}
        </div>
      )}
    </div>
  );
};