# Kişisel Asistan

Masaüstünde küçük bir pencerede çalışan, seni zamanla tanıyan, objektif analiz yapan ve öneri veren
kişisel asistan. **Yapay zekâ modeli tamamen senin bilgisayarında çalışır ve onu sen eğitirsin.**
Hiçbir dış API'ye bağlanmaz, internet olmadan da çalışır.

## Nasıl çalışır?

```
 Sen konuşursun ──► Yerel model (Ollama) ──► Cevap
        │                                       │
        │     👍 / 👎 düzelt / elle örnek         │
        ▼                                       ▼
   veri/ klasörü (hafıza, kişilik, sohbetler, geri bildirimler)
        │
        ▼  egitim/modeli_egit.bat
   LoRA ince ayarı ──► "benim-asistanim" modeli ──► Ollama ──► asistan artık bunu kullanır
```

1. **Başlangıç:** Açık kaynaklı bir temel model (Qwen3 4B) kullanılır. Türkçe konuşabilir ama seni tanımaz.
2. **Veri biriktirme:** Konuştukça her cevaba:
   - **👍** verirsin → "böyle cevap ver" örneği olur,
   - **👎 Düzelt** ile ideal cevabı yazarsın → model bunu öğrenir,
   - **Eğitim** sekmesinde doğrudan örnek yazarsın ("şu soruya şöyle cevap ver") → modelin
     **fikirlerini ve üslubunu** sen belirlersin.
3. **Eğitim:** Yeterli örnek birikince (en az ~100, ideali 500+) `egitim/modeli_egit.bat` çalıştırırsın.
   Temel model senin verinle ince ayar yapılır. Böylece sana özgü, ağırlıkları senin diskinde duran
   **benim-asistanim** modeli oluşur.
4. **Tekrarla:** Asistan yeni modelini otomatik kullanır. Konuşmaya ve düzeltmeye devam ettikçe
   birkaç haftada bir yeniden eğitirsin ve model her seferinde sana daha çok benzer.

Bunlara ek olarak, eğitimden bağımsız olarak her gün çalışan bir **hafıza** da var. Asistan
konuşmalardan senin hakkında öğrendiklerini ve kendi görüşlerini kaydeder. Bunları **Hafıza**
sekmesinde görüp düzeltebilirsin. Hafıza anında etkilidir; eğitim ise modelin karakterini kalıcı
olarak değiştirir.

> **Neden sıfırdan model eğitmiyoruz?** Sıfırdan bir dil modeli eğitmek milyarlarca sayfa metin ve
> milyonlarca dolarlık donanım ister. Kişisel verinle eğitilen sıfırdan bir model Türkçe cümle bile
> kuramaz. Dünyada kişisel asistanlar bu yüzden hep aynı yolla yapılır: dili bilen açık kaynaklı
> bir modeli alıp kendi verinle ince ayar (fine-tuning) yaparsın. Ortaya çıkan model tamamen senindir.

## Kurulum (bir kerelik)

1. **Python 3.10+** kur: <https://www.python.org/downloads/> (Windows'ta kurarken *"Add Python to PATH"* kutusunu işaretle).
2. **Ollama** kur: <https://ollama.com/download>. Modelleri bilgisayarında çalıştıran programdır.
3. Temel modeli indir. Komut İstemi'ni aç ve şunu yaz (yaklaşık 2.5 GB):
   ```
   ollama pull qwen3:4b
   ```
4. Bu klasörü bilgisayarına indir.

## Çalıştırma

- **Windows:** `baslat.bat` dosyasına çift tıkla.
- **macOS / Linux:** `./baslat.sh`

Chrome veya Edge varsa asistan ayrı, küçük bir uygulama penceresinde açılır.

**Bilgisayar açılınca otomatik başlasın:** `Win + R` tuşlarına bas, `shell:startup` yaz ve açılan
klasöre `baslat.bat` için bir **kısayol** koy.

## Modelini eğitmek

### Gereken donanım

| Temel model | Ekran kartı (NVIDIA) | Not |
|---|---|---|
| `Qwen/Qwen3-4B-Instruct-2507` (varsayılan) | 16 GB+ VRAM (RTX 4080/4090/5080…) | En iyi kalite |
| `Qwen/Qwen2.5-1.5B-Instruct` | 8 GB+ VRAM (RTX 3060/4060…) | Daha küçük kartlar için |

Ekran kartın yoksa eğitim işlemcide çok yavaş olur (günler sürebilir). Sadece sohbet için ekran
kartı gerekmez; Ollama işlemcide de çalışır.

### Adımlar

1. Asistanla konuş, 👍 ver, düzelt, **Eğitim** sekmesinde örnek ekle. Sayacı aynı sekmede görürsün.
2. Asistanı kapat, sonra `egitim\modeli_egit.bat` dosyasına çift tıkla.
   Daha küçük ekran kartı için Komut İstemi'nde şunu çalıştır:
   ```
   egitim\modeli_egit.bat --temel Qwen/Qwen2.5-1.5B-Instruct
   ```
   İlk çalıştırmada gerekli kütüphaneler (~5 GB) ve temel modelin ağırlıkları indirilir.
   Toplam süre, örnek sayısına göre birkaç dakika ile bir saat arasındadır.
3. Bittiğinde asistanı yeniden başlat. Eğitim sekmesinde *"kendi eğittiğin modeli kullanıyorsun"* yazar.

`modeli_egit.bat` üç adımı sırayla çalıştırır. İstersen adımları tek tek de çalıştırabilirsin:

| Adım | Komut | Ne yapar |
|---|---|---|
| 1 | `python egitim/veri_hazirla.py` | 👍, düzeltmeler ve elle örneklerden `egitim/veri.jsonl` dosyasını oluşturur |
| 2 | `python egitim/egit.py` | LoRA ile ince ayar yapar ve modeli `egitim/cikti/birlesik` klasörüne kaydeder |
| 3 | `python egitim/ollamaya_yukle.py` | Modeli GGUF biçimine çevirir, sıkıştırır ve Ollama'ya `benim-asistanim` adıyla yükler |

`egit.py` ayarları: `--epoch` (varsayılan 3), `--lora-r` (varsayılan 16; büyüdükçe model daha çok
değişir), `--ogrenme-hizi`. Model verini ezberlemeye başlarsa (aynı cümleleri tekrar ederse)
`--epoch 2` ile yeniden dene.

### İyi eğitim için ipuçları

- **Nitelik, nicelikten önemlidir.** 200 özenle yazılmış ideal cevap, 2000 rastgele cevaptan iyidir.
- Modelin fikir sahibi olmasını istiyorsan, fikirlerini **Eğitim → Örnek öğret** ile açıkça yaz.
  Örneğin: *"Sence X mi Y mi?" → "Bence Y, çünkü..."*
- Farklı konularda örnek ver: iş, sağlık, ilişkiler, para, günlük planlama, analiz talepleri.
- **Beni analiz et** sorusuna nasıl bir analiz beklediğini birkaç kez elle yaz. Model analiz
  tarzını buradan öğrenir.

## Ayarlar

| Ortam değişkeni | Varsayılan | Açıklama |
|---|---|---|
| `ASISTAN_TEMEL_MODEL` | `qwen3:4b` | Henüz kendi modelini eğitmediysen kullanılan Ollama modeli |
| `ASISTAN_MODEL` | *(otomatik)* | Belirli bir modeli zorla (normalde `benim-asistanim` varsa o kullanılır) |
| `ASISTAN_PORT` | `8765` | Arayüzün yerel portu |
| `ASISTAN_VERI` | `veri/` | Verilerin saklandığı klasör |

## Gizlilik

- Model, hafıza, kişilik, sohbetler ve geri bildirimler **sadece senin bilgisayarında** durur.
  Sohbet sırasında internete hiçbir şey gönderilmez.
- İnternet yalnızca kurulumda gerekir: Ollama ve temel modelin indirilmesi, eğitimde de kütüphaneler,
  temel model ağırlıkları ve llama.cpp dönüştürücüsü.
- `veri/` ve eğitim çıktıları `.gitignore` dosyasında listelidir, git'e gönderilmez.
- Yedek almak için `veri/` klasörünü kopyalaman yeterli.

## Sınırlar

- 4B boyutunda yerel bir model, büyük bulut modelleri kadar derin analiz yapamaz. Asıl gücü sana
  özgü olmasıdır ve eğittikçe gelişir. Daha güçlü bir bilgisayarın varsa daha büyük bir temel modelle
  eğitebilirsin, örneğin 24 GB VRAM ile `--temel Qwen/Qwen2.5-7B-Instruct`.
- Bu asistan bir terapist, doktor veya avukat değildir. Analizleri ona anlattıklarına dayanır.
