import React from 'react';
import { ActiveTab } from '../types';
import { Calendar, ArrowRight, MoreHorizontal } from 'lucide-react';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ setActiveTab }) => {
  return (
    <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8 space-y-12 animate-fade-in">
      
      {/* Top Academic Sanctuary Header */}
      <div className="text-center space-y-3 pb-8 border-b border-black">
        <div className="inline-block px-3 py-1 border border-black text-black text-[9px] uppercase tracking-[0.25em] font-bold">
          Academic Sanctuary &bull; Journal
        </div>
        
        <h1 className="font-serif text-5xl sm:text-6xl font-normal italic text-black tracking-tight leading-none pt-2">
          Good evening, Alex
        </h1>

        <p className="font-serif italic text-black/70 text-base max-w-lg mx-auto">
          &ldquo;The quieter you become, the more you are able to hear.&rdquo;
        </p>

        {/* Exam Countdown Pill */}
        <div className="pt-2 flex justify-center">
          <div className="inline-flex items-center space-x-2 border border-black bg-[#F8F7F2] text-black text-[10px] font-bold uppercase tracking-widest px-4 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-black" />
            <span><strong>21 days</strong> until Algorithms Finals</span>
          </div>
        </div>
      </div>

      {/* Current Priority Card */}
      <div className="bg-[#FDFDFC] border border-black p-8 sm:p-10 space-y-6 relative overflow-hidden">
        <div className="space-y-3 max-w-2xl relative z-10">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40">
            Current High-Yield Priority
          </div>

          <h2 className="font-serif text-4xl sm:text-5xl italic text-black leading-tight">
            Graph Algorithms &amp; Traversal
          </h2>

          <p className="text-xs text-black/80 leading-relaxed font-sans">
            Exploring the intricate complexities of Dijkstra&apos;s shortest path, Bellman-Ford, and A* Search. Progressing through past paper practice set II.
          </p>

          <div className="pt-6 border-t border-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2 min-w-[240px]">
              <div className="flex justify-between text-[10px] uppercase tracking-[0.15em] font-bold text-black">
                <span>40% Session Complete</span>
                <span>2/5 Solved</span>
              </div>
              <div className="w-full bg-black/10 h-1">
                <div className="bg-black h-full w-[40%] transition-all duration-500"></div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('practice')}
              className="inline-flex items-center space-x-3 bg-black text-white hover:bg-white hover:text-black border border-black px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors"
            >
              <span>Continue Practice</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Study Journal / Question Stream Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-black pb-3">
          <h3 className="font-serif text-3xl italic text-black">
            Study Journal &amp; Log
          </h3>
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">Aug 3, 2026</span>
        </div>

        {/* Timeline Items */}
        <div className="space-y-4">
          
          {/* Timeline Item 1 */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-serif text-2xl italic text-black">
                  Big O Notation &amp; Recurrence Relations
                </h4>
                <p className="text-xs text-black/70 mt-1 italic font-serif">
                  Reviewing logarithmic and exponential time complexities for nested recursive calls and Master Theorem cases.
                </p>
              </div>
              <div className="text-[10px] text-black font-mono font-bold uppercase tracking-wider border border-black/20 px-2 py-1 bg-white">
                20:00 &ndash; 20:45
              </div>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <span className="text-[9px] uppercase tracking-[0.15em] font-bold bg-black text-white px-2.5 py-1">
                THEORY
              </span>
              <span className="text-[9px] uppercase tracking-[0.15em] font-bold border border-black text-black px-2.5 py-1">
                REVISION
              </span>
            </div>
          </div>

          {/* Timeline Item 2 */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-serif text-2xl italic text-black">
                  Dynamic Programming Practice
                </h4>
                <p className="text-xs text-black/70 mt-1 italic font-serif">
                  Solving &apos;Longest Common Subsequence&apos; using memoization matrix and bottom-up tabulation.
                </p>
              </div>
              <div className="text-[10px] text-black font-mono font-bold uppercase tracking-wider border border-black/20 px-2 py-1 bg-white">
                21:00 &ndash; 22:30
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-[9px] uppercase tracking-[0.15em] font-bold bg-black text-white px-2.5 py-1">
                OPTIMAL SUBSTRUCTURE
              </span>
              <MoreHorizontal className="w-4 h-4 text-black cursor-pointer" />
            </div>
          </div>

          {/* Timeline Item 3 */}
          <div className="bg-[#F8F7F2] border border-black/40 border-dashed p-6 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-serif text-2xl italic text-black/60">
                  Reflection &amp; Daily Log
                </h4>
                <p className="text-xs text-black/50 mt-1 italic font-serif">
                  Final notes for the day and planning tomorrow&apos;s high-yield review session.
                </p>
              </div>
              <div className="text-[10px] text-black/60 font-mono font-bold uppercase tracking-wider">
                22:45 &ndash; 23:00
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Ambient Sanctuary Banner */}
      <div className="relative border border-black h-52 bg-black flex items-center justify-center p-8 text-center text-white">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity"
          style={{ 
            backgroundImage: `url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80')` 
          }}
        ></div>
        
        <div className="relative z-10 space-y-2 max-w-lg">
          <h3 className="font-serif text-3xl italic tracking-wide text-white">
            The Night&apos;s Architecture
          </h3>
          <p className="font-serif italic text-sm text-white/80 leading-relaxed">
            Refining mental models in the absolute silence of the sanctuary.
          </p>
        </div>
      </div>

      {/* Focus Metrics Cards at Bottom */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        
        {/* Focus Score */}
        <div className="bg-[#F8F7F2] border border-black p-8 text-center space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
            Focus Score
          </div>
          <div className="font-serif text-5xl italic font-normal text-black">
            88 / 100
          </div>
        </div>

        {/* Deep Hours */}
        <div className="bg-[#F8F7F2] border border-black p-8 text-center space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
            Deep Focus Hours
          </div>
          <div className="font-serif text-5xl italic font-normal text-black">
            4.2 hrs
          </div>
        </div>

      </div>

    </div>
  );
};

