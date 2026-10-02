@echo off
setlocal
rem Lance le quiz en local : serveur Python + ouverture du navigateur.
rem Fermer cette fenetre (ou Ctrl+C) arrete le serveur.

cd /d "%~dp0"
set PORT=8000

rem Trouve Python (python, sinon le lanceur py)
set PY=
where python >nul 2>nul && set PY=python
if not defined PY (
    where py >nul 2>nul && set PY=py
)
if not defined PY (
    echo Python est introuvable. Installe-le depuis https://www.python.org/downloads/
    echo en cochant "Add python.exe to PATH", puis relance ce fichier.
    pause
    exit /b 1
)

echo Generation des galons...
%PY% tools\generate_galons.py
if errorlevel 1 (
    echo Erreur pendant la generation des galons.
    pause
    exit /b 1
)

echo.
echo Quiz disponible sur http://localhost:%PORT%
echo Ferme cette fenetre pour arreter le serveur.
echo.
rem Ouvre le navigateur 2 s plus tard, le temps que le serveur demarre
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%"
%PY% tools\serve.py %PORT%

pause
