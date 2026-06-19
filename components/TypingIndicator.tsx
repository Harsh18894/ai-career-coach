import React from 'react';

export default function TypingIndicator() {
  return (
    <div role="status" aria-label="Coach is typing" className="flex items-center gap-1.5 py-3 px-4 bg-slate-100 rounded-2xl w-fit border border-slate-200">
      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }} />
      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }} />
    </div>
  );
}
