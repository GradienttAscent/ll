import React, { useState } from 'react';
import { LMSCourse } from '../types';
import { GraduationCap, RefreshCw, CheckCircle2, Link2, Loader2 } from 'lucide-react';

interface LMSIntegrationViewProps {
  courses: LMSCourse[];
  onSync: () => void;
}

export const LMSIntegrationView: React.FC<LMSIntegrationViewProps> = ({ courses, onSync }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectedPlatform, setConnectedPlatform] = useState<string>('Canvas');

  const handleRunSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      onSync();
      alert('Successfully synchronized syllabus and assignment dates from Canvas LMS!');
    }, 1500);
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-black pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Learning Management System Bridge</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            LMS Integration &amp; Course Sync
          </h1>
          <p className="text-xs text-black/70 mt-2 max-w-xl font-sans">
            Seamlessly import course syllabi, assignment schedules, and official exam dates from Canvas, Moodle, Blackboard, and Google Classroom.
          </p>
        </div>

        <button
          onClick={handleRunSync}
          disabled={isSyncing}
          className="border border-black bg-black text-white hover:bg-white hover:text-black px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50 self-start md:self-auto flex items-center space-x-2"
        >
          {isSyncing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Syncing with Canvas...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Sync LMS Data Now</span>
            </>
          )}
        </button>
      </div>

      {/* Platform Connect Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['Canvas', 'Moodle', 'Blackboard', 'Google Classroom'].map((platform) => {
          const isConnected = connectedPlatform === platform;
          return (
            <div
              key={platform}
              onClick={() => setConnectedPlatform(platform)}
              className={`p-5 border transition-all cursor-pointer text-center space-y-3 ${
                isConnected
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-black border-black/30 hover:border-black'
              }`}
            >
              <div className={`w-8 h-8 border font-bold text-xs mx-auto flex items-center justify-center ${
                isConnected ? 'border-white text-white' : 'border-black text-black'
              }`}>
                {platform[0]}
              </div>
              <div className="text-xs font-serif italic">{platform}</div>
              <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border inline-block ${
                isConnected
                  ? 'border-white text-white'
                  : 'border-black/40 text-black/60'
              }`}>
                {isConnected ? 'Connected' : 'Available'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Synced Courses & Syllabus Extraction Status */}
      <div className="space-y-6">
        <h2 className="font-serif text-3xl italic font-normal text-black">
          Synchronized University Courses ({courses.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {courses.map((c) => (
            <div key={c.id} className="bg-[#F8F7F2] border border-black p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] bg-black text-white px-3 py-1">
                    {c.courseCode}
                  </span>
                  <span className="text-[10px] font-mono text-black/60">{c.platform}</span>
                </div>

                <div>
                  <h3 className="font-serif text-2xl italic font-normal text-black leading-snug">
                    {c.courseName}
                  </h3>
                  <div className="text-xs text-black/70 mt-1 font-sans">{c.instructor}</div>
                </div>

                {/* Syllabi Status */}
                <div className="flex items-center space-x-2 text-xs font-sans">
                  <CheckCircle2 className="w-4 h-4 text-black" />
                  <span className="text-black font-bold">Syllabus Parsed ({c.syllabiStatus})</span>
                </div>

                {/* Upcoming Exams list */}
                <div className="space-y-2 pt-3 border-t border-black">
                  <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-black/60">
                    LMS Exam Deadlines
                  </div>
                  {c.upcomingExams.map((ex, idx) => (
                    <div key={idx} className="bg-white border border-black p-3 space-y-1">
                      <div className="text-xs font-serif italic text-black">{ex.title}</div>
                      <div className="flex justify-between text-[10px] text-black/60 font-mono">
                        <span>📅 {ex.date}</span>
                        <span className="font-bold text-black">{ex.weight}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 text-[9px] text-black/60 border-t border-black font-mono flex items-center justify-between">
                <span>Last synced: {c.syncedAt}</span>
                <Link2 className="w-3.5 h-3.5 text-black" />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

