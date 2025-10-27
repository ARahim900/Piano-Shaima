
export interface SongNote {
  note: string; // e.g., "C4", "F#5", or "Rest"
  duration: number; // in milliseconds
  startTime: number; // in milliseconds from the start of the song
}

export type AppState = 'IDLE' | 'LOADING' | 'LOADED' | 'PLAYING' | 'PAUSED' | 'ERROR' | 'LEARNING';

export interface Transcription {
  user: string;
  assistant: string;
  isTurnComplete: boolean;
}