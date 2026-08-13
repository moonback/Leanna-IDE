@echo off
title Jarvis OS
echo ========================================
echo         Demarrage de Jarvis OS
echo ========================================
echo.

:: Verifier que Node.js est installe
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe ou pas dans le PATH.
    echo Telecharge-le ici : https://nodejs.org/
    pause
    exit /b 1
)

:: Aller dans le repertoire du script
cd /d "%~dp0"

:: Installer les dependances si node_modules n'existe pas
if not exist "node_modules\" (
    echo [INFO] Installation des dependances...
    call npm install
    echo.
)

:: Lancer l'application desktop (serveur + Electron)
echo [INFO] Lancement de Jarvis OS...
echo.
call npm run desktop

pause
