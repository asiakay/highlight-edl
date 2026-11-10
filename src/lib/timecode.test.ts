import { describe, expect, it } from 'vitest';
import {
  FRAME_RATES,
  framesToTimecode,
  normalizeRate,
  secondsToFrames,
  snapToFrame,
  stepTarget,
  supportsDropFrame,
  timecodeToFrames,
} from './timecode';

const rate = (label: string) => FRAME_RATES.find((r) => r.label === label)!;

describe('timecode', () => {
  it('formats non-drop-frame timecode at integer rates', () => {
    expect(framesToTimecode(0, rate('25'))).toBe('00:00:00:00');
    expect(framesToTimecode(25 * 3661 + 7, rate('25'))).toBe('01:01:01:07');
  });

  it('counts 23.976 at a nominal 24 fps', () => {
    expect(framesToTimecode(24, rate('23.976'))).toBe('00:00:01:00');
    // 10 real seconds at 23.976 is 240 frames (rounded) -> 00:00:10:00 of timecode.
    expect(secondsToFrames(10.01, rate('23.976'))).toBe(240);
  });

  it('skips frame numbers 00 and 01 each minute in 29.97 drop-frame', () => {
    const r = rate('29.97');
    expect(framesToTimecode(1799, r, true)).toBe('00:00:59;29');
    expect(framesToTimecode(1800, r, true)).toBe('00:01:00;02');
    // ...except every tenth minute.
    expect(framesToTimecode(17982, r, true)).toBe('00:10:00;00');
    // One hour of 29.97 DF is 107892 frames.
    expect(framesToTimecode(107892, r, true)).toBe('01:00:00;00');
  });

  it('round-trips drop-frame timecode', () => {
    const r = rate('59.94');
    for (const f of [0, 3, 3596, 3600, 35964, 215784, 123457]) {
      expect(timecodeToFrames(framesToTimecode(f, r, true), r, true)).toBe(f);
    }
  });

  it('ignores the drop-frame flag on rates that have no drop-frame', () => {
    expect(supportsDropFrame(rate('25'))).toBe(false);
    expect(framesToTimecode(1800, rate('30'), true)).toBe('00:01:00:00');
  });

  it('rejects malformed timecode', () => {
    expect(timecodeToFrames('1:2:3', rate('25'))).toBeNull();
    expect(timecodeToFrames('00:00:00:25', rate('25'))).toBeNull();
    expect(timecodeToFrames('00:61:00:00', rate('25'))).toBeNull();
  });

  it('snaps measured rates to standard ones', () => {
    expect(normalizeRate(29.970029).label).toBe('29.97');
    expect(normalizeRate({ num: 2997, den: 100 }).label).toBe('29.97');
    expect(normalizeRate(12.5).label).toBe('12.5');
  });

  it('steps one frame at a time in both directions', () => {
    for (const r of [rate('25'), rate('29.97'), rate('23.976')]) {
      let t = stepTarget(10 / (r.num / r.den), r, 0);
      expect(secondsToFrames(t, r)).toBe(10);
      for (let i = 1; i <= 5; i++) {
        t = stepTarget(t, r, 1);
        expect(secondsToFrames(t, r)).toBe(10 + i);
      }
      for (let i = 1; i <= 8; i++) {
        t = stepTarget(t, r, -1);
        expect(secondsToFrames(t, r)).toBe(15 - i);
      }
    }
  });

  it('steps from the frame on screen, not the nearest frame boundary', () => {
    const r = rate('25');
    // 0.7 into frame 10: frame 10 is showing, so back one is frame 9.
    expect(secondsToFrames(stepTarget(10.7 / 25, r, -1), r)).toBe(9);
    expect(stepTarget(0.01, r, -3)).toBeCloseTo(0.25 / 25);
  });

  it('snaps a playhead time to the frame on screen, surviving ms rounding', () => {
    const r = rate('29.97');
    // 2.0s is 59.94 frames in: frame 59 is showing, not 60.
    const t = snapToFrame(2, r);
    expect(secondsToFrames(t, r)).toBe(59);
    expect(secondsToFrames(Math.round(t * 1000) / 1000, r)).toBe(59);
  });
});
