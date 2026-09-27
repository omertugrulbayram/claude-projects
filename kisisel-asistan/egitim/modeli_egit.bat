@echo off
rem Modelini baştan sona eğitir: veri hazırla -> eğit -> Ollama'ya yükle
cd /d "%~dp0\.."
if not exist egitim\.venv (
  python -m venv egitim\.venv
  egitim\.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cu130
  egitim\.venv\Scripts\pip install -r egitim\requirements.txt
)
egitim\.venv\Scripts\python egitim\veri_hazirla.py || goto hata
egitim\.venv\Scripts\python egitim\egit.py %* || goto hata
egitim\.venv\Scripts\python egitim\ollamaya_yukle.py || goto hata
pause
exit /b 0
:hata
echo Bir hata oldu, yukaridaki mesaja bak.
pause
exit /b 1
