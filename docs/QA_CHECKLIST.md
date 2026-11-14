# Disbox Manual QA Checklist

Use this checklist before releases and when validating major changes (uploads/downloads, sharing, extension/proxy behavior).

## Environments

- Browsers: Chrome/Chromium, Firefox (latest stable if possible)
- Modes: with browser extension installed/enabled, without extension
- Network conditions (when feasible): normal, throttled/high-latency, intermittent failures
- Origins/builds: local dev (`npm run dev`), local preview/prod build (`npm run preview:prod`), deployed site (if applicable)

## Setup & configuration

- [ ] Fresh load with no stored webhook URL shows setup/home flow correctly
- [ ] Valid Discord webhook URL connects and loads file tree
- [ ] Invalid/malformed webhook URL shows clear error
- [ ] Server/unreachable errors show clear recovery guidance
- [ ] `.env` / build-time vars behave as expected after restart/rebuild:
  - [ ] `VITE_DISBOX_SERVER_URL`
  - [ ] `VITE_DOWNLOAD_PROXY_URL`
  - [ ] `VITE_DISBOX_EXTENSION_ID` / `VITE_DISBOX_EXTENSION_IDS`

## Browsing & navigation

- [ ] Root folder loads and lists items correctly
- [ ] Open folders by double-click/context action
- [ ] Breadcrumb/path navigation works
- [ ] Search finds files/folders/extensions as expected
- [ ] Selection (single/multi) works on desktop and mobile widths
- [ ] Empty folder/search states display correctly

## Uploads

- [ ] Upload single file via button
- [ ] Upload multiple files via button
- [ ] Upload folder via picker (preserves folder structure)
- [ ] Drag-and-drop files uploads correctly
- [ ] Drag-and-drop folders uploads correctly (including nested folders)
- [ ] Progress/status shown in transfer manager
- [ ] Name conflicts handled (auto-rename/availability behavior)
- [ ] Upload failure shows actionable error; retry works
- [ ] Large file/chunked upload completes (watch rate limits/progress)

## Downloads

- [ ] Download single file
- [ ] Download multiple selected files
- [ ] Download folder as zip (contents/paths correct)
- [ ] Progress/status shown where applicable (transfers/notifications)
- [ ] Extension detected status shown correctly; re-check works
- [ ] With extension (direct download capable): download succeeds without CORS/proxy issues
- [ ] With extension unavailable: fallback to browser/proxy path works
- [ ] With custom/self-hosted proxy configured: proxy path used/fallbacks behave correctly
- [ ] Expired/missing attachment URL recovery works (retry/refresh behavior)
- [ ] Per-chunk/network retry behavior recovers transient failures when possible
- [ ] Failed downloads show clear reason and retry option

## Move / rename / delete

- [ ] Rename file/folder (inline or dialog where supported)
- [ ] Move single item to existing folder
- [ ] Move multiple items
- [ ] Move to new/nonexistent folder path creates destination as expected
- [ ] Conflict handling on move/rename works (skip/rename/cancel behavior as implemented)
- [ ] Delete confirmation protects against accidental deletion (single and bulk)
- [ ] Delete removes item(s) and UI refreshes correctly
- [ ] Error cases (missing parent/target, name collision, API failure) show clear messages

## Sharing

- [ ] Generate/copy share link for file
- [ ] Open shared file page from copied link
- [ ] Shared page download works (with and without extension, as applicable)
- [ ] Share dialog shows metadata/expiry guidance (attachment links may expire)
- [ ] Regenerate/re-copy share link works and uses fresh URLs
- [ ] Invalid/expired share links show clear errors

## Previews

- [ ] Supported file types preview correctly (images, video/audio, PDF, text/json as supported)
- [ ] Unsupported/oversized files show clear “preview unavailable/limited” messaging
- [ ] Preview load failures show useful error state
- [ ] Preview actions (download/copy link/close) work
- [ ] Mobile/responsive preview layout usable

## UI/UX & accessibility

- [ ] Responsive layout works on narrow/mobile widths
- [ ] Keyboard focus/navigation works for key dialogs/actions
- [ ] Buttons/menus disabled states are correct during busy operations
- [ ] Toasts/errors/success messages are clear and not misleading
- [ ] Dark/light theme behavior remains correct (if applicable)

## Regression checks

- [ ] Folder structure operations do not corrupt paths/tree
- [ ] Refresh/current view stays consistent after mutations
- [ ] No console errors/spam during normal flows
- [ ] `npm run typecheck`, `npm run lint`, `npm run format`, `npm run test`, `npm run build` pass
