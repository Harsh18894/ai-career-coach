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

  const paragraphs = text.split('\n\n');

  return paragraphs.map((paragraph, pIdx) => {
    const lines = paragraph.split('\n');
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

// Only bold (**text**) is supported — anything else passes through as plain text.
function renderInlineElements(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-ink">
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
        <div className="flex items-center gap-2 px-4 py-2 bg-paper border border-border-soft text-ink-muted rounded-full text-xs font-medium">
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
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-hachi flex items-center justify-center text-white text-xs font-bold shadow-sm">
          A
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-border-soft flex items-center justify-center text-ink-muted text-xs shadow-sm">
          <User className="w-4 h-4" />
        </div>
      )}

      {/* Bubble */}
      <div
        /* Assistant speaks on a white card; the person speaks in ink. Orange is deliberately
           absent from both — it is reserved for Hachi's insights and actions, and a whole
           conversation of orange bubbles would spend the accent that makes a recommendation
           feel like a recommendation. */
        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm border ${isAssistant
          ? 'bg-white border-border-soft text-ink'
          : 'bg-ink border-ink text-white font-medium'
          }`}
      >
        <div className="prose prose-sm">
          {formatMessageContent(message.content)}
        </div>

        {/* Timestamp */}
        <span className={`block text-[10px] mt-1 text-right ${isAssistant ? 'text-ink-muted/70' : 'text-white/55'
          }`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export default memo(MessageBubble);
