// Streams Google Drive files to the <video> element without downloading them
// whole. The page points the player at /drive-stream/<fileId>?size=…&type=…;
// this worker turns each Range request into the same Range request against the
// Drive API with the user's access token. The token lives only in this
// worker's memory and in the page, never on any server of ours.

const PREFIX = '/drive-stream/';
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
let token = null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'drive-token') token = msg.token || null;
  // A hard reload leaves the page uncontrolled; it asks to be claimed again.
  if (msg.type === 'claim') event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  event.respondWith(stream(event, url));
});

/** Asks the page that made the request for a current token (the worker may have restarted). */
async function tokenFromPage(clientId) {
  const candidates = [];
  const own = clientId && (await self.clients.get(clientId));
  if (own) candidates.push(own);
  candidates.push(...(await self.clients.matchAll({ type: 'window' })));
  for (const client of candidates) {
    const reply = await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 3000);
      channel.port1.onmessage = (e) => {
        clearTimeout(timer);
        resolve(e.data);
      };
      client.postMessage({ type: 'drive-token-request' }, [channel.port2]);
    });
    if (reply) return reply;
  }
  return null;
}

/** Returns { start, end, open } where `open` means the request had no end byte. */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : { start, end, open: m[2] === '' };
}

async function stream(event, url) {
  const id = decodeURIComponent(url.pathname.slice(PREFIX.length));
  const size = Number(url.searchParams.get('size'));
  const type = url.searchParams.get('type') || 'application/octet-stream';
  if (!id || !Number.isFinite(size) || size <= 0) return new Response('Bad stream URL', { status: 400 });

  const range = parseRange(event.request.headers.get('Range'), size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const { start, open } = range || { start: 0, open: true };
  let end = range ? range.end : size - 1;

  const upstreamUrl = `${DRIVE}${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  const get = (t) =>
    fetch(upstreamUrl, {
      // Keep open-ended requests open-ended, so Drive streams and the player can stop reading.
      headers: { Authorization: `Bearer ${t}`, Range: open ? `bytes=${start}-` : `bytes=${start}-${end}` },
      signal: event.request.signal,
    });

  token ??= await tokenFromPage(event.clientId);
  if (!token) return new Response('Google Drive is not connected', { status: 401 });
  let upstream = await get(token);
  if (upstream.status === 401) {
    token = await tokenFromPage(event.clientId);
    if (!token) return new Response('Google Drive access expired', { status: 401 });
    upstream = await get(token);
  }
  if (!upstream.ok) return new Response(upstream.body, { status: upstream.status });
  // Drive ignored the range and sent the whole file: only usable from byte 0.
  if (upstream.status === 200 && start > 0) {
    upstream.body?.cancel();
    return new Response('Drive did not honour the byte range', { status: 502 });
  }

  // Build the headers ourselves: Drive's CORS response hides Content-Range.
  // Content-Length is visible, and a server may send less than an open-ended
  // range asked for; claim only what is actually coming so the player re-requests the rest.
  const sent = Number(upstream.headers.get('Content-Length'));
  if (sent > 0 && sent < end - start + 1) end = start + sent - 1;
  const headers = new Headers({
    // Chrome won't play an H.264 .mov labelled video/quicktime; the bytes are MP4-family.
    'Content-Type': type === 'video/quicktime' ? 'video/mp4' : type,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
    'Cache-Control': 'no-store',
  });
  if (!range && end === size - 1) return new Response(upstream.body, { status: 200, headers });
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  return new Response(upstream.body, { status: 206, headers });
}
