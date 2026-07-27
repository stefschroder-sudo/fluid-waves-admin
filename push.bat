@echo off
REM ── Push wijzigingen naar GitHub. Vercel deployt daarna automatisch. ──
cd /d "%~dp0"

echo.
set /p bericht="Omschrijving van deze wijziging: "
if "%bericht%"=="" set bericht=update

git add -A
git commit -m "%bericht%"
git push

echo.
echo Klaar. Vercel pikt de push automatisch op.
pause
