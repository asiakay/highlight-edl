import { afterEach, describe, expect, it, vi } from 'vitest';
import { rangeReader } from './media';

const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);

afterEach(() => vi.unstubAllGlobals());

describe('rangeReader', () => {
  it('requests the exact byte range', async () => {
    const fetchMock = vi.fn(async () => new Response(bytes.slice(10, 20), { status: 206 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(Array.from(await rangeReader('/drive-stream/x')(10, 10))).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(fetchMock).toHaveBeenCalledWith('/drive-stream/x', { headers: { Range: 'bytes=10-19' } });
  });

  it('slices the requested part when the server ignores Range and sends everything', async () => {
    vi.stubGlobal('fetch', async () => new Response(bytes, { status: 200 }));
    expect(Array.from(await rangeReader('/x')(95, 10))).toEqual([95, 96, 97, 98, 99]);
  });

  it('fails loudly on errors such as an expired token', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 401 }));
    await expect(rangeReader('/x')(0, 10)).rejects.toThrow('HTTP 401');
  });
});
