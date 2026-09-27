# Kişisel Asistan

Masaüstünde küçük bir pencerede çalışan, seni zamanla tanıyan, objektif analiz yapan,
öneri veren ve **senin eğittiğin** kişisel asistan. Yapay zekâ olarak Claude (Anthropic API)
kullanır; hafızası ve kişiliği tamamen senin bilgisayarında, düz dosyalarda durur.

## Nasıl çalışır?

"Eğitim" burada modeli sıfırdan eğitmek değil. Hazır, güçlü bir modele her konuşmada şunlar verilir:

| Katman | Nerede | Kim yazar |
|---|---|---|
| **Kişilik & fikirler** — adı, üslubu, değerleri, nelere karşı çıkacağı | `veri/kisilik.md` (Eğitim sekmesi) | Sen |
| **Senin hakkında bildikleri** — hedeflerin, alışkanlıkların, işin, değerlerin… | `veri/hafiza.json` → `bilgiler` | Asistan sohbet ederken kendisi kaydeder, sen de ekleyip silebilirsin |
| **Kendi görüşleri** — sende fark ettiği örüntüler, güçlü yanlar, kör noktalar | `veri/hafiza.json` → `gorusler` | Asistan kendisi oluşturur |
| **Dersler** — 👎 ile yaptığın düzeltmeler | `veri/hafiza.json` → `dersler` | Sen |
| Sohbet kayıtları | `veri/sohbetler/GÜN.jsonl` | Otomatik |

Yani asistanı üç şekilde eğitirsin:
1. **Eğitim sekmesinde** kişiliğini ve fikirlerini yazarak ("Bana karşı sert ol", "Para konusunda tutucu ol", "Sabah rutinini önemse"...).
2. **Onunla konuşarak** — anlattıkça seni öğrenir ve hafızasına yazar (cevabın altında 🧠 ile görürsün).
3. **👎 Düzelt** butonuyla — yanlış bulduğun cevabı düzeltirsin, bu kalıcı bir ders olur.

Yeni bilgiler, dersler ve kişilik değişiklikleri **yeni oturumda** tam olarak devreye girer ("Yeni oturum" butonu).

## Kurulum (bir kerelik)

1. **Python 3.10+** kur: <https://www.python.org/downloads/> (Windows'ta kurulumda *"Add Python to PATH"* kutusunu işaretle).
2. **API anahtarı al:** <https://console.anthropic.com> → hesap aç → *API Keys* → yeni anahtar oluştur (kullandıkça ücretlendirilir).
3. Anahtarı ortam değişkeni olarak kaydet:
   - **Windows** (Komut İstemi): `setx ANTHROPIC_API_KEY "sk-ant-..."` → pencereyi kapatıp yeniden aç.
   - **macOS / Linux:** `~/.zshrc` veya `~/.bashrc` dosyasına `export ANTHROPIC_API_KEY="sk-ant-..."` ekle.
4. Bu klasörü bilgisayarına indir.

## Çalıştırma

- **Windows:** `baslat.bat` dosyasına çift tıkla.
- **macOS / Linux:** `./baslat.sh`

İlk açılışta gerekli paket otomatik kurulur. Chrome veya Edge varsa asistan ayrı, küçük bir
uygulama penceresi olarak açılır; yoksa tarayıcında açılır (`http://127.0.0.1:8765`).

### Bilgisayar açılınca otomatik başlasın

- **Windows:** `Win + R` → `shell:startup` yaz → açılan klasöre `baslat.bat` için bir **kısayol** koy.
- **macOS:** Sistem Ayarları → Genel → Giriş Öğeleri → `baslat.sh`'yi ekle.

## İlk hafta için öneri

1. Eğitim sekmesinde kişiliği kendine göre yaz.
2. **"Beni tanı"** ile başla, soruları dürüstçe cevapla.
3. Her akşam **"Günlük check-in"** yap (2-3 dakika).
4. Hafta sonunda **"Beni analiz et"** — hafıza büyüdükçe analizler keskinleşir.
5. Hafıza sekmesini ara ara kontrol et; yanlış kaydedilen bilgiyi sil.

## Ayarlar

| Ortam değişkeni | Varsayılan | Açıklama |
|---|---|---|
| `ASISTAN_MODEL` | `claude-opus-5` | Kullanılacak Claude modeli. Daha ucuz için `claude-sonnet-5`. |
| `ASISTAN_PORT` | `8765` | Yerel sunucu portu. |

Asistan, isteklerde Anthropic'in *sunucu tarafı yedek model* özelliğini (`fallbacks: "default"`)
kullanır: bir istek güvenlik filtresine takılırsa aynı istek otomatik olarak önerilen başka bir
modelde yeniden denenir.

## Gizlilik

- Hafıza, kişilik ve sohbet kayıtları sadece bu klasördeki `veri/` dizininde durur; hiçbir yere yüklenmez
  (`.gitignore` sayesinde git'e de gönderilmez).
- Her mesajda kişilik ve hafıza, cevap üretmek için Anthropic API'ye gönderilir.
- Sunucu sadece kendi bilgisayarından erişilebilir (`127.0.0.1`).
- Yedek almak için `veri/` klasörünü kopyalaman yeterli.

## Sınırlar

Bu asistan bir terapist, doktor veya avukat değildir. Analizleri senin ona anlattıklarına dayanır —
ne kadar dürüst ve düzenli anlatırsan o kadar isabetli olur.
