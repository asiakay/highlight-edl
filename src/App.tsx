import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DropZone } from './components/DropZone';
import { ExportPanel } from './components/ExportPanel';
import { MarkerList } from './components/MarkerList';
import { Player, stepFrames } from './components/Player';
import { TAG_KEYS, TagBar } from './components/TagBar';
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions, type ExportSource } from './lib/export';
import { driveEnabled, openDriveFile, pickDriveFile, reconnectDrive } from './lib/drive';
import { type LoadedMedia, localMedia } from './lib/media';
import { type ProbeResult, probeMedia } from './lib/probe';
import {
  DEFAULT_RATE,
  FRAME_RATES,
  type FrameRateOption,
  isValidTimecode,
  rateLabel,
  snapToFrame,
  supportsDropFrame,
  timecodeToFrames,
} from './lib/timecode';
import { TAGS, type Tag, initialMarkerState, loadSaved, markerReducer, save, storageKey } from './state/markers';

type ProbeState = { status: 'idle' | 'probing' | 'failed' } | { status: 'done'; result: ProbeResult };

type Loaded = LoadedMedia & { key: string };

type DriveState = { status: 'idle' } | { status: 'busy'; label: string; progress?: number } | { status: 'error'; message: string };

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Bumped per loaded file so a slow probe of a replaced file can't apply its metadata.
  const probeGen = useRef(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [state, dispatch] = useReducer(markerReducer, initialMarkerState);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<FrameRateOption>(DEFAULT_RATE);
  const [dropFrame, setDropFrame] = useState(false);
  const [startTimecode, setStartTimecode] = useState('00:00:00:00');
  const [probe, setProbe] = useState<ProbeState>({ status: 'idle' });
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [lastTag, setLastTag] = useState<Tag | null>(null);
  const [drive, setDrive] = useState<DriveState>({ status: 'idle' });


  const openMedia = useCallback(
    (media: LoadedMedia) => {
      setLoaded((prev) => {
        prev?.dispose();
        return { ...media, key: storageKey(media) };
      });
      const saved = loadSaved(storageKey(media));
      dispatch({
        type: 'load',
        state: saved ?? { ...initialMarkerState, preRollSec: state.preRollSec, postRollSec: state.postRollSec },
      });
      setCurrentTime(0);
      setDuration(0);
      setOptions((o) => ({ ...o, title: media.name.replace(/\.[^.]+$/, '') }));
      setProbe({ status: 'probing' });
      const gen = ++probeGen.current;
      probeMedia(media).then(
        (result) => {
          if (gen !== probeGen.current) return;
          setProbe({ status: 'done', result });
          if (result.rate) {
            setRate(result.rate);
            setDropFrame(supportsDropFrame(result.rate) && Boolean(result.startTimecode?.includes(';')));
          }
          setStartTimecode(result.startTimecode ?? '00:00:00:00');
        },
        (err: unknown) => {
          if (gen !== probeGen.current) return;
          console.warn('Media probe failed', err);
          setProbe({ status: 'failed' });
        },
      );
    },
    [state.preRollSec, state.postRollSec],
  );

  const onFile = useCallback((file: File) => openMedia(localMedia(file)), [openMedia]);

  // Runs from the Drive button's click, which Google's sign-in popup needs.
  const onDrive = useCallback(async () => {
    try {
      setDrive({ status: 'busy', label: 'Connecting to Google Drive…' });
      const file = await pickDriveFile();
      if (!file) {
        setDrive({ status: 'idle' });
        return;
      }
      const name = file.name;
      setDrive({ status: 'busy', label: `Opening ${name}…` });
      const media = await openDriveFile(file, (progress) => setDrive({ status: 'busy', label: `Downloading ${name}…`, progress }));
      openMedia(media);
      setDrive({ status: 'idle' });
    } catch (err) {
      setDrive({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [openMedia]);

  // After the hour-long Drive token expires, playback stalls; this resumes where it was.
  const onReconnectDrive = useCallback(async () => {
    await reconnectDrive();
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    v.load();
    v.addEventListener('loadedmetadata', () => (v.currentTime = t), { once: true });
  }, []);

  useEffect(() => {
    if (loaded) save(loaded.key, state);
  }, [loaded, state]);

  const addMarker = useCallback(
    (tag: Tag) => {
      const v = videoRef.current;
      if (!v) return;
      dispatch({
        type: 'add',
        id: crypto.randomUUID(),
        tag,
        timeSec: snapToFrame(v.currentTime, rate),
        durationSec: v.duration,
        createdAt: new Date().toISOString(),
      });
      setLastTag(tag);
      setTimeout(() => setLastTag((t) => (t === tag ? null : t)), 350);
    },
    [rate],
  );

  const seek = useCallback((sec: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = sec;
  }, []);

  // Keyboard: Space/K play-pause, J/L ±5s, ←/→ ±1 frame (Shift: ±1s), 1/2/3 tags.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = TAGS.find((t) => TAG_KEYS[t] === e.key);
      if (tag) {
        e.preventDefault();
        addMarker(tag);
        return;
      }
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          void (v.paused ? v.play() : v.pause());
          break;
        case 'j':
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case 'l':
          v.currentTime = Math.min(v.duration, v.currentTime + 5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) v.currentTime = Math.max(0, v.currentTime - 1);
          else stepFrames(v, rate, -1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) v.currentTime = Math.min(v.duration, v.currentTime + 1);
          else stepFrames(v, rate, 1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMarker, rate]);

  const df = dropFrame && supportsDropFrame(rate);
  const tcValid = isValidTimecode(startTimecode, rate);
  const startFrames = (tcValid && timecodeToFrames(startTimecode, rate, df)) || 0;

  const source: ExportSource | null = loaded && {
    name: loaded.name,
    sizeBytes: loaded.size,
    durationSec: duration,
    rate,
    dropFrame: df,
    startTimecode: tcValid ? startTimecode : '00:00:00:00',
    rateSource: probe.status === 'done' && probe.result.rate && probe.result.rate.num === rate.num && probe.result.rate.den === rate.den ? 'wasm-probe' : 'manual',
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Highlight <span>EDL</span>
        </h1>
        <p className="topbar__tag">Local-only · nothing is uploaded</p>
      </header>

      {!loaded ? (
        <main className="intro">
          <DropZone onFile={onFile} drive={driveEnabled ? { onPick: onDrive, ...drive } : undefined} />
          <ul className="intro__steps">
            <li>
              <b>Load</b> any video your browser can play{driveEnabled ? ', from this device or Google Drive' : ''}. Frame rate and start timecode are read locally with MediaInfo (WebAssembly).
            </li>
            <li>
              <b>Tag</b> moments as #quote, #broll or #turning-point with one key press.
            </li>
            <li>
              <b>Export</b> a JSON manifest or a CMX3600 EDL for Premiere, Resolve or Avid.
            </li>
          </ul>
        </main>
      ) : (
        <main className="workspace">
          <div className="workspace__main">
            <DropZone
              onFile={onFile}
              compact
              fileName={loaded.name}
              drive={driveEnabled ? { onPick: onDrive, ...drive } : undefined}
            />
            <Player
              src={loaded.url}
              videoRef={videoRef}
              rate={rate}
              dropFrame={df}
              startFrames={startFrames}
              currentTime={currentTime}
              duration={duration}
              onTime={setCurrentTime}
              onDuration={setDuration}
              errorAction={loaded.origin === 'drive' ? { label: 'Reconnect Google Drive', run: onReconnectDrive } : undefined}
            />
            <TagBar
              onTag={addMarker}
              disabled={!duration}
              preRollSec={state.preRollSec}
              postRollSec={state.postRollSec}
              onRoll={(pre, post) => dispatch({ type: 'setRoll', preRollSec: pre, postRollSec: post })}
              lastTag={lastTag}
            />
            <section className="panel source" aria-label="Source timing">
              <header className="panel__head">
                <h2>Source timing</h2>
                <ProbeBadge probe={probe} />
              </header>
              <div className="source__opts">
                <label>
                  Frame rate
                  <select
                    value={rateLabel(rate)}
                    onChange={(e) => {
                      const next = FRAME_RATES.find((r) => r.label === e.target.value) ?? DEFAULT_RATE;
                      setRate(next);
                      if (!supportsDropFrame(next)) setDropFrame(false);
                    }}
                  >
                    {!FRAME_RATES.some((r) => r.label === rate.label) && <option value={rate.label}>{rate.label}</option>}
                    {FRAME_RATES.map((r) => (
                      <option key={r.label} value={r.label}>
                        {r.label} fps
                      </option>
                    ))}
                  </select>
                </label>
                <label className={supportsDropFrame(rate) ? '' : 'is-disabled'}>
                  <input
                    type="checkbox"
                    checked={df}
                    disabled={!supportsDropFrame(rate)}
                    onChange={(e) => setDropFrame(e.target.checked)}
                  />
                  Drop-frame
                </label>
                <label>
                  Start TC
                  <input
                    type="text"
                    className={`tc${tcValid ? '' : ' is-invalid'}`}
                    value={startTimecode}
                    onChange={(e) => setStartTimecode(e.target.value)}
                    aria-invalid={!tcValid}
                  />
                </label>
              </div>
              {probe.status === 'done' && probe.result.variableFrameRate && (
                <p className="warn">Variable frame rate detected. Timecodes are approximate; conform to a constant-rate proxy for frame-accurate edits.</p>
              )}
            </section>
          </div>
          <aside className="workspace__side">
            <MarkerList
              markers={state.markers}
              dispatch={dispatch}
              rate={rate}
              dropFrame={df}
              startFrames={startFrames}
              currentTime={currentTime}
              onSeek={seek}
            />
            {source && <ExportPanel markers={state.markers} source={source} options={options} onOptions={setOptions} />}
          </aside>
        </main>
      )}

      <footer className="footer">
        <kbd>Space</kbd> play · <kbd>J</kbd>/<kbd>L</kbd> ±5s · <kbd>←</kbd>/<kbd>→</kbd> ±1 frame · <kbd>1</kbd>
        <kbd>2</kbd>
        <kbd>3</kbd> tag
      </footer>
    </div>
  );
}

function ProbeBadge({ probe }: { probe: ProbeState }) {
  if (probe.status === 'probing') return <span className="badge badge--busy">Reading metadata (WASM)…</span>;
  if (probe.status === 'failed') return <span className="badge badge--warn">Couldn’t read metadata; set manually</span>;
  if (probe.status === 'done') {
    const r = probe.result;
    const bits = [r.codec, r.width && r.height ? `${r.width}×${r.height}` : null, r.rate ? `${r.rate.label} fps` : 'rate unknown'];
    return <span className="badge badge--ok">{bits.filter(Boolean).join(' · ')}</span>;
  }
  return null;
}
