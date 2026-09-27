"""Adım 4 (isteğe bağlı) — Eğitim işe yaradı mı? Kör karşılaştırma.

Eğitimde hiç görmediği sınav sorularını (egitim/sinav.jsonl) hem temel modele hem de
eğittiğin modele sorar. Cevapları, hangisinin hangi modelden geldiğini gizleyerek yan yana
gösteren bir sayfa oluşturur. Sen hangisi daha iyiyse onu seçersin, sonunda sonuç açıklanır.

Kullanım (Ollama açıkken):
    python egitim/karsilastir.py
"""

import argparse
import html
import json
import random
import sys
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import asistan  # noqa: E402

KLASOR = Path(__file__).resolve().parent


def sor(model, mesajlar):
    yanit = asistan.ollama("/api/chat", {"model": model, "messages": mesajlar, "stream": False,
                                        "think": False, "options": {"num_ctx": 8192}})
    return asistan.dusunceyi_temizle(yanit["message"]["content"])


def main():
    ayri = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ayri.add_argument("--eski", default=asistan.TEMEL_MODEL)
    ayri.add_argument("--yeni", default=asistan.KENDI_MODELIN)
    ayri.add_argument("--sinav", default=str(KLASOR / "sinav.jsonl"))
    args = ayri.parse_args()

    sorular = asistan.jsonl_oku(Path(args.sinav))
    if not sorular:
        sys.exit("Sınav sorusu yok. En az 30 eğitim örneğiyle veri_hazirla.py çalıştırınca oluşur.")

    rastgele = random.Random()
    kartlar = []
    for i, o in enumerate(sorular, 1):
        print(f"[{i}/{len(sorular)}] soruluyor…")
        try:
            cevaplar = [("eski", sor(args.eski, o["prompt"])), ("yeni", sor(args.yeni, o["prompt"]))]
        except asistan.ModelHatasi as hata:
            sys.exit(str(hata))
        rastgele.shuffle(cevaplar)
        soru = o["prompt"][-1]["content"]
        ideal = o["completion"][0]["content"]
        secenekler = "".join(
            f'<button class="secenek" data-kaynak="{kaynak}"><b>{"AB"[j]}</b>'
            f'<div>{html.escape(metin)}</div></button>'
            for j, (kaynak, metin) in enumerate(cevaplar)
        )
        kartlar.append(
            f'<section><h2>Soru {i}</h2><p class="soru">{html.escape(soru)}</p>'
            f'<details><summary>Senin ideal cevabın</summary><p>{html.escape(ideal)}</p></details>'
            f'<div class="ikili">{secenekler}</div></section>'
        )

    sayfa = SABLON.replace("{{KARTLAR}}", "\n".join(kartlar)).replace("{{SAYI}}", str(len(sorular)))
    cikti = KLASOR / "cikti" / "sinav-sonucu.html"
    cikti.parent.mkdir(exist_ok=True)
    cikti.write_text(sayfa, encoding="utf-8")
    print(f"Karşılaştırma sayfası: {cikti}")
    webbrowser.open(cikti.as_uri())


SABLON = """<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Model Sınavı</title>
<style>
:root{--bg:#f6f5f2;--panel:#fff;--text:#1f1f1d;--muted:#6b6a66;--line:#e3e1dc;--accent:#2f6f5e}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--panel:#1f1f1d;--text:#ecebe7;--muted:#9b9a95;--line:#33322f;--accent:#5fb39a}}
body{margin:0 auto;max-width:960px;padding:16px;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}
section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:12px 0}
.soru{font-weight:600}.ikili{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
@media (max-width:640px){.ikili{grid-template-columns:1fr}}
.secenek{font:inherit;color:inherit;text-align:left;white-space:pre-wrap;background:var(--bg);border:2px solid var(--line);
  border-radius:10px;padding:10px;cursor:pointer}.secenek.secili{border-color:var(--accent)}
details{color:var(--muted)}#sonuc{position:sticky;bottom:0;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;padding:10px 16px}
</style></head><body>
<h1>Model sınavı</h1>
<p>Her soruda sana daha çok benzeyen, daha iyi cevabı seç. Hangisinin eğittiğin model olduğu gizli.</p>
{{KARTLAR}}
<div id="sonuc">Seçilen: <b id="sayac">0</b> / {{SAYI}} <button id="goster">Sonucu göster</button> <span id="metin"></span></div>
<script>
const secim = new Map();
document.querySelectorAll("section").forEach((s, i) => s.querySelectorAll(".secenek").forEach(b => b.onclick = () => {
  s.querySelectorAll(".secenek").forEach(x => x.classList.toggle("secili", x === b));
  secim.set(i, b.dataset.kaynak); document.getElementById("sayac").textContent = secim.size;
}));
document.getElementById("goster").onclick = () => {
  const yeni = [...secim.values()].filter(k => k === "yeni").length;
  document.getElementById("metin").textContent =
    `Eğittiğin model ${yeni} soruda, temel model ${secim.size - yeni} soruda kazandı.`;
  document.querySelectorAll(".secenek b").forEach(b =>
    b.textContent += b.parentElement.dataset.kaynak === "yeni" ? " — senin modelin" : " — temel model");
  document.getElementById("goster").disabled = true;
};
</script></body></html>
"""


if __name__ == "__main__":
    main()
