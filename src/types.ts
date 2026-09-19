export interface DiarizationItem {
  speaker: string;
  start: string;
  end: string;
  text: string;
}

export type ActiveTab = 'srt' | 'diarization';
