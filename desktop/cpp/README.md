# vovchikGram 2.0.0 — C++ / Qt edition

This branch adds a separate Windows desktop shell in C++ using Qt 6 Widgets + Qt WebEngine. It reuses the existing web client and Node.js backend, so the browser/PWA version remains independent.

## Requirements

- Qt 6 with the WebEngineWidgets module
- CMake 3.21+
- Visual Studio 2022 C++ workload (MSVC)
- Node.js 22 for running the backend during development

## Build

```powershell
cmake -S desktop/cpp -B desktop/cpp/build -DCMAKE_PREFIX_PATH="C:/Qt/6.x.x/msvc2022_64"
cmake --build desktop/cpp/build --config Release
```

Open the generated solution in Visual Studio if you prefer the IDE. Deploy Qt runtime files with Qt's `windeployqt` tool.

## Current status

Initial C++ shell scaffold. It launches the local Node server when run from a repository checkout and embeds the existing client in Qt WebEngine. Packaging the Node backend as a sidecar, first-run configuration, server health checks, graceful shutdown, and a complete Windows deployment test remain follow-up work.

No Electron dependency is used. This is a C++ desktop host, not a rewrite of the web client into native Qt widgets.
