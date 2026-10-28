import { describe, expect, it } from 'vitest';
import { initialMarkerState, markerReducer, type MarkerState } from './markers';

const add = (state: MarkerState, timeSec: number, id = String(timeSec), durationSec = 100) =>
  markerReducer(state, { type: 'add', id, tag: '#quote', timeSec, durationSec, createdAt: 'now' });

describe('markerReducer', () => {
  it('applies pre/post-roll handles and clamps to the media bounds', () => {
    const s = add(add(initialMarkerState, 50), 0.5, 'early');
    expect(s.markers.map((m) => [m.id, m.inSec, m.outSec])).toEqual([
      ['early', 0, 3.5],
      ['50', 48, 53],
    ]);
    const end = add(initialMarkerState, 99.5);
    expect(end.markers[0]).toMatchObject({ inSec: 97.5, outSec: 100 });
  });

  it('keeps markers sorted when an in point moves', () => {
    let s = add(add(initialMarkerState, 10), 20);
    s = markerReducer(s, { type: 'update', id: '20', patch: { inSec: 1 } });
    expect(s.markers.map((m) => m.id)).toEqual(['20', '10']);
  });

  it('never lets out precede in', () => {
    let s = add(initialMarkerState, 10);
    s = markerReducer(s, { type: 'update', id: '10', patch: { inSec: 20 } });
    expect(s.markers[0]).toMatchObject({ inSec: 20, outSec: 20.1 });
    s = markerReducer(s, { type: 'update', id: '10', patch: { outSec: 5 } });
    expect(s.markers[0]).toMatchObject({ inSec: 4.9, outSec: 5 });
  });

  it('removes and clears', () => {
    let s = add(add(initialMarkerState, 10), 20);
    s = markerReducer(s, { type: 'remove', id: '10' });
    expect(s.markers).toHaveLength(1);
    expect(markerReducer(s, { type: 'clear' }).markers).toHaveLength(0);
  });
});
