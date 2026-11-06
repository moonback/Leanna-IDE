
@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title LEANNA OS ^| Autonomous AI Workspace
color 0B

:: ============================================================
:: FENETRE MAXIMISEE
:: ============================================================
:: Maximiser la fenetre de la console via un script VBS temporaire
:: (envoie Alt+Espace puis x = commande "Agrandir" du menu systeme)
set "FS_VBS=%TEMP%\leanna_maximize.vbs"
(
    echo Set WshShell = CreateObject^("WScript.Shell"^)
    echo WScript.Sleep 150
    echo WshShell.AppActivate "LEANNA OS ^| Autonomous AI Workspace"
    echo WScript.Sleep 150
    echo WshShell.SendKeys "% x"
) > "%FS_VBS%" 2>nul
if exist "%FS_VBS%" (
    cscript //nologo "%FS_VBS%" >nul 2>&1
    del "%FS_VBS%" >nul 2>&1
)

:: ============================================================
:: LEANNA OS - PREMIUM LAUNCHER
:: Version 2.1 | Windows CMD | Node.js / Electron / PM2
:: ============================================================

set "VERSION=2.2.0"
set "LAUNCHER_VERSION=2.1"
set "STEP=0"
set "TOTAL=3"

cd /d "%~dp0" || (
    echo [ERROR] Impossible d'acceder au dossier du projet.
    pause
    exit /b 1
)

:: Activer les sequences ANSI dans la console Windows
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

:: Palette visuelle
set "RST=%ESC%[0m"
set "BOLD=%ESC%[1m"
set "DIM=%ESC%[2m"
set "ITAL=%ESC%[3m"
set "WHITE=%ESC%[97m"
set "GREY=%ESC%[38;5;245m"
set "CYAN=%ESC%[96m"
set "BLUE=%ESC%[38;5;39m"
set "GREEN=%ESC%[38;5;82m"
set "RED=%ESC%[38;5;203m"
set "YELLOW=%ESC%[38;5;220m"
set "PURPLE=%ESC%[38;5;141m"
set "TEAL=%ESC%[38;5;80m"

:menu
cls
call :banner

echo.
echo  %CYAN%  ╭──────────────────────────────────────────────────────────────╮%RST%
echo  %CYAN%  │%RST%   %WHITE%%BOLD%WORKSPACE CONTROL CENTER%RST%   %DIM%· choisissez une action ci-dessous%RST%   %CYAN%│%RST%
echo  %CYAN%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
echo     %GREEN%▸ 01%RST%   %WHITE%%BOLD%START WORKSPACE%RST%
echo             %GREY%Lancer Leanna en mode normal%RST%
echo.
echo     %BLUE%▸ 02%RST%   %WHITE%%BOLD%DEVELOPER MODE%RST%
echo             %GREY%Electron + Vite + DevTools%RST%
echo.
echo     %PURPLE%▸ 03%RST%   %WHITE%%BOLD%PRODUCTION MODE%RST%
echo             %GREY%Build et lancement via PM2%RST%
echo.
echo     %YELLOW%▸ 04%RST%   %WHITE%%BOLD%DEPENDENCY MANAGER%RST%
echo             %GREY%Nettoyer node_modules et reinstaller%RST%
echo.
echo     %TEAL%▸ 05%RST%   %WHITE%%BOLD%BUILD INSTALLER (WIN)%RST%
echo             %GREY%Generer l'installateur Windows ^(npm run dist:win^)%RST%
echo.
echo     %TEAL%▸ 06%RST%   %WHITE%%BOLD%BUILD PORTABLE (WIN)%RST%
echo             %GREY%Generer un build non empaquete ^(npm run pack:win^)%RST%
echo.
echo     %PURPLE%▸ 07%RST%   %WHITE%%BOLD%CREDITS%RST%
echo             %GREY%A propos de Leanna OS%RST%
echo.
echo     %RED%▸ 08%RST%   %WHITE%%BOLD%EXIT%RST%
echo             %GREY%Fermer le launcher%RST%
echo.
echo  %CYAN%  ────────────────────────────────────────────────────────────────%RST%
echo  %DIM%   📁 Projet   %RST%%GREY%%CD%%RST%
echo  %DIM%   ⚙  Runtime  %RST%%GREY%Node.js  ·  Electron  ·  Vite%RST%
echo  %CYAN%  ────────────────────────────────────────────────────────────────%RST%
echo.

choice /c 12345678 /n /m "  %TEAL%LEANNA ❯%RST% Selectionner une option [1-8] : "

if errorlevel 8 exit /b 0
if errorlevel 7 goto :credits
if errorlevel 6 goto :pack_win
if errorlevel 5 goto :dist_win
if errorlevel 4 goto :clean_deps
if errorlevel 3 goto :pm2_process
if errorlevel 2 goto :dev_process
if errorlevel 1 goto :start_process

:: ============================================================
:: BANNIERE
:: ============================================================

:banner
echo.
echo  %BLUE%  ██╗     ███████╗ █████╗ ███╗   ██╗███╗   ██╗ █████╗%RST%
echo  %CYAN%  ██║     ██╔════╝██╔══██╗████╗  ██║████╗  ██║██╔══██╗%RST%
echo  %CYAN%  ██║     █████╗  ███████║██╔██╗ ██║██╔██╗ ██║███████║%RST%
echo  %CYAN%  ██║     ██╔══╝  ██╔══██║██║╚██╗██║██║╚██╗██║██╔══██║%RST%
echo  %BLUE%  ███████╗███████╗██║  ██║██║ ╚████║██║ ╚████║██║  ██║%RST%
echo  %BLUE%  ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚═╝  ╚═╝%RST%
echo.
echo  %DIM%  A U T O N O M O U S   A I   W O R K S P A C E%RST%
echo  %CYAN%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%RST%
echo  %WHITE%%BOLD%  ◆ LEANNA OS%RST%  %DIM%v%VERSION%  ·  LAUNCHER v%LAUNCHER_VERSION%%RST%
echo  %CYAN%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%RST%
goto :eof

:: ============================================================
:: MODE NORMAL
:: ============================================================

:start_process
set "RUN_CMD=desktop"
set "RUN_LABEL=MODE NORMAL"
set "TOTAL=3"
goto :prepare_app

:: ============================================================
:: MODE DEVELOPPEUR
:: ============================================================

:dev_process
set "RUN_CMD=desktop:debug"
set "RUN_LABEL=DEVELOPER MODE"
set "TOTAL=3"
goto :prepare_app

:: ============================================================
:: PREPARATION
:: ============================================================

:prepare_app
set "STEP=0"
cls
call :banner
echo.
echo  %CYAN%  ╭───────────────────────── INITIALIZATION ─────────────────────╮%RST%
echo.
call :step "Verification de Node.js"

where node >nul 2>&1
if errorlevel 1 (
    call :fatal "Node.js est introuvable." "Installez Node.js LTS puis relancez."
    goto :menu
)
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODE_VERSION=%%v"
call :ok "Node.js !NODE_VERSION!"

call :step "Verification de npm"
where npm >nul 2>&1
if errorlevel 1 (
    call :fatal "npm est introuvable." "Reparez l'installation de Node.js."
    goto :menu
)
call :ok "npm disponible"

call :step "Verification des dependances"
if not exist "node_modules\" (
    echo.
    call :info "Installation des dependances en cours..."
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        call :fatal "Installation des dependances echouee." "Verifiez le reseau et les logs npm."
        goto :menu
    )
    call :ok "Dependances installees"
) else (
    call :ok "node_modules disponible"
)

echo.
echo  %CYAN%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
echo  %CYAN%  ╭──────────────────────────────────────────────────────────────╮%RST%
echo  %CYAN%  │%RST%  %WHITE%%BOLD%TARGET%RST%    !RUN_LABEL!
echo  %CYAN%  │%RST%  %GREY%Commande%RST%  %DIM%npm run !RUN_CMD!%RST%
echo  %CYAN%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
echo  %GREEN%  ● LIVE%RST%  Les logs de Leanna vont apparaitre ci-dessous.
echo  %GREY%          Pour arreter le processus : %WHITE%Ctrl+C%RST%
echo.
echo  %CYAN%  ───────────────────────── LIVE CONSOLE ────────────────────────%RST%
echo.

call npm run !RUN_CMD!
set "EXIT_CODE=!errorlevel!"

echo.
echo  %CYAN%  ────────────────────────────────────────────────────────────────%RST%
if not "!EXIT_CODE!"=="0" (
    call :fatal "Leanna s'est arrete avec le code !EXIT_CODE!." "Consultez les logs ci-dessus."
) else (
    call :ok "Le processus s'est termine avec le code 0."
    echo.
    pause
)
goto :menu

:: ============================================================
:: MODE PRODUCTION PM2
:: ============================================================

:pm2_process
cls
call :banner
echo.
echo  %PURPLE%  ╭───────────────────────── PRODUCTION DEPLOY ──────────────────╮%RST%
echo.
call :step "Verification de PM2"

where pm2 >nul 2>&1
if errorlevel 1 (
    call :info "Installation globale de PM2..."
    call npm install -g pm2
    if errorlevel 1 (
        call :fatal "Installation de PM2 echouee." "Essayez : npm install -g pm2"
        goto :menu
    )
)
call :ok "PM2 disponible"

call :step "Verification des dependances"
if not exist "node_modules\" (
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        call :fatal "Installation des dependances echouee."
        goto :menu
    )
)
call :ok "Dependances disponibles"

call :step "Build de production"
echo.
call npm run build
if errorlevel 1 (
    call :fatal "Le build a echoue." "Consultez les logs de compilation."
    goto :menu
)
call :ok "Build termine"

call :step "Demarrage PM2"
if not exist "ecosystem.config.cjs" (
    call :fatal "ecosystem.config.cjs introuvable." "Verifiez la configuration PM2."
    goto :menu
)

:: Eviter de lancer deux fois les memes processus
call pm2 start ecosystem.config.cjs
if errorlevel 1 (
    call :fatal "Le lancement PM2 a echoue." "Consultez : pm2 logs"
    goto :menu
)

call :ok "Demande de demarrage envoyee a PM2"
echo.
echo  %PURPLE%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
call pm2 status
echo.
echo  %CYAN%  ╭──────────────────────── COMMANDES UTILES ────────────────────╮%RST%
echo  %GREY%   pm2 logs        %RST%%DIM%Logs en direct%RST%
echo  %GREY%   pm2 monit       %RST%%DIM%Supervision%RST%
echo  %GREY%   pm2 restart all %RST%%DIM%Redemarrage%RST%
echo  %GREY%   pm2 stop all    %RST%%DIM%Arret%RST%
echo  %CYAN%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
pause
goto :menu

:: ============================================================
:: BUILD INSTALLER WINDOWS (dist:win)
:: ============================================================

:dist_win
set "BUILD_CMD=dist:win"
set "BUILD_LABEL=BUILD INSTALLER (WIN)"
set "BUILD_DESC=Generation de l'installateur Windows"
goto :build_win

:: ============================================================
:: BUILD PORTABLE WINDOWS (pack:win)
:: ============================================================

:pack_win
set "BUILD_CMD=pack:win"
set "BUILD_LABEL=BUILD PORTABLE (WIN)"
set "BUILD_DESC=Generation d'un build non empaquete (dossier)"
goto :build_win

:: ============================================================
:: PIPELINE DE BUILD WINDOWS COMMUN
:: ============================================================

:build_win
set "STEP=0"
set "TOTAL=3"
cls
call :banner
echo.
echo  %TEAL%  ╭───────────────────────── WINDOWS BUILD ──────────────────────╮%RST%
echo.
call :step "Verification de Node.js"
where node >nul 2>&1
if errorlevel 1 (
    call :fatal "Node.js est introuvable." "Installez Node.js LTS puis relancez."
    goto :menu
)
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODE_VERSION=%%v"
call :ok "Node.js !NODE_VERSION!"

call :step "Verification des dependances"
if not exist "node_modules\" (
    echo.
    call :info "Installation des dependances en cours..."
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        call :fatal "Installation des dependances echouee." "Verifiez le reseau et les logs npm."
        goto :menu
    )
    call :ok "Dependances installees"
) else (
    call :ok "node_modules disponible"
)

call :step "!BUILD_DESC!"
echo.
echo  %TEAL%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
echo  %CYAN%  ╭──────────────────────────────────────────────────────────────╮%RST%
echo  %CYAN%  │%RST%  %WHITE%%BOLD%TARGET%RST%    !BUILD_LABEL!
echo  %CYAN%  │%RST%  %GREY%Commande%RST%  %DIM%npm run !BUILD_CMD!%RST%
echo  %CYAN%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
echo  %GREEN%  ● LIVE%RST%  La compilation electron-builder va demarrer.
echo  %GREY%          Pour arreter : %WHITE%Ctrl+C%RST%
echo.
echo  %CYAN%  ───────────────────────── BUILD CONSOLE ───────────────────────%RST%
echo.

call npm run !BUILD_CMD!
set "EXIT_CODE=!errorlevel!"

echo.
echo  %CYAN%  ────────────────────────────────────────────────────────────────%RST%
if not "!EXIT_CODE!"=="0" (
    call :fatal "Le build s'est arrete avec le code !EXIT_CODE!." "Consultez les logs ci-dessus."
) else (
    call :ok "Build termine avec succes."
    if exist "release\" call :info "Artefacts disponibles dans le dossier : release"
    if exist "dist_electron\" call :info "Artefacts disponibles dans le dossier : dist_electron"
    echo.
    pause
)
goto :menu

:: ============================================================
:: CREDITS
:: ============================================================

:credits
cls
call :banner
echo.
echo  %PURPLE%  ╭──────────────────────────── CREDITS ─────────────────────────╮%RST%
echo.
echo     %WHITE%%BOLD%  LEANNA OS%RST%  %DIM%v%VERSION%%RST%
echo     %GREY%  Autonomous AI Workspace%RST%
echo.
echo     %CYAN%  Launcher%RST%        %WHITE%v%LAUNCHER_VERSION%%RST%
echo     %CYAN%  Runtime%RST%         %WHITE%Node.js  ·  Electron  ·  Vite%RST%
echo     %CYAN%  Process Mgr%RST%     %WHITE%PM2%RST%
echo     %CYAN%  Build System%RST%    %WHITE%electron-builder  ·  esbuild%RST%
echo.
echo  %PURPLE%  ────────────────────────────────────────────────────────────────%RST%
echo     %GREY%  Concu et developpe par l'equipe Leanna.%RST%
echo     %GREY%  (c) 2026 Leanna OS. Tous droits reserves.%RST%
echo.
echo  %PURPLE%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
pause
goto :menu

:: ============================================================
:: NETTOYAGE
:: ============================================================

:clean_deps
cls
call :banner
echo.
echo  %YELLOW%  ╭──────────────────────── DEPENDENCY MANAGER ──────────────────╮%RST%
echo.
echo  %WHITE%  Cette operation supprimera uniquement node_modules.%RST%
echo  %GREY%  package-lock.json sera conserve pour garder les versions verrouillees.%RST%
echo.
echo  %YELLOW%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
choice /c ON /n /m "  Confirmer le nettoyage ? [O/N] : "
if errorlevel 2 goto :menu

if exist "node_modules\" (
    echo.
    call :info "Suppression de node_modules..."
    rd /s /q "node_modules"
    if exist "node_modules\" (
        call :fatal "Suppression impossible." "Fermez les processus Node.js qui utilisent le dossier."
        goto :menu
    )
    call :ok "node_modules supprime"
) else (
    call :ok "Aucun node_modules a supprimer"
)

echo.
call :info "Reinstallation des dependances..."
call npm install --no-fund --no-audit
if errorlevel 1 (
    call :fatal "Reinstallation echouee." "Consultez les logs npm."
    goto :menu
)
call :ok "Environnement restaure"
echo.
pause
goto :menu

:: ============================================================
:: FONCTIONS UI
:: ============================================================

:step
set /a STEP+=1
echo  %BLUE%  ◆ [%STEP%/%TOTAL%]%RST% %WHITE%%~1%RST%
goto :eof

:ok
echo  %GREEN%  ✔%RST%  %~1
goto :eof

:info
echo  %YELLOW%  ●%RST%  %~1
goto :eof

:fatal
echo.
echo  %RED%  ╭────────────────────────────── ERROR ─────────────────────────╮%RST%
echo  %RED%  │%RST%  %WHITE%%BOLD%✖ %~1%RST%
if not "%~2"=="" echo  %RED%  │%RST%  %GREY%%~2%RST%
echo  %RED%  ╰──────────────────────────────────────────────────────────────╯%RST%
echo.
pause
goto :eof
