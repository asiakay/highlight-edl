import { useEffect, useState, type RefObject } from 'react';
import { type FrameRate, framesToSeconds, framesToTimecode, secondsToFrames } from '../lib/timecode';

interface Props {
  src: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  rate: FrameRate;
  dropFrame: boolean;
  startFrames: number;
  currentTime: number;
  duration: number;
  onTime: (t: number) => void;
  onDuration: (d: number) => void;
}

const RATES = [0.25, 0.5, 1, 1.5, 2];

export function stepFrames(video: HTMLVideoElement, rate: FrameRate, frames: number) {
  video.pause();
  // Land in the middle of the target frame so decoders don't round back a frame.
  const target = secondsToFrames(video.currentTime, rate) + frames;
  video.currentTime = Math.max(0, framesToSeconds(target + 0.5, rate));
}

export function Player({ src, videoRef, rate, dropFrame, startFrames, currentTime, duration, onTime, onDuration }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [src]);

  // Poll per animation frame while playing; `timeupdate` alone fires ~4x/sec.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    let id = 0;
    const tick = () => {
      onTime(v.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, videoRef, onTime]);

  const v = () => videoRef.current;
  const seekBy = (sec: number) => {
    const el = v();
    if (el) el.currentTime = Math.min(Math.max(0, el.currentTime + sec), el.duration || Infinity);
  };
  const tc = framesToTimecode(startFrames + secondsToFrames(currentTime, rate), rate, dropFrame);
  const endTc = framesToTimecode(startFrames + secondsToFrames(duration, rate), rate, dropFrame);

  return (
    <section className="player" aria-label="Video player">
      <div className="player__stage">
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="auto"
          onClick={() => {
            const el = v();
            if (el) void (el.paused ? el.play() : el.pause());
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          onSeeked={(e) => onTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            onDuration(e.currentTarget.duration);
            e.currentTarget.playbackRate = speed;
          }}
          onError={() =>
            setError(
              'Your browser can’t decode this file’s codec (common with ProRes, DNxHD or HEVC). Try an H.264/MP4 or WebM proxy.',
            )
          }
        />
        {error && <div className="player__error">{error}</div>}
      </div>

      <input
        className="player__scrub"
        type="range"
        min={0}
        max={duration || 0}
        step="any"
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => {
          const el = v();
          if (el) el.currentTime = Number(e.target.value);
        }}
        aria-label="Seek"
        disabled={!duration}
      />

      <div className="player__controls">
        <div className="player__buttons">
          <button type="button" className="btn btn--icon" onClick={() => seekBy(-5)} title="Back 5s (J)" aria-label="Back 5 seconds">
            −5s
          </button>
          <button type="button" className="btn btn--icon" onClick={() => v() && stepFrames(v()!, rate, -1)} title="Previous frame (←)" aria-label="Previous frame">
            ◂|
          </button>
          <button
            type="button"
            className="btn btn--play"
            onClick={() => {
              const el = v();
              if (el) void (el.paused ? el.play() : el.pause());
            }}
            title="Play / pause (Space or K)"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="btn btn--icon" onClick={() => v() && stepFrames(v()!, rate, 1)} title="Next frame (→)" aria-label="Next frame">
            |▸
          </button>
          <button type="button" className="btn btn--icon" onClick={() => seekBy(5)} title="Forward 5s (L)" aria-label="Forward 5 seconds">
            +5s
          </button>
        </div>
        <div className="player__readout">
          <span className="tc tc--big" aria-live="off">
            {tc}
          </span>
          <span className="tc tc--dim">/ {endTc}</span>
        </div>
        <label className="player__speed">
          <span className="sr-only">Playback speed</span>
          <select
            value={speed}
            onChange={(e) => {
              const s = Number(e.target.value);
              setSpeed(s);
              const el = v();
              if (el) el.playbackRate = s;
            }}
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
