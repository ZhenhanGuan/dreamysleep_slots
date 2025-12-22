import React, { useLayoutEffect, useRef, useState } from 'react';
import { SlotItem } from '../types';

interface SlotReelProps {
  spinDuration: number;
  targetItem: SlotItem | null;
  isSpinning: boolean;
  strip: SlotItem[]; // The generated long strip of items
}

// Fixed height matching the CSS height below (mobile: 120px, desktop: 160px)
const ITEM_HEIGHT_MOBILE = 120;
const ITEM_HEIGHT_DESKTOP = 160; 

export const SlotReel: React.FC<SlotReelProps> = ({ spinDuration, targetItem, isSpinning, strip }) => {
  const reelRef = useRef<HTMLDivElement>(null);
  const [translateY, setTranslateY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useLayoutEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // useLayoutEffect ensures the DOM updates synchronously before the browser paints.
  // This is crucial for the "Silent Swap" technique to work without flickering.
  useLayoutEffect(() => {
    // If we have a target item, we MUST be positioned at it, 
    // regardless of whether we are currently spinning or finished spinning.
    if (targetItem) {
      // Find the index of the target item near the end of the strip
      // We search from 'length - 5' because that's where the generator places the target.
      let targetIndex = -1;
      for (let i = strip.length - 5; i >= 0; i--) {
        if (strip[i].id === targetItem.id) {
            targetIndex = i;
            break;
        }
      }

      if (targetIndex !== -1) {
        // Calculate pixel distance based on screen size
        const itemHeight = isMobile ? ITEM_HEIGHT_MOBILE : ITEM_HEIGHT_DESKTOP;
        const finalPosition = targetIndex * itemHeight;
        setTranslateY(finalPosition);
      }
    } else {
      // Only reset to 0 if there is explicitly no target item (Idle/Reset state)
      setTranslateY(0);
    }
  }, [isSpinning, targetItem, strip, isMobile]);

  return (
    <div className="relative w-20 sm:w-28 md:w-36 h-[120px] sm:h-[160px] overflow-hidden bg-slate-800 border-x-2 sm:border-x-4 border-slate-900 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] rounded-lg">
      {/* The Reel Strip */}
      <div
        ref={reelRef}
        className="flex flex-col items-center w-full"
        style={{
          transform: `translateY(-${translateY}px)`,
          // Only animate when spinning. When isSpinning becomes false, we keep the transform but disable transition to hold position.
          transition: isSpinning ? `transform ${spinDuration}ms cubic-bezier(0.25, 1, 0.5, 1)` : 'none',
        }}
      >
        {strip.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex flex-col items-center justify-center w-full h-[120px] sm:h-[160px] shrink-0 border-b border-slate-700/50"
          >
            <span className="text-3xl sm:text-5xl md:text-6xl filter drop-shadow-lg mb-1 sm:mb-2 transform hover:scale-110 transition-transform">
              {item.emoji}
            </span>
            <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider ${item.color} opacity-80`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Shine/Reflection Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60 pointer-events-none z-10"></div>
      <div className="absolute top-0 left-0 right-0 h-4 bg-white/10 blur-sm pointer-events-none z-10"></div>
    </div>
  );
};