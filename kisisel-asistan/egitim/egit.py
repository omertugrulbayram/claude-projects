"""Adım 2 — Modelini eğit (LoRA ince ayarı).

Açık kaynaklı bir temel modeli (varsayılan: Qwen3 4B) senin verinle ince ayar yapar.
Sonuç tamamen sana ait bir modeldir: ağırlıkları senin diskinde durur.

Gereken: NVIDIA ekran kartı (4B için ~16 GB, 1.5B için ~8 GB VRAM) ve
    pip install -r egitim/requirements.txt

Kullanım:
    python egitim/egit.py
    python egitim/egit.py --temel Qwen/Qwen2.5-1.5B-Instruct   # daha küçük ekran kartları için
"""

import argparse
import json
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

KLASOR = Path(__file__).resolve().parent


def main():
    ayri = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ayri.add_argument("--temel", default="Qwen/Qwen3-4B-Instruct-2507", help="Hugging Face model adı veya yerel klasör")
    ayri.add_argument("--veri", default=str(KLASOR / "veri.jsonl"))
    ayri.add_argument("--cikti", default=str(KLASOR / "cikti"))
    ayri.add_argument("--epoch", type=float, default=3)
    ayri.add_argument("--ogrenme-hizi", type=float, default=2e-4)
    ayri.add_argument("--lora-r", type=int, default=16, help="büyüdükçe model daha çok değişir (8-64)")
    ayri.add_argument("--max-uzunluk", type=int, default=4096, help="token cinsinden en uzun örnek")
    ayri.add_argument("--max-adim", type=int, default=-1, help="test için adım sınırı")
    args = ayri.parse_args()

    veri = load_dataset("json", data_files=args.veri, split="train")
    print(f"{len(veri)} örnekle eğitim başlıyor. Temel model: {args.temel}")

    gpu = torch.cuda.is_available()
    bf16 = gpu and torch.cuda.is_bf16_supported()
    if not gpu:
        print("Uyarı: Ekran kartı (CUDA) bulunamadı; işlemcide eğitim çok yavaş olur.")

    cikti = Path(args.cikti)
    ayarlar = SFTConfig(
        output_dir=str(cikti / "kontrol-noktalari"),
        num_train_epochs=args.epoch,
        max_steps=args.max_adim,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=args.ogrenme_hizi,
        lr_scheduler_type="cosine",
        warmup_steps=5,
        max_length=args.max_uzunluk,
        completion_only_loss=True,  # sadece asistanın cevaplarından öğren, senin mesajlarını ezberleme
        gradient_checkpointing=gpu,
        bf16=bf16,
        fp16=gpu and not bf16,
        use_cpu=not gpu,
        logging_steps=5,
        save_strategy="no",
        report_to="none",
        model_init_kwargs={"dtype": torch.bfloat16 if bf16 else (torch.float16 if gpu else torch.float32)},
    )
    lora = LoraConfig(r=args.lora_r, lora_alpha=args.lora_r * 2, lora_dropout=0.05,
                      target_modules="all-linear", task_type="CAUSAL_LM")

    egitici = SFTTrainer(model=args.temel, args=ayarlar, train_dataset=veri, peft_config=lora)
    egitici.train()

    adaptor = cikti / "lora"
    egitici.model.save_pretrained(adaptor)
    print(f"LoRA adaptörü kaydedildi → {adaptor}")

    birlesik = cikti / "birlesik"
    model = egitici.model.merge_and_unload()
    model.save_pretrained(birlesik)
    egitici.processing_class.save_pretrained(birlesik)
    (cikti / "egitim-bilgisi.json").write_text(json.dumps({
        "temel": args.temel, "ornek_sayisi": len(veri), "epoch": args.epoch, "lora_r": args.lora_r,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Birleştirilmiş model kaydedildi → {birlesik}")
    print("Sıradaki adım: modeli Ollama'ya yükle (egitim/ollamaya_yukle.bat veya .sh)")


if __name__ == "__main__":
    main()
