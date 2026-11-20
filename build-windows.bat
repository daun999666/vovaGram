@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Updating dependencies for the Node 22 build...
call npm install
if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 1)
call npm run check
if errorlevel 1 (pause & exit /b 1)
call npm run build:win
if errorlevel 1 (echo EXE packaging failed. Check the error above and confirm Node.js 22 LTS is installed.& pause & exit /b 1)
echo EXE created in dist\vovchikGram.exe
pause
