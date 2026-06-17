@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
set "NODE=C:\Program Files\nodejs\node.exe"
set "NPM=C:\Program Files\nodejs\npm.cmd"

echo ====================================
echo    CRM eProtectoIT - Demarrage
echo ====================================

:: Installer si premiere fois
if not exist "%~dp0server\node_modules" (
    echo Installation backend (1 minute)...
    cd /d "%~dp0server"
    call "%NPM%" install
)
if not exist "%~dp0client\node_modules" (
    echo Installation frontend (1 minute)...
    cd /d "%~dp0client"
    call "%NPM%" install
)

echo Demarrage backend...
start "Backend CRM" cmd /k "set PATH=C:\Program Files\nodejs;%%PATH%% && cd /d "%~dp0server" && node server.js"

echo Attente 4 secondes...
timeout /t 4 /nobreak > nul

echo Demarrage frontend...
start "Frontend CRM" cmd /k "set PATH=C:\Program Files\nodejs;%%PATH%% && cd /d "%~dp0client" && npm run dev"

echo Attente 6 secondes...
timeout /t 6 /nobreak > nul

echo Ouverture du navigateur...
start http://localhost:5173

echo.
echo ====================================
echo  CRM : http://localhost:5173
echo  Mot de passe : eprotectoit2024
echo ====================================
echo  (Fermez les 2 fenetres CMD pour arreter)
echo ====================================
