// Google Drive as a video source, entirely client-side: Google Identity
// Services issues a short-lived access token in the browser, the Google Picker
// lets the user choose a file, and the bytes come straight from the Drive API.
// The `drive.file` scope only grants access to files the user picks.

import { type LoadedMedia, localMedia, rangeReader } from './media';

const env = import.meta.env;
const CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID ?? '';
const API_KEY = env.VITE_GOOGLE_API_KEY ?? '';
const APP_ID = env.VITE_GOOGLE_APP_ID ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files/';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** The Drive button only shows when the build was given Google credentials. */
export const driveEnabled = Boolean(CLIENT_ID && API_KEY && APP_ID);

/* ---- minimal typings for the two Google scripts we load ---- */

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}
interface PickerDoc {
  id: string;
  name?: string;
  mimeType?: string;
}
interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(cb: (r: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
interface GoogleNs {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): TokenClient;
    };
  };
  picker: {
    DocsView: new (viewId?: unknown) => {
      setIncludeFolders(v: boolean): unknown;
      setEnableDrives(v: boolean): unknown;
      setMimeTypes(types: string): unknown;
    };
    PickerBuilder: new () => PickerBuilder;
    ViewId: { DOCS_VIDEOS: unknown };
    Feature: { SUPPORT_DRIVES: unknown };
    Action: { PICKED: string; CANCEL: string };
  };
}
declare global {
  interface Window {
    google?: GoogleNs;
    gapi?: { load(lib: string, cb: { callback: () => void; onerror: () => void }): void };
  }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scripts.delete(src);
        reject(new Error(`Couldn't load ${new URL(src).host}. Check your connection or content blockers.`));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

let pickerReady: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  pickerReady ??= loadScript('https://apis.google.com/js/api.js').then(
    () =>
      new Promise<void>((resolve, reject) =>
        window.gapi!.load('picker', { callback: resolve, onerror: () => reject(new Error('Google Picker failed to load')) }),
      ),
  );
  pickerReady.catch(() => (pickerReady = null));
  return pickerReady;
}

/** Loads Google's scripts ahead of the click (on hover/focus), so the sign-in popup isn't blocked. */
export function preloadDrive(): void {
  if (!driveEnabled) return;
  loadScript(GSI_SRC).catch(() => {});
  loadPicker().catch(() => {});
}

/* ---- access token ---- */

let token: { value: string; expiresAt: number } | null = null;
let tokenClient: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

function currentToken(): string | null {
  // Treat the last minute as expired so a request doesn't start with a dying token.
  return token && token.expiresAt - 60_000 > Date.now() ? token.value : null;
}

/**
 * Must run inside a click handler: Google opens its consent popup from here.
 * When the script is already loaded (see preloadDrive) nothing is awaited
 * before the popup opens, so popup blockers still see the click.
 */
async function requestToken(): Promise<string> {
  if (!window.google?.accounts) await loadScript(GSI_SRC);
  tokenClient ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (r) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (r.error || !r.access_token) {
        p.reject(new Error(r.error_description || r.error || 'Google sign-in failed'));
        return;
      }
      token = { value: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
      void sendTokenToWorker();
      p.resolve(r.access_token);
    },
    error_callback: (e) => {
      const p = pending;
      pending = null;
      p?.reject(new Error(e.type === 'popup_closed' ? 'Sign-in was cancelled' : e.message || 'Google sign-in failed'));
    },
  });
  pending?.reject(new Error('Superseded by a newer sign-in'));
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient!.requestAccessToken({ prompt: '' });
  });
}

async function ensureToken(): Promise<string> {
  return currentToken() ?? requestToken();
}

/** Re-authorises after the hour-long token expires; call from a click. */
export async function reconnectDrive(): Promise<void> {
  token = null;
  await requestToken();
}

/* ---- streaming service worker ---- */

let workerReady: Promise<ServiceWorker | null> | null = null;

async function activateWorker(): Promise<ServiceWorker | null> {
  // Answer the worker when it has lost its token (it is stopped when idle).
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { type?: string })?.type === 'drive-token-request') e.ports[0]?.postMessage(currentToken());
  });
  const reg = await navigator.serviceWorker.register('/drive-sw.js');
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    const changed = new Promise((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
    );
    reg.active?.postMessage({ type: 'claim' });
    await changed;
  }
  return navigator.serviceWorker.controller;
}

function setupWorker(): Promise<ServiceWorker | null> {
  workerReady ??= (async () => {
    if (!('serviceWorker' in navigator)) return null;
    // When workers are blocked (browser setting, extension), register() succeeds but
    // the worker never activates and `ready` never settles, so cap the wait.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
    try {
      const sw = await Promise.race([activateWorker(), timeout]);
      if (!sw) console.warn('Drive streaming unavailable (service worker did not start); downloading instead');
      return sw;
    } catch (err) {
      console.warn('Drive streaming unavailable, downloading instead', err);
      return null;
    }
  })();
  return workerReady;
}

async function sendTokenToWorker() {
  const sw = await setupWorker();
  sw?.postMessage({ type: 'drive-token', token: currentToken() });
}

/* ---- picking and opening ---- */

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Opens the Google Picker. Resolves null if the user cancels. Call from a click. */
export async function pickDriveFile(): Promise<DriveFile | null> {
  const [accessToken] = await Promise.all([ensureToken(), loadPicker()]);
  const g = window.google!.picker;
  const picked = await new Promise<PickerDoc | null>((resolve) => {
    const videos = new g.DocsView(g.ViewId.DOCS_VIDEOS);
    videos.setIncludeFolders(true);
    videos.setEnableDrives(true);
    new g.PickerBuilder()
      .addView(videos)
      .enableFeature(g.Feature.SUPPORT_DRIVES)
      .setTitle('Choose a video')
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setCallback((r) => {
        if (r.action === g.Action.PICKED) resolve(r.docs?.[0] ?? null);
        else if (r.action === g.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
  if (!picked) return null;

  // The picker's own size field is unreliable across Drive types; ask the API.
  const res = await fetch(
    `${DRIVE_API}${encodeURIComponent(picked.id)}?fields=id,name,size,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Couldn't read that file's details from Drive (HTTP ${res.status})`);
  const meta = (await res.json()) as { id: string; name: string; size?: string; mimeType: string };
  const size = Number(meta.size);
  if (!size) throw new Error('That item has no downloadable content (Google Docs and shortcuts can’t be played).');
  return { id: meta.id, name: meta.name, size, mimeType: meta.mimeType };
}

export function driveStreamUrl(file: DriveFile): string {
  const q = new URLSearchParams({ size: String(file.size), type: file.mimeType });
  return `/drive-stream/${encodeURIComponent(file.id)}?${q}`;
}

/**
 * Streams through the service worker when it can. Without one (e.g. Firefox
 * private windows) it downloads the whole file first, reporting progress 0–1.
 */
export async function openDriveFile(file: DriveFile, onProgress: (fraction: number) => void): Promise<LoadedMedia> {
  const sw = await setupWorker();
  if (sw) {
    await sendTokenToWorker();
    const url = driveStreamUrl(file);
    return { name: file.name, size: file.size, url, origin: 'drive', read: rangeReader(url), dispose: () => {} };
  }

  const accessToken = await ensureToken();
  const res = await fetch(`${DRIVE_API}${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok || !res.body) throw new Error(`Drive download failed (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(Math.min(1, received / file.size));
  }
  const media = localMedia(new File(chunks, file.name, { type: file.mimeType }));
  return { ...media, origin: 'drive' };
}
