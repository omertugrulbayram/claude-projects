@echo off
cd /d "%~dp0"
python asistan.py
if errorlevel 1 pause
