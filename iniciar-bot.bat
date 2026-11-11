@echo off
chcp 65001 >nul
title CheckIn Bot
cd /d "%~dp0"

echo ==================================
echo   CheckIn Bot
echo   Feche esta janela para desligar.
echo ==================================
echo.

:inicio
call npm start
echo.
echo [%date% %time%] Bot encerrado. Veja a pasta logs\ para o motivo.
echo Reiniciando em 15 segundos... (feche a janela para cancelar)
timeout /t 15 /nobreak >nul
goto inicio
