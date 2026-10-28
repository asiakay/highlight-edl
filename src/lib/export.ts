import type { Marker, Tag } from '../state/markers';
import {
  type FrameRate,
  framesToTimecode,
  rateLabel,
  secondsToFrames,
  supportsDropFrame,
  timecodeToFrames,
} from './timecode';

export interface ExportSource {
  name: string;
  sizeBytes: number;
  durationSec: number;
  rate: FrameRate;
  dropFrame: boolean;
  /** Embedded start timecode of the source (00:00:00:00 when unknown). */
  startTimecode: string;
  /** Where the frame rate came from. */
  rateSource: 'wasm-probe' | 'manual';
}

export interface ExportOptions {
  title: string;
  /** Timeline start for the record side of the EDL. */
  recordStart: string;
  /** CMX3600 reel name, max 8 chars. */
  reel: string;
  /** CMX3600 track field, e.g. "V", "A", "AA/V". */
  tracks: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  title: 'HIGHLIGHTS',
  recordStart: '01:00:00:00',
  reel: 'AX',
  tracks: 'AA/V',
};

export const MANIFEST_SCHEMA = 'highlight-edl/manifest@1';
export const CMX3600_MAX_EVENTS = 999;

interface Clip {
  marker: Marker;
  index: number;
  srcIn: number;
  srcOut: number;
}

function df(source: ExportSource): boolean {
  return source.dropFrame && supportsDropFrame(source.rate);
}

function toClips(markers: Marker[], source: ExportSource): Clip[] {
  const base = timecodeToFrames(source.startTimecode, source.rate, df(source)) ?? 0;
  return [...markers]
    .sort((a, b) => a.inSec - b.inSec || a.markSec - b.markSec)
    .map((marker, i) => {
      const srcIn = base + secondsToFrames(marker.inSec, source.rate);
      // Out points are exclusive; guarantee at least one frame per event.
      const srcOut = Math.max(srcIn + 1, base + secondsToFrames(marker.outSec, source.rate));
      return { marker, index: i + 1, srcIn, srcOut };
    });
}

/** CMX3600 EDL comment lines must stay single-line and plain. */
function sanitizeComment(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
}

function edlTitle(s: string): string {
  return sanitizeComment(s).toUpperCase().slice(0, 70) || 'UNTITLED';
}

export function buildEdl(markers: Marker[], source: ExportSource, options: ExportOptions): string {
  const isDf = df(source);
  const tc = (f: number) => framesToTimecode(f, source.rate, isDf);
  const reel = (sanitizeComment(options.reel).replace(/\s+/g, '').slice(0, 8) || 'AX').padEnd(8);
  const tracks = (options.tracks || 'V').padEnd(5);
  let rec = timecodeToFrames(options.recordStart, source.rate, isDf) ?? 0;

  const lines = [`TITLE: ${edlTitle(options.title)}`, `FCM: ${isDf ? 'DROP FRAME' : 'NON-DROP FRAME'}`, ''];
  for (const clip of toClips(markers, source)) {
    const len = clip.srcOut - clip.srcIn;
    const num = String(clip.index).padStart(3, '0');
    lines.push(
      `${num}  ${reel} ${tracks} ${'C'.padEnd(8)} ${tc(clip.srcIn)} ${tc(clip.srcOut)} ${tc(rec)} ${tc(rec + len)}`,
    );
    lines.push(`* FROM CLIP NAME: ${sanitizeComment(source.name)}`);
    const note = sanitizeComment(clip.marker.note);
    lines.push(`* COMMENT: ${clip.marker.tag}${note ? ` ${note}` : ''}`);
    lines.push('');
    rec += len;
  }
  return lines.join('\n');
}

export interface ManifestMarker {
  index: number;
  id: string;
  tag: Tag;
  note: string;
  markSec: number;
  inSec: number;
  outSec: number;
  durationSec: number;
  markTimecode: string;
  inTimecode: string;
  outTimecode: string;
  createdAt: string;
}

export interface Manifest {
  schema: typeof MANIFEST_SCHEMA;
  generatedAt: string;
  title: string;
  source: {
    name: string;
    sizeBytes: number;
    durationSec: number;
    frameRate: { num: number; den: number; label: string };
    dropFrame: boolean;
    startTimecode: string;
    frameRateSource: ExportSource['rateSource'];
  };
  summary: {
    count: number;
    totalDurationSec: number;
    byTag: Record<string, number>;
  };
  markers: ManifestMarker[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildManifest(
  markers: Marker[],
  source: ExportSource,
  options: ExportOptions,
  now: Date,
): Manifest {
  const isDf = df(source);
  const base = timecodeToFrames(source.startTimecode, source.rate, isDf) ?? 0;
  const tc = (f: number) => framesToTimecode(f, source.rate, isDf);
  const clips = toClips(markers, source);
  const byTag: Record<string, number> = {};
  let total = 0;

  const out = clips.map(({ marker, index, srcIn, srcOut }): ManifestMarker => {
    byTag[marker.tag] = (byTag[marker.tag] ?? 0) + 1;
    const durationSec = r3(marker.outSec - marker.inSec);
    total += durationSec;
    return {
      index,
      id: marker.id,
      tag: marker.tag,
      note: marker.note,
      markSec: marker.markSec,
      inSec: marker.inSec,
      outSec: marker.outSec,
      durationSec,
      markTimecode: tc(base + secondsToFrames(marker.markSec, source.rate)),
      inTimecode: tc(srcIn),
      outTimecode: tc(srcOut),
      createdAt: marker.createdAt,
    };
  });

  return {
    schema: MANIFEST_SCHEMA,
    generatedAt: now.toISOString(),
    title: options.title,
    source: {
      name: source.name,
      sizeBytes: source.sizeBytes,
      durationSec: r3(source.durationSec),
      frameRate: { num: source.rate.num, den: source.rate.den, label: rateLabel(source.rate) },
      dropFrame: isDf,
      startTimecode: source.startTimecode,
      frameRateSource: source.rateSource,
    },
    summary: { count: out.length, totalDurationSec: r3(total), byTag },
    markers: out,
  };
}

export function exportFileBase(sourceName: string): string {
  return sourceName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'highlights';
}
