import React, { useState } from 'react';
import { LMSCourse } from '../types';
import { GraduationCap, RefreshCw, CheckCircle2, Link2, Loader2, Sparkles } from 'lucide-react';

interface LMSIntegrationViewProps {
  courses: LMSCourse[];
  onSync: () => void;
}

export const LMSIntegrationView: React.FC<LMSIntegrationViewProps> = ({ courses, onSync }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [connectedPlatform, setConnectedPlatform] = useState<string>('Canvas');

  const handleRunSync = () => {
    setIsSyncing(true);
    setSyncSuccess(false);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncSuccess(true);
      onSync();
      setTimeout(() => setSyncSuccess(false), 4000);
    }, 1500);
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in pb-16">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#EDE7F3] pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[9px] uppercase tracking-[0.2em] font-bold text-[#461599] mb-3">
            <GraduationCap className="w-3.5 h-3.5 text-[#5E35B1]" />
            <span>Learning Management System Bridge</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-[#1C1B1F]">
            LMS Integration &amp; Course Sync
          </h1>
          <p className="text-xs text-[#7B7484] mt-2 max-w-xl font-sans">
            Seamlessly import course syllabi, assignment schedules, and official exam dates from Canvas, Moodle, Blackboard, and Google Classroom.
          </p>
        </div>

        <button
          onClick={handleRunSync}
          disabled={isSyncing}
          className="bg-[#5E35B1] hover:bg-[#461599] text-white px-6 py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-xs hover:shadow active:scale-98 disabled:opacity-50 self-start md:self-auto flex items-center space-x-2"
        >
          {isSyncing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#CEB8FF]" />
              <span>Syncing with {connectedPlatform}...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 text-[#CEB8FF]" />
              <span>Sync LMS Data Now</span>
            </>
          )}
        </button>
      </div>

      {syncSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-sans flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Successfully synchronized syllabus and assignment deadlines from {connectedPlatform} LMS!</span>
        </div>
      )}

      {/* Platform Connect Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['Canvas', 'Moodle', 'Blackboard', 'Google Classroom'].map((platform) => {
          const isConnected = connectedPlatform === platform;
          return (
            <div
              key={platform}
              onClick={() => setConnectedPlatform(platform)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer text-center space-y-3 shadow-2xs ${
                isConnected
                  ? 'bg-[#EDE7F6] border-[#5E35B1] text-[#461599]'
                  : 'bg-white text-[#1C1B1F] border-[#EDE7F3] hover:border-[#D8CCE8]'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl font-bold text-xs mx-auto flex items-center justify-center transition-colors ${
                isConnected ? 'bg-[#5E35B1] text-white shadow-2xs' : 'bg-[#FAF8FC] text-[#55524E] border border-[#EDE7F3]'
              }`}>
                {platform[0]}
              </div>
              <div className="text-xs font-serif italic font-bold">{platform}</div>
              <span className={`text-[8px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full inline-block ${
                isConnected
                  ? 'bg-[#5E35B1] text-white'
                  : 'bg-[#FAF8FC] text-[#7B7484] border border-[#EDE7F3]'
              }`}>
                {isConnected ? 'Connected' : 'Available'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Synced Courses & Syllabus Extraction Status */}
      <div className="space-y-6">
        <h2 className="font-serif text-3xl italic font-normal text-[#1C1B1F]">
          Synchronized University Courses ({courses.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {courses.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-5 flex flex-col justify-between shadow-2xs">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] bg-[#EDE7F6] text-[#461599] border border-[#D8CCE8] px-3 py-1 rounded-lg">
                    {c.courseCode}
                  </span>
                  <span className="text-[10px] font-mono text-[#7B7484]">{c.platform}</span>
                </div>

                <div>
                  <h3 className="font-serif text-2xl italic font-normal text-[#1C1B1F] leading-snug">
                    {c.courseName}
                  </h3>
                  <div className="text-xs text-[#7B7484] mt-1 font-sans">{c.instructor}</div>
                </div>

                {/* Syllabi Status */}
                <div className="flex items-center space-x-2 text-xs font-sans">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-[#1C1B1F] font-bold">Syllabus Parsed ({c.syllabiStatus})</span>
                </div>

                {/* Upcoming Exams list */}
                <div className="space-y-2 pt-3 border-t border-[#EDE7F3]">
                  <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">
                    LMS Exam Deadlines
                  </div>
                  {c.upcomingExams.map((ex, idx) => (
                    <div key={idx} className="bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-3 space-y-1">
                      <div className="text-xs font-serif italic text-[#1C1B1F] font-bold">{ex.title}</div>
                      <div className="flex justify-between text-[10px] text-[#7B7484] font-mono">
                        <span>📅 {ex.date}</span>
                        <span className="font-bold text-[#5E35B1]">{ex.weight}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 text-[9px] text-[#7B7484] border-t border-[#EDE7F3] font-mono flex items-center justify-between">
                <span>Last synced: {c.syncedAt}</span>
                <Link2 className="w-3.5 h-3.5 text-[#5E35B1]" />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

