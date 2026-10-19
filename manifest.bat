@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node.exe not found in PATH. Install Node.js first.
  goto :fail
)

if /i "%~1"=="new"   goto :new
if /i "%~1"=="check" goto :check
if /i "%~1"=="list"  goto :list
goto :usage

:new
if "%~2"=="" (
  echo [ERROR] missing snapshot name. Example: manifest.bat new 2026-10-19-android0427-01
  goto :fail
)
if not exist raw\ (
  echo [ERROR] raw\ folder not found. Put the unpacked data under raw\ first.
  goto :fail
)
set "MAN=index\%~2.json"
if exist "%MAN%" (
  echo [ERROR] snapshot already exists: %MAN%
  echo         Pick a new name, or run: manifest.bat check %~2
  goto :fail
)

echo [1/2] Build %MAN% from raw\
if /i "%~3"=="hashes" (
  node scripts\build-manifest.js raw "%MAN%" --hashes-only
) else (
  node scripts\build-manifest.js raw "%MAN%"
)
if errorlevel 1 (
  echo [ERROR] build-manifest.js failed. Nothing was registered.
  goto :fail
)

echo [2/2] Verify raw\ against the new snapshot
node scripts\verify-manifest.js "%MAN%" raw
if errorlevel 1 (
  echo [ERROR] verify failed right after build - raw\ changed while hashing.
  goto :fail
)

echo Next steps:
echo    - fill the archive field in %MAN% with the netdisk file name
echo    - compress raw\ and upload; the extract code never goes on GitHub
echo    - paste templates\register.md into the wiki issue and fill every blank
goto :done

:check
if "%~2"=="" (
  echo [ERROR] missing snapshot name. Run: manifest.bat list
  goto :fail
)
set "MAN=index\%~2.json"
if not exist "%MAN%" (
  echo [ERROR] no such snapshot: %MAN%
  echo Snapshots under index\:
  dir /b index\*.json 2>nul
  goto :fail
)

echo Verify raw\ against %MAN%
if /i "%~3"=="extra" (
  node scripts\verify-manifest.js "%MAN%" raw --allow-extra
) else (
  node scripts\verify-manifest.js "%MAN%" raw
)
if errorlevel 1 (
  echo [RESULT] mismatch. Do not rewrite the manifest - find out which files differ first.
  goto :fail
)
echo [RESULT] manifest matches raw\
goto :done

:list
dir /b index\*.json 2>nul
if not exist index\*.json echo No snapshot JSON under index\ yet.
goto :done

:usage
echo usage:
echo   manifest.bat new  ^<snapshot^> [hashes]   build index\^<snapshot^>.json from raw\, then verify
echo   manifest.bat check ^<snapshot^> [extra]  verify raw\ against an existing snapshot; extra ignores extra files
echo   manifest.bat list                       list snapshot names under index\
echo name format: YYYY-MM-DD-source-NN   e.g. 2026-10-19-android0427-01
echo set MANIFEST_NO_PAUSE=1 to skip the pause when calling this from another script
goto :fail

:fail
if /i not "%MANIFEST_NO_PAUSE%"=="1" pause
endlocal
exit /b 1

:done
if /i not "%MANIFEST_NO_PAUSE%"=="1" pause
endlocal
exit /b 0
