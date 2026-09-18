export type ProcessMode = 'translate' | 'transcribe';

export interface DetectedLanguage {
  name: string;
  code: string;
  nativeName: string;
  flagEmoji: string;
}

export interface LiveTranscriptionResult {
  hasSpeech: boolean;
  detectedLanguage: DetectedLanguage | null;
  transcript: string;
  translation: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface MediaLanguageDetectionResult {
  hasSpeech: boolean;
  detectedLanguage: DetectedLanguage | null;
  confidence: 'high' | 'medium' | 'low';
  snippet?: string;
  snippetTranslation?: string;
  summary?: string;
}

export async function detectMediaLanguage(
  fileBase64: string,
  mimeType: string
): Promise<MediaLanguageDetectionResult> {
  const response = await fetch('/api/detect-media-language', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileBase64,
      mimeType,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: 'Language detection failed' }));
    throw new Error(errData.error || `Language detection error (${response.status})`);
  }

  return response.json();
}

export async function generateSRT(fileBase64: string, mimeType: string, mode: ProcessMode = 'translate'): Promise<string> {
  const response = await fetch('/api/generate-srt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileBase64,
      mimeType,
      mode,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errData.error || `Failed to generate SRT (${response.status})`);
  }

  const data = await response.json();
  return data.srt;
}

export async function transcribeLiveAudio(
  audioBase64: string,
  mimeType: string = 'audio/webm',
  translateToEnglish: boolean = true
): Promise<LiveTranscriptionResult> {
  const response = await fetch('/api/transcribe-live', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioBase64,
      mimeType,
      translateToEnglish,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: 'Live transcription failed' }));
    throw new Error(errData.error || `Server error during transcription (${response.status})`);
  }

  return response.json();
}

