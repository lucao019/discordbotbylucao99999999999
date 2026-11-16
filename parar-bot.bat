@echo off
rem Stops the CheckIn bot (and its auto-restart loop) for this folder only.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'iniciar-bot.bat' -and $_.Name -eq 'cmd.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'CheckIn' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo CheckIn stopped.
