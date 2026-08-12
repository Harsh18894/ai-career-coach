import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartHachiButton, START_EVENT, type StartDetail } from './StartHachi';
import { SAMPLE_PROFILES } from '@/lib/samples';
import { takePendingIntake } from '@/lib/pending-intake';
import { stashResumeText } from '@/lib/resume-stash';
import { startNewSession } from '@/lib/session';

/* =====================================================================================
 * What the chooser decides, and what it hands on.
 *
 * This dialog has been the source of two "the button does nothing" reports, both because the
 * hand-off to the home experience was wrong rather than because the button was. So the assertions
 * here are all on the hand-off: which intent leaves the dialog, and what travels with it.
 * ===================================================================================== */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
// Fire-and-forget beacon; nothing here should depend on it, but jsdom has no fetch server.
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

/** Captures the detail of the start event, which is what the home experience acts on. */
function listenForStart(): StartDetail[] {
  const seen: StartDetail[] = [];
  window.addEventListener(START_EVENT, (e) => seen.push((e as CustomEvent<StartDetail>).detail));
  return seen;
}

async function openDialog() {
  const user = userEvent.setup();
  render(<StartHachiButton />);
  await user.click(screen.getByRole('button', { name: /try hachi/i }));
  return user;
}

beforeEach(() => {
  push.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  // The dialog only ever renders on "/" in these tests unless a case says otherwise.
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  takePendingIntake();
  vi.restoreAllMocks();
});

describe('StartHachi hand-off', () => {
  it('opens the file picker rather than navigating when nothing is stashed', async () => {
    const started = listenForStart();
    const user = await openDialog();

    const input = screen.getByLabelText(/choose your resume pdf/i) as HTMLInputElement;
    const click = vi.spyOn(input, 'click');

    await user.click(screen.getByRole('button', { name: /upload my resume/i }));

    expect(click).toHaveBeenCalledTimes(1);
    // Nothing starts until a file actually comes back — the dialog stays open behind the picker.
    expect(started).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('starts the conversation with a chosen PDF, without a stop at the intake screen', async () => {
    const started = listenForStart();
    const user = await openDialog();

    await user.upload(
      screen.getByLabelText(/choose your resume pdf/i),
      new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' })
    );

    expect(started).toEqual([{}]);
    const pending = takePendingIntake();
    expect(pending).toMatchObject({ kind: 'file' });
    expect((pending as { kind: 'file'; file: File }).file.name).toBe('resume.pdf');
  });

  it('reuses a resume this browser already holds instead of asking for it again', async () => {
    stashResumeText('PRIOR RESUME TEXT');
    const started = listenForStart();
    const user = await openDialog();

    const input = screen.getByLabelText(/choose your resume pdf/i) as HTMLInputElement;
    const click = vi.spyOn(input, 'click');

    await user.click(screen.getByRole('button', { name: /resume you already gave me/i }));

    expect(click).not.toHaveBeenCalled();
    expect(started).toEqual([{}]);
    expect(takePendingIntake()).toEqual({ kind: 'text', text: 'PRIOR RESUME TEXT' });
  });

  it('does not offer a sample resume back as "the resume you already gave me"', async () => {
    // Samples are stashed through the same key, so the stash alone does not mean "yours".
    startNewSession({ isSample: true, sampleId: SAMPLE_PROFILES[0].id });
    stashResumeText(SAMPLE_PROFILES[0].resumeText);
    await openDialog();

    expect(screen.queryByText(/resume you already gave me/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload my resume/i })).toBeInTheDocument();
  });

  it('sends the "no PDF" link straight into the guided conversation', async () => {
    const started = listenForStart();
    const user = await openDialog();

    await user.click(screen.getByRole('button', { name: /answer a few questions instead/i }));

    // 'questions' is what skips the intake screen entirely; an empty detail would land there.
    expect(started).toEqual([{ mode: 'questions' }]);
    expect(takePendingIntake()).toBeNull();
  });

  it('carries the same intents through a real navigation from another route', async () => {
    window.history.replaceState({}, '', '/review');
    const user = await openDialog();

    await user.click(screen.getByRole('button', { name: /answer a few questions instead/i }));

    expect(push).toHaveBeenCalledWith('/?start=questions');
  });

  it('names the sample in the event so the listener can mint the session once', async () => {
    const started = listenForStart();
    const user = await openDialog();

    await user.click(screen.getByRole('button', { name: new RegExp(SAMPLE_PROFILES[1].label, 'i') }));

    expect(started).toEqual([{ sampleId: SAMPLE_PROFILES[1].id }]);
  });
});
