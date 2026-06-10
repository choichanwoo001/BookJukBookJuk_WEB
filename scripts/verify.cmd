@echo off
setlocal
cd /d "%~dp0\.."
call npm.cmd run lint
if errorlevel 1 exit /b %errorlevel%
call npm.cmd run build
exit /b %errorlevel%
