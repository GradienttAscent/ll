import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Total duration of splash screen animation before calling onComplete
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  const handleSkip = () => {
    setIsVisible(false);
  };

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {isVisible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#FAF8FC] text-[#1C1B1F] select-none"
        >
          {/* Subtle Ambient Background Grain/Glow */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(206,184,255,0.18)_0%,transparent_70%)]" />

          {/* Skip button for quick student navigation */}
          <button
            onClick={handleSkip}
            className="absolute top-6 right-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] hover:text-[#461599] transition-colors px-3 py-1.5 rounded-full border border-[#EDE7F3] bg-white/70 backdrop-blur-xs"
          >
            Skip
          </button>

          <div className="relative flex flex-col items-center">
            {/* Logo Stage */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Minimal Study Notebook - Enters Stage 2, settles Stage 3, softly dissolves Stage 5 */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.85 }}
                animate={{
                  opacity: [0, 0.95, 0.95, 0.25, 0],
                  y: [20, 8, 8, 2, 0],
                  scale: [0.85, 1, 1, 0.95, 0.9],
                }}
                transition={{
                  duration: 2.2,
                  times: [0, 0.25, 0.45, 0.75, 1],
                  ease: 'easeInOut',
                }}
                className="absolute -bottom-2 pointer-events-none"
              >
                <svg width="84" height="42" viewBox="0 0 84 42" fill="none">
                  {/* Open notebook silhouette */}
                  <path
                    d="M 6 32 C 24 32 38 28 42 22 C 46 28 60 32 78 32 L 80 12 C 60 12 46 8 42 3 C 38 8 24 12 4 12 Z"
                    fill="#EDE7F6"
                    stroke="#D8CCE8"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  {/* Spine mark */}
                  <line x1="42" y1="3" x2="42" y2="22" stroke="#461599" strokeWidth="1.5" strokeOpacity="0.4" />
                </svg>
              </motion.div>

              {/* Interlocking Monogram SVGs */}
              <svg
                viewBox="0 0 100 100"
                className="w-28 h-28 overflow-visible relative z-10"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* 1. Light Lavender Resting L (Appears first, breathes when book enters) */}
                <motion.path
                  d="M 22 28 V 74 C 22 79.5 26.5 84 32 84 H 78"
                  stroke="#CEB8FF"
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 1],
                    opacity: [0, 1, 1],
                    scale: [0.95, 1, 1.03, 1],
                  }}
                  transition={{
                    duration: 1.6,
                    times: [0, 0.4, 0.7, 1],
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />

                {/* 4. Dark Purple L (Smoothly rises and locks into upright position) */}
                <motion.path
                  d="M 44 18 V 64 C 44 69.5 48.5 74 54 74 H 84"
                  stroke="#461599"
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ opacity: 0, y: 24, rotate: -12 }}
                  animate={{
                    opacity: [0, 0, 1, 1],
                    y: [24, 24, 0, 0],
                    rotate: [-12, -12, 0, 0],
                  }}
                  transition={{
                    duration: 1.8,
                    times: [0, 0.45, 0.85, 1],
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </svg>
            </div>

            {/* 6. "LazyLift" Wordmark */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.6, ease: 'easeOut' }}
              className="mt-4 flex items-baseline gap-1"
            >
              <span className="font-sans text-3xl font-extrabold tracking-tight">
                <span className="text-[#1C1B1F]">Lazy</span>
                <span className="text-[#5E35B1]">Lift</span>
              </span>
            </motion.div>

            {/* 7. "Your Academic Buddy" Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.7, duration: 0.6, ease: 'easeOut' }}
              className="mt-1 font-sans text-xs font-medium text-[#7B7484] tracking-wider"
            >
              Your Academic Buddy
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
