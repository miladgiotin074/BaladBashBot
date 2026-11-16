// جلوه‌های صوتی ساده با Web Audio (بدون نیاز به فایل صوتی)
import { loadSetting, saveSetting } from './util.ts';

let enabled = loadSetting('sound', 'on') === 'on';
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  saveSetting('sound', on ? 'on' : 'off');
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, duration: number, delay = 0, type: OscillatorType = 'sine', volume = 0.07): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  const start = a.currentTime + delay;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sfx = {
  tap: (): void => tone(520, 0.06, 0, 'triangle', 0.04),
  tick: (): void => tone(880, 0.05, 0, 'square', 0.025),
  correct: (): void => {
    tone(660, 0.12, 0, 'triangle');
    tone(990, 0.2, 0.1, 'triangle');
  },
  wrong: (): void => {
    tone(220, 0.18, 0, 'sawtooth', 0.05);
    tone(160, 0.28, 0.12, 'sawtooth', 0.05);
  },
  win: (): void => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, i * 0.11, 'triangle'));
  },
  lose: (): void => {
    [392, 330, 262].forEach((f, i) => tone(f, 0.26, i * 0.15, 'sine', 0.06));
  },
  coin: (): void => {
    tone(1200, 0.08, 0, 'square', 0.03);
    tone(1600, 0.14, 0.07, 'square', 0.03);
  },
};
