@echo off
title SecureLife Insurance Bot
echo Starting SecureLife Insurance Bot...
echo.

cd /d "%~dp0"

echo [1/2] Starting FastAPI backend...
start "Backend - FastAPI" cmd /k "cd /d %~dp0 && uvicorn main:app --reload"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Next.js frontend...
start "Frontend - Next.js" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 5 /nobreak >nul

echo.
echo Both servers are running!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo.
echo Opening browser...
start http://localhost:3000

echo Press any key to stop both servers...
pause >nul

taskkill /FI "WINDOWTITLE eq Backend - FastAPI" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend - Next.js" /F >nul 2>&1
echo Servers stopped.
