# Disbox Downloader for Firefox

This folder contains a **separate Firefox WebExtension** that helps the Disbox web app download Discord attachment files by fetching them from the extension context (bypassing page CORS restrictions). It is isolated from the main web app code.

> The published/signed version is available on AMO: **[Disbox Downloader for Firefox](https://addons.mozilla.org/en-US/firefox/addon/disbox-downloader-for-firefox/)**. This folder contains the extension source used for development and AMO updates (currently `v0.1.5`), including support for the fork’s deployed site (`https://fl-of.github.io/*`) and download progress reporting for the web app’s transfer ETA. If you submit/publish a separate public AMO listing, use a unique Gecko extension ID for that listing.

## What it does

- Uses a content script bridge on allowed Disbox web app origins to communicate with the page reliably
- Responds to install/ping messages with `{ installed: true, capabilities: [...] }`
- **Direct download (preferred):** when asked with `{ action: "download", filename, urls }`, fetches attachment chunks in the extension context and saves the assembled file via the browser Downloads API (avoids page CORS and avoids returning large data URLs to the page)
- **Fetch fallback:** when asked to fetch a URL, downloads it using extension permissions and returns `{ data: <data URL> }` (used for compatibility/fallback paths; memory-intensive for large files)

## Files

- `manifest.json` – Firefox extension manifest (MV2)
- `background.js` – background script handling fetch requests and downloads
- `content-script.js` – page bridge (window.postMessage) for reliable communication from the web app
- `icons/` – extension icons

## Install (recommended)

Install the signed extension from AMO: **https://addons.mozilla.org/en-US/firefox/addon/disbox-downloader-for-firefox/**

After installing or updating, refresh the Disbox web app page so the updated content-script bridge and progress reporting are detected.

## Local development / temporary load (unpacked)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `firefox-extension/manifest.json` from this folder
4. Open the Disbox web app and hard-refresh the page:
   - **Hosted site:** https://fl-of.github.io/disbox_fork/web/
   - **Local dev:** your localhost URL if running locally
5. The app should detect the extension and use it for downloads (when supported)

**Notes**

- Temporary add-ons are removed when Firefox closes (standard Firefox behavior). You’ll need to load it again after restarting Firefox.
- This folder is already configured for the fork site (`https://fl-of.github.io/*`) and uses extension ID `disbox-downloader-public@example.local` (matching the deployed site’s configured IDs). No web app rebuild is required for the hosted site.
- Repo manifest version: `0.1.5` (includes fork site support and download progress reporting). Bump the version for future AMO submissions as required.

## Web app integration / extension ID

The extension uses Gecko ID `disbox-downloader-public@example.local` (see `manifest.json`). The deployed fork website build is configured to try compatible extension IDs (including this one), so it should work on **https://fl-of.github.io/disbox_fork/web/** once this extension is loaded.

For local/custom builds, configure the web app with the extension ID from `manifest.json` via `.env` if needed:

```env
VITE_DISBOX_EXTENSION_ID=disbox-downloader-public@example.local
```

Or support multiple IDs during migration/testing:

```env
VITE_DISBOX_EXTENSION_IDS=disbox-downloader-public@example.local,disbox-downloader@example.local,jklpfhklkhbfgeencifbmkoiaokeieah
```

Then restart/rebuild the web app. For the already-deployed fork site, no rebuild is needed.

## Permissions

- `downloads` – save files directly from the extension
- `storage` – reserved for future settings
- Host permissions for Discord CDN domains to fetch attachment files:
  - `https://cdn.discordapp.com/*`
  - `https://media.discordapp.net/*`
  - `https://*.discordapp.net/*` / `https://*.discordapp.com/*`

## Limitations / notes

- Direct download mode assembles chunks into a Blob in the extension background context before saving; this reduces overhead vs data URLs but can still be memory-intensive for very large files.
- The legacy fetch-to-data-URL path is the most memory-intensive and should only be used as fallback/compatibility.
- Discord attachment URLs can expire; failed downloads may require generating/fetching fresh URLs.
- This is intended as a local/dev helper extension; for distribution you should review Firefox add-on policies, signing, and consider MV3 migration as appropriate.
