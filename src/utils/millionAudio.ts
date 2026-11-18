import { MILLION_PRESENTER_AUDIO_CONFIG, type PresenterCue } from '../config/millionPresenterAudio';

const MUTE_STORAGE_KEY = 'cfo_million_audio_muted_v1';

let sharedAudioCtx: AudioContext | null = null;
let activeClipAudio: HTMLAudioElement | null = null;

export function isMillionAudioMuted(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMillionAudioMuted(muted: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
    }
    if (muted && activeClipAudio) {
      activeClipAudio.pause();
      activeClipAudio = null;
    }
  } catch {
    // Ignore storage unavailability in restricted environments
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playToneSequence(notes: Array<{ freq: number; duration: number; delay: number; type?: OscillatorType; gain?: number }>): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = note.type || 'triangle';
    osc.frequency.setValueAtTime(note.freq, now + note.delay);
    const peak = note.gain ?? 0.08;
    gainNode.gain.setValueAtTime(0.0001, now + note.delay);
    gainNode.gain.exponentialRampToValueAtTime(peak, now + note.delay + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.duration);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + note.delay);
    osc.stop(now + note.delay + note.duration + 0.02);
  }
}

const STUDIO_SYNTH_CUES: Record<PresenterCue, Array<{ freq: number; duration: number; delay: number; type?: OscillatorType; gain?: number }>> = {
  intro: [
    { freq: 392, duration: 0.14, delay: 0, type: 'triangle', gain: 0.09 },
    { freq: 523.25, duration: 0.14, delay: 0.11, type: 'triangle', gain: 0.09 },
    { freq: 659.25, duration: 0.28, delay: 0.22, type: 'triangle', gain: 0.1 },
  ],
  nextQuestion: [
    { freq: 440, duration: 0.1, delay: 0, type: 'sine', gain: 0.06 },
    { freq: 587.33, duration: 0.16, delay: 0.08, type: 'sine', gain: 0.07 },
  ],
  correct: [
    { freq: 523.25, duration: 0.12, delay: 0, type: 'triangle', gain: 0.09 },
    { freq: 659.25, duration: 0.12, delay: 0.09, type: 'triangle', gain: 0.09 },
    { freq: 783.99, duration: 0.24, delay: 0.18, type: 'triangle', gain: 0.1 },
  ],
  wrong: [
    { freq: 293.66, duration: 0.18, delay: 0, type: 'sawtooth', gain: 0.06 },
    { freq: 220, duration: 0.34, delay: 0.15, type: 'sawtooth', gain: 0.06 },
  ],
  help: [
    { freq: 587.33, duration: 0.1, delay: 0, type: 'sine', gain: 0.07 },
    { freq: 783.99, duration: 0.16, delay: 0.08, type: 'sine', gain: 0.07 },
  ],
  stop: [
    { freq: 493.88, duration: 0.14, delay: 0, type: 'triangle', gain: 0.07 },
    { freq: 440, duration: 0.22, delay: 0.12, type: 'triangle', gain: 0.07 },
  ],
  millionWin: [
    { freq: 523.25, duration: 0.14, delay: 0, type: 'triangle', gain: 0.1 },
    { freq: 659.25, duration: 0.14, delay: 0.1, type: 'triangle', gain: 0.1 },
    { freq: 783.99, duration: 0.14, delay: 0.2, type: 'triangle', gain: 0.1 },
    { freq: 1046.5, duration: 0.45, delay: 0.3, type: 'triangle', gain: 0.11 },
  ],
};

export function playMillionCue(cue: PresenterCue): void {
  if (isMillionAudioMuted()) return;
  try {
    const clipUrl = MILLION_PRESENTER_AUDIO_CONFIG.enabled
      ? MILLION_PRESENTER_AUDIO_CONFIG.clips[cue]
      : null;

    if (clipUrl && typeof Audio !== 'undefined') {
      if (activeClipAudio) {
        activeClipAudio.pause();
      }
      const audio = new Audio(clipUrl);
      activeClipAudio = audio;
      void audio.play().catch(() => {
        playToneSequence(STUDIO_SYNTH_CUES[cue]);
      });
      return;
    }

    playToneSequence(STUDIO_SYNTH_CUES[cue]);
  } catch {
    // Ignore audio failures when blocked by browser autoplay policy
  }
}
