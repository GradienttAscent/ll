import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export const ScrollToTopButton: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show after meaningful scrolling (~350px)
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      setIsVisible(scrollTop > 350);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
    document.documentElement.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className="fixed bottom-6 right-6 z-40 p-2.5 rounded-full border shadow-sm transition-all duration-200 active:scale-95 bg-[#FDFDFC] dark:bg-[#17151A] border-[#EDE7F3] dark:border-[#302B35] text-[#1C1B1F] dark:text-[#F5F3F7] hover:border-[#D8CCE8] dark:hover:border-[#4B4454] hover:shadow"
    >
      <ArrowUp className="w-4 h-4 stroke-[2.2]" />
    </button>
  );
};
