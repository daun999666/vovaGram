# vovchikGram 2.0 — development branch

> **Status:** development release, not yet merged into `main`. The 250-item roadmap is a delivery plan, not a claim that all 250 features are complete.

## Verified 2.0 features in this branch

- Cursor-based message history (50-message pages), preserving scroll position while older messages load.
- Per-chat unread counters and server-side read cursors.
- Server-backed multiple pins and Saved Messages.
- Server-backed chat favourites and archive state.
- Search across people, chats and message text, restricted to chats the signed-in user can access.
- Message forwarding with source author/chat metadata.
- Edit history: previous message text is retained and visible to chat members.
- Real-time typing state and presence updates scoped to shared chats (presence has no last-seen timestamp yet).
- Per-chat server drafts and per-account message hiding with a restore manager.
- Account blocking, with mutual direct-message enforcement and a blocked-users manager.
- Group member lists, owner/admin/member role controls, and expiring / limited-use invite links.
- Image, PDF, TXT, DOCX, ZIP, MP4 and WebM attachments with signature checks, compact document cards and inline video playback.
- Material 3 Expressive wavy progress indicators using the upstream `material@3.16.0` web component.

## Build and verify

Requires Node.js 22 LTS.

```cmd
npm install
copy .env.example .env
```

Set private values in `.env`, then run:

```cmd
npm run check
npm start
```

Open http://localhost:8787.

The CI workflow runs JavaScript syntax checks, Node integration/unit tests and a Windows x64 EXE packaging job on every push to `v2.0.0-dev`.

- [2.0 roadmap — 100 main + 150 secondary items](docs/2.0/ROADMAP.md)
- [Architecture and delivery notes](docs/2.0/ARCHITECTURE.md)
- [Third-party licenses and notices](THIRD_PARTY_NOTICES.md)
- [Latest v2 Windows build and CI results](https://github.com/daun999666/vovaGram/actions)

For this branch's source ZIP:
https://github.com/daun999666/vovaGram/archive/refs/heads/v2.0.0-dev.zip

When updating an existing installation, keep your own `.env` and `data/` folder. Stop the server before copying database files.

---

# Legacy main branch documentation — vovchikGram 1.x

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

5. Open `.env` in Notepad. Set unique long `OWNER_PASSWORD`, `DEV_PASSWORD`, and `JWT_SECRET` values (replace every `CHANGE_ME` placeholder). Never publish or upload your real `.env` file.
   
   The repository ZIP contains `.env.example`, not your private `.env`. The Windows launcher creates `.env` from the example when it is missing. If you already had private values, restore them from your own backup; they cannot be recovered from the public repository.
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


## Latest main branch

The current `main` branch contains the Material 3 Expressive interface work, expressive playback waveform/timeline, button groups and toolbars, upload progress indicator, responsive message layout and modal scrolling fixes.

Download the current source archive from:
https://github.com/daun999666/vovaGram/archive/refs/heads/main.zip

The archive is the project source, not a preconfigured server with personal secrets. Keep your local `.env`, `data/`, and `uploads/` folders when updating an existing installation. Stop the old server first, extract the new source to a separate folder, then copy your old `.env` and `data/` into the new project folder. Do not overwrite these with example data.
