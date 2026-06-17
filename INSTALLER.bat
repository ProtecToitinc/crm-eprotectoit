@echo off
echo ============================================
echo   CRM eProtectoIT - Installation initiale
echo ============================================
echo.
echo Node.js est requis. Telechargement...
echo.

:: Télécharger Node.js LTS
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi' -OutFile '%TEMP%\nodejs.msi'"

echo Installation de Node.js...
msiexec /i "%TEMP%\nodejs.msi" /qn

echo Attendez 10 secondes...
timeout /t 10 /nobreak > nul

:: Rafraîchir le PATH
call refreshenv 2>nul || (
  set "PATH=%PATH%;C:\Program Files\nodejs"
)

echo.
echo Installation des modules backend...
cd server
call "C:\Program Files\nodejs\npm.cmd" install

echo.
echo Installation des modules frontend...
cd ..\client
call "C:\Program Files\nodejs\npm.cmd" install

echo.
echo ============================================
echo  Installation terminee !
echo  Double-cliquez sur DEMARRER.bat
echo ============================================
pause
