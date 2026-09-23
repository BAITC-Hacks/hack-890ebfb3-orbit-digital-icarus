@echo off
setlocal
rem Double-click launcher: quoted paths also support folders containing spaces.
title Orbit - Event contractor matching
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>nul
if not errorlevel 1 goto use_py
python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>nul
if not errorlevel 1 goto use_python
echo.
echo Orbit needs Python 3.11 or newer. Install it once, then double-click this file again.
echo Download: https://www.python.org/downloads/
echo During installation, enable "Add Python to PATH" if offered.
echo.
pause
exit /b 1

:use_py
py -3 "%~dp0start.py" %*
goto finished

:use_python
python "%~dp0start.py" %*

:finished
if not errorlevel 1 exit /b 0
echo.
echo Setup did not finish. Read the message above, then try again.
pause
exit /b 1
