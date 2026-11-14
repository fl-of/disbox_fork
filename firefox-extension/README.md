# Disbox Downloader for Firefox

This folder contains a **separate Firefox WebExtension** that helps the Disbox web app download Discord attachment files by fetching them from the extension context (bypassing page CORS restrictions). It is isolated from the main web app code.

> This is an experimental/local extension implementation for Firefox. It is **not** the same as the published Chrome extension and uses a different extension ID. If you submit/publish a separate public AMO listing, use a unique Gecko extension ID for that listing.

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

## Load temporarily in Firefox (for testing)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `firefox-extension/manifest.json` from this repository
4. The extension will be loaded until Firefox is closed

## Important: web app integration / extension ID

The current Disbox web app code has the **Chrome extension ID hardcoded** (`jklpfhklkhbfgeencifbmkoiaokeieah`) and only messages that specific ID. Because Firefox extensions have different IDs, this local Firefox extension will **not** be used automatically by the current web app unless the app is updated to:

- send messages to this extension’s ID, or
- detect/support a configurable extension ID

This folder provides the Firefox extension implementation without changing the original web app behavior.

### Temporary local testing tip

For local experiments, configure the web app with the extension ID from `manifest.json` via `.env` (recommended) instead of hardcoding code changes:

```env
VITE_DISBOX_EXTENSION_ID=disbox-downloader-public@example.local
```

Then restart/rebuild the web app. If you need to support multiple extension IDs during migration/testing, use `VITE_DISBOX_EXTENSION_IDS` with a comma-separated list. Avoid committing temporary hardcoded ID changes if you want to keep other browser/extension behavior unchanged.

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
