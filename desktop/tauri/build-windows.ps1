param(
  [string]$QtOrRustTarget = ""
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
Push-Location $root
try {
  Write-Host "[1/4] Building the Node.js backend executable..."
  npm install
  npm run build:win
  $triple = (rustc --print host-tuple).Trim()
  if (-not $triple) { throw "Could not determine Rust target triple." }

  $binDir = Join-Path $PSScriptRoot "src-tauri/binaries"
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  $source = Join-Path $root "dist/vovchikGram.exe"
  if (-not (Test-Path $source)) { throw "Backend executable was not produced: $source" }
  Copy-Item $source (Join-Path $binDir "vovchikgram-server-$triple.exe") -Force

  Write-Host "[2/4] Installing Tauri CLI..."
  Push-Location $PSScriptRoot
  npm install
  Write-Host "[3/4] Building the Windows desktop app..."
  npm run tauri -- build
  Write-Host "[4/4] Build finished. Check desktop/tauri/src-tauri/target/release/bundle."
}
finally {
  Pop-Location
}
