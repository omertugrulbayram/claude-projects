"""Kişisel Asistan — tamamen senin bilgisayarında çalışan, senin eğittiğin asistan.

Yapay zekâ modeli Ollama ile yerelde çalışır; hiçbir dış API'ye bağlanmaz.
Çalıştırma:  python asistan.py
Tüm veriler bu klasördeki `veri/` dizininde saklanır.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import uuid
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

KLASOR = Path(__file__).resolve().parent
VERI = Path(os.environ.get("ASISTAN_VERI", KLASOR / "veri"))
HAFIZA_DOSYASI = VERI / "hafiza.json"
KISILIK_DOSYASI = VERI / "kisilik.md"
SOHBET_KLASORU = VERI / "sohbetler"
GERI_BILDIRIM_DOSYASI = VERI / "geri_bildirim.jsonl"
ORNEK_DOSYASI = VERI / "ornekler.jsonl"

OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
if not OLLAMA.startswith("http"):
    OLLAMA = "http://" + OLLAMA
KENDI_MODELIN = "benim-asistanim"  # egitim/ adımlarıyla oluşturulan, sana özel model
TEMEL_MODEL = os.environ.get("ASISTAN_TEMEL_MODEL", "qwen3:4b")  # henüz eğitmediysen kullanılan model
PORT = int(os.environ.get("ASISTAN_PORT", "8765"))
GECMIS_UZUNLUGU = 6  # eğitim verisine her cevapla birlikte kaydedilen önceki mesaj sayısı
PENCERE = 20  # modele gönderilen en fazla önceki mesaj (bağlam penceresini aşmamak için)

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
- Analiz yaparken aşağıdaki bilgilere dayan; veri azsa bunu söyle ve soru sor.
- Kendi fikrin olsun. Sorulduğunda "sana kalmış" deme; gerekçesiyle net bir görüş bildir.
- Öneriler somut, küçük ve uygulanabilir olsun (ne, ne zaman, nasıl ölçülür).
- Tıbbi, hukuki veya ciddi psikolojik konularda bir uzmana yönlendir; kriz belirtisi görürsen \
profesyonel destek almasını öner.
- Her zaman Türkçe cevap ver."""

CIKARIM_TALIMATI = """Aşağıda bir kullanıcı ile asistanının son konuşması ve asistanın kullanıcı \
hakkında zaten bildikleri var. Görevin, konuşmadan kullanıcı hakkında KALICI ve İŞE YARAR yeni \
bilgileri çıkarmak (hedef, alışkanlık, değer, ilişki, iş, sağlık, tercih, önemli olay).

Kurallar:
- Sadece kullanıcının kendisinin söylediklerine dayan; tahmin yürütme.
- Zaten bilinenleri tekrar yazma. Geçici veya önemsiz şeyleri (selamlaşma, anlık ruh hali) yazma.
- Her bilgi tek cümle ve kendi başına anlaşılır olsun, Türkçe yaz.
- "gorus" alanına, yalnızca bu konuşmada kullanıcıda gerçekten dikkat çekici bir örüntü, güçlü yan \
veya kör nokta fark ettiysen asistanın kendi görüşünü yaz; yoksa boş bırak.
- Yeni bir şey yoksa boş liste döndür."""

CIKARIM_SEMASI = {
    "type": "object",
    "properties": {
        "bilgiler": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "bilgi": {"type": "string"},
                    "kategori": {
                        "type": "string",
                        "enum": ["kimlik", "hedef", "aliskanlik", "deger", "iliski", "is", "saglik", "tercih", "olay", "diger"],
                    },
                },
                "required": ["bilgi", "kategori"],
            },
        },
        "gorus": {"type": "string"},
    },
    "required": ["bilgiler", "gorus"],
}

kilit = threading.Lock()        # sohbet oturumu için
dosya_kilidi = threading.Lock()  # hafıza dosyası için (arka plan çıkarımı da yazar)


# ---------------------------------------------------------------- veri katmanı

def zaman():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def jsonl_oku(dosya):
    if not dosya.exists():
        return []
    return [json.loads(satir) for satir in dosya.read_text(encoding="utf-8").splitlines() if satir.strip()]


def jsonl_ekle(dosya, kayit):
    dosya.parent.mkdir(parents=True, exist_ok=True)
    with dosya.open("a", encoding="utf-8") as f:
        f.write(json.dumps(kayit, ensure_ascii=False) + "\n")


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
    with dosya_kilidi:
        hafiza = hafiza_oku()
        kayit = {"id": uuid.uuid4().hex[:8], "tarih": zaman(), **kayit}
        hafiza[tur].append(kayit)
        hafiza_yaz(hafiza)
    return kayit


def hafizadan_sil(tur, kimlik):
    with dosya_kilidi:
        hafiza = hafiza_oku()
        hafiza[tur] = [k for k in hafiza[tur] if k["id"] != kimlik]
        hafiza_yaz(hafiza)


def kisilik_oku():
    if not KISILIK_DOSYASI.exists():
        VERI.mkdir(exist_ok=True)
        KISILIK_DOSYASI.write_text(VARSAYILAN_KISILIK, encoding="utf-8")
    return KISILIK_DOSYASI.read_text(encoding="utf-8")


def sistem_metni(hafiza=None, kisilik=None):
    """Modele verilen sistem mesajı. Eğitim verisi de aynı biçimi kullanır."""
    hafiza = hafiza or hafiza_oku()
    kisilik = kisilik if kisilik is not None else kisilik_oku()
    bilgiler = "\n".join(f"- [{b['kategori']}] {b['bilgi']}" for b in hafiza["bilgiler"]) or "- (henüz yok)"
    gorusler = "\n".join(f"- {g['gorus']}" for g in hafiza["gorusler"]) or "- (henüz yok)"
    dersler = "\n".join(f"- {d['ders']}" for d in hafiza["dersler"]) or "- (henüz yok)"
    return (
        f"{TEMEL_TALIMAT}\n\n"
        f"## Kişiliğin ve eğitimin\n{kisilik.strip()}\n\n"
        f"## Kullanıcı hakkında bildiklerin\n{bilgiler}\n\n"
        f"## Kullanıcı hakkındaki kendi görüşlerin\n{gorusler}\n\n"
        f"## Kullanıcının koyduğu kurallar (mutlaka uy)\n{dersler}"
    )


# ---------------------------------------------------------------- yerel model (Ollama)

class ModelHatasi(Exception):
    pass


def ollama(yol, govde=None, zaman_asimi=600):
    istek = urllib.request.Request(
        OLLAMA + yol,
        data=None if govde is None else json.dumps(govde).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(istek, timeout=zaman_asimi) as yanit:
            return json.loads(yanit.read())
    except urllib.error.HTTPError as hata:
        ayrinti = hata.read().decode("utf-8", "replace")
        raise ModelHatasi(f"Ollama hatası ({hata.code}): {ayrinti[:300]}") from hata
    except (urllib.error.URLError, TimeoutError, ConnectionError) as hata:
        raise ModelHatasi("Ollama'ya bağlanılamadı. Ollama kurulu ve açık mı? (README → Kurulum)") from hata


def aktif_model():
    """Eğittiğin model varsa onu, yoksa temel modeli kullan."""
    if os.environ.get("ASISTAN_MODEL"):
        return os.environ["ASISTAN_MODEL"]
    try:
        adlar = {m["name"].split(":")[0] for m in ollama("/api/tags", zaman_asimi=5).get("models", [])}
    except ModelHatasi:
        return TEMEL_MODEL
    return KENDI_MODELIN if KENDI_MODELIN in adlar else TEMEL_MODEL


def dusunceyi_temizle(metin):
    return re.sub(r"<think>.*?</think>", "", metin, flags=re.S).strip()


def model_sor(mesajlar, bicim=None):
    govde = {"model": aktif_model(), "messages": mesajlar, "stream": False, "think": False,
             "options": {"num_ctx": 8192}}
    if bicim:
        govde["format"] = bicim
        govde["options"]["temperature"] = 0
    yanit = ollama("/api/chat", govde)
    return dusunceyi_temizle(yanit["message"]["content"])


# ---------------------------------------------------------------- sohbet

class Oturum:
    def __init__(self):
        self.sistem = sistem_metni()  # oturum boyunca sabit
        self.mesajlar = []


oturum = Oturum()


def cevap_al(kullanici_metni):
    gecmis = oturum.mesajlar[-GECMIS_UZUNLUGU:]
    mesajlar = [{"role": "system", "content": oturum.sistem}, *oturum.mesajlar[-PENCERE:],
                {"role": "user", "content": kullanici_metni}]
    cevap = model_sor(mesajlar)
    oturum.mesajlar += [{"role": "user", "content": kullanici_metni}, {"role": "assistant", "content": cevap}]

    kimlik = uuid.uuid4().hex[:10]
    jsonl_ekle(SOHBET_KLASORU / f"{datetime.now():%Y-%m-%d}.jsonl", {
        "id": kimlik, "zaman": zaman(), "model": aktif_model(),
        "gecmis": gecmis, "soru": kullanici_metni, "cevap": cevap,
    })
    threading.Thread(target=hafizaya_cikar, args=(kullanici_metni, cevap), daemon=True).start()
    return kimlik, cevap


def hafizaya_cikar(soru, cevap):
    """Arka planda: son konuşmadan kullanıcı hakkında yeni bilgileri çıkarıp hafızaya yaz."""
    hafiza = hafiza_oku()
    bilinenler = "\n".join(f"- {b['bilgi']}" for b in hafiza["bilgiler"]) or "- (hiçbir şey)"
    gorusler = "\n".join(f"- {g['gorus']}" for g in hafiza["gorusler"]) or "- (henüz yok)"
    try:
        ham = model_sor([
            {"role": "system", "content": CIKARIM_TALIMATI},
            {"role": "user", "content": f"Zaten bilinenler:\n{bilinenler}\n\n"
                                        f"Asistanın mevcut görüşleri (tekrarlama):\n{gorusler}\n\nKullanıcı: {soru}\n\nAsistan: {cevap}"},
        ], bicim=CIKARIM_SEMASI)
        sonuc = json.loads(ham)
        if not isinstance(sonuc, dict):
            return
    except (ModelHatasi, json.JSONDecodeError, KeyError):
        return
    mevcut = {b["bilgi"].casefold() for b in hafiza["bilgiler"]}
    for b in sonuc.get("bilgiler", [])[:5]:
        metin = str(b.get("bilgi", "")).strip()
        if metin and metin.casefold() not in mevcut:
            hafizaya_ekle("bilgiler", {"bilgi": metin, "kategori": b.get("kategori", "diger"), "kaynak": "asistan"})
    gorus = str(sonuc.get("gorus", "")).strip()
    if gorus and gorus.casefold() not in {g["gorus"].casefold() for g in hafiza["gorusler"]}:
        hafizaya_ekle("gorusler", {"gorus": gorus})


def egitim_durumu():
    kayitlar = [k for d in sorted(SOHBET_KLASORU.glob("*.jsonl")) for k in jsonl_oku(d)] if SOHBET_KLASORU.exists() else []
    geri = {g["id"]: g for g in jsonl_oku(GERI_BILDIRIM_DOSYASI)}
    return {
        "model": aktif_model(),
        "kendi_modelin_var": aktif_model() == KENDI_MODELIN,
        "toplam_cevap": len(kayitlar),
        "begenilen": sum(1 for g in geri.values() if g.get("iyi")),
        "duzeltilen": sum(1 for g in geri.values() if g.get("ideal")),
        "elle_ornek": len(jsonl_oku(ORNEK_DOSYASI)),
    }


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
        elif self.path == "/api/egitim-durumu":
            self._json(egitim_durumu())
        else:
            self._json({"hata": "bulunamadı"}, 404)

    def do_POST(self):
        global oturum
        veri = self._govde()
        try:
            if self.path == "/api/sohbet":
                with kilit:
                    kimlik, cevap = cevap_al(veri["mesaj"])
                self._json({"id": kimlik, "cevap": cevap})
            elif self.path == "/api/yeni-oturum":
                with kilit:
                    oturum = Oturum()
                self._json({"tamam": True})
            elif self.path == "/api/kisilik":
                KISILIK_DOSYASI.write_text(veri["metin"], encoding="utf-8")
                self._json({"tamam": True})
            elif self.path == "/api/geri-bildirim":
                kayit = {"id": veri["id"], "zaman": zaman()}
                if veri.get("iyi"):
                    kayit["iyi"] = True
                if veri.get("ideal", "").strip():
                    kayit["ideal"] = veri["ideal"].strip()
                jsonl_ekle(GERI_BILDIRIM_DOSYASI, kayit)
                if veri.get("kural", "").strip():
                    hafizaya_ekle("dersler", {"ders": veri["kural"].strip()})
                self._json({"tamam": True})
            elif self.path == "/api/ornek":
                jsonl_ekle(ORNEK_DOSYASI, {"id": uuid.uuid4().hex[:10], "zaman": zaman(),
                                           "soru": veri["soru"].strip(), "cevap": veri["cevap"].strip()})
                self._json({"tamam": True})
            elif self.path == "/api/bilgi":
                hafizaya_ekle("bilgiler", {"bilgi": veri["bilgi"], "kategori": veri.get("kategori", "diger"), "kaynak": "sen"})
                self._json({"tamam": True})
            elif self.path == "/api/sil":
                hafizadan_sil(veri["tur"], veri["id"])
                self._json({"tamam": True})
            else:
                self._json({"hata": "bulunamadı"}, 404)
        except ModelHatasi as hata:
            self._json({"hata": str(hata)}, 503)


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
    print(f"Kişisel asistan çalışıyor: {adres}  (model: {aktif_model()}, kapatmak için Ctrl+C)")
    if "--pencere-acma" not in sys.argv:
        pencere_ac(adres)
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
