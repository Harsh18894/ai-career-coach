import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateResumeFile, beginSampleSession } from './intake';
import { LIMITS, formatBytes } from './limits';
import { SAMPLE_PROFILES } from './samples';
import { getSessionMeta } from './session';

// Fire-and-forget beacon. Mocked so these assertions are about intake, not about the network.
vi.mock('./analytics', () => ({ track: vi.fn() }));

/** A File of a given size without allocating the bytes — jsdom reports `size` from the blob. */
function fileOf(name: string, type: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  localStorage.clear();
});

describe('validateResumeFile', () => {
  it('accepts a PDF by MIME type', () => {
    expect(validateResumeFile(fileOf('resume.pdf', 'application/pdf'))).toBeNull();
  });

  it('accepts a PDF by extension when the browser supplies no MIME type', () => {
    expect(validateResumeFile(fileOf('resume.pdf', ''))).toBeNull();
  });

  it('accepts an uppercase extension', () => {
    // Windows and several LinkedIn exports produce `Resume.PDF`, and a case-sensitive check
    // rejected it whenever the browser also left `type` empty.
    expect(validateResumeFile(fileOf('Resume.PDF', ''))).toBeNull();
  });

  it('rejects a non-PDF with a message that points at the way out', () => {
    const error = validateResumeFile(fileOf('resume.docx', 'application/msword'));
    expect(error?.code).toBe('RESUME_PARSE_FAILED');
    expect(error?.message).toMatch(/paste your resume text/i);
  });

  it('rejects a file over the shared upload ceiling, quoting that ceiling', () => {
    const error = validateResumeFile(
      fileOf('resume.pdf', 'application/pdf', LIMITS.maxUploadBytes + 1)
    );
    expect(error?.code).toBe('RESUME_PARSE_FAILED');
    // Reads from lib/limits.ts rather than a literal, so raising the cap cannot leave the
    // message quoting the old number.
    expect(error?.message).toContain(formatBytes(LIMITS.maxUploadBytes));
  });

  it('accepts a file exactly on the ceiling', () => {
    expect(
      validateResumeFile(fileOf('resume.pdf', 'application/pdf', LIMITS.maxUploadBytes))
    ).toBeNull();
  });

  it('offers a paste fallback for every rejection it produces', async () => {
    const { offersPasteFallback } = await import('./errors');
    for (const file of [fileOf('a.txt', 'text/plain'), fileOf('b.pdf', 'application/pdf', LIMITS.maxUploadBytes + 1)]) {
      const error = validateResumeFile(file);
      expect(error && offersPasteFallback(error.code)).toBe(true);
    }
  });
});

describe('beginSampleSession', () => {
  it('tags the session as a sample before returning anything to send', () => {
    const sample = SAMPLE_PROFILES[0];

    const source = beginSampleSession(sample);

    // The ordering is the point: the session must already be flagged by the time the caller
    // has a source in hand, or the first request of a demo run is attributed to real traffic.
    expect(getSessionMeta()).toMatchObject({ isSample: true, sampleId: sample.id });
    expect(source).toEqual({ kind: 'text', text: sample.resumeText });
  });

  it('mints a fresh id rather than inheriting whatever was already stored', () => {
    const before = getSessionMeta().id;

    beginSampleSession(SAMPLE_PROFILES[1]);

    expect(getSessionMeta().id).not.toBe(before);
  });

  it('re-tags when switching from one sample to another', () => {
    beginSampleSession(SAMPLE_PROFILES[0]);
    const first = getSessionMeta().id;

    beginSampleSession(SAMPLE_PROFILES[2]);

    expect(getSessionMeta().id).not.toBe(first);
    expect(getSessionMeta().sampleId).toBe(SAMPLE_PROFILES[2].id);
  });
});
