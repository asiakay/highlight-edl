import type { Dispatch } from 'react';
import { type FrameRate, formatDuration, framesToTimecode, secondsToFrames } from '../lib/timecode';
import { TAGS, type Marker, type MarkerAction, type Tag } from '../state/markers';
import { tagClass } from './TagBar';

interface Props {
  markers: Marker[];
  dispatch: Dispatch<MarkerAction>;
  rate: FrameRate;
  dropFrame: boolean;
  startFrames: number;
  currentTime: number;
  onSeek: (sec: number) => void;
}

export function MarkerList({ markers, dispatch, rate, dropFrame, startFrames, currentTime, onSeek }: Props) {
  const tc = (sec: number) => framesToTimecode(startFrames + secondsToFrames(sec, rate), rate, dropFrame);

  if (markers.length === 0) {
    return (
      <section className="panel markers" aria-label="Logged markers">
        <header className="panel__head">
          <h2>Markers</h2>
        </header>
        <p className="empty">Press a tag button (or 1 / 2 / 3) while the video plays to log a highlight.</p>
      </section>
    );
  }

  return (
    <section className="panel markers" aria-label="Logged markers">
      <header className="panel__head">
        <h2>
          Markers <span className="count">{markers.length}</span>
        </h2>
        <button
          type="button"
          className="btn btn--ghost btn--danger"
          onClick={() => {
            if (confirm(`Delete all ${markers.length} markers?`)) dispatch({ type: 'clear' });
          }}
        >
          Clear all
        </button>
      </header>
      <ol className="markers__list">
        {markers.map((m, i) => {
          const active = currentTime >= m.inSec && currentTime < m.outSec;
          return (
            <li key={m.id} className={`marker${active ? ' is-active' : ''}`}>
              <div className="marker__row">
                <span className="marker__num">{String(i + 1).padStart(2, '0')}</span>
                <select
                  className={`marker__tag ${tagClass(m.tag)}`}
                  value={m.tag}
                  aria-label="Tag"
                  onChange={(e) => dispatch({ type: 'update', id: m.id, patch: { tag: e.target.value as Tag } })}
                >
                  {TAGS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button type="button" className="marker__jump tc" onClick={() => onSeek(m.inSec)} title="Jump to in point">
                  {tc(m.inSec)}
                </button>
                <span className="marker__arrow" aria-hidden="true">
                  →
                </span>
                <button type="button" className="marker__jump tc" onClick={() => onSeek(m.outSec)} title="Jump to out point">
                  {tc(m.outSec)}
                </button>
                <span className="marker__dur">{formatDuration(m.outSec - m.inSec)}</span>
              </div>
              <div className="marker__row marker__row--edit">
                <input
                  className="marker__note"
                  type="text"
                  placeholder="Note (optional)"
                  value={m.note}
                  onChange={(e) => dispatch({ type: 'update', id: m.id, patch: { note: e.target.value } })}
                />
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => dispatch({ type: 'update', id: m.id, patch: { inSec: currentTime } })}
                  title="Set in point to playhead"
                >
                  In ⇤
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => dispatch({ type: 'update', id: m.id, patch: { outSec: currentTime } })}
                  title="Set out point to playhead"
                >
                  ⇥ Out
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => dispatch({ type: 'remove', id: m.id })}
                  aria-label={`Delete marker ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
