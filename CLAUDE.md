# Context for Claude Code sessions in this repo

Keep this current when the structure changes.

## What this is

A client-only React + Vite app: load a video, tag highlights
(#quote / #broll / #turning-point), and export a JSON manifest or a CMX3600 EDL.
There is no backend, and nothing is uploaded. That is a product requirement: don't add server calls.
The one network dependency is the optional, user-initiated Google Drive import. The browser
talks to Google directly, and Google's scripts load only when the user reaches for the Drive button.

## Layout

- `src/lib/timecode.ts` handles all SMPTE math. Rates are `{num, den}` rationals, and timecode digits count at the nominal rate. Drop-frame applies to the 1001-denominator 30/60 families only.
- `src/lib/export.ts` has `buildEdl` and `buildManifest`, both pure. `buildManifest` takes `now` so it stays deterministic in tests. Manifest schema id: `highlight-edl/manifest@1`. Bump the schema id if the shape changes.
- `src/lib/media.ts` defines `LoadedMedia` (`url` for the player, `size` + `read(offset, length)` for the probe). Both local files and Drive files go through it.
- `src/lib/probe.ts` runs mediainfo.js (WASM), lazy-loaded, reading byte ranges through `LoadedMedia.read`. The `.wasm` URL comes from Vite's `?url` import.
- Google Drive:
  - `src/lib/drive.ts` handles the GIS token (`drive.file` scope, in memory only), the Picker, and opening files. It's enabled only when `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` / `VITE_GOOGLE_APP_ID` are set at build time; CI reads them from repo *variables*.
  - `public/drive-sw.js` serves `/drive-stream/<id>?size=&type=` by proxying Range requests to the Drive API. It builds `Content-Range` itself because Drive's CORS response hides it. When the worker restarts or gets a 401, it asks the page for the token.
  - If the worker doesn't take control within 6s (blocked workers leave `ready` pending forever), `openDriveFile` downloads the whole file instead.
  - The Drive button triggers the sign-in popup, so keep `requestToken` free of awaits once the GIS script is loaded, or popup blockers fire.
- `src/state/markers.ts` holds the marker reducer (kept sorted by in point, min clip 0.1s) and the per-file localStorage persistence.
- `src/App.tsx` owns the wiring and keyboard shortcuts. The components live in `src/components/`.
- Deploy: `wrangler.toml` (Pages, `pages_build_output_dir = ./dist`), `public/_headers` (CSP needs `'wasm-unsafe-eval'` for MediaInfo, `blob:` in `media-src`, and the Google hosts for Drive. COOP is `same-origin-allow-popups` and Referrer-Policy sends the origin, both needed for Google sign-in and the API-key website restriction), and `.github/workflows/deploy.yml` (test + build always; on main only, it creates the Pages project via the API if missing, then runs `wrangler pages deploy`).

## Conventions

- Run `npm test` and `npm run build` (which includes `tsc --noEmit`) before pushing.
- EDL comment lines are ASCII-only and single-line (`sanitizeComment`). CMX3600 caps a list at 999 events, and the UI warns past that.
