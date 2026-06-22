'use client';

import React from 'react';

/** Same avatar/bubble shell as an assistant MessageBubble, but with the "typing" dots in place
 * of text — so the coach visibly "is" the one typing, instead of a separate floating indicator. */
export default function ThinkingBubble() {
  return (
    <div className="flex items-start w-full gap-3 my-4 animate-fade-in justify-start" role="status" aria-label="Aria is typing">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-linear-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
        A
      </div>

      <div className="max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3.5 shadow-sm border bg-white border-slate-200">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }} />
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }} />
        </div>
      </div>
    </div>
  );
}
