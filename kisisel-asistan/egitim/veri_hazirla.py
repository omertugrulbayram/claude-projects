"""Adım 1 — Eğitim verisini hazırla.

Senin 👍 verdiğin cevapları, düzelttiğin cevapları (senin yazdığın ideal cevapla) ve
Eğitim sekmesinde elle eklediğin örnekleri toplar:
    egitim/veri.jsonl   → eğitimde kullanılır
    egitim/sinav.jsonl  → eğitimde KULLANILMAZ; eğitim sonrası karşılaştırma için ayrılır (%10)

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
SINAV = Path(__file__).resolve().parent / "sinav.jsonl"


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
    ayri.add_argument("--sinav-orani", type=float, default=0.1, help="sınava ayrılacak oran (30+ örnek varsa)")
    args = ayri.parse_args()

    ornekler = ornekleri_topla(args.hepsi)
    random.Random(0).shuffle(ornekler)
    sinav_sayisi = min(30, max(3, round(len(ornekler) * args.sinav_orani))) if len(ornekler) >= 30 else 0
    sinav, ornekler = ornekler[:sinav_sayisi], ornekler[sinav_sayisi:]
    for dosya, liste in ((CIKTI, ornekler), (SINAV, sinav)):
        with dosya.open("w", encoding="utf-8") as f:
            for o in liste:
                f.write(json.dumps(o, ensure_ascii=False) + "\n")

    print(f"{len(ornekler)} eğitim örneği yazıldı → {CIKTI}")
    if sinav:
        print(f"{len(sinav)} örnek sınav için ayrıldı → {SINAV}")
    if len(ornekler) < 100:
        print("Uyarı: 100'den az örnek var. Eğitebilirsin ama etkisi sınırlı olur; "
              "ideali 500+ örnek. Daha çok 👍 / düzeltme / elle örnek ekle.")


if __name__ == "__main__":
    main()
