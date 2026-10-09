@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Leanna - Autonomous AI Workspace

:: Support ANSI dans la console Windows
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

:: Palette
set "C_RESET=%ESC%[0m"
set "C_DIM=%ESC%[90m"
set "C_TXT=%ESC%[97m"
set "C_ACC=%ESC%[38;5;39m"
set "C_OK=%ESC%[38;5;78m"
set "C_ERR=%ESC%[38;5;203m"
set "C_BOLD=%ESC%[1m"

set "STEP=0"
set "TOTAL=3"
set "VERSION=1.6.0"

cd /d "%~dp0"

:: ---------------------------------------------------------------------------
::  Banniere
:: ---------------------------------------------------------------------------
:: ---------------------------------------------------------------------------
::  Menu principal
:: ---------------------------------------------------------------------------
:menu
cls
echo.
echo   %ESC%[38;5;27m██╗     ███████╗ █████╗ ███╗   ██╗███╗   ██╗ █████╗ %C_RESET%
echo   %ESC%[38;5;33m██║     ██╔════╝██╔══██╗████╗  ██║████╗  ██║██╔══██╗%C_RESET%
echo   %ESC%[38;5;39m██║     █████╗  ███████║██╔██╗ ██║██╔██╗ ██║███████║%C_RESET%
echo   %ESC%[38;5;45m██║     ██╔══╝  ██╔══██║██║╚██╗██║██║╚██╗██║██╔══██║%C_RESET%
echo   %ESC%[38;5;51m███████╗███████╗██║  ██║██║ ╚████║██║ ╚████║██║  ██║%C_RESET%
echo   %ESC%[38;5;87m╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚═╝  ╚═╝%C_RESET%
echo.
echo   %C_DIM%Autonomous AI Workspace  ·  v%VERSION%%C_RESET%
echo   %C_DIM%────────────────────────────────────────────────────%C_RESET%
echo.
echo   %C_ACC%%C_BOLD%1)%C_RESET% %C_TXT%Démarrer Leanna (mode normal)%C_RESET%
echo   %C_ACC%%C_BOLD%2)%C_RESET% %C_TXT%Démarrer Leanna (mode dev / debug)%C_RESET%
echo   %C_ACC%%C_BOLD%3)%C_RESET% %C_TXT%Démarrer Leanna (mode PM2 / production)%C_RESET%
echo   %C_ACC%%C_BOLD%4)%C_RESET% %C_TXT%Réinstaller les dépendances (Clean)^%C_RESET%
echo   %C_ACC%%C_BOLD%5)%C_RESET% %C_TXT%Quitter%C_RESET%
echo.

choice /c 12345 /n /m "Choix : "
if errorlevel 5 goto :eof
if errorlevel 4 goto :clean_deps
if errorlevel 3 goto :pm2_process
if errorlevel 2 goto :dev_process
if errorlevel 1 goto :start_process

:: ---------------------------------------------------------------------------
::  Lancement en mode PM2 (production)
:: ---------------------------------------------------------------------------
:pm2_process
set "STEP=0"
set "TOTAL=4"
call :step "Vérification de l'environnement (PM2)"

where pm2 >nul 2>&1
if errorlevel 1 (
    echo   %C_DIM%   PM2 introuvable, installation globale en cours...%C_RESET%
    echo.
    call npm install -g pm2
    if errorlevel 1 (
        call :fatal "L'installation de PM2 a échoué." "Essayez : npm install -g pm2"
        pause
        goto :menu
    )
    call :ok "PM2 installé"
) else (
    call :ok "PM2 déjà présent"
)

call :step "Dépendances"
if not exist "node_modules\" (
    echo   %C_DIM%   Première exécution, installation en cours...%C_RESET%
    echo.
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        call :fatal "L'installation des dépendances a échoué." "Essayez : npm cache clean --force"
        pause
        goto :menu
    )
    echo.
    call :ok "Dépendances installées"
) else (
    call :ok "Dépendances déjà présentes"
)

call :step "Build de production"
echo.
call npm run build
if errorlevel 1 (
    call :fatal "Le build de production a échoué." "Consultez les logs ci-dessus."
    pause
    goto :menu
)
echo.
call :ok "Build terminé"

call :step "Lancement via PM2"
echo.
call pm2 start ecosystem.config.cjs
if errorlevel 1 (
    call :fatal "Le démarrage PM2 a échoué." "Consultez : pm2 logs"
    pause
    goto :menu
)
echo.
call :ok "Leanna démarré avec PM2"
echo.
echo   %C_DIM%   Commandes utiles :%C_RESET%
echo   %C_DIM%     pm2 status        → état des process%C_RESET%
echo   %C_DIM%     pm2 logs          → logs en direct%C_RESET%
echo   %C_DIM%     pm2 restart all   → redémarrer%C_RESET%
echo   %C_DIM%     pm2 stop all      → arrêter%C_RESET%
echo   %C_DIM%     pm2 delete all    → supprimer les process%C_RESET%
echo.
call pm2 status
echo.
pause
goto :menu

:: ---------------------------------------------------------------------------
::  Nettoyage des dépendances
:: ---------------------------------------------------------------------------
:clean_deps
call :step "Nettoyage des dépendances"
if exist "node_modules\" (
    rd /s /q node_modules
    if exist "node_modules\" (
        call :fatal "Impossible de supprimer node_modules. Fermez les applications qui l'utilisent."
        pause
        goto :menu
    )
    call :ok "Dossier node_modules supprimé"
) else (
    call :ok "Aucun dossier node_modules trouvé"
)
if exist "package-lock.json" (
    del /f /q package-lock.json
    call :ok "package-lock.json supprimé"
)
goto :start_process

:: ---------------------------------------------------------------------------
::  Démarrage en mode dev / debug
:: ---------------------------------------------------------------------------
:dev_process
set "RUN_CMD=desktop:debug"
set "RUN_LABEL=mode dev / debug"
goto :prepare_app

:: ---------------------------------------------------------------------------
::  1. Environnement  (mode normal par défaut)
:: ---------------------------------------------------------------------------
:start_process
set "RUN_CMD=desktop"
set "RUN_LABEL=mode normal"

:prepare_app
set "STEP=0"
set "TOTAL=3"
call :step "Vérification de l'environnement"


:: ---------------------------------------------------------------------------
::  2. Dépendances
:: ---------------------------------------------------------------------------
call :step "Dépendances"

if not exist "node_modules\" (
    echo   %C_DIM%   Première exécution, installation en cours...%C_RESET%
    echo.
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        call :fatal "L'installation des dépendances a échoué." "Essayez : npm cache clean --force"
        exit /b 1
    )
    echo.
    call :ok "Dépendances installées"
) else (
call :ok "Dépendances déjà présentes"
)
goto :run_app


:: ---------------------------------------------------------------------------


:run_app
:: ---------------------------------------------------------------------------
::  3. Lancement
:: ---------------------------------------------------------------------------

if not defined RUN_CMD set "RUN_CMD=desktop"
if not defined RUN_LABEL set "RUN_LABEL=mode normal"

echo   %C_DIM%   Lancement : %RUN_LABEL% (npm run %RUN_CMD%)%C_RESET%
echo   %C_DIM%   Ctrl+C pour arrêter%C_RESET%
echo.
echo   %C_DIM%┌─ logs ───────────────────────────────────────────%C_RESET%

call npm run %RUN_CMD%
set "exit_code=!errorlevel!"

echo   %C_DIM%└──────────────────────────────────────────────────%C_RESET%
echo.

if !exit_code! NEQ 0 (
    call :fatal "Leanna s'est arrêté avec le code !exit_code!." "Consultez les logs ci-dessus."
) else (
    echo   %C_OK%✔  Leanna s'est arrêté proprement.%C_RESET%
    echo.
    pause
)
exit /b !exit_code!

:: ---------------------------------------------------------------------------
::  Fonctions d'affichage
:: ---------------------------------------------------------------------------
:step
set /a STEP+=1
echo   %C_ACC%%C_BOLD%[!STEP!/%TOTAL%]%C_RESET% %C_TXT%%~1%C_RESET%
goto :eof

:ok
echo   %C_OK%   ✔%C_RESET%  %~1
goto :eof

:fatal
echo.
echo   %C_ERR%╭─ ERREUR ─────────────────────────────────────────%C_RESET%
echo   %C_ERR%│%C_RESET%  %~1
if not "%~2"=="" echo   %C_ERR%│%C_RESET%  %C_DIM%%~2%C_RESET%
echo   %C_ERR%╰──────────────────────────────────────────────────%C_RESET%
echo.
pause
goto :eof