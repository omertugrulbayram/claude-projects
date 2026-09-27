"""Adım 1 — Eğitim verisini hazırla.

Senin 👍 verdiğin cevapları, düzelttiğin cevapları (senin yazdığın ideal cevapla) ve
Eğitim sekmesinde elle eklediğin örnekleri tek bir eğitim dosyasında toplar:
    egitim/veri.jsonl

Kullanım:
    python egitim/veri_hazirla.py            # sadece onayladığın/düzelttiğin cevaplar (önerilen)
    python egitim/veri_hazirla.py --hepsi    # değerlendirmediğin cevapları da ekle
"""

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import asistan  # noqa: E402  (aynı sistem mesajını ve veri yollarını kullanmak için)

CIKTI = Path(__file__).resolve().parent / "veri.jsonl"


def ornekleri_topla(hepsi=False):
    sistem = asistan.sistem_metni()
    geri = {}
    for g in asistan.jsonl_oku(asistan.GERI_BILDIRIM_DOSYASI):
        geri.setdefault(g["id"], {}).update(g)  # aynı cevaba sonradan verilen geri bildirim öncekini günceller

    ornekler = []
    for dosya in sorted(asistan.SOHBET_KLASORU.glob("*.jsonl")) if asistan.SOHBET_KLASORU.exists() else []:
        for kayit in asistan.jsonl_oku(dosya):
            g = geri.get(kayit["id"], {})
            if g.get("ideal"):
                cevap = g["ideal"]
            elif g.get("iyi") or hepsi:
                cevap = kayit["cevap"]
            else:
                continue
            ornekler.append({
                "prompt": [{"role": "system", "content": sistem}, *kayit["gecmis"],
                           {"role": "user", "content": kayit["soru"]}],
                "completion": [{"role": "assistant", "content": cevap}],
            })

    for o in asistan.jsonl_oku(asistan.ORNEK_DOSYASI):
        ornekler.append({
            "prompt": [{"role": "system", "content": sistem}, {"role": "user", "content": o["soru"]}],
            "completion": [{"role": "assistant", "content": o["cevap"]}],
        })
    return ornekler


def main():
    ayri = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ayri.add_argument("--hepsi", action="store_true", help="değerlendirilmemiş cevapları da ekle")
    args = ayri.parse_args()

    ornekler = ornekleri_topla(args.hepsi)
    random.Random(0).shuffle(ornekler)
    with CIKTI.open("w", encoding="utf-8") as f:
        for o in ornekler:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")

    print(f"{len(ornekler)} eğitim örneği yazıldı → {CIKTI}")
    if len(ornekler) < 100:
        print("Uyarı: 100'den az örnek var. Eğitebilirsin ama etkisi sınırlı olur; "
              "ideali 500+ örnek. Daha çok 👍 / düzeltme / elle örnek ekle.")


if __name__ == "__main__":
    main()
