import React from 'react';

interface LazyLiftLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  showTagline?: boolean;
  showBadge?: boolean;
  className?: string;
}

export const LazyLiftLogo: React.FC<LazyLiftLogoProps> = ({
  size = 'md',
  showWordmark = true,
  showTagline = false,
  showBadge = false,
  className = '',
}) => {
  // Dimension presets
  const dims = {
    sm: { icon: 28, text: 'text-lg', tag: 'text-[9px]', badge: 'text-[8px] px-1.5 py-0.5' },
    md: { icon: 36, text: 'text-xl', tag: 'text-[10px]', badge: 'text-[9px] px-2 py-0.5' },
    lg: { icon: 44, text: 'text-2xl', tag: 'text-[11px]', badge: 'text-[10px] px-2.5 py-1' },
    xl: { icon: 64, text: 'text-4xl', tag: 'text-xs', badge: 'text-xs px-3 py-1' },
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Interlocking LL Monogram Icon (Light lavender resting L + Dark purple upright L, no arrow) */}
      <div 
        className="relative shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-[#FAF8FC] to-[#F1ECF7] border border-[#E5DCED] shadow-xs"
        style={{ width: dims.icon, height: dims.icon }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-4/5 h-4/5 overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Base Resting L - Light Lavender */}
          <path
            d="M 22 28 V 74 C 22 79.5 26.5 84 32 84 H 78"
            stroke="#CEB8FF"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Upright Rising L - Deep Scholastic Violet */}
          <path
            d="M 44 18 V 64 C 44 69.5 48.5 74 54 74 H 84"
            stroke="#461599"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Wordmark: strictly LazyLift without Academic suffix */}
      {showWordmark && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className={`font-sans font-extrabold tracking-tight ${dims.text} leading-none`}>
              <span className="text-[#1C1B1F]">Lazy</span>
              <span className="text-[#5E35B1]">Lift</span>
            </span>
          </div>

          {showTagline && (
            <span className={`font-sans font-medium text-[#7B7484] tracking-normal mt-0.5 ${dims.tag}`}>
              Your Academic Buddy
            </span>
          )}
        </div>
      )}
    </div>
  );
};
