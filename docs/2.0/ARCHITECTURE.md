# vovchikGram 2.0 — architecture and delivery rules

## Delivery model
- v2 work stays on the `v2.0.0-dev` branch until the release checklist passes.
- Each feature is implemented in a small vertical slice: schema/API/UI/tests/docs.
- A roadmap checkbox changes to [x] only after implementation and an automated test or explicit manual validation exists.
- Database migrations must be additive and safe for existing SQLite installations.
- The app remains self-hosted Node.js + Express + Socket.IO + SQLite until a separately tested desktop shell is ready.

## Current baseline gaps
- Message history loads only the latest 100 rows; there is no older-message cursor.
- No persistent read cursors/unread counters.
- Socket.IO room messaging exists, but no typing/presence event model.
- Pins and Saved Messages need server persistence; previous workspace-local data is not cross-device.
- Message upload sends base64 JSON and buffers the complete file in memory.
- Most client rendering lives in one large app.js module.

## First 2.0 vertical slice
1. Add cursor-based message pagination.
2. Add persistent chat read cursors and unread counts.
3. Add Socket.IO typing and presence events with membership checks.
4. Add server-backed pinned messages and Saved Messages.
5. Add tests for query validation, message paging, access checks and read cursor behavior.
6. Remove the duplicate player header waveform and reduce the timeline to the M3 wavy-progress proportions.

## M3 implementation note
The official `@material/web` repository provides browser-native Material Web Components under Apache-2.0. It includes standard linear/circular progress components. The M3 Expressive wavy progress implementation is documented in `material-components-android` and is a native Android component; it cannot be embedded unchanged into an HTML/JS web page. The browser timeline therefore uses a compact SVG rendering following the documented wavy-track anatomy, while web-native Material components are used where available. Third-party code and licenses are retained in `THIRD_PARTY_NOTICES.md`.

## Automated checks
- `npm run check`: syntax checks plus Node's built-in test runner.
- Windows packaging: `npm run build:win`.
- Browser smoke tests should cover chat opening, paging, typing, read counts, pin/save, player seek, settings modal scrolling and file upload.
