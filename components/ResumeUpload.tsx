'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { Upload, AlertCircle, Link2, ChevronDown, FlaskConical } from 'lucide-react';
import { offersPasteFallback, type ClientError } from '@/lib/errors';
import { SAMPLE_PROFILES, type SampleProfile } from '@/lib/samples';
import { LIMITS, formatBytes } from '@/lib/limits';
import { validateResumeFile } from '@/lib/intake';

/**
 * The intake screen: a dropzone, a paste box, and the two ways out of both.
 *
 * Purely presentational as far as the network is concerned. The parse-resume/generate-opener
 * sequence used to live here and again in HomeExperience; it now lives once in lib/intake.ts,
 * called by whichever surface is showing. That also means the analysis spinner is the page's,
 * not this component's — so an upload started from the header chooser and one started from this
 * dropzone look identical.
 */
interface ResumeUploadProps {
  onFileSubmit: (file: File) => void;
  onManualTextSubmit: (text: string) => void;
  onSampleSubmit: (sample: SampleProfile) => void;
  onStartWithoutResume: () => void;
  /** Raised by the hoisted intake runner. Rendered here so there is one error surface. */
  error?: ClientError | null;
}

export default function ResumeUpload({
  onFileSubmit,
  onManualTextSubmit,
  onSampleSubmit,
  onStartWithoutResume,
  error: intakeError = null,
}: ResumeUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<ClientError | null>(null);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [manualText, setManualText] = useState('');
  const [showLinkedinHelp, setShowLinkedinHelp] = useState(false);
  const [showSamplePicker, setShowSamplePicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) submitFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared before anything else, so choosing the same filename again after a failure still
    // fires a change event. Without this, the second attempt at a file that failed to parse
    // silently did nothing.
    e.target.value = '';
    if (file) submitFile(file);
  };

  /**
   * Checked here rather than left to the runner, so a wrong file type answers instantly instead
   * of flashing the analysis screen on its way to the same message.
   */
  const submitFile = (file: File) => {
    const invalid = validateResumeFile(file);
    if (invalid) {
      setLocalError(invalid);
      setShowTextFallback(true);
      return;
    }
    setLocalError(null);
    setShowTextFallback(false);
    onFileSubmit(file);
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Hands a chosen sample up rather than starting it here.
   *
   * This used to mint the session, stash the text and call `onManualTextSubmit` itself — which
   * made a demo run indistinguishable from a real pasted resume by the time it reached the
   * funnel, and put session-minting in a component that otherwise touches nothing global.
   * `beginSampleSession` in lib/intake.ts is now the single owner of that ordering.
   */
  const handleUseSample = (sample: SampleProfile) => {
    setLocalError(null);
    setShowSamplePicker(false);
    onSampleSubmit(sample);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || manualText.trim().length < 150) {
      setLocalError({ code: 'RESUME_PARSE_FAILED', message: 'That is too short to work with — paste at least 150 characters of your resume or career history.' });
      return;
    }
    setLocalError(null);
    onManualTextSubmit(manualText);
  };

  // Derived, not stored: this component stays mounted across a failed run, so a lazy useState
  // initialiser would go stale, and an effect that copied the prop into state would trip the
  // set-state-in-effect rule.
  const shownError = localError ?? intakeError;
  const pasteVisible =
    showTextFallback || (intakeError ? offersPasteFallback(intakeError.code) : false);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
          <span className="text-ink">Find your </span>
          <span className="bg-hachi bg-clip-text text-transparent">
            next career move
          </span>
        </h1>
        <p className="mt-4 text-lg text-ink-muted max-w-xl mx-auto leading-relaxed">
          Upload your resume, have a brief conversation with Hachi, a sharp career mentor, and unlock your <strong>personalized career paths.</strong>
        </p>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-colors duration-200 ${dragActive
          ? 'border-hachi/30 '
          : 'border-border-soft bg-paper'
          }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="application/pdf,.pdf"
          onChange={handleChange}
          aria-label="Upload resume PDF"
        />

        <div className="flex flex-col items-center justify-center py-6">
          <div className="p-3.5 rounded-full bg-hachi text-white shadow-sm mb-4 transition-transform duration-150 hover:scale-105">
            <Upload className="w-7 h-7" />
          </div>

          <p className="text-lg font-semibold text-ink mb-1">
            Drag &amp; drop your resume PDF here
          </p>
          <p className="text-sm text-ink-muted mb-6">
            {`Only PDF formats up to ${formatBytes(LIMITS.maxUploadBytes)} are accepted`}
          </p>

          <button
            type="button"
            onClick={onButtonClick}
            className="px-6 py-2.5 bg-hachi text-white rounded-xl font-semibold shadow-sm hover:opacity-90 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 transition-all duration-150"
          >
            Select file
          </button>
        </div>
      </div>

      <>
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setShowSamplePicker((prev) => !prev)}
              aria-expanded={showSamplePicker}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-soft bg-white text-sm font-semibold text-ink hover:border-hachi/30 hover:text-hachi hover:bg-hachi/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
              Try with a sample resume
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showSamplePicker ? 'rotate-180' : ''}`} />
            </button>
            <p className="mt-2 text-xs text-ink-muted">
              Prefer not to upload anything? Start from one of three fictional profiles.
            </p>
          </div>

          {showSamplePicker && (
            <div className="mt-3 grid gap-2 animate-fade-in">
              {SAMPLE_PROFILES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleUseSample(sample)}
                  className="text-left p-4 rounded-xl border border-border-soft bg-white hover:border-hachi/30 hover:bg-hachi/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi transition-colors"
                >
                  <span className="block text-sm font-semibold text-ink">{sample.label}</span>
                  <span className="block mt-0.5 text-xs text-ink-muted">{sample.blurb}</span>
                </button>
              ))}
              <p className="text-xs text-ink-muted/70 text-center mt-1">
                These profiles are invented for the demo — they are not real people.
              </p>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-ink-muted">
            Just want your resume checked?{' '}
            <Link
              href="/review"
              className="font-semibold text-hachi underline-offset-2 hover:text-hachi hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded"
            >
              Get a line-by-line review instead
            </Link>
          </p>

          {/* Always available, not only after a parse failure. `offersPasteFallback` is false
              for a network or rate-limit error, which used to leave the one workaround
              unreachable at exactly the moment it was needed. */}
          <p className="mt-2 text-center text-sm text-ink-muted">
            No PDF handy?{' '}
            <button
              type="button"
              onClick={() => setShowTextFallback(true)}
              className="font-semibold text-hachi underline-offset-2 hover:text-hachi hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded"
            >
              Paste your resume text instead
            </button>
          </p>

          <p className="mt-2 text-center text-sm text-ink-muted">
            Don&apos;t have a resume ready?{' '}
            <button
              type="button"
              onClick={onStartWithoutResume}
              className="font-semibold text-hachi underline-offset-2 hover:text-hachi hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded"
            >
              Build your profile in chat instead
            </button>
          </p>

          <p className="mt-2 text-center text-sm text-ink-muted">
            <button
              type="button"
              onClick={() => setShowLinkedinHelp((prev) => !prev)}
              aria-expanded={showLinkedinHelp}
              className="inline-flex items-center gap-1.5 font-semibold text-hachi underline-offset-2 hover:text-hachi hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded"
            >
              <Link2 className="w-3.5 h-3.5" />
              Or share your LinkedIn profile
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showLinkedinHelp ? 'rotate-180' : ''}`} />
            </button>
          </p>

          {/* Placed at the point of decision rather than only in the footer: the question
              "where does my resume go" occurs to people as they are about to hand it over. */}
          <p className="mt-4 text-center text-xs text-ink-muted/70">
            <Link
              href="/privacy"
              className="underline-offset-2 hover:text-ink-muted hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded"
            >
              What happens to your resume
            </Link>
          </p>

          {showLinkedinHelp && (
            <div className="mt-3 p-5 bg-paper border border-border-soft rounded-xl text-sm text-ink-muted animate-fade-in">
              <p className="font-semibold text-ink mb-2">
                Follow the below steps to download your LinkedIn profile as a PDF and upload it here:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  <span className="font-medium text-ink">Log in</span> to your LinkedIn account on a desktop browser.
                </li>
                <li>
                  Click the <span className="font-medium text-ink">Me</span> icon at the top of the page and select <span className="font-medium text-ink">View Profile</span>.
                </li>
                <li>
                  Click the <span className="font-medium text-ink">More</span> or <span className="font-medium text-ink">Resources</span> button located below your profile picture and headline.
                </li>
                <li>
                  Select <span className="font-medium text-ink">Save to PDF</span> from the dropdown menu.
                </li>
                <li>
                  Wait a few moments for the download to complete into your default downloads folder.
                </li>
                <li>
                  Upload the downloaded PDF above to start your career analysis.
                </li>
              </ol>
            </div>
          )}
      </>

      {shownError && (
        <div role="alert" className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p>{shownError.message}</p>
          </div>
        </div>
      )}

      {pasteVisible && (
        <form onSubmit={handleManualSubmit} className="mt-6 p-6 bg-white border border-border-soft rounded-2xl shadow-sm">
          <label htmlFor="manual-resume-text" className="block text-sm font-semibold text-ink mb-2">
            Paste your resume contents, professional experience, and career history here:
          </label>
          <textarea
            id="manual-resume-text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            maxLength={LIMITS.maxResumeChars}
            rows={6}
            placeholder="Paste your titles, duties, skills, and dates of employment here..."
            className="w-full p-4 rounded-xl border border-border-soft bg-white text-ink focus:ring-2 focus:ring-hachi focus:border-transparent outline-none transition"
          />
          <div className="mt-4 flex justify-between items-center gap-4">
            <span className="text-xs text-ink-muted">
              Min 150 characters · Current length: {manualText.length}
            </span>
            <button
              type="submit"
              disabled={manualText.length < 150}
              className="px-5 py-2 bg-hachi hover:opacity-90 text-white disabled:opacity-50 disabled:pointer-events-none rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150 whitespace-nowrap"
            >
              Analyze text profile
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
