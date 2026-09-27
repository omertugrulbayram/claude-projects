#!/usr/bin/env bash
# Modelini baştan sona eğitir: veri hazırla -> eğit -> Ollama'ya yükle
set -e
cd "$(dirname "$0")/.."
if [ ! -d egitim/.venv ]; then
  python3 -m venv egitim/.venv
  egitim/.venv/bin/pip install torch
  egitim/.venv/bin/pip install -r egitim/requirements.txt
fi
egitim/.venv/bin/python egitim/veri_hazirla.py
egitim/.venv/bin/python egitim/egit.py "$@"
egitim/.venv/bin/python egitim/ollamaya_yukle.py
