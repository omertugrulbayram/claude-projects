@echo off
rem Modelini bastan sona egitir: veri hazirla -> egit -> Ollama'ya yukle -> karsilastir
chcp 65001 >nul
cd /d "%~dp0\.."
if not exist egitim\.venv\kuruldu.txt (
  echo Egitim kutuphaneleri kuruluyor ^(ilk seferde ~5 GB, bir kez yapilir^)...
  if not exist egitim\.venv python -m venv egitim\.venv || goto hata
  egitim\.venv\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cu130 || goto hata
  egitim\.venv\Scripts\python -m pip install -r egitim\requirements.txt || goto hata
  echo tamam> egitim\.venv\kuruldu.txt
)
egitim\.venv\Scripts\python egitim\veri_hazirla.py || goto hata
egitim\.venv\Scripts\python egitim\egit.py %* || goto hata
egitim\.venv\Scripts\python egitim\ollamaya_yukle.py || goto hata
echo.
echo Egitim bitti. Simdi eski ve yeni modeli kor karsilastirma ile sinayabilirsin:
egitim\.venv\Scripts\python egitim\karsilastir.py
pause
exit /b 0
:hata
echo Bir hata oldu, yukaridaki mesaja bak.
pause
exit /b 1
