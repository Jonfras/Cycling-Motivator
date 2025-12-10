@echo off
set "LOCAL_NODE=%~dp0.local\node-v22.12.0-win-x64"
set "PATH=%LOCAL_NODE%;%PATH%"
echo Using local Node.js from %LOCAL_NODE%
node -v
npm run dev
