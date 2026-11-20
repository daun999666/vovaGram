# vovchikGram 2.0.0 — Tauri edition

This branch adds a Tauri 2 desktop shell without Electron. The existing web client and Node/Express/Socket.IO/SQLite backend remain the application core.

## Architecture

- Tauri 2 + Rust: native window, lifecycle, packaging.
- Existing `public/`: shared HTML/CSS/JS client.
- Existing Node server: API, Socket.IO and SQLite.
- The Node server is packaged as a Tauri sidecar; it must be built for the target triple and placed in `src-tauri/binaries/`.

## Windows prerequisites

- Node.js 22
- Rust stable + MSVC C++ build tools
- WebView2 Runtime
- Windows SDK

## Build workflow (Windows x64)

From repository root:

```powershell
npm install
npm run build:win
$triple = rustc --print host-tuple
New-Item -ItemType Directory -Force desktop/tauri/src-tauri/binaries | Out-Null
Copy-Item dist/vovchikGram.exe "desktop/tauri/src-tauri/binaries/vovchikgram-server-$triple.exe"
cd desktop/tauri
npm install
npm run tauri build
```

The sidecar path and capability are configured in `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json`. Tauri requires a target-triple suffix for each bundled executable.

## Status

Initial project scaffold. The sidecar startup/lifecycle integration and a real Windows packaging run still need to be completed and tested before calling this a release build. The server executable is intentionally not committed; it is generated locally.

## Data safety

The backend stores packaged-app data under the current Windows user's AppData directory. Back up the existing `data/` folder before migration/testing. Do not commit `.env`, credentials, databases, or built executables.
