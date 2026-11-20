@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 LTS is recommended (20+ can run source mode). Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
for /f "tokens=1" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if not "%NODE_MAJOR%"=="22" (
  echo Recommended: Node.js 22 LTS. Detected major version %NODE_MAJOR%.
  echo The packaged EXE build uses the same Node 22 ABI as better-sqlite3.
  pause
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 1)
)
if not exist .env copy .env.example .env >nul
echo.
echo IMPORTANT: Edit .env and set strong passwords for OWNER_PASSWORD, DEV_PASSWORD and JWT_SECRET.
echo.
call npm start
pause
