@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 LTS is recommended. Install Node.js and run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 1)
)
if not exist .env if exist .env.example copy .env.example .env >nul
echo Starting vovchikGram server...
start "vovchikGram server" "%ComSpec%" /d /c "cd /d ""%~dp0"" && set NO_BROWSER=1 && npm start"
echo Waiting for local server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ready=$false; for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8787/api/health' -TimeoutSec 2;if($r.StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Seconds 1};if(!$ready){exit 1}"
if errorlevel 1 (
  echo Server failed to start. Check the minimized server window.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=@((Get-Command msedge.exe -ErrorAction SilentlyContinue).Source,(Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'));$e=$c|Where-Object {$_ -and (Test-Path $_)}|Select-Object -First 1;if(!$e){Write-Error 'msedge.exe not found';exit 2};Start-Process -FilePath $e -ArgumentList @('--new-window','http://127.0.0.1:8787')"
if errorlevel 1 (
  echo Microsoft Edge could not be launched. No default browser fallback was used.
  pause
  exit /b 1
)
echo vovchikGram opened in Microsoft Edge.
pause
endlocal
