# Yol Haritası

Hedef donanım: **RTX 5050 (8 GB VRAM)**, Windows. Model tamamen yerelde, dış API yok.

## ✅ Faz 1 — Temel asistan
- [x] Masaüstü penceresi (Chrome/Edge uygulama modu), Türkçe arayüz
- [x] Yerel model (Ollama, Qwen3 4B), internet olmadan çalışır
- [x] Hafıza: asistan konuşmalardan seni öğrenir, kendi görüşlerini kaydeder, sen düzenlersin
- [x] Kişilik ve fikirler: Eğitim sekmesinden sen yazarsın
- [x] Hazır butonlar: günlük check-in, objektif analiz, öneri, beni tanı

## ✅ Faz 2 — Kendi modelini eğitme
- [x] 👍 / 👎 düzelt / elle örnek → eğitim verisi
- [x] LoRA ince ayarı (`egitim/egit.py`)
- [x] GGUF'a çevirip Ollama'ya `benim-asistanim` olarak yükleme; asistan otomatik geçer
- [x] Tek tıkla eğitim (`egitim/modeli_egit.bat`)

## ✅ Faz 3 — RTX 5050'ye uyarlama ve kolay kurulum
- [x] 8 GB kartlarda otomatik 4-bit eğitim (QLoRA). 4B model 8 GB'a sığar
- [x] Birleştirme tam hassasiyette yapılır (4-bit kalite kaybı olmaz)
- [x] RTX 50 serisi (Blackwell) destekli PyTorch (CUDA 13)
- [x] `kurulum.bat`: kontrol, model indirme, masaüstü kısayolu, otomatik başlatma
- [x] Kör model sınavı: eğitimde görülmemiş sorularla eski ve yeni model karşılaştırması (`egitim/karsilastir.py`)

## ⏭️ Faz 4 — Günlük alışkanlık
- [ ] Akşam check-in hatırlatıcısı (Windows bildirimi)
- [ ] Haftalık otomatik analiz raporu: haftanın özeti, örüntüler, gelecek hafta için 3 öneri
- [ ] Ruh hali / enerji / uyku için 1–5 puanlama ve zaman içindeki grafik
- [ ] Hedef takibi: hedef koy, asistan ilerlemeyi sorsun

## ⏭️ Faz 5 — Daha iyi cevaplar
- [ ] Cevapların kelime kelime akması (streaming). Uzun cevaplarda beklemeyi azaltır
- [ ] Uzun geçmiş için arama: eski sohbetlerden ilgili olanları bulup modele verme (yerel embedding)
- [ ] Tercih eğitimi (DPO): 👍/👎 çiftlerinden "şunu değil bunu tercih et"i öğretme
- [ ] Eğitim sonrası otomatik "ezber" kontrolü (aşırı öğrenme uyarısı)

## ⏭️ Faz 6 — Ses ve veri kaynakları
- [ ] Sesle konuşma: yerel Whisper (konuşma → yazı) ve yerel TTS (yazı → ses), Türkçe
- [ ] Günlük / not içe aktarma (txt, md, Notion/Obsidian dışa aktarımı)
- [ ] Takvim içe aktarma (.ics). Programına göre öneri

## ⏭️ Faz 7 — Güvenlik ve taşınabilirlik
- [ ] `veri/` klasörünü parolayla şifreleme
- [ ] Tek tıkla yedekleme / geri yükleme
- [ ] Tek dosya Windows uygulaması (.exe) olarak paketleme
