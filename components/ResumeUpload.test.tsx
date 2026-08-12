import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    onFileSubmit: vi.fn(),
    onManualTextSubmit: vi.fn(),
    onSampleSubmit: vi.fn(),
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

  it('hands the chosen sample up as a sample, not as pasted text', async () => {
    const user = userEvent.setup();
    const props = renderUpload();

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(SAMPLE_PROFILES[1].label, 'i') }));

    expect(props.onSampleSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSampleSubmit).toHaveBeenCalledWith(SAMPLE_PROFILES[1]);
    // Routing a sample through the paste path is what made demo runs indistinguishable from
    // real ones in the funnel. It must stay its own callback.
    expect(props.onManualTextSubmit).not.toHaveBeenCalled();
    expect(props.onFileSubmit).not.toHaveBeenCalled();
    expect(props.onStartWithoutResume).not.toHaveBeenCalled();
  });

  it('starts no session of its own — that ordering belongs to lib/intake.ts', async () => {
    const user = userEvent.setup();
    const before = getSessionMeta().id;
    renderUpload();

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(SAMPLE_PROFILES[0].label, 'i') }));

    expect(getSessionMeta().id).toBe(before);
  });
});

describe('ResumeUpload file selection', () => {
  const pdf = () => new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' });

  it('hands a chosen PDF straight to the caller', async () => {
    const user = userEvent.setup();
    const props = renderUpload();

    await user.upload(screen.getByLabelText(/upload resume pdf/i), pdf());

    expect(props.onFileSubmit).toHaveBeenCalledTimes(1);
    expect(props.onFileSubmit).toHaveBeenCalledWith(expect.any(File));
  });

  it('accepts the same file twice — the input value is cleared between picks', async () => {
    const user = userEvent.setup();
    const props = renderUpload();
    const input = screen.getByLabelText(/upload resume pdf/i);

    // Retrying the file that just failed is the single most likely next action, and it used to
    // do nothing: an unchanged input value fires no change event.
    await user.upload(input, pdf());
    await user.upload(input, pdf());

    expect(props.onFileSubmit).toHaveBeenCalledTimes(2);
  });

  it('rejects a non-PDF locally and opens the paste box instead of spending a request', () => {
    const props = renderUpload();

    // Dropped, not picked: the picker filters by `accept`, so a wrong file type can realistically
    // only arrive over the dropzone.
    const file = new File(['hello'], 'resume.txt', { type: 'text/plain' });
    fireEvent.drop(screen.getByText(/drag & drop your resume pdf here/i), {
      dataTransfer: { files: [file], types: ['Files'] },
    });

    expect(props.onFileSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/not a PDF/i);
    expect(screen.getByLabelText(/paste your resume contents/i)).toBeInTheDocument();
  });

  it('leaves the paste box reachable after an error that offers no automatic fallback', async () => {
    const user = userEvent.setup();
    // UPSTREAM_ERROR is not in offersPasteFallback, so nothing opens the form on its own —
    // without a standing link, a network failure stranded the user with no way forward.
    renderUpload({ error: { code: 'UPSTREAM_ERROR', message: 'Something went wrong.' } });

    expect(screen.queryByLabelText(/paste your resume contents/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /paste your resume text instead/i }));

    expect(screen.getByLabelText(/paste your resume contents/i)).toBeInTheDocument();
  });

  it('surfaces an error raised by the hoisted intake runner', () => {
    renderUpload({ error: { code: 'RESUME_PARSE_FAILED', message: 'Could not read that PDF.' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not read that PDF.');
    // RESUME_PARSE_FAILED does have a fallback, so the form opens without being asked.
    expect(screen.getByLabelText(/paste your resume contents/i)).toBeInTheDocument();
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
