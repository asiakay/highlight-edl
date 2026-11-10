# Highlight EDL

Log highlight moments on a local video and export them as a JSON manifest or a
CMX3600 EDL. Everything runs in the browser: the video plays from a `blob:` URL,
and frame rate and start timecode come from MediaInfo compiled to WebAssembly.
Nothing is uploaded.

## Use it

1. Drop a video (or click **choose a file**).
2. Play it. Press **1** `#quote`, **2** `#broll` or **3** `#turning-point` (or click the buttons) to log a marker at the playhead.
   Each marker gets pre/post-roll handles (2s / 3s by default) so it becomes a clip.
3. Trim with **In ⇤ / ⇥ Out** (sets that edge to the playhead), add a note, retag.
4. In **Export**, copy or download the JSON manifest or the `.edl`.

Keys: `Space`/`K` play-pause · `J`/`L` ±5s · `←`/`→` ±1 frame (`Shift` ±1s) · `1` `2` `3` tag.

Markers are saved in `localStorage` per file (name + size), so reloading the same
file brings them back. They stay in that browser only.

### Timing

- The frame rate, drop-frame and start timecode are read from the file. You can override them under **Source timing**.
- Rates are exact rationals (30000/1001, not 29.97). Drop-frame is implemented for 29.97 and 59.94.
- The EDL source side is offset by the embedded start timecode. The record side lays events back-to-back from **Record start** (default `01:00:00:00`).
- Variable-frame-rate files (phone footage) get a warning: their timecodes are approximate.
- Playback depends on what the browser can decode. ProRes, DNxHD and often HEVC won't play, so use an H.264 or WebM proxy.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: timecode math, EDL/manifest output, marker reducer
npm run build      # typecheck + production build into dist/
```

## Deploy (Cloudflare Pages)

`wrangler.toml` points Pages at `./dist`. `public/_headers` sets the CSP (with
`'wasm-unsafe-eval'` for MediaInfo) and immutable caching for `/assets/*`.

`.github/workflows/deploy.yml` runs tests and the build on every push and PR.
On `main` it also deploys with `wrangler pages deploy`. Before that, the job
creates the `highlight-edl` Pages project through the Cloudflare API if it
doesn't exist yet. The only setup is two repo secrets:

- `CLOUDFLARE_API_TOKEN`: a custom token with just **Account → Cloudflare Pages → Edit**, scoped to your account.
- `CLOUDFLARE_ACCOUNT_ID`

Don't also connect the repo through Pages' Git integration, or every push will deploy twice.
