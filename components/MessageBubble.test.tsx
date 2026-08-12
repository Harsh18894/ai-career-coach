import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from './MessageBubble';

/* =====================================================================================
 * These exist because of a real, shipped defect.
 *
 * The palette sweep stripped a gradient background off the user's message bubble and left
 * `text-white` behind, so every message a person typed rendered as white text on a white
 * background — an empty outlined box with a timestamp in it. The build passed, the type check
 * passed, 292 tests passed, and the single most important element in the product was unreadable.
 *
 * Colour is not usually worth asserting. A foreground with no matching background is, because
 * it is invisible rather than merely ugly, and nothing else in the suite can see it.
 * ===================================================================================== */

const base = { id: 'm1', createdAt: new Date().toISOString() };

function bubbleFor(role: 'user' | 'assistant', content = 'Backend, Python and SQL.') {
  const { container } = render(<MessageBubble message={{ ...base, role, content }} />);
  // The bubble is the element carrying the rounded-2xl treatment.
  return container.querySelector('[class*="rounded-2xl"]') as HTMLElement;
}

describe('MessageBubble', () => {
  it('renders the text of a user message', () => {
    render(<MessageBubble message={{ ...base, role: 'user', content: 'Backend, Python and SQL.' }} />);
    expect(screen.getByText(/Backend, Python and SQL/)).toBeInTheDocument();
  });

  it('never gives the user bubble white text without a dark background', () => {
    const bubble = bubbleFor('user');
    const cls = bubble.className;
    if (cls.includes('text-white')) {
      expect(
        /bg-(ink|hachi|black|slate-[789]00)/.test(cls),
        `user bubble has text-white but no dark background: "${cls}"`
      ).toBe(true);
    }
  });

  it('keeps the assistant bubble legible on its light card', () => {
    const cls = bubbleFor('assistant').className;
    expect(cls).not.toContain('text-white');
    expect(/bg-(white|surface)/.test(cls)).toBe(true);
  });

  it('distinguishes the two speakers by more than nothing', () => {
    // Whatever the treatment is, the two must not render identically — otherwise a transcript
    // reads as one voice talking to itself.
    expect(bubbleFor('user').className).not.toBe(bubbleFor('assistant').className);
  });
});
