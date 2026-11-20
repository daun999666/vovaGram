param(
  [Parameter(Mandatory=$true)]
  [string]$QtPrefix
)
$ErrorActionPreference = "Stop"
$buildDir = Join-Path $PSScriptRoot "build"
cmake -S $PSScriptRoot -B $buildDir -DCMAKE_PREFIX_PATH="$QtPrefix"
if ($LASTEXITCODE -ne 0) { throw "CMake configure failed." }
cmake --build $buildDir --config Release
if ($LASTEXITCODE -ne 0) { throw "C++ build failed." }

$windeployqt = Join-Path $QtPrefix "bin/windeployqt.exe"
$exe = Join-Path $buildDir "Release/vovchikGram.exe"
if (Test-Path $windeployqt) {
  & $windeployqt --release $exe
  if ($LASTEXITCODE -ne 0) { throw "windeployqt deployment failed." }
} else {
  Write-Warning "windeployqt.exe not found; Qt runtime deployment was skipped."
}
Write-Host "C++ app build output: $exe"
