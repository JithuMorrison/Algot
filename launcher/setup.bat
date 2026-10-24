@echo off
setlocal

set "ROOT=%~dp0"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL%" (
    echo Windows PowerShell could not be found.
    pause
    exit /b 1
)

"%POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%ROOT%install-app.ps1" -RestartServices
if errorlevel 1 (
    echo.
    echo Northstar setup failed. See the message above for details.
    pause
    exit /b 1
)

endlocal
