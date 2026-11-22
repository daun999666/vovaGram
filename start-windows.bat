@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js 22 LTS first.& pause & exit /b 1)
if not exist node_modules (
 echo Installing dependencies...
 call npm install
 if errorlevel 1 (echo npm install failed.& pause & exit /b 1)
)
echo Starting vovchikGram...
start "vovchikGram server" /min cmd /c "cd /d "%~dp0" ^&^& npm start"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:8787'; for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 2;if($r.StatusCode -ge 200){exit 0}}catch{};Start-Sleep -Seconds 1};exit 1"
if errorlevel 1 (echo Server did not become ready.& pause & exit /b 1)
where msedge.exe >nul 2>nul
if errorlevel 1 (echo Microsoft Edge msedge.exe was not found in PATH.& echo Open http://127.0.0.1:8787 manually.& pause & exit /b 1)
start "" msedge.exe --new-window http://127.0.0.1:8787
echo vovchikGram is running in Microsoft Edge.
pause
