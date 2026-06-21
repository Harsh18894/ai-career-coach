'use client';

import React, { memo } from 'react';
import { User, ShieldAlert } from 'lucide-react';
import { ChatMessage } from '@/lib/state/conversation';

interface MessageBubbleProps {
  message: ChatMessage;
}

// Simple custom parser to render basic markdown-style text (**bold**, paragraphs, list items)
function formatMessageContent(text: string) {
  if (!text) return null;

  // Split by paragraphs
  const paragraphs = text.split('\n\n');

  return paragraphs.map((paragraph, pIdx) => {
    const lines = paragraph.split('\n');

    // Detect if this paragraph is a list
    const isList = lines.every(line => line.trim().startsWith('- ') || line.trim().startsWith('* '));

    if (isList) {
      return (
        <ul key={pIdx} className="list-disc pl-5 my-2 space-y-1 text-sm">
          {lines.map((line, lIdx) => {
            const cleanLine = line.trim().substring(2);
            return <li key={lIdx}>{renderInlineElements(cleanLine)}</li>;
          })}
        </ul>
      );
    }

    // Default: render line breaks inside paragraph if any
    return (
      <p key={pIdx} className="leading-relaxed mb-3 last:mb-0 text-sm md:text-base">
        {lines.map((line, lIdx) => (
          <span key={lIdx}>
            {renderInlineElements(line)}
            {lIdx < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

// Renders bold (**text**) elements inline
function renderInlineElements(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

// Memoized: during a streamed reply, ChatWindow's `messages` array is rebuilt every token, but
// every *unchanged* message object keeps its same reference — only the actively-streaming one
// gets a new object. React.memo lets every other bubble (and its markdown-lite parsing below)
// skip re-rendering on every token instead of re-running on each one.
function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-500 rounded-full text-xs font-medium">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start w-full gap-3 my-4 animate-fade-in ${isAssistant ? 'justify-start' : 'justify-end'
        }`}
    >
      {/* Avatar */}
      {isAssistant ? (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-linear-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          C
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs shadow-sm">
          <User className="w-4 h-4" />
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm border ${isAssistant
          ? 'bg-white border-slate-200 text-slate-800'
          : 'bg-linear-to-br from-slate-900 to-indigo-950 border-indigo-950 text-white font-medium'
          }`}
      >
        <div className="prose prose-sm">
          {formatMessageContent(message.content)}
        </div>

        {/* Timestamp */}
        <span className={`block text-[10px] mt-1 text-right ${isAssistant ? 'text-slate-400' : 'text-slate-300'
          }`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export default memo(MessageBubble);
