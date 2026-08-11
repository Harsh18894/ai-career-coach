'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { Upload, AlertCircle, Link2, ChevronDown, FlaskConical } from 'lucide-react';
import { Profile, AdaptiveQuestion } from '@/lib/ai/schemas';
import {
  ClientApiError,
  clientErrorFrom,
  asClientError,
  offersPasteFallback,
  type ClientError,
} from '@/lib/errors';
import { sessionHeaders, startNewSession } from '@/lib/session';
import { stashResumeText } from '@/lib/resume-stash';
import { SAMPLE_PROFILES, type SampleProfile } from '@/lib/samples';
import AnalyzingProgress, { RESUME_ANALYSIS_STEPS } from './AnalyzingProgress';

interface ResumeUploadProps {
  onUploadSuccess: (profile: Profile, opener: AdaptiveQuestion) => void;
  onManualTextSubmit: (text: string) => void;
  onStartWithoutResume: () => void;
}

export default function ResumeUpload({
  onUploadSuccess,
  onManualTextSubmit,
  onStartWithoutResume,
}: ResumeUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setError(null);
    setShowTextFallback(false);

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setError({ code: 'RESUME_PARSE_FAILED', message: 'That file is not a PDF. Upload a PDF, or paste your resume text instead.' });
      setShowTextFallback(true);
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError({ code: 'RESUME_PARSE_FAILED', message: 'That file is over the 5 MB limit. Try a smaller PDF, or paste your resume text instead.' });
      setShowTextFallback(true);
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        // No Content-Type — the browser sets the multipart boundary itself.
        headers: sessionHeaders(),
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ClientApiError(clientErrorFrom(data, 'RESUME_PARSE_FAILED'));
      }

      if (data.insufficientInfo) {
        onStartWithoutResume();
      } else {
        if (typeof data.text === 'string') stashResumeText(data.text);
        const openerResponse = await fetch('/api/generate-opener', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
          body: JSON.stringify({ profile: data.profile }),
        });
        const openerData = await openerResponse.json();
        if (!openerResponse.ok) {
          throw new ClientApiError(clientErrorFrom(openerData));
        }
        onUploadSuccess(data.profile, openerData.opener);
      }
    } catch (err) {
      const clientError = asClientError(err);
      console.error(`[${clientError.code}]`, err);
      setError(clientError);
      // An unreadable PDF is the one failure with a genuine alternative route — reveal the
      // paste-text form directly rather than telling the user about it and making them hunt.
      if (offersPasteFallback(clientError.code)) setShowTextFallback(true);
    } finally {
      setIsLoading(false);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Starts a session from a fictional sample profile. It goes through `onManualTextSubmit` —
   * the same paste-text path a real user hits — so there is no second intake flow to keep
   * correct. The session id is re-minted first so this run is tagged isSample from its very
   * first request, rather than inheriting whatever session was already in localStorage.
   */
  const handleUseSample = (sample: SampleProfile) => {
    setError(null);
    setShowSamplePicker(false);
    startNewSession({ isSample: true, sampleId: sample.id });
    stashResumeText(sample.resumeText);
    onManualTextSubmit(sample.resumeText);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || manualText.trim().length < 150) {
      setError({ code: 'RESUME_PARSE_FAILED', message: 'That is too short to work with — paste at least 150 characters of your resume or career history.' });
      return;
    }
    onManualTextSubmit(manualText);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
          <span className="text-slate-900">Find your </span>
          <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            next career move
          </span>
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
          Upload your resume, have a brief conversation with Aria, a sharp career mentor, and unlock your <strong>personalized career paths.</strong>
        </p>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-colors duration-200 ${dragActive
          ? 'border-violet-400 bg-linear-to-br from-indigo-50/60 to-violet-50/60'
          : 'border-slate-200 bg-slate-50'
          } ${isLoading ? 'pointer-events-none opacity-80' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf"
          onChange={handleChange}
          aria-label="Upload resume PDF"
        />

        {isLoading ? (
          <div className="py-10">
            <AnalyzingProgress steps={RESUME_ANALYSIS_STEPS} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="p-3.5 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-sm mb-4 transition-transform duration-150 hover:scale-105">
              <Upload className="w-7 h-7" />
            </div>

            <p className="text-lg font-semibold text-slate-800 mb-1">
              Drag &amp; drop your resume PDF here
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Only PDF formats up to 5 MB are accepted
            </p>

            <button
              type="button"
              onClick={onButtonClick}
              className="px-6 py-2.5 bg-linear-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-semibold shadow-sm hover:from-indigo-700 hover:to-violet-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-all duration-150"
            >
              Select file
            </button>
          </div>
        )}
      </div>

      {!isLoading && (
        <>
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setShowSamplePicker((prev) => !prev)}
              aria-expanded={showSamplePicker}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
              Try with a sample resume
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showSamplePicker ? 'rotate-180' : ''}`} />
            </button>
            <p className="mt-2 text-xs text-slate-500">
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
                  className="text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                >
                  <span className="block text-sm font-semibold text-slate-800">{sample.label}</span>
                  <span className="block mt-0.5 text-xs text-slate-500">{sample.blurb}</span>
                </button>
              ))}
              <p className="text-xs text-slate-400 text-center mt-1">
                These profiles are invented for the demo — they are not real people.
              </p>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-slate-500">
            Just want your resume checked?{' '}
            <Link
              href="/review"
              className="font-semibold text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
              Get a line-by-line review instead
            </Link>
          </p>

          <p className="mt-2 text-center text-sm text-slate-500">
            Don&apos;t have a resume ready?{' '}
            <button
              type="button"
              onClick={onStartWithoutResume}
              className="font-semibold text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
              Build your profile in chat instead
            </button>
          </p>

          <p className="mt-2 text-center text-sm text-slate-500">
            <button
              type="button"
              onClick={() => setShowLinkedinHelp((prev) => !prev)}
              aria-expanded={showLinkedinHelp}
              className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
              <Link2 className="w-3.5 h-3.5" />
              Or share your LinkedIn profile
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showLinkedinHelp ? 'rotate-180' : ''}`} />
            </button>
          </p>

          {showLinkedinHelp && (
            <div className="mt-3 p-5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 animate-fade-in">
              <p className="font-semibold text-slate-800 mb-2">
                Follow the below steps to download your LinkedIn profile as a PDF and upload it here:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  <span className="font-medium text-slate-800">Log in</span> to your LinkedIn account on a desktop browser.
                </li>
                <li>
                  Click the <span className="font-medium text-slate-800">Me</span> icon at the top of the page and select <span className="font-medium text-slate-800">View Profile</span>.
                </li>
                <li>
                  Click the <span className="font-medium text-slate-800">More</span> or <span className="font-medium text-slate-800">Resources</span> button located below your profile picture and headline.
                </li>
                <li>
                  Select <span className="font-medium text-slate-800">Save to PDF</span> from the dropdown menu.
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
      )}

      {error && (
        <div role="alert" className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p>{error.message}</p>
          </div>
        </div>
      )}

      {showTextFallback && (
        <form onSubmit={handleManualSubmit} className="mt-6 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <label htmlFor="manual-resume-text" className="block text-sm font-semibold text-slate-800 mb-2">
            Paste your resume contents, professional experience, and career history here:
          </label>
          <textarea
            id="manual-resume-text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={6}
            placeholder="Paste your titles, duties, skills, and dates of employment here..."
            className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
          />
          <div className="mt-4 flex justify-between items-center gap-4">
            <span className="text-xs text-slate-500">
              Min 150 characters · Current length: {manualText.length}
            </span>
            <button
              type="submit"
              disabled={manualText.length < 150}
              className="px-5 py-2 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white disabled:opacity-50 disabled:pointer-events-none rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150 whitespace-nowrap"
            >
              Analyze text profile
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
