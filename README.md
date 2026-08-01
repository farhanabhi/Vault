# Vault — Personal Storage

A single-page, privacy-first, offline vault for notes and files. Everything is
encrypted and stored **only** in your browser (IndexedDB) — there is no
server, no account, and no network request is ever made with your data.

## Deploy to GitHub Pages

1. Create a new GitHub repo and push the contents of this folder to it
   (`index.html` must be at the repo root, alongside `css/`, `js/`, `icons/`,
   `manifest.json`, and `sw.js`).
2. In the repo, go to **Settings → Pages**, set **Source** to your default
   branch, root folder, and save.
3. Open the published URL (`https://<username>.github.io/<repo>/`). That's it
   — no build step, no dependencies to install.

All paths in this project are relative (`./css/...`, `./js/...`), so it works
whether the site is served from a domain root or a repo subpath.

## Run it locally

Because the app uses the Web Crypto API, IndexedDB, and a service worker, it
needs to be served over `http(s)://`, not opened directly as a `file://`
path (browsers restrict those APIs on `file://`). From this folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## How the security model works

- **Unlock secret:** on first launch you choose either a 6-digit PIN or a
  master password. Nothing about it is ever stored — only a PBKDF2-SHA256
  derived AES-256 key (250,000 iterations, random salt) is used, and a small
  encrypted "verifier" string is stored so the app can check a re-entered
  PIN/password without ever storing the secret itself.
- **Encryption:** every note and file is encrypted with AES-GCM using that
  key before it touches IndexedDB. File bytes and note/file metadata (title,
  tag, content) are encrypted separately, so the app can show your list
  after unlocking without decrypting large file blobs until you actually
  open them.
- **In memory only:** the AES key lives only in a JavaScript variable while
  the vault is unlocked. It is discarded whenever the app locks.
- **Auto-lock:** the vault locks automatically after your chosen idle period
  (1/2/5/10 min, default 2) or the instant this browser tab is hidden
  (switching apps, locking your phone, etc.).
- **No recovery:** because the key is derived only from what you type and
  is never stored anywhere, there is no password-reset. Forgetting your
  PIN/password means the data is unrecoverable unless you have an exported
  backup made with a secret you still remember.
- **Backups:** the export in Settings produces a `.vault` (JSON) file that
  contains only ciphertext — it's safe to store anywhere, since it still
  requires your PIN/password to read. Import fully replaces the current
  vault's contents.
- **Nuke Vault:** permanently deletes the IndexedDB database and any
  service-worker caches on this device. Irreversible without a backup.

## Notes on scope

- Files are capped with a soft 50 MB warning — very large files can make
  encryption/decryption noticeably slower since it all happens on the main
  thread in the browser.
- PDF/image previews render inline via a decrypted, in-memory Blob URL;
  everything else offers a direct (still-encrypted-at-rest) download.
- Markdown support in notes is intentionally minimal (headings, bold,
  italic, inline code, links, lists) and implemented from scratch with no
  external dependency, so it works fully offline.
- No external fonts, icon packs, or CDNs are used anywhere, by design.

## File structure

```
index.html          Single-page app shell (all screens)
css/style.css        All styling
js/crypto.js          PBKDF2 + AES-GCM helpers (Web Crypto API)
js/db.js               IndexedDB wrapper
js/icons.js            Inline SVG icon set
js/markdown.js          Minimal safe markdown renderer
js/app.js               App logic / state / UI wiring
manifest.json         PWA manifest
sw.js                  Service worker (offline app-shell caching)
icons/                Generated app icons
```
