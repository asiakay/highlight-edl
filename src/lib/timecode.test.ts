import { describe, expect, it } from 'vitest';
import {
  FRAME_RATES,
  framesToTimecode,
  normalizeRate,
  secondsToFrames,
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
});
