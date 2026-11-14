# Disbox Downloader for Firefox

This folder contains a **separate Firefox WebExtension** that helps the Disbox web app download Discord attachment files by fetching them from the extension context (bypassing page CORS restrictions). It is isolated from the main web app code.

> This is an experimental/local extension implementation for Firefox. It is **not** the same as the published Chrome extension and uses a different extension ID.

## What it does
- Uses a content script bridge on allowed Disbox web app origins to communicate with the page reliably
- Responds to install/ping messages with `{ installed: true }`
- When asked to fetch a URL, downloads it using extension permissions and returns `{ data: <data URL> }` (the web app expects a fetchable `data` URL/string)

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
For local experiments, you can temporarily change the extension ID used by the web app (e.g. in `src/disbox-file-manager.ts` and any detection logic) to the ID in `manifest.json` (`disbox-downloader@example.local`) and rebuild. Do **not** commit that change if you want to keep Chrome behavior unchanged.

## Permissions
The extension requests host permissions for Discord CDN domains to fetch attachment files:
- `https://cdn.discordapp.com/*`
- `https://media.discordapp.net/*`
- `https://*.discordapp.net/*` / `https://*.discordapp.com/*`

## Limitations / notes
- Large files are converted to data URLs in memory, which can be memory-intensive for very large chunks/files.
- Discord attachment URLs can expire; failed downloads may require generating/fetching fresh URLs.
- This is intended as a local/dev helper extension; for distribution you should review Firefox add-on policies, signing, and consider MV3 migration as appropriate.
