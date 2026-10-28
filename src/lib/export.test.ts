import { describe, expect, it } from 'vitest';
import type { Marker } from '../state/markers';
import { DEFAULT_EXPORT_OPTIONS, buildEdl, buildManifest, type ExportSource } from './export';
import { FRAME_RATES } from './timecode';

const r25 = FRAME_RATES.find((r) => r.label === '25')!;
const r2997 = FRAME_RATES.find((r) => r.label === '29.97')!;

const source: ExportSource = {
  name: 'interview.mp4',
  sizeBytes: 1234,
  durationSec: 120,
  rate: r25,
  dropFrame: false,
  startTimecode: '00:00:00:00',
  rateSource: 'manual',
};

const marker = (p: Partial<Marker> & Pick<Marker, 'id' | 'inSec' | 'outSec'>): Marker => ({
  tag: '#quote',
  markSec: p.inSec,
  note: '',
  createdAt: '2026-10-28T00:00:00.000Z',
  ...p,
});

const markers = [
  marker({ id: 'b', tag: '#broll', inSec: 30, outSec: 32.5 }),
  marker({ id: 'a', inSec: 10, outSec: 14, note: 'Great line\nabout co-ops — really' }),
];

describe('buildEdl', () => {
  it('emits CMX3600 events in source order with a contiguous record side', () => {
    expect(buildEdl(markers, source, DEFAULT_EXPORT_OPTIONS)).toBe(
      [
        'TITLE: HIGHLIGHTS',
        'FCM: NON-DROP FRAME',
        '',
        '001  AX       AA/V  C        00:00:10:00 00:00:14:00 01:00:00:00 01:00:04:00',
        '* FROM CLIP NAME: interview.mp4',
        '* COMMENT: #quote Great line about co-ops  really',
        '',
        '002  AX       AA/V  C        00:00:30:00 00:00:32:13 01:00:04:00 01:00:06:13',
        '* FROM CLIP NAME: interview.mp4',
        '* COMMENT: #broll',
        '',
      ].join('\n'),
    );
  });

  it('offsets source timecode by the embedded start and honours drop-frame', () => {
    const edl = buildEdl(
      [marker({ id: 'x', inSec: 60, outSec: 61 })],
      { ...source, rate: r2997, dropFrame: true, startTimecode: '10:00:00;00' },
      { ...DEFAULT_EXPORT_OPTIONS, recordStart: '01:00:00;00' },
    );
    expect(edl).toContain('FCM: DROP FRAME');
    // 30 frames after 10:00:59;28 crosses a minute, so ;00 and ;01 are skipped.
    expect(edl).toContain('10:00:59;28 10:01:01;00 01:00:00;00 01:00:01;00');
  });
});

describe('buildManifest', () => {
  it('produces a sorted, summarised, deterministic manifest', () => {
    const m = buildManifest(markers, source, DEFAULT_EXPORT_OPTIONS, new Date('2026-10-28T12:00:00Z'));
    expect(m.schema).toBe('highlight-edl/manifest@1');
    expect(m.generatedAt).toBe('2026-10-28T12:00:00.000Z');
    expect(m.markers.map((x) => x.id)).toEqual(['a', 'b']);
    expect(m.markers[1]).toMatchObject({ index: 2, inTimecode: '00:00:30:00', outTimecode: '00:00:32:13', durationSec: 2.5 });
    expect(m.summary).toEqual({ count: 2, totalDurationSec: 6.5, byTag: { '#quote': 1, '#broll': 1 } });
    expect(m.source.frameRate).toEqual({ num: 25, den: 1, label: '25' });
  });
});
