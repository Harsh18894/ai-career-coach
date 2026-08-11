import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeUpload from './ResumeUpload';
import { SAMPLE_PROFILES } from '@/lib/samples';
import { getSessionMeta } from '@/lib/session';

/* =====================================================================================
 * The sample-resume entry point.
 *
 * The thing being protected here is that samples reuse the real paste-text intake rather than
 * growing a parallel flow, and that the session is tagged before any request goes out.
 * ===================================================================================== */

function renderUpload(overrides: Partial<React.ComponentProps<typeof ResumeUpload>> = {}) {
  const props = {
    onUploadSuccess: vi.fn(),
    onManualTextSubmit: vi.fn(),
    onStartWithoutResume: vi.fn(),
    ...overrides,
  };
  render(<ResumeUpload {...props} />);
  return props;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('ResumeUpload sample profiles', () => {
  it('offers the sample entry point without needing an upload first', () => {
    renderUpload();
    expect(screen.getByRole('button', { name: /try with a sample resume/i })).toBeInTheDocument();
  });

  it('lists all three samples with their descriptions once opened', async () => {
    const user = userEvent.setup();
    renderUpload();

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));

    for (const sample of SAMPLE_PROFILES) {
      expect(screen.getByRole('button', { name: new RegExp(sample.label, 'i') })).toBeInTheDocument();
      expect(screen.getByText(sample.blurb)).toBeInTheDocument();
    }
  });

  it('says plainly that the profiles are invented', async () => {
    const user = userEvent.setup();
    renderUpload();

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));

    expect(screen.getByText(/not real people/i)).toBeInTheDocument();
  });

  it('feeds the chosen sample into the existing paste-text path verbatim', async () => {
    const user = userEvent.setup();
    const props = renderUpload();

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(SAMPLE_PROFILES[1].label, 'i') }));

    expect(props.onManualTextSubmit).toHaveBeenCalledTimes(1);
    expect(props.onManualTextSubmit).toHaveBeenCalledWith(SAMPLE_PROFILES[1].resumeText);
    // No separate intake: the upload path must not have fired.
    expect(props.onUploadSuccess).not.toHaveBeenCalled();
    expect(props.onStartWithoutResume).not.toHaveBeenCalled();
  });

  it('tags the session as a sample before the intake call is made', async () => {
    const user = userEvent.setup();
    let metaAtSubmit: ReturnType<typeof getSessionMeta> | null = null;
    // Captured inside the callback, i.e. at the moment the intake path is entered — the point
    // by which the session must already be flagged for telemetry to attribute it correctly.
    renderUpload({ onManualTextSubmit: vi.fn(() => void (metaAtSubmit = getSessionMeta())) });

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(SAMPLE_PROFILES[0].label, 'i') }));

    expect(metaAtSubmit).toMatchObject({ isSample: true, sampleId: SAMPLE_PROFILES[0].id });
  });

  it('mints a fresh session id rather than reusing whatever was already stored', async () => {
    const user = userEvent.setup();
    const before = getSessionMeta().id;
    renderUpload();

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(SAMPLE_PROFILES[0].label, 'i') }));

    expect(getSessionMeta().id).not.toBe(before);
  });
});

describe('sample fixtures', () => {
  it('are long enough to clear the intake minimum', () => {
    for (const sample of SAMPLE_PROFILES) {
      // The paste path rejects anything under 150 characters, client and server side.
      expect(sample.resumeText.trim().length).toBeGreaterThan(150);
    }
  });

  it('use example.com contact details so nothing resolves to a real inbox', () => {
    for (const sample of SAMPLE_PROFILES) {
      const emails = sample.resumeText.match(/[\w.+-]+@[\w.-]+/g) ?? [];
      expect(emails.length).toBeGreaterThan(0);
      for (const email of emails) {
        expect(email).toMatch(/@example\.com$/);
      }
    }
  });

  it('have unique ids and labels', () => {
    expect(new Set(SAMPLE_PROFILES.map((s) => s.id)).size).toBe(SAMPLE_PROFILES.length);
    expect(new Set(SAMPLE_PROFILES.map((s) => s.label)).size).toBe(SAMPLE_PROFILES.length);
  });
});
