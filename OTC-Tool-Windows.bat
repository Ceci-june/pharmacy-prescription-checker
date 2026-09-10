@echo off
REM ---------------------------------------------------------------
REM  Mo otc-viewer.html trong mot cua so app rieng (khong tab,
REM  khong thanh dia chi). Chay hoan toan offline.
REM
REM  Dat file .bat nay CUNG THU MUC voi otc-viewer.html.
REM
REM  Khac ban GiaiDapDuoc-Edge.bat cu: KHONG dung --user-data-dir.
REM  Ly do: Danh muc + Thong tu luu trong localStorage cua profile,
REM  dung profile rieng se lam du lieu bi tach khoi tab thuong.
REM ---------------------------------------------------------------

set "HTML=%~dp0otc-viewer.html"

if not exist "%HTML%" (
    echo Khong tim thay otc-viewer.html trong thu muc:
    echo   %~dp0
    pause
    exit /b 1
)

set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if not exist "%BROWSER%" (
    echo Khong tim thay Microsoft Edge hoac Google Chrome.
    echo Mo bang trinh duyet mac dinh...
    start "" "%HTML%"
    exit /b 0
)

start "" "%BROWSER%" --app="file:///%HTML:\=/%" --window-size=1440,900
exit /b 0
