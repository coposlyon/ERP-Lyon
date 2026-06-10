@echo off
title Dator ERP v2.0
color 0A

echo.
echo  ==========================================
echo   DATOR ERP v2.0 - Sistema de Gestao
echo  ==========================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "backend\node_modules" (
  echo [1/3] Instalando dependencias do backend...
  cd backend
  npm install
  cd ..
)

if not exist "frontend\node_modules" (
  echo [2/3] Instalando dependencias do frontend...
  cd frontend
  npm install
  cd ..
)

:: Check .env
if not exist "backend\.env" (
  echo.
  echo [ATENCAO] Arquivo backend\.env nao encontrado!
  echo Copie backend\.env.example para backend\.env e configure o Supabase.
  echo.
  pause
  exit /b 1
)

echo [3/3] Iniciando servidores...
echo.
echo  Backend: http://localhost:3001
echo  Frontend: http://localhost:5173
echo.
echo  Pressione CTRL+C para parar.
echo.

:: Start both servers
start "Dator ERP - Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
timeout /t 2 /nobreak >nul
start "Dator ERP - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Open browser after 3 seconds
timeout /t 3 /nobreak >nul
start http://localhost:5173
