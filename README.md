# Disbox Web Client

### Try Disbox here: https://disboxapp.github.io/web

This is the web client for the [Disbox](https://github.com/DisboxApp/web) project.

Disbox is a cloud storage service that stores your files on Discord. It bypasses the file size limit by splitting files into chunks and wraps everything in a virtual file system.

Using Discord webhooks allows for simple setup, chunked uploads/downloads, multiple drives (different webhook URLs), and easy access management.

## Features

| Feature | Support | UI | JavaScript/API notes |
|---|---|---|---|
| Login using Webhook URL | ✅ | Setup page (validates/connects storage) | `DisboxFileManager.create(webhookUrl)` |
| Upload files | ✅ | Upload button, drag & drop, transfer queue | `uploadFile(path, file, onProgress)` |
| Upload folders | ✅ (drag & drop) | Drag & drop folders/files (preserves folder structure) | Uses `ensureDirectory(...)` + uploads |
| Create folders | ✅ | "New folder" button | `createDirectory(path)` |
| Download files | ✅ | Row actions / bulk actions / transfer queue | `downloadFile(path, fileSystemWritable, onProgress)` |
| Share files | ✅ | Share/copy link actions, improved shared file page | `getAttachmentUrls(path)` |
| Delete files/folders | ✅ | Row actions / bulk actions (recursive folder delete supported) | `deleteFile(path, onProgress)` |
| Rename | ✅ | Inline rename, rename dialog, actions menu | `renameFile(path, newName)` |
| Move | ✅ | Move dialog / bulk move / actions menu | `moveFile(path, newParentPath)` |
| Browse folders | ✅ | Breadcrumbs, folder navigation | `getChildren(path)` |
| Search / sort / filter | ✅ | Search bar (`ext:` filters), column sort/filter | UI-driven |
| File icons | ✅ | File type icons in list | UI-driven |
| File previews | ✅ (supported types) | In-app preview dialog and shared-file preview (images/video/audio/PDF/text, size-limited) | UI-driven |
| Transfer manager | ✅ | Queue/status/progress/errors/retry for uploads & downloads | UI-driven |
| Bulk actions & actions menu | ✅ | Multi-select toolbar actions + per-item "More" menu | UI-driven |
| Responsive/mobile improvements | ✅ (improved) | Responsive layout, collapsible navbar, mobile-friendly interactions | UI-driven |
| Download folders (zip) | ❌ | - | - |
| In-app file editor | ❌ | - | Re-upload/overwrite file content is possible |

Suggestions and contributions are welcome!

## Recent updates (this fork/workspace)

- **Migrated build tooling:** CRA (`react-scripts`) → **Vite**
- **Upgraded React:** React 17 → **React 18** (`createRoot`)
- **TypeScript migration:** converted project source to **TypeScript/TSX** (with pragmatic typings and `tsc --noEmit` passing)
- **UI/UX improvements:**
  - Transfer manager (queued/running/completed/failed, progress, retry, clear completed)
  - Better error/loading/empty states and snackbar notifications
  - Drag-and-drop file/folder uploads with folder structure preservation
  - Move/rename dialogs, bulk actions, per-item "More" actions menu
  - In-app previews for supported file types and improved shared-file page
  - Responsive layout/accessibility improvements (focus states, collapsible nav, mobile-friendly behavior)
- **Download reliability improvements:**
  - More robust fetch/proxy fallback handling and clearer error messages
  - Configurable download proxy via `VITE_DOWNLOAD_PROXY_URL`
  - Configurable extension ID(s) via `VITE_DISBOX_EXTENSION_ID` / `VITE_DISBOX_EXTENSION_IDS`
- **Firefox extension:** added `firefox-extension/` (MV2) with a content-script bridge for download assistance (separate from the main web app), including support for AMO-signed builds using the extension ID `disbox-downloader@example.local`

## How it works

Disbox splits uploaded files into chunks to fit Discord attachment limits, uploads chunks via a Discord webhook, and stores file/folder metadata plus chunk/message references in a separate database. The web client presents this as a virtual file system and reassembles chunks on download.

## Technical details

### Database
Disbox stores file metadata and message/chunk references in a backend database. Webhook URLs are used as account identifiers (hashed client-side in this implementation). The database does not provide direct access to Discord attachments by itself.

### Discord API (Webhooks)
Webhooks are used instead of bots because they are easier for users to set up and require minimal Discord configuration.

### CORS and downloads
Browsers cannot reliably fetch Discord CDN attachment URLs directly from a web page due to CORS restrictions. This project supports:
- **Browser extension (recommended):** fetches attachment data from an extension context with appropriate permissions
- **Proxy fallback:** attempts direct/proxy fetch strategies when extension download is unavailable (third-party proxies can be unreliable/blocked and may expose request data to the proxy)

For self-hosted/reliable setups, you can configure a custom proxy endpoint with `VITE_DOWNLOAD_PROXY_URL`.

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

### Type checking
```bash
npx tsc --noEmit
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
# VITE_DISBOX_EXTENSION_ID=disbox-downloader@example.local
# VITE_DISBOX_EXTENSION_IDS=disbox-downloader@example.local,jklpfhklkhbfgeencifbmkoiaokeieah
```

- `VITE_DISBOX_SERVER_URL` – overrides the Disbox metadata server URL (defaults to the project’s configured server)
- `VITE_DOWNLOAD_PROXY_URL` – custom download proxy/prefix/template used for download fallback (helpful when public proxies fail)
- `VITE_DISBOX_EXTENSION_ID` / `VITE_DISBOX_EXTENSION_IDS` – extension ID(s) the web app should try for download assistance

**Important:** Vite env variables are embedded at **dev server start/build time**. After changing `.env`, restart `npm run dev` or rebuild (`npm run build` / `npm run preview:prod`).

## Firefox extension
A Firefox extension implementation is available in `firefox-extension/` to assist with downloads by fetching Discord attachment URLs from the extension context (bypassing page CORS restrictions).

- **Source/location:** `firefox-extension/` (manifest, background script, content-script bridge, icons)
- **Temporary/local load:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on...** → `firefox-extension/manifest.json`
- **Allowed origins (content-script bridge):** `http://localhost/*`, `http://127.0.0.1/*`, `https://localhost/*`, `https://127.0.0.1/*`, `https://disboxapp.github.io/*`
- **Extension ID:** `disbox-downloader@example.local` (as configured in this repo’s Firefox extension manifest)

### Using the Firefox extension with this web app
The web app must be configured to message the extension ID, and the build must include that configuration:

1. Install/load the Firefox extension (temporary or signed `.xpi`)
2. Set in `.env`:
   ```env
   VITE_DISBOX_EXTENSION_ID=disbox-downloader@example.local
   ```
3. Restart/rebuild the web app (`npm run dev`, or `npm run build` / `npm run preview:prod`)
4. Open the app on an allowed origin (e.g. `http://localhost:5173/`)

> Note: The extension being installed in Firefox is separate from the website code. A deployed site (e.g. `https://disboxapp.github.io/web`) will only use this Firefox extension if that deployed build is configured with the matching extension ID.

See `firefox-extension/README.md` for more details and limitations.

## Notes
- Discord attachment URLs can expire; if a shared/download link stops working, generate a fresh share link or re-fetch/download again.
- Public CORS proxies may fail or be blocked; a browser extension or a trusted/self-hosted proxy is more reliable for downloads.
- Keep webhook URLs private (they grant access to the associated storage).

## License
See [LICENSE](LICENSE).
