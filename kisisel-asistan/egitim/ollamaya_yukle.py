"""Adım 3 — Eğittiğin modeli Ollama'ya yükle.

egitim/cikti/birlesik klasöründeki modeli GGUF biçimine çevirir, sıkıştırır (q4_K_M)
ve Ollama'ya "benim-asistanim" adıyla yükler. Asistan, bu model varsa otomatik olarak onu kullanır.

Gereken: git ve Ollama kurulu olmalı.
Kullanım:
    python egitim/ollamaya_yukle.py
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

KLASOR = Path(__file__).resolve().parent
LLAMA_CPP = KLASOR / "llama.cpp"
MODEL_ADI = "benim-asistanim"


def calistir(komut):
    print("→", " ".join(str(k) for k in komut))
    try:
        subprocess.run([str(k) for k in komut], check=True)
    except subprocess.CalledProcessError:
        sys.exit("Bu adım başarısız oldu; yukarıdaki hata mesajına bak.")


def main():
    ayri = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ayri.add_argument("--model", default=str(KLASOR / "cikti" / "birlesik"))
    ayri.add_argument("--sikistirma", default="q4_K_M", help="q4_K_M (küçük, hızlı) · q8_0 (daha kaliteli, 2 kat büyük)")
    args = ayri.parse_args()

    model = Path(args.model)
    if not (model / "config.json").exists():
        sys.exit(f"Eğitilmiş model bulunamadı: {model}\nÖnce: python egitim/egit.py")
    if not shutil.which("ollama"):
        sys.exit("Ollama bulunamadı. https://ollama.com/download adresinden kur.")

    if not LLAMA_CPP.exists():
        if not shutil.which("git"):
            sys.exit("git bulunamadı. https://git-scm.com/downloads adresinden kur.")
        calistir(["git", "clone", "--depth", "1", "https://github.com/ggml-org/llama.cpp", LLAMA_CPP])

    gguf = KLASOR / "cikti" / f"{MODEL_ADI}-f16.gguf"
    calistir([sys.executable, LLAMA_CPP / "convert_hf_to_gguf.py", model, "--outfile", gguf, "--outtype", "f16"])

    modelfile = KLASOR / "cikti" / "Modelfile"
    modelfile.write_text(
        f"FROM ./{gguf.name}\n"
        "PARAMETER temperature 0.7\n"
        "PARAMETER num_ctx 8192\n",
        encoding="utf-8",
    )
    calistir(["ollama", "create", MODEL_ADI, "-f", modelfile, "--quantize", args.sikistirma])

    print(f"\nTamam! '{MODEL_ADI}' modeli Ollama'ya yüklendi. Asistanı yeniden başlat; artık kendi modelini kullanacak.")
    print(f"Yer açmak için ara dosyayı silebilirsin: {gguf}")


if __name__ == "__main__":
    main()
