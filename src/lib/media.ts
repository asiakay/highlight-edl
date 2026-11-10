// A loaded video, wherever it came from. The player only needs `url`; the
// metadata probe only needs `size` and `read`, so local files and Drive files
// go through the same path.

export interface LoadedMedia {
  name: string;
  size: number;
  url: string;
  origin: 'local' | 'drive';
  /** Reads `length` bytes at `offset` (fewer at end of file). */
  read: (offset: number, length: number) => Promise<Uint8Array>;
  dispose: () => void;
}

export function localMedia(file: File): LoadedMedia {
  const url = URL.createObjectURL(file);
  return {
    name: file.name,
    size: file.size,
    url,
    origin: 'local',
    read: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
    dispose: () => URL.revokeObjectURL(url),
  };
}

/** Byte-range reads over HTTP, for a URL that honours Range (our Drive stream). */
export function rangeReader(url: string): LoadedMedia['read'] {
  return async (offset, length) => {
    const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    if (res.status !== 206 && res.status !== 200) throw new Error(`Range read failed: HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    // A 200 means the whole file came back; keep only the slice we asked for.
    return res.status === 200 ? buf.subarray(offset, offset + length) : buf;
  };
}
