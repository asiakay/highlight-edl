// SMPTE timecode math. Rates are exact rationals (30000/1001, not 29.97) so
// frame counts never drift; timecode digits always count at the nominal
// (rounded) rate, which is how NTSC timecode works.

export interface FrameRate {
  num: number;
  den: number;
}

export interface FrameRateOption extends FrameRate {
  label: string;
}

export const FRAME_RATES: readonly FrameRateOption[] = [
  { label: '23.976', num: 24000, den: 1001 },
  { label: '24', num: 24, den: 1 },
  { label: '25', num: 25, den: 1 },
  { label: '29.97', num: 30000, den: 1001 },
  { label: '30', num: 30, den: 1 },
  { label: '50', num: 50, den: 1 },
  { label: '59.94', num: 60000, den: 1001 },
  { label: '60', num: 60, den: 1 },
];

export const DEFAULT_RATE: FrameRateOption = FRAME_RATES[3]!;

export function fps(rate: FrameRate): number {
  return rate.num / rate.den;
}

export function nominalFps(rate: FrameRate): number {
  return Math.round(rate.num / rate.den);
}

export function rateLabel(rate: FrameRate): string {
  const known = FRAME_RATES.find((r) => r.num * rate.den === rate.num * r.den);
  return known ? known.label : String(Math.round(fps(rate) * 1000) / 1000);
}

/** Snap an arbitrary measured rate (e.g. 29.970029) to a standard one when close. */
export function normalizeRate(value: number | FrameRate): FrameRateOption {
  const f = typeof value === 'number' ? value : fps(value);
  const known = FRAME_RATES.find((r) => Math.abs(fps(r) - f) < 0.01);
  if (known) return known;
  if (typeof value !== 'number') return { ...value, label: rateLabel(value) };
  const num = Math.round(f * 1000);
  return { num, den: 1000, label: String(num / 1000) };
}

/** Drop-frame only exists for the 1001-denominator 30/60 families. */
export function supportsDropFrame(rate: FrameRate): boolean {
  const nom = nominalFps(rate);
  return rate.den === 1001 && (nom === 30 || nom === 60);
}

function dropCount(rate: FrameRate): number {
  return nominalFps(rate) === 60 ? 4 : 2;
}

export function secondsToFrames(seconds: number, rate: FrameRate): number {
  return Math.round((Math.max(0, seconds) * rate.num) / rate.den);
}

export function framesToSeconds(frames: number, rate: FrameRate): number {
  return (frames * rate.den) / rate.num;
}

/** The frame on screen at a playhead time: the one containing it (floor, not round). */
export function frameAt(seconds: number, rate: FrameRate): number {
  return Math.max(0, Math.floor((seconds * rate.num) / rate.den + 1e-6));
}

/**
 * A quarter of the way into a frame: past its start so decoders don't show the
 * previous frame, and short of the midpoint so secondsToFrames (which rounds,
 * and is safe on ms-rounded stored times) maps it back to the same frame.
 */
function insideFrame(frame: number, rate: FrameRate): number {
  return framesToSeconds(Math.max(0, frame) + 0.25, rate);
}

/** Playhead time moved onto the frame on screen, so exports agree with the readout. */
export function snapToFrame(seconds: number, rate: FrameRate): number {
  return insideFrame(frameAt(seconds, rate), rate);
}

/** Seek position for stepping `frames` from the frame on screen at `seconds`. */
export function stepTarget(seconds: number, rate: FrameRate, frames: number): number {
  return insideFrame(frameAt(seconds, rate) + frames, rate);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function framesToTimecode(frames: number, rate: FrameRate, dropFrame = false): string {
  const nom = nominalFps(rate);
  const df = dropFrame && supportsDropFrame(rate);
  let f = Math.max(0, Math.round(frames));

  if (df) {
    const drop = dropCount(rate);
    const per10Min = nom * 600 - drop * 9;
    const perMin = nom * 60 - drop;
    const tens = Math.floor(f / per10Min);
    const rem = f % per10Min;
    f += drop * 9 * tens + (rem > drop ? drop * Math.floor((rem - drop) / perMin) : 0);
  }

  const ff = f % nom;
  const ss = Math.floor(f / nom) % 60;
  const mm = Math.floor(f / (nom * 60)) % 60;
  const hh = Math.floor(f / (nom * 3600)) % 24;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}${df ? ';' : ':'}${pad2(ff)}`;
}

const TC_RE = /^(\d{1,2})[:;.](\d{2})[:;.](\d{2})[:;.,](\d{2,3})$/;

export function isValidTimecode(tc: string, rate: FrameRate): boolean {
  const m = TC_RE.exec(tc.trim());
  if (!m) return false;
  const [, , mm, ss, ff] = m.map(Number) as number[];
  return mm! < 60 && ss! < 60 && ff! < nominalFps(rate);
}

/** Parses HH:MM:SS:FF (or ;FF for drop-frame). Returns null when malformed. */
export function timecodeToFrames(tc: string, rate: FrameRate, dropFrame = false): number | null {
  if (!isValidTimecode(tc, rate)) return null;
  const [, hh, mm, ss, ff] = TC_RE.exec(tc.trim())!.map(Number) as number[];
  const nom = nominalFps(rate);
  let frames = (hh! * 3600 + mm! * 60 + ss!) * nom + ff!;
  if (dropFrame && supportsDropFrame(rate)) {
    const totalMinutes = hh! * 60 + mm!;
    frames -= dropCount(rate) * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  return frames;
}

export function secondsToTimecode(seconds: number, rate: FrameRate, dropFrame = false): string {
  return framesToTimecode(secondsToFrames(seconds, rate), rate, dropFrame);
}

/** Compact human duration, e.g. "4.20s" or "1:02.5". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, '0')}`;
}
