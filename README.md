# Highlight EDL

Log highlight moments on a video and export them as a JSON manifest or a
CMX3600 EDL. Everything runs in the browser. A local video plays from a `blob:` URL;
a Google Drive video streams straight from Drive to the browser. Frame rate and
start timecode come from MediaInfo compiled to WebAssembly. Nothing is uploaded,
and there is no backend.

## Use it

1. Drop a video, click **choose a file**, or click **Open from Google Drive** (when configured, see below).
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

## Google Drive (optional)

**Open from Google Drive** signs in with Google, opens the Drive file picker, and
plays the chosen video without downloading it first: `public/drive-sw.js`, a
service worker, turns the player's byte-range requests into Drive API requests.
Browsers that block service workers download the whole file instead, with a
progress bar.

- The app requests the `drive.file` scope, so it can read only the files you pick.
- The access token stays in browser memory and lasts an hour. After that, playback stops and shows a **Reconnect Google Drive** button, which resumes where you were.
- Google's scripts load only when you reach for the Drive button, never for local-only use.

The button only appears when the build has three public values. They are browser
config, not secrets: they end up in the JS bundle.

| Build variable | GitHub Actions *variable* | What it is |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | OAuth client ID (Web application) |
| `VITE_GOOGLE_API_KEY` | `GOOGLE_API_KEY` | API key restricted to this site and the Google Picker API |
| `VITE_GOOGLE_APP_ID` | `GOOGLE_APP_ID` | Google Cloud project **number** |

Google Cloud setup (all in the web console):

1. Create a project. In **APIs & Services → Library**, enable **Google Drive API** and **Google Picker API**.
2. In **Google Auth Platform**, set up the consent screen:
   - **Branding**: app name and support email.
   - **Audience**: External, left in **Testing**, with each user's Google account added as a test user (up to 100).
   - **Data access**: add the `.../auth/drive.file` scope.
3. In **Clients**, create a **Web application** client. Set the authorized JavaScript origins to `https://highlight-edl.pages.dev` and `http://localhost:5173`. No redirect URIs are needed.
4. In **APIs & Services → Credentials**, create an API key:
   - Application restriction: **Websites**, with `https://highlight-edl.pages.dev/*` and `http://localhost:5173/*`.
   - API restriction: **Google Picker API** only.
5. The project number is under **IAM & Admin → Settings**.
6. In GitHub, go to repo **Settings → Secrets and variables → Actions → Variables** and add the three variables above. The next deploy picks them up.

For local development, put the `VITE_*` values in `.env.local`, which git ignores.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: timecode math, EDL/manifest output, marker reducer
npm run build      # typecheck + production build into dist/
```

## Deploy (Cloudflare Pages)

`wrangler.toml` points Pages at `./dist`. `public/_headers` sets the CSP and
immutable caching for `/assets/*`. The CSP allows `'wasm-unsafe-eval'` for
MediaInfo, plus the Google hosts used by Drive import.

`.github/workflows/deploy.yml` runs tests and the build on every push and PR.
On `main` it also deploys with `wrangler pages deploy`. Before that, the job
creates the `highlight-edl` Pages project through the Cloudflare API if it
doesn't exist yet. The only setup is two repo secrets:

- `CLOUDFLARE_API_TOKEN`: a custom token with just **Account → Cloudflare Pages → Edit**, scoped to your account.
- `CLOUDFLARE_ACCOUNT_ID`

Don't also connect the repo through Pages' Git integration, or every push will deploy twice.
