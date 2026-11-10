export const TAGS = ['#quote', '#broll', '#turning-point'] as const;
export type Tag = (typeof TAGS)[number];

export interface Marker {
  id: string;
  tag: Tag;
  /** Playhead position when the tag button was pressed. */
  markSec: number;
  inSec: number;
  outSec: number;
  note: string;
  createdAt: string;
}

export interface MarkerState {
  markers: Marker[];
  /** Handles applied around the mark when a new marker is logged. */
  preRollSec: number;
  postRollSec: number;
}

export type MarkerAction =
  | { type: 'add'; id: string; tag: Tag; timeSec: number; durationSec: number; createdAt: string }
  | { type: 'update'; id: string; patch: Partial<Pick<Marker, 'tag' | 'note' | 'inSec' | 'outSec'>> }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'setRoll'; preRollSec?: number; postRollSec?: number }
  | { type: 'load'; state: MarkerState };

export const initialMarkerState: MarkerState = {
  markers: [],
  preRollSec: 2,
  postRollSec: 3,
};

/** Smallest clip we allow, so an EDL event never has zero length. */
export const MIN_CLIP_SEC = 0.1;

const ms = (n: number) => Math.round(n * 1000) / 1000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function byTime(a: Marker, b: Marker): number {
  return a.inSec - b.inSec || a.markSec - b.markSec;
}

export function markerReducer(state: MarkerState, action: MarkerAction): MarkerState {
  switch (action.type) {
    case 'add': {
      const end = action.durationSec > 0 ? action.durationSec : Infinity;
      const mark = clamp(action.timeSec, 0, end);
      const marker: Marker = {
        id: action.id,
        tag: action.tag,
        markSec: ms(mark),
        inSec: ms(clamp(mark - state.preRollSec, 0, end)),
        outSec: ms(clamp(mark + state.postRollSec, 0, end)),
        note: '',
        createdAt: action.createdAt,
      };
      if (marker.outSec - marker.inSec < MIN_CLIP_SEC) {
        marker.outSec = ms(marker.inSec + MIN_CLIP_SEC);
      }
      return { ...state, markers: [...state.markers, marker].sort(byTime) };
    }
    case 'update': {
      const markers = state.markers.map((m) => {
        if (m.id !== action.id) return m;
        const next = { ...m, ...action.patch };
        next.inSec = ms(Math.max(0, next.inSec));
        next.outSec = ms(next.outSec);
        // Moving one edge past the other drags the other edge along.
        if (next.outSec - next.inSec < MIN_CLIP_SEC) {
          if (action.patch.inSec !== undefined) next.outSec = ms(next.inSec + MIN_CLIP_SEC);
          else next.inSec = ms(Math.max(0, next.outSec - MIN_CLIP_SEC));
        }
        return next;
      });
      return { ...state, markers: markers.sort(byTime) };
    }
    case 'remove':
      return { ...state, markers: state.markers.filter((m) => m.id !== action.id) };
    case 'clear':
      return { ...state, markers: [] };
    case 'setRoll':
      return {
        ...state,
        preRollSec: Math.max(0, action.preRollSec ?? state.preRollSec),
        postRollSec: Math.max(0, action.postRollSec ?? state.postRollSec),
      };
    case 'load':
      return action.state;
  }
}

/* ---- per-file persistence (browser-local only) ---- */

export function storageKey(file: { name: string; size: number }): string {
  return `highlight-edl:v1:${file.name}:${file.size}`;
}

function isMarkerState(v: unknown): v is MarkerState {
  if (!v || typeof v !== 'object') return false;
  const s = v as MarkerState;
  return (
    Array.isArray(s.markers) &&
    typeof s.preRollSec === 'number' &&
    typeof s.postRollSec === 'number' &&
    s.markers.every(
      (m) =>
        typeof m.id === 'string' &&
        (TAGS as readonly string[]).includes(m.tag) &&
        typeof m.inSec === 'number' &&
        typeof m.outSec === 'number',
    )
  );
}

export function loadSaved(key: string): MarkerState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isMarkerState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function save(key: string, state: MarkerState): void {
  try {
    if (state.markers.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage blocked or full: markers still live in memory for this session.
  }
}
