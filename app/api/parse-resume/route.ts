import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { extractProfile, generateOpeningMessage } from '@/lib/ai/coach';

export const maxDuration = 60; // Allow enough time for parsing + model generation

export async function POST(request: NextRequest) {
  try {
    let text = '';
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      text = body.text || '';
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
      }

      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        return NextResponse.json({ error: 'Only PDF files are accepted.' }, { status: 400 });
      }

      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File size exceeds the 5 MB limit.' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      try {
        const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
        const textResult = await parser.getText();
        text = textResult.text || '';
        await parser.destroy();
      } catch (parseError: any) {
        console.error('PDF parsing library error:', parseError);
        return NextResponse.json({
          error: 'Unreadable PDF file. The file may be corrupt or secured.',
        }, { status: 450 });
      }
    }

    const cleanText = text.trim();

    // Too short to be a real resume — most likely a scanned image with no OCR text layer.
    if (cleanText.length < 150) {
      return NextResponse.json({
        textIsEmpty: true,
        error: 'This PDF seems to have no readable text layer (e.g. it is a scanned image). Please paste your resume text in the chat instead.',
      });
    }

    const profile = await extractProfile(cleanText);

    if (!profile) {
      return NextResponse.json({
        insufficientInfo: true,
        error: "We couldn't find enough relevant career information in this to build a profile.",
      });
    }

    const openingMessage = await generateOpeningMessage(profile);

    return NextResponse.json({
      profile,
      openingMessage,
      textIsEmpty: false,
    });
  } catch (error: any) {
    console.error('Error in parse-resume route:', error);
    return NextResponse.json({
      error: error.message || 'An error occurred during resume parsing.',
    }, { status: 500 });
  }
}
