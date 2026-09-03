@echo off
echo ========================================================
echo   Starting Universal AI Agent QA Platform (Full-Stack)
echo ========================================================

echo 1. Starting Backend FastAPI Server (Port 8000)...
start "QA Platform - Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo 2. Starting Frontend Vite Server (Port 5173)...
start "QA Platform - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are launching in separate windows!
echo Backend:  http://127.0.0.1:8000/docs
echo Frontend: http://localhost:5173
echo ========================================================
