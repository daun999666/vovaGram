# vovchikGram — build 1.6.0

Material You messenger for desktop browsers and mobile PWA. Server: Node.js + Express + Socket.IO + SQLite. The desktop EXE is packaged with `@yao-pkg/pkg`; Electron is not used.

## Project folder

After extracting the ZIP, open the `vovchikGram` folder. It contains `server.js`, `package.json`, `public/`, and `.env.example`.

## Windows setup

1. Install **Node.js 22 LTS** (not Node 24) from https://nodejs.org/.
2. Extract the ZIP, open the `vovchikGram` folder.
3. In the folder address bar type `cmd` and press Enter.
4. Run:

```cmd
npm install
copy .env.example .env
```

5. Open `.env` in Notepad. Set your own long `OWNER_PASSWORD`, `DEV_PASSWORD`, and `JWT_SECRET`. Never publish this file.
6. Run:

```cmd
npm run check
npm start
```

7. Open http://localhost:8787.

The first start creates `data/vovchikgram.sqlite`. Existing database files must be copied into `data/` only while the old server is stopped. Keep the `-wal` and `-shm` files with the database if they exist.

## Use from a phone on the same Wi-Fi

The phone and PC must be on the same local network. Run `ipconfig` on the PC, find the active Wi-Fi adapter's IPv4 address, then open `http://PC-IP:8787` on the phone. Allow Node.js through Windows Firewall on **Private networks**. The PC must stay on and the server process must remain running. A phone hotspot is also a local network: connect the PC to the phone's hotspot and use the PC's IPv4 address shown by `ipconfig`.

## Build a Windows EXE

```cmd
npm run build:win
```

The target is Node 22 x64. The build uses `@yao-pkg/pkg` and includes the `better-sqlite3` native binary for the matching Node 22 ABI. Run `npm install` before the build; `build-windows.bat` refreshes dependencies automatically. The EXE has not been built or validated in this source archive. When running as a packaged app, database/uploads are stored under `%APPDATA%\\vovchikGram`.

## Features in 1.4.1

- Telegram-inspired animated navigation drawer, chat folders with transitions, search results for people and chats, profile drawer.
- Material You palettes and geometric wallpapers, working light/dark mode, whole-interface font scaling and font family selection, message corner radius, message spacing, compact chat list.
- Profile avatar upload, bio, anonymous number, profile color cover, developer/owner verification badge.
- Up to five additional usernames (3–24 characters, including short names such as `dev`).
- Group and channel creation, direct messages, chat avatars, chat descriptions and wallpaper presets; channel owners can delete their channels from the chat information panel.
- Default Material 3 geometric wallpaper, dots/diamonds presets, custom wallpaper upload (local browser preference).
- Message reply, edit, delete, copy and emoji reactions.
- Emoji picker with categories and search.
- Upload audio from file picker, personal track library, half-screen player/editor with animated waveform, timecode seeking, and playback speed controls.
- Admin dashboard with user/chat/message/online counts, ban/unban, and permanent deletion of ordinary user accounts with group ownership handover.
- PWA manifest and responsive mobile layout.

## Important limitations

This is a feature-rich prototype, not a secure production replacement for Telegram. It does not include end-to-end encryption, voice/video calls, push notifications, reliable multi-device read receipts, message forwarding, large-file streaming, or a full channel subscription/discovery system. Uploads are limited to 5 MB for images and 15 MB for audio. Uploaded media is stored in `data/uploads/`. Keep backups of the entire `data/` directory. Before exposing the server to the public internet, add rate limiting, stronger upload inspection/quota controls, HTTPS reverse proxy, backups, and an independent security review.

## Admin accounts

On first launch, `@owner` and `@dev` are created only if their passwords are set in `.env`. `@owner` receives `+888000888`; `@dev` receives a generated number. Older regular accounts named `@owner` show a one-time owner-activation section in Settings (also noted in the profile panel). To use it, first change `OWNER_PASSWORD` in `.env` to a private value, restart the server, then enter that same value in Settings. Do not share the value. When the EXE is placed in `dist/`, it reads `.env` next to the EXE first and falls back to the project folder one level above. Activation is only possible when no owner has already been initialized. After activation, the reserved account number is set to exactly `+888000888`; any other account holding this reserved number is retained and assigned a new generated number. Both roles receive the verified badge. `@dev` cannot ban `@owner` or another `@dev`; `@owner` can manage regular users.


## v1.4.2
- Paste images from clipboard (Ctrl+V) and attach images from file picker (up to 4 images, 5 MB each).
- Image attachments are stored as message attachment metadata; existing message history is preserved by a safe SQLite column migration.
- Softer Material 3 wallpapers and dimmed wallpaper continuity in the chat list.
- Chat details now support removing a direct conversation, leaving a group/channel, and deleting owned spaces.


## v1.6.0 — Workspace update

- Added a collapsible right-side workspace panel inside chats with Tools, Search, Saved, and Settings tabs.
- Added a dedicated message editor panel, context menu actions, local bookmarks, local pins, and multi-message selection.
- Added per-chat local drafts, private notes, favorites, mute preferences, and archive visibility.
- Added in-chat search over the currently loaded message history and plain-text chat export.
- Added a basic forward-as-new-message action to another chat in the current chat list.
- Added compact list, focus mode, preview visibility, interface scaling, Enter-to-send preference, and keyboard shortcuts (Alt+P, Ctrl/⌘+Enter, Esc).

**v1.6 local-only data:** favorites, archive flags, mute preferences, notes, drafts, bookmarks, pins, and interface preferences are stored in the browser's local storage. They do not sync to other devices and are cleared if the browser's site data is cleared. Search scans the messages currently loaded in the open conversation (up to the server's existing history limit). Forwarding creates a new text message and does not preserve the original sender attribution or image attachments.
