export type ProcessMode = 'translate' | 'transcribe';

export interface DiarizedSegment {
  speaker: string;
  start: string;
  end: string;
  text: string;
}

export interface GenerateSrtResult {
  srt: string;
  diarization: DiarizedSegment[];
}

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

export async function generateSRT(fileBase64: string, mimeType: string, mode: ProcessMode = 'translate'): Promise<GenerateSrtResult> {
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
  return {
    srt: data.srt || '',
    diarization: Array.isArray(data.diarization) ? data.diarization : [],
  };
}

export async function diarizeMedia(fileBase64: string, mimeType: string, mode: ProcessMode = 'transcribe'): Promise<DiarizedSegment[]> {
  const response = await fetch('/api/diarize', {
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
    const errData = await response.json().catch(() => ({ error: 'Diarization failed' }));
    throw new Error(errData.error || `Speaker diarization error (${response.status})`);
  }

  return response.json();
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

