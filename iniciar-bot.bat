@echo off
chcp 65001 >nul
title CheckIn
cd /d "%~dp0"
cls

:inicio
call npm start --silent
echo.
echo   [%date% %time%] Process exited. Restarting in 15s... (close this window to stop)
timeout /t 15 /nobreak >nul
cls
goto inicio
