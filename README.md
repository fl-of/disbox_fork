# Disbox Web Client

This is the web client for the [Disbox](https://github.com/DisboxApp/web) project (fork/workspace with ongoing improvements).

Disbox is a cloud storage service that stores your files on Discord. It bypasses the file size limit by splitting files into chunks and wraps everything in a virtual file system.

Using Discord webhooks allows for simple setup, chunked uploads/downloads, multiple drives (different webhook URLs), and easy access management.

## Features

| Feature                           | Support              | UI                                                                                                | JavaScript/API notes                                                                                                 |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Login using Webhook URL           | ✅                   | Setup page (validates/connects storage)                                                           | `DisboxFileManager.create(webhookUrl)`                                                                               |
| Upload files                      | ✅                   | Upload files button, multi-file picker, drag & drop, transfer queue                               | `uploadFile(path, file, onProgress)`                                                                                 |
| Upload folders                    | ✅                   | Upload folder picker and drag & drop (preserves folder structure)                                 | Uses `ensureDirectory(...)` + uploads                                                                                |
| Create folders                    | ✅                   | "New folder" button                                                                               | `createDirectory(path)`                                                                                              |
| Download files                    | ✅                   | Row actions / bulk actions / transfer queue, extension-assisted or proxy fallback                 | `downloadFile(...)`, `downloadFileViaExtension(...)`                                                                 |
| Download folders (zip)            | ✅ (single folder)   | Folder "Zip" action downloads selected folder as a `.zip` (streams to disk when supported)        | Client-side recursive download + streaming ZIP packaging (File System Access API when available, in-memory fallback) |
| Share files                       | ✅                   | Share dialog with copy/regenerate link, expiry guidance, improved shared-file page                | `getAttachmentUrls(path)` + encoded share payload                                                                    |
| Delete files/folders              | ✅                   | Safer delete confirmation dialog (typed confirmation), recursive delete supported                 | `deleteFile(path, onProgress)`                                                                                       |
| Rename                            | ✅                   | Inline rename, rename dialog, actions menu                                                        | `renameFile(path, newName)`                                                                                          |
| Move                              | ✅                   | Move dialog / bulk move / actions menu, destination picker chips, conflict handling (rename/skip) | `moveFile(path, newParentPath)`                                                                                      |
| Browse folders                    | ✅                   | Breadcrumbs, folder navigation                                                                    | `getChildren(path)`                                                                                                  |
| Search / sort / filter            | ✅                   | Search bar (`ext:` filters), column sort/filter                                                   | UI-driven                                                                                                            |
| File icons                        | ✅                   | File type icons in list                                                                           | UI-driven                                                                                                            |
| File previews                     | ✅ (supported types) | In-app preview dialog and shared-file preview (images/video/audio/PDF/text, size-limited)         | UI-driven                                                                                                            |
| Transfer manager                  | ✅                   | Queue/status/progress/errors/retry for uploads & downloads, extension status indicator            | UI-driven                                                                                                            |
| Bulk actions & actions menu       | ✅                   | Multi-select toolbar actions + per-item "More" menu                                               | UI-driven                                                                                                            |
| Client-side encryption (optional) | ✅                   | Encryption dialog (enable for new uploads + passphrase), auto-decrypt in-app when configured      | AES-GCM per-chunk encryption before upload; encrypted metadata stored in file content                                |
| Responsive/mobile improvements    | ✅ (improved)        | Responsive layout, collapsible navbar, mobile-friendly interactions                               | UI-driven                                                                                                            |
| Trash / restore                   | ❌                   | No backend-backed trash; deletion is permanent after confirmation                                 | -                                                                                                                    |
| In-app file editor                | ❌                   | -                                                                                                 | Re-upload/overwrite file content is possible                                                                         |

Suggestions and contributions are welcome!

## Recent updates (this fork/workspace)

- **Tooling/platform**
  - Migrated build tooling from CRA (`react-scripts`) to **Vite**
  - Upgraded React 17 → **React 18** (`createRoot`)
  - Converted source to **TypeScript/TSX** (pragmatic typing, `tsc --noEmit` passing)
  - Added route-level lazy loading and Vite manual chunking; replaced `react-helmet` with `react-helmet-async`
  - Added quality/tooling scripts and CI workflow: `typecheck`, `lint`, `format`, `test`, GitHub Actions CI
- **File manager / UX**
  - Transfer manager (queued/running/paused/completed/failed, progress, retry, pause/resume uploads, clear completed)
  - Bulk actions, per-item "More" actions menu, improved loading/error/empty states
  - Upload improvements: multi-file upload, folder upload picker, drag-and-drop files/folders with preserved structure
  - Move/rename dialogs, move conflict handling (rename/skip), safer delete confirmation dialog
  - Folder download as **zip** (single folder), with streaming ZIP-to-disk when supported (File System Access API) and in-memory fallback, in-app previews for supported file types, improved shared-file page
  - Optional **client-side encryption** for new uploads (AES-GCM per-chunk, passphrase-based key derivation) with auto-decrypt in-app when configured
  - Responsive/layout and accessibility improvements
- **Sharing**
  - Share dialog with copy/regenerate link and attachment-link expiry guidance (encrypted share links do not include the passphrase)
- **Download reliability & extension support**
  - More robust direct/proxy fallback handling, clearer errors, per-chunk retries, and expired attachment URL recovery
  - Configurable download proxy via `VITE_DOWNLOAD_PROXY_URL`
  - Configurable extension ID(s) via `VITE_DISBOX_EXTENSION_ID` / `VITE_DISBOX_EXTENSION_IDS`
  - Extension-aware downloads with capability detection and automatic fallback
- **Firefox extension (`firefox-extension/`, MV2)**
  - Content-script bridge for reliable page↔extension messaging
  - Direct download support via browser Downloads API (preferred, avoids page CORS/data URL handoff to page)
  - Legacy fetch-to-data-URL fallback path retained for compatibility
  - Updated manifest/permissions and versioning for AMO validation (prepared public/listed package `0.1.3` with ID `disbox-downloader-public@example.local`; a previous `0.1.2` build was AMO-approved)
- **Testing/docs**
  - Added Vitest-based unit tests for utility/share logic and `docs/QA_CHECKLIST.md` for manual cross-browser QA

## How it works

Disbox splits uploaded files into chunks to fit Discord attachment limits, uploads chunks via a Discord webhook, and stores file/folder metadata plus chunk/message references in a separate database. The web client presents this as a virtual file system and reassembles chunks on download.

## Technical details

### Database

Disbox stores file metadata and message/chunk references in a backend database. Webhook URLs are used as account identifiers (hashed client-side in this implementation). The database does not provide direct access to Discord attachments by itself.

### Discord API (Webhooks)

Webhooks are used instead of bots because they are easier for users to set up and require minimal Discord configuration.

### CORS and downloads

Browsers cannot reliably fetch Discord CDN attachment URLs directly from a web page due to CORS restrictions. This project supports:

- **Browser extension (recommended):** detects compatible extensions, can perform direct downloads from the extension context (bypassing page CORS), and falls back automatically when unavailable/failing
- **Proxy fallback:** attempts direct/proxy fetch strategies when extension download is unavailable (third-party proxies can be unreliable/blocked and may expose request data to the proxy)

For self-hosted/reliable setups, you can configure a custom proxy endpoint with `VITE_DOWNLOAD_PROXY_URL`. Downloads also include retry/expired-link recovery logic to improve reliability.

## Development

### Prerequisites

- Node.js + npm

### Install

```bash
npm install
```

### Run locally (development)

```bash
npm run dev
```

Open the local URL shown by Vite (typically `http://localhost:5173/`).

### Production build

```bash
npm run build
```

Outputs static files to `dist/` (built for the `/web/` base path).

Preview the production build locally:

```bash
npm run preview:prod
```

Then open the URL shown (including `/web/`, e.g. `http://localhost:3000/web/`).

### Quality checks & tests

```bash
npm run typecheck
npm run lint
npm run format
npm run test
# or run typecheck + lint + format + test
npm run check
```

### Deploy

```bash
npm run deploy
```

Publishes `dist/` via `gh-pages`.

## Environment variables (`.env`)

Create a `.env` file in the project root to configure build-time variables:

```env
# Optional: override the Disbox metadata server
# VITE_DISBOX_SERVER_URL=https://disbox-server.fly.dev

# Optional: custom download proxy/prefix/template (tried first when set)
# VITE_DOWNLOAD_PROXY_URL=https://your-proxy.example/?url=
# VITE_DOWNLOAD_PROXY_URL=https://your-proxy.example/fetch?target={url}

# Optional: extension ID(s) for download assistance
# VITE_DISBOX_EXTENSION_ID=disbox-downloader-public@example.local
# VITE_DISBOX_EXTENSION_IDS=disbox-downloader-public@example.local,disbox-downloader@example.local,jklpfhklkhbfgeencifbmkoiaokeieah
```

- `VITE_DISBOX_SERVER_URL` – overrides the Disbox metadata server URL (defaults to the project’s configured server)
- `VITE_DOWNLOAD_PROXY_URL` – custom download proxy/prefix/template used for download fallback (helpful when public proxies fail)
- `VITE_DISBOX_EXTENSION_ID` / `VITE_DISBOX_EXTENSION_IDS` – extension ID(s) the web app should try for download assistance

**Important:** Vite env variables are embedded at **dev server start/build time**. After changing `.env`, restart `npm run dev` or rebuild (`npm run build` / `npm run preview:prod`).

## Firefox extension

A Firefox extension implementation is available in `firefox-extension/` to assist with downloads by fetching Discord attachment URLs from the extension context (bypassing page CORS restrictions).

- **Download/install:** [Firefox Add-ons (AMO)](https://addons.mozilla.org/) — search for **“Disbox Downloader for Firefox”** (or use the signed AMO build if you already have the listing link). For local/testing, you can also load the unpacked extension from `firefox-extension/`.
- **Source/location:** `firefox-extension/` (manifest, background script, content-script bridge, icons)
- **Extension ID:** `disbox-downloader-public@example.local` (as configured in this repo’s Firefox extension manifest/package for public listing)
- **Capabilities:** direct download via browser Downloads API (preferred), capability detection/ping, and legacy fetch fallback path
- **Allowed origins (content-script bridge):** `http://localhost/*`, `http://127.0.0.1/*`, `https://localhost/*`, `https://127.0.0.1/*`, `https://disboxapp.github.io/*`
- **Temporary/local load:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on...** → `firefox-extension/manifest.json`
- **Current packaged manifest version in repo:** `0.1.3` (prepared with a unique ID for a separate public/listed AMO submission)

### Using the Firefox extension with this web app

The web app must be configured to message the extension ID, and the build must include that configuration:

1. Install/load the Firefox extension (temporary or signed `.xpi`)
2. Set in `.env`:
   ```env
   VITE_DISBOX_EXTENSION_ID=disbox-downloader-public@example.local
   ```
3. Restart/rebuild the web app (`npm run dev`, or `npm run build` / `npm run preview:prod`)
4. Open the app on an allowed origin (e.g. `http://localhost:5173/`)

> Note: Installing the extension in Firefox is separate from the website code. A deployed site (e.g. `https://disboxapp.github.io/web`) will only use this Firefox extension if that deployed build is configured with the matching extension ID.

See `firefox-extension/README.md` for details/limitations and `docs/QA_CHECKLIST.md` for manual validation scenarios.

## Client-side encryption (optional)

The web app supports optional client-side encryption for **new uploads**:

- Enable it from the **Encryption** settings in the app and set a passphrase.
- File chunks are encrypted in the browser (AES-GCM, passphrase-derived key) before upload, so Discord stores ciphertext chunks instead of plaintext.
- Encrypted files are **auto-decrypted in-app** for downloads/previews/folder zip when the correct passphrase is configured.
- Encryption metadata is stored with the file’s content reference (legacy unencrypted files remain compatible).

**Important limitations**

- The passphrase is stored in this browser’s `localStorage` for convenience. Treat the device/browser profile as trusted.
- If you lose the passphrase, **encrypted files cannot be recovered**.
- Share links do not include the encryption passphrase (or a recipient-decryptable key), so recipients cannot auto-decrypt encrypted files from a share link alone.
- Encrypted files use the in-app download/decrypt path (extension direct-download is bypassed for encrypted content).

## Notes

- **Pause/resume uploads:** supported in-session from the transfer manager. If the app/tab is closed or reloaded while an upload is paused, partial uploaded chunks may remain unreferenced on Discord and the upload cannot yet be resumed automatically.
- Discord attachment URLs can expire; if a shared/download link stops working, regenerate the share link or retry the download (the app attempts expired-link recovery in supported flows).
- Public CORS proxies may fail or be blocked; a browser extension or a trusted/self-hosted proxy is more reliable for downloads.
- Deletions are permanent after confirmation (no trash/restore).
- Folder zip download supports streaming to disk when the browser supports the File System Access API; otherwise it falls back to an in-memory zip build, which can be memory-intensive for very large folders/files.
- Keep webhook URLs and encryption passphrases private (they protect access to stored data).

## License

See [LICENSE](LICENSE).
