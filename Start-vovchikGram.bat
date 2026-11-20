@echo off
setlocal
title vovchikGram Launcher

echo ========================================
echo          vovchikGram Launcher
echo ========================================
echo.
set /p "PROJECT_DIR=Path to the project folder (the folder with package.json): "
if not defined PROJECT_DIR (
  echo No folder was entered.
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%\\package.json" (
  echo.
  echo ERROR: package.json was not found in:
  echo %PROJECT_DIR%
  echo Enter the project folder, not the folder containing this launcher.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm was not found. Install Node.js LTS, then reopen this launcher.
  pause
  exit /b 1
)

pushd "%PROJECT_DIR%"
if not exist "node_modules" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    popd
    pause
    exit /b 1
  )
)

echo.
echo Starting vovchikGram...
echo The browser will open when http://localhost:8787 responds.
echo Keep this window open while using the messenger.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='http://localhost:8787'; for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -ge 200){Start-Process $u;exit}}catch{};Start-Sleep -Seconds 1}; Start-Process $u"
call npm start
echo.
echo vovchikGram server stopped.
popd
pause
endlocal
