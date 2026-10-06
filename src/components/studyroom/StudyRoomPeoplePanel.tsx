import React from 'react';
import type { FocusSession, StudyRoom, StudyRoomMember } from '../../types';

const stateStyles: Record<StudyRoomMember['state'], { dot: string; label: string; text: string }> = {
  FOCUSING: { dot: 'bg-emerald-500', label: 'Focusing', text: 'text-emerald-600 dark:text-emerald-400' },
  ON_BREAK: { dot: 'bg-amber-400', label: 'On break', text: 'text-amber-600 dark:text-amber-400' },
  IN_ROOM: { dot: 'bg-[#C4BDD0] dark:bg-[#4B4454]', label: 'In room', text: 'text-[#7B7484] dark:text-[#7A7480]' },
};

/** Minutes elapsed in the current session for someone who is focusing right now. */
function focusedMinutes(session: FocusSession | null, memberId: string): number | null {
  if (!session) return null;
  const participant = session.participants.find((item) => item.userId === memberId);
  if (!participant) return null;
  const joinedAt = Date.parse(participant.joinedAt);
  if (!Number.isFinite(joinedAt)) return null;
  return Math.max(0, Math.round((Date.parse(session.endsAt) - joinedAt) / 60000));
}

interface Props {
  room: StudyRoom;
  members: StudyRoomMember[];
  session: FocusSession | null;
}

/**
 * A deliberately small roster. Membership, session participation, and the focus/break phase are
 * separate facts, so each row states which one it is showing instead of implying everything.
 */
export const StudyRoomPeoplePanel: React.FC<Props> = ({ room, members, session }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">People studying</p>
      <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] font-mono">
        {members.length} / {room.maxParticipants}
      </p>
    </div>

    {members.length === 0 ? (
      <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans py-8 text-center">Nobody else has joined this room yet.</p>
    ) : (
      <ul className="divide-y divide-[#EDE7F3] dark:divide-[#302B35]">
        {members.map((member) => {
          const style = stateStyles[member.state];
          const minutes = member.state === 'FOCUSING' ? focusedMinutes(session, member.id) : null;
          return (
            <li key={member.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                <span className="text-xs text-[#17151A] dark:text-[#F5F3F7] truncate">{member.displayName}</span>
                {member.isHost && (
                  <span className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA] font-medium">
                    Host
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium shrink-0 ${style.text}`}>
                {member.state === 'FOCUSING' && minutes !== null ? `${minutes} min` : style.label}
              </span>
            </li>
          );
        })}
      </ul>
    )}

    <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[10px] text-[#7B7484] dark:text-[#7A7480] font-sans">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Focusing in this session
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />On break in this session
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#C4BDD0] dark:bg-[#4B4454]" />In the room, not in the session
      </span>
    </div>
  </div>
);