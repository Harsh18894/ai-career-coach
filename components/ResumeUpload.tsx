'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { Profile } from '@/lib/ai/schemas';

interface ResumeUploadProps {
  onUploadSuccess: (profile: Profile, openingMessage: string) => void;
  onManualTextSubmit: (text: string) => void;
  onStartWithoutResume: () => void;
}

export default function ResumeUpload({
  onUploadSuccess,
  onManualTextSubmit,
  onStartWithoutResume,
}: ResumeUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [manualText, setManualText] = useState('');
  
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

    // Validate type (must be PDF)
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setError('Please upload a PDF file only.');
      return;
    }

    // Validate size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError('File is too large. Maximum allowed size is 5 MB.');
      return;
    }

    setIsLoading(true);
    setStatusMessage('Reading your resume PDF...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse resume.');
      }

      if (data.textIsEmpty) {
        setError(data.error);
        setShowTextFallback(true);
      } else if (data.insufficientInfo) {
        onStartWithoutResume();
      } else {
        setStatusMessage('Extracting professional profile and planning opener...');
        onUploadSuccess(data.profile, data.openingMessage);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Something went wrong during parsing. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || manualText.trim().length < 150) {
      setError('Please paste a substantial summary of your resume (at least 150 characters).');
      return;
    }
    onManualTextSubmit(manualText);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-[1.1]">
          Find your next career move
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
          Upload your resume, have a brief conversation with a sharp career mentor, and unlock 3 personalized paths forward.
        </p>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-colors duration-200 ${
          dragActive
            ? 'border-indigo-400 bg-indigo-50/60'
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
          <div className="flex flex-col items-center justify-center py-10 gap-4" role="status">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <div className="space-y-1">
              <p className="text-base font-medium text-slate-800">
                {statusMessage}
              </p>
              <p className="text-sm text-slate-500">
                Analyzing history, tenure, and transition gaps…
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="p-3.5 rounded-full bg-indigo-50 text-indigo-600 mb-4 transition-transform duration-150 hover:scale-105">
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
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold shadow-sm hover:bg-indigo-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-all duration-150"
            >
              Select file
            </button>
          </div>
        )}
      </div>

      {!isLoading && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Don&apos;t have a resume ready?{' '}
          <button
            type="button"
            onClick={onStartWithoutResume}
            className="font-semibold text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
          >
            Build your profile in chat instead
          </button>
        </p>
      )}

      {error && (
        <div role="alert" className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold mb-1">Error</p>
            <p>{error}</p>
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
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:pointer-events-none rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150 whitespace-nowrap"
            >
              Analyze text profile
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
