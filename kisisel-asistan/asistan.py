"""Kişisel Asistan — masaüstünde çalışan, seni tanıyan ve senin eğittiğin asistan.

Çalıştırma:  python asistan.py
Tüm veriler bu klasördeki `veri/` dizininde, senin bilgisayarında saklanır.
"""

import json
import os
import shutil
import subprocess
import sys
import threading
import uuid
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import anthropic

KLASOR = Path(__file__).resolve().parent
VERI = KLASOR / "veri"
HAFIZA_DOSYASI = VERI / "hafiza.json"
KISILIK_DOSYASI = VERI / "kisilik.md"
SOHBET_KLASORU = VERI / "sohbetler"

MODEL = os.environ.get("ASISTAN_MODEL", "claude-opus-5")
PORT = int(os.environ.get("ASISTAN_PORT", "8765"))

VARSAYILAN_KISILIK = """# Asistanımın kişiliği ve görüşleri
(Bu metni istediğin gibi değiştir — asistan her sohbette buna göre davranır.)

- Adın: Ayna. Bana karşı dürüst ve doğrudan ol; beni pohpohlama.
- Önce dinle, sonra görüşünü net söyle. Katılmıyorsan açıkça "katılmıyorum" de ve nedenini açıkla.
- Disiplin, sağlık ve uzun vadeli düşünmeyi önemsersin.
- Kısa ve samimi konuş, gereksiz uzatma. Türkçe konuş.
"""

TEMEL_TALIMAT = """Sen kullanıcının kişisel masaüstü asistanısın. Görevin onu zamanla tanımak, \
objektif analiz etmek ve ona gerçekten işe yarayan öneriler vermek.

İlkelerin:
- Objektif ol. Kullanıcıyı memnun etmek için gerçeği yumuşatma; ama kırıcı da olma.
- Gözlem ile yorumu ayır: "Bana şunu söyledin: ..." (gözlem) ile "Bundan şunu çıkarıyorum: ..." \
(yorum) farklıdır. Yorumlarının ne kadar emin olduğunu belirt.
- Analiz yaparken hafızandaki somut bilgilere dayan; veri azsa bunu söyle ve soru sor.
- Kendi fikrin olsun. Sorulduğunda "sana kalmış" deme; gerekçesiyle net bir görüş bildir.
- Öneriler somut, küçük ve uygulanabilir olsun (ne, ne zaman, nasıl ölçülür).
- Tıbbi, hukuki veya ciddi psikolojik konularda bir uzmana yönlendir; kriz belirtisi görürsen \
profesyonel destek almasını öner.

Hafıza araçları:
- Kullanıcı hakkında kalıcı ve işe yarar yeni bir şey öğrendiğinde (hedef, alışkanlık, değer, \
ilişki, iş, sağlık, tercih, önemli olay) `kullanici_bilgisi_kaydet` aracını kullan. Önemsiz veya \
geçici şeyleri kaydetme; zaten hafızada olanı tekrar kaydetme.
- Kullanıcı hakkında kendi görüşün oluştuğunda veya değiştiğinde (bir örüntü, güçlü yan, kör nokta) \
`kendi_gorusunu_kaydet` aracını kullan. Bunlar senin zamanla gelişen fikirlerindir.
- Araç kullandığını uzun uzun anlatma; sohbete doğal şekilde devam et."""

ARACLAR = [
    {
        "name": "kullanici_bilgisi_kaydet",
        "description": "Kullanıcı hakkında öğrenilen kalıcı bir bilgiyi uzun süreli hafızaya kaydeder.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "bilgi": {"type": "string", "description": "Tek cümlelik, kendi başına anlaşılır bilgi."},
                "kategori": {
                    "type": "string",
                    "enum": ["kimlik", "hedef", "aliskanlik", "deger", "iliski", "is", "saglik", "tercih", "olay", "diger"],
                },
            },
            "required": ["bilgi", "kategori"],
            "additionalProperties": False,
        },
    },
    {
        "name": "kendi_gorusunu_kaydet",
        "description": "Asistanın kullanıcı hakkındaki kendi görüşünü (örüntü, güçlü yan, kör nokta) kaydeder.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "gorus": {"type": "string", "description": "Görüş ve kısa gerekçesi."},
            },
            "required": ["gorus"],
            "additionalProperties": False,
        },
    },
]

kilit = threading.Lock()
istemci = anthropic.Anthropic()


# ---------------------------------------------------------------- veri katmanı

def zaman():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def hafiza_oku():
    if HAFIZA_DOSYASI.exists():
        return json.loads(HAFIZA_DOSYASI.read_text(encoding="utf-8"))
    return {"bilgiler": [], "gorusler": [], "dersler": []}


def hafiza_yaz(hafiza):
    VERI.mkdir(exist_ok=True)
    gecici = HAFIZA_DOSYASI.with_suffix(".tmp")
    gecici.write_text(json.dumps(hafiza, ensure_ascii=False, indent=2), encoding="utf-8")
    gecici.replace(HAFIZA_DOSYASI)


def hafizaya_ekle(tur, kayit):
    hafiza = hafiza_oku()
    kayit = {"id": uuid.uuid4().hex[:8], "tarih": zaman(), **kayit}
    hafiza[tur].append(kayit)
    hafiza_yaz(hafiza)
    return kayit


def kisilik_oku():
    if not KISILIK_DOSYASI.exists():
        VERI.mkdir(exist_ok=True)
        KISILIK_DOSYASI.write_text(VARSAYILAN_KISILIK, encoding="utf-8")
    return KISILIK_DOSYASI.read_text(encoding="utf-8")


def sohbet_gunlugune_yaz(rol, metin):
    SOHBET_KLASORU.mkdir(parents=True, exist_ok=True)
    dosya = SOHBET_KLASORU / f"{datetime.now():%Y-%m-%d}.jsonl"
    with dosya.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"zaman": zaman(), "rol": rol, "metin": metin}, ensure_ascii=False) + "\n")


def sistem_istemi():
    """Oturum başında bir kez kurulur; oturum içinde sabit kalır (önbellek için)."""
    hafiza = hafiza_oku()
    bilgiler = "\n".join(f"- [{b['kategori']}] {b['bilgi']} ({b['tarih']})" for b in hafiza["bilgiler"]) or "- (henüz yok)"
    gorusler = "\n".join(f"- {g['gorus']} ({g['tarih']})" for g in hafiza["gorusler"]) or "- (henüz yok)"
    dersler = "\n".join(f"- {d['ders']}" for d in hafiza["dersler"]) or "- (henüz yok)"
    baglam = (
        f"<kisilik_ve_egitim>\n{kisilik_oku()}\n</kisilik_ve_egitim>\n\n"
        f"<kullanici_hakkinda_bildiklerin>\n{bilgiler}\n</kullanici_hakkinda_bildiklerin>\n\n"
        f"<kendi_goruslerin>\n{gorusler}\n</kendi_goruslerin>\n\n"
        f"<kullanicinin_duzeltmeleri>\nKullanıcı geçmişte cevaplarını şöyle düzeltti; bunlara mutlaka uy:\n{dersler}\n"
        f"</kullanicinin_duzeltmeleri>\n\nOturum başlangıcı: {zaman()}"
    )
    return [
        {"type": "text", "text": TEMEL_TALIMAT, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": baglam},
    ]


# ---------------------------------------------------------------- sohbet

class Oturum:
    def __init__(self):
        self.sistem = sistem_istemi()
        self.mesajlar = []


oturum = Oturum()


def araci_calistir(ad, girdi):
    if ad == "kullanici_bilgisi_kaydet":
        kayit = hafizaya_ekle("bilgiler", {"bilgi": girdi["bilgi"], "kategori": girdi["kategori"]})
        return f"Kaydedildi (id={kayit['id']})."
    if ad == "kendi_gorusunu_kaydet":
        kayit = hafizaya_ekle("gorusler", {"gorus": girdi["gorus"]})
        return f"Kaydedildi (id={kayit['id']})."
    raise ValueError(f"Bilinmeyen araç: {ad}")


def cevap_al(kullanici_metni):
    """Kullanıcı mesajını gönderir, araç döngüsünü yürütür; (cevap, kaydedilenler) döner."""
    baslangic = len(oturum.mesajlar)
    try:
        return _cevap_dongusu(kullanici_metni)
    except anthropic.APIError:
        del oturum.mesajlar[baslangic:]  # yarım kalan turu geri al, geçmiş tutarlı kalsın
        raise


def _cevap_dongusu(kullanici_metni):
    oturum.mesajlar.append({"role": "user", "content": kullanici_metni})
    kaydedilenler = []

    for _ in range(8):  # güvenlik sınırı: en fazla 8 araç turu
        yanit = istemci.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=oturum.sistem,
            tools=ARACLAR,
            messages=oturum.mesajlar,
            cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        # Tüm içeriği (düşünme blokları dahil) aynen geçmişe ekle.
        oturum.mesajlar.append({"role": "assistant", "content": yanit.content})

        if yanit.stop_reason == "refusal":
            return "Bu isteğe cevap veremiyorum. Farklı bir şekilde sormayı deneyebilirsin.", kaydedilenler

        if yanit.stop_reason != "tool_use":
            metin = "".join(b.text for b in yanit.content if b.type == "text").strip()
            if yanit.stop_reason == "max_tokens":
                metin += "\n\n(Cevap uzunluk sınırında kesildi.)"
            sohbet_gunlugune_yaz("kullanici", kullanici_metni)
            sohbet_gunlugune_yaz("asistan", metin)
            return metin, kaydedilenler

        sonuclar = []
        for blok in yanit.content:
            if blok.type != "tool_use":
                continue
            try:
                icerik = araci_calistir(blok.name, blok.input)
                kaydedilenler.append(next(iter(blok.input.values())))
                sonuclar.append({"type": "tool_result", "tool_use_id": blok.id, "content": icerik})
            except Exception as hata:  # araç hatası modele bildirilir
                sonuclar.append({"type": "tool_result", "tool_use_id": blok.id, "content": str(hata), "is_error": True})
        oturum.mesajlar.append({"role": "user", "content": sonuclar})

    return "Çok fazla araç turu oldu, lütfen tekrar dene.", kaydedilenler


# ---------------------------------------------------------------- HTTP sunucusu

class Isleyici(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, veri, kod=200):
        govde = json.dumps(veri, ensure_ascii=False).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)

    def _govde(self):
        uzunluk = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(uzunluk) or b"{}")

    def do_GET(self):
        if self.path == "/":
            govde = (KLASOR / "arayuz.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(govde)))
            self.end_headers()
            self.wfile.write(govde)
        elif self.path == "/api/hafiza":
            self._json(hafiza_oku())
        elif self.path == "/api/kisilik":
            self._json({"metin": kisilik_oku()})
        else:
            self._json({"hata": "bulunamadı"}, 404)

    def do_POST(self):
        global oturum
        veri = self._govde()
        try:
            with kilit:
                if self.path == "/api/sohbet":
                    metin, kaydedilenler = cevap_al(veri["mesaj"])
                    self._json({"cevap": metin, "kaydedilenler": kaydedilenler})
                elif self.path == "/api/yeni-oturum":
                    oturum = Oturum()
                    self._json({"tamam": True})
                elif self.path == "/api/kisilik":
                    KISILIK_DOSYASI.write_text(veri["metin"], encoding="utf-8")
                    self._json({"tamam": True})
                elif self.path == "/api/ders":
                    hafizaya_ekle("dersler", {"ders": veri["ders"]})
                    self._json({"tamam": True})
                elif self.path == "/api/bilgi":
                    hafizaya_ekle("bilgiler", {"bilgi": veri["bilgi"], "kategori": veri.get("kategori", "diger")})
                    self._json({"tamam": True})
                elif self.path == "/api/sil":
                    hafiza = hafiza_oku()
                    hafiza[veri["tur"]] = [k for k in hafiza[veri["tur"]] if k["id"] != veri["id"]]
                    hafiza_yaz(hafiza)
                    self._json({"tamam": True})
                else:
                    self._json({"hata": "bulunamadı"}, 404)
        except anthropic.AuthenticationError:
            self._json({"hata": "API anahtarı geçersiz veya eksik. README'deki kurulum adımlarına bak."}, 401)
        except anthropic.RateLimitError:
            self._json({"hata": "Çok sık istek gönderildi, biraz bekleyip tekrar dene."}, 429)
        except anthropic.APIConnectionError:
            self._json({"hata": "İnternet bağlantısı kurulamadı."}, 503)
        except anthropic.APIStatusError as hata:
            self._json({"hata": f"API hatası ({hata.status_code}): {hata.message}"}, 502)

def pencere_ac(adres):
    """Chrome/Edge varsa uygulama penceresi gibi aç, yoksa normal tarayıcıda aç."""
    adaylar = ["msedge", "chrome", "google-chrome", "chromium", "chromium-browser",
               r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
               r"C:\Program Files\Google\Chrome\Application\chrome.exe",
               "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    for aday in adaylar:
        yol = shutil.which(aday) or (aday if Path(aday).exists() else None)
        if yol:
            subprocess.Popen([yol, f"--app={adres}", "--window-size=480,760"])
            return
    webbrowser.open(adres)


def main():
    kisilik_oku()
    sunucu = ThreadingHTTPServer(("127.0.0.1", PORT), Isleyici)
    adres = f"http://127.0.0.1:{PORT}/"
    print(f"Kişisel asistan çalışıyor: {adres}  (kapatmak için Ctrl+C)")
    if "--pencere-acma" not in sys.argv:
        pencere_ac(adres)
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
