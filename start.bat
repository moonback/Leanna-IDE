
@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title LEANNA OS ^| Autonomous AI Workspace
mode con: cols=88 lines=34
color 0B

:: ============================================================
:: LEANNA OS - PREMIUM LAUNCHER
:: Version 2.0 | Windows CMD | Node.js / Electron / PM2
:: ============================================================

set "VERSION=1.6.0"
set "LAUNCHER_VERSION=2.0"
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
set "WHITE=%ESC%[97m"
set "CYAN=%ESC%[96m"
set "BLUE=%ESC%[38;5;39m"
set "GREEN=%ESC%[38;5;82m"
set "RED=%ESC%[38;5;203m"
set "YELLOW=%ESC%[38;5;220m"
set "PURPLE=%ESC%[38;5;141m"

:menu
cls
call :banner

echo.
echo  %CYAN%  +--------------------------------------------------------------+%RST%
echo  %CYAN%  ^|%RST%  %WHITE%%BOLD%  WORKSPACE CONTROL CENTER%RST%                                  %CYAN%^|%RST%
echo  %CYAN%  +--------------------------------------------------------------+%RST%
echo.
echo     %GREEN%[01]%RST%   %WHITE%%BOLD%START WORKSPACE%RST%
echo            %DIM%Lancer Leanna en mode normal%RST%
echo.
echo     %BLUE%[02]%RST%   %WHITE%%BOLD%DEVELOPER MODE%RST%
echo            %DIM%Electron + Vite + DevTools%RST%
echo.
echo     %PURPLE%[03]%RST%   %WHITE%%BOLD%PRODUCTION MODE%RST%
echo            %DIM%Build et lancement via PM2%RST%
echo.
echo     %YELLOW%[04]%RST%   %WHITE%%BOLD%DEPENDENCY MANAGER%RST%
echo            %DIM%Nettoyer node_modules et reinstaller%RST%
echo.
echo     %RED%[05]%RST%   %WHITE%%BOLD%EXIT%RST%
echo            %DIM%Fermer le launcher%RST%
echo.
echo  %CYAN%  +--------------------------------------------------------------+%RST%
echo  %DIM%     Projet : %CD%%RST%
echo  %DIM%     Runtime : Node.js ^| Electron ^| Vite%RST%
echo  %CYAN%  +--------------------------------------------------------------+%RST%
echo.

choice /c 12345 /n /m "  LEANNA ^> Selectionner une option [1-5] : "

if errorlevel 5 exit /b 0
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
echo  %CYAN%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%RST%
echo  %WHITE%  LEANNA OS%RST%  %DIM%v%VERSION%  ^|  LAUNCHER v%LAUNCHER_VERSION%%RST%
echo  %CYAN%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%RST%
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
echo  %CYAN%  +---------------------- INITIALIZATION -----------------------+%RST%
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
    echo  %YELLOW%  [INFO]%RST% Installation des dependances...
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
echo  %CYAN%  +--------------------------------------------------------------+%RST%
echo  %WHITE%  TARGET : !RUN_LABEL!%RST%
echo  %DIM%  Commande : npm run !RUN_CMD!%RST%
echo  %CYAN%  +--------------------------------------------------------------+%RST%
echo.
echo  %GREEN%  [LIVE]%RST% Les logs de Leanna vont apparaitre ci-dessous.
echo  %DIM%  Pour arreter le processus : Ctrl+C%RST%
echo.
echo  %CYAN%  ----------------------- LIVE CONSOLE --------------------------%RST%
echo.

call npm run !RUN_CMD!
set "EXIT_CODE=!errorlevel!"

echo.
echo  %CYAN%  ---------------------------------------------------------------%RST%
if not "!EXIT_CODE!"=="0" (
    call :fatal "Leanna s'est arrete avec le code !EXIT_CODE!." "Consultez les logs ci-dessus."
) else (
    echo  %GREEN%  [OK]%RST% Le processus s'est termine avec le code 0.
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
echo  %PURPLE%  +-------------------- PRODUCTION DEPLOY ---------------------+%RST%
echo.
call :step "Verification de PM2"

where pm2 >nul 2>&1
if errorlevel 1 (
    echo  %YELLOW%  [INFO]%RST% Installation globale de PM2...
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
call pm2 status
echo.
echo  %CYAN%  Commandes utiles%RST%
echo  %DIM%  pm2 logs        - Logs en direct%RST%
echo  %DIM%  pm2 monit       - Supervision%RST%
echo  %DIM%  pm2 restart all - Redemarrage%RST%
echo  %DIM%  pm2 stop all    - Arret%RST%
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
echo  %YELLOW%  +-------------------- DEPENDENCY MANAGER --------------------+%RST%
echo.
echo  %WHITE%  Cette operation supprimera uniquement node_modules.%RST%
echo  %DIM%  package-lock.json sera conserve pour garder les versions verrouillees.%RST%
echo.
choice /c ON /n /m "  Confirmer le nettoyage ? [O/N] : "
if errorlevel 2 goto :menu

if exist "node_modules\" (
    echo.
    echo  %YELLOW%  [INFO]%RST% Suppression de node_modules...
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
echo  %CYAN%  Reinstallation des dependances...%RST%
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
echo  %BLUE%  [%02d%STEP%/%TOTAL%]%RST% %WHITE%%~1%RST%
goto :eof

:ok
echo  %GREEN%  [OK]%RST% %~1
goto :eof

:fatal
echo.
echo  %RED%  +-------------------------- ERROR -----------------------------+%RST%
echo  %RED%  [!!]%RST% %WHITE%%~1%RST%
if not "%~2"=="" echo  %DIM%       %~2%RST%
echo  %RED%  +--------------------------------------------------------------+%RST%
echo.
pause
goto :eof
