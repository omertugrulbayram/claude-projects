@echo off
rem Tek tikla kurulum: gereksinimleri kontrol eder, temel modeli indirir, kisayollari olusturur.
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [X] Python bulunamadi. Acilan sayfadan kur ^(kurulumda "Add Python to PATH" kutusunu isaretle^), sonra bu dosyayi tekrar calistir.
  start https://www.python.org/downloads/
  pause & exit /b 1
)
echo [OK] Python bulundu.

where ollama >nul 2>nul
if errorlevel 1 (
  echo [X] Ollama bulunamadi. Acilan sayfadan kur, sonra bu dosyayi tekrar calistir.
  start https://ollama.com/download
  pause & exit /b 1
)
echo [OK] Ollama bulundu.

echo Temel model indiriliyor ^(yaklasik 2.5 GB, sadece ilk seferde^)...
ollama pull qwen3:4b
if errorlevel 1 (
  echo [X] Model indirilemedi. Internet baglantini ve Ollama'nin acik oldugunu kontrol et.
  pause & exit /b 1
)
echo [OK] Temel model hazir.

set "HEDEF=%~dp0baslat.bat"
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Kisisel Asistan.lnk'); $s.TargetPath=$env:HEDEF; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo [OK] Masaustune "Kisisel Asistan" kisayolu eklendi.

choice /M "Bilgisayar acilinca asistan otomatik baslasin mi"
if errorlevel 2 goto son
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Startup')+'\Kisisel Asistan.lnk'); $s.TargetPath=$env:HEDEF; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo [OK] Otomatik baslatma acildi.

:son
echo.
echo Kurulum tamam! Masaustundeki "Kisisel Asistan" kisayoluyla ac.
pause
