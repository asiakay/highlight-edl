// Reads container metadata with MediaInfoLib compiled to WebAssembly. Nothing
// is uploaded: the WASM module pulls byte ranges straight from the source (a
// local File, or a Drive file through its streaming URL). HTMLVideoElement
// doesn't expose frame rate or embedded timecode, and an EDL is meaningless
// without them, so this is the WASM step.

import { type FrameRateOption, normalizeRate } from './timecode';
import wasmUrl from 'mediainfo.js/MediaInfoModule.wasm?url';

export interface ProbeResult {
  rate: FrameRateOption | null;
  variableFrameRate: boolean;
  startTimecode: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
}

type Track = Record<string, unknown> & { '@type': string };

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

let factory: Promise<typeof import('mediainfo.js')> | null = null;

export interface ProbeSource {
  size: number;
  read: (offset: number, length: number) => Promise<Uint8Array>;
}

export async function probeMedia(source: ProbeSource): Promise<ProbeResult> {
  factory ??= import('mediainfo.js');
  const { default: mediaInfoFactory } = await factory;
  const mi = await mediaInfoFactory({ format: 'object', locateFile: () => wasmUrl });
  try {
    const result = await mi.analyzeData(() => source.size, (size, offset) => source.read(offset, size));
    const tracks = (result.media?.track ?? []) as unknown as Track[];
    const video = tracks.find((t) => t['@type'] === 'Video');
    const general = tracks.find((t) => t['@type'] === 'General');
    const other = tracks.find((t) => t['@type'] === 'Other' && t.TimeCode_FirstFrame);

    const n = num(video?.FrameRate_Num);
    const d = num(video?.FrameRate_Den);
    const f = num(video?.FrameRate);
    const rate = n && d ? normalizeRate({ num: n, den: d }) : f ? normalizeRate(f) : null;
    const tc = str(video?.TimeCode_FirstFrame) ?? str(other?.TimeCode_FirstFrame);

    return {
      rate,
      variableFrameRate: str(video?.FrameRate_Mode) === 'VFR',
      startTimecode: tc,
      durationSec: num(general?.Duration) ?? num(video?.Duration),
      width: num(video?.Width),
      height: num(video?.Height),
      codec: str(video?.Format),
    };
  } finally {
    mi.close();
  }
}
