# Context for Claude Code sessions in this repo

Keep this current when the structure changes.

## What this is

A client-only React + Vite app: load a local video, tag highlights
(#quote / #broll / #turning-point), and export a JSON manifest or a CMX3600 EDL.
There is no backend, and nothing is uploaded. That is a product requirement: don't add server calls.

## Layout

- `src/lib/timecode.ts` handles all SMPTE math. Rates are `{num, den}` rationals, and timecode digits count at the nominal rate. Drop-frame applies to the 1001-denominator 30/60 families only.
- `src/lib/export.ts` has `buildEdl` and `buildManifest`, both pure. `buildManifest` takes `now` so it stays deterministic in tests. Manifest schema id: `highlight-edl/manifest@1`. Bump the schema id if the shape changes.
- `src/lib/probe.ts` runs mediainfo.js (WASM), lazy-loaded, reading byte ranges from the `File`. The `.wasm` URL comes from Vite's `?url` import.
- `src/state/markers.ts` holds the marker reducer (kept sorted by in point, min clip 0.1s) and the per-file localStorage persistence.
- `src/App.tsx` owns the wiring and keyboard shortcuts. The components live in `src/components/`.
- Deploy: `wrangler.toml` (Pages, `pages_build_output_dir = ./dist`), `public/_headers` (CSP needs `'wasm-unsafe-eval'` for MediaInfo, and `blob:` in `media-src` for playback), and `.github/workflows/deploy.yml` (test + build always; `wrangler pages deploy` on main only).

## Conventions

- Run `npm test` and `npm run build` (which includes `tsc --noEmit`) before pushing.
- EDL comment lines are ASCII-only and single-line (`sanitizeComment`). CMX3600 caps a list at 999 events, and the UI warns past that.
