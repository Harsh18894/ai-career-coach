import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { extractProfile } from '@/lib/ai/coach';
import { enforceLimits } from '@/lib/rate-limit';
import { withTelemetryContext, telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse, failWith } from '@/lib/api-response';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Both intake paths that produce a profile (PDF upload and pasted text) land here, so this
    // is where a resume-based session starts. Checked before the body is read so an oversized
    // upload from a limited caller is rejected without being buffered.
    const limited = await enforceLimits(request, { sessionStart: true });
    if (limited) return limited;

    let text = '';
    const contentType = request.headers.get('content-type') || '';

    // The resume-review surface needs the extracted TEXT, not a coaching Profile — segmentation
    // works from raw text. Requested via ?mode=text, which returns after extraction and skips
    // the extractProfile model call entirely rather than paying for a Profile nothing reads.
    const textOnly = new URL(request.url).searchParams.get('mode') === 'text';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      text = body.text || '';
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return failWith('RESUME_PARSE_FAILED', { message: 'No file was uploaded. Choose a PDF, or paste your resume text instead.' });
      }

      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        return failWith('RESUME_PARSE_FAILED', { message: 'Only PDF files are accepted. You can also paste your resume text instead.' });
      }

      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        return failWith('RESUME_PARSE_FAILED', { message: 'That file is over the 5 MB limit. Try a smaller PDF, or paste your resume text instead.' });
      }

      const arrayBuffer = await file.arrayBuffer();
      try {
        const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
        const textResult = await parser.getText();
        text = textResult.text || '';
        await parser.destroy();
      } catch (parseError) {
        console.error('PDF parsing library error:', parseError);
        return failWith('RESUME_PARSE_FAILED', {
          message: "We couldn't open that PDF — it may be corrupt or password-protected. Paste your resume text instead.",
        });
      }
    }

    const cleanText = text.trim();

    // Too short to be a real resume — most likely a scanned image with no OCR text layer.
    // Returned as a typed RESUME_PARSE_FAILED so the client shows the paste-text fallback as
    // an explicit next action rather than inferring it from a 200 with a flag.
    if (cleanText.length < 150) {
      return failWith('RESUME_PARSE_FAILED', {
        message:
          'This PDF has no readable text layer — it looks like a scan or an image. Paste your resume text instead and we can carry on.',
      });
    }

    if (textOnly) return NextResponse.json({ text: cleanText });

    const profile = await withTelemetryContext(
      telemetryContextFromRequest(request, '/api/parse-resume'),
      () => extractProfile(cleanText)
    );

    if (!profile) {
      return NextResponse.json({
        insufficientInfo: true,
        error: "We couldn't find enough relevant career information in this to build a profile.",
      });
    }

    return NextResponse.json({
      profile,
      // Returned so the resume-review surface can carry the same document over without asking
      // the user to upload it a second time. It is their own resume, already in this response's
      // request cycle — re-extracting it later would mean a second PDF parse for no reason.
      text: cleanText,
      textIsEmpty: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
