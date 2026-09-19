import { DiarizationItem } from '../types';

/**
 * Converts a timestamp like "00:00:01,200" or "00:00:01.200" to seconds.
 */
export function srtTimeToSeconds(timestamp: string): number {
  if (!timestamp) return 0;
  const cleaned = timestamp.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(cleaned) || 0;
}

/**
 * Converts DiarizationItem array into formatted SubRip (.srt) format with speaker tags.
 */
export function diarizationToSrt(items: DiarizationItem[]): string {
  return items
    .map((item, index) => {
      const start = item.start.includes(',') ? item.start : item.start.replace('.', ',');
      const end = item.end.includes(',') ? item.end : item.end.replace('.', ',');
      const text = item.text.trim();
      return `${index + 1}\n${start} --> ${end}\n[${item.speaker}]: ${text}\n`;
    })
    .join('\n');
}

/**
 * Converts DiarizationItem array into WebVTT format for native HTML5 video/audio subtitle tracks.
 */
export function diarizationToVtt(items: DiarizationItem[]): string {
  let vtt = 'WEBVTT\n\n';
  items.forEach((item, index) => {
    const start = item.start.replace(',', '.');
    const end = item.end.replace(',', '.');
    vtt += `${index + 1}\n${start} --> ${end}\n<v ${item.speaker}>${item.text.trim()}\n\n`;
  });
  return vtt;
}

/**
 * Generates a consistent, attractive color scheme for any speaker string (Speaker 1, Speaker 2, etc.)
 */
const SPEAKER_PALETTES = [
  {
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    bubble: 'bg-indigo-50/50 border-indigo-100 text-indigo-950',
    dot: 'bg-indigo-600',
    avatarBg: 'bg-indigo-600 text-white',
  },
  {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    bubble: 'bg-emerald-50/50 border-emerald-100 text-emerald-950',
    dot: 'bg-emerald-600',
    avatarBg: 'bg-emerald-600 text-white',
  },
  {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    bubble: 'bg-amber-50/50 border-amber-100 text-amber-950',
    dot: 'bg-amber-600',
    avatarBg: 'bg-amber-600 text-white',
  },
  {
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    bubble: 'bg-rose-50/50 border-rose-100 text-rose-950',
    dot: 'bg-rose-600',
    avatarBg: 'bg-rose-600 text-white',
  },
  {
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    bubble: 'bg-cyan-50/50 border-cyan-100 text-cyan-950',
    dot: 'bg-cyan-600',
    avatarBg: 'bg-cyan-600 text-white',
  },
  {
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    bubble: 'bg-purple-50/50 border-purple-100 text-purple-950',
    dot: 'bg-purple-600',
    avatarBg: 'bg-purple-600 text-white',
  },
];

export function getSpeakerStyle(speakerName: string) {
  // Extract number if formatted like "Speaker 1", else hash the name
  const match = speakerName.match(/\d+/);
  let index = 0;
  if (match) {
    index = (parseInt(match[0], 10) - 1) % SPEAKER_PALETTES.length;
  } else {
    let hash = 0;
    for (let i = 0; i < speakerName.length; i++) {
      hash = speakerName.charCodeAt(i) + ((hash << 5) - hash);
    }
    index = Math.abs(hash) % SPEAKER_PALETTES.length;
  }
  return SPEAKER_PALETTES[index] || SPEAKER_PALETTES[0];
}
