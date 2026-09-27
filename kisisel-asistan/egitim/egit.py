"""Adım 2 — Modelini eğit (LoRA ince ayarı).

Açık kaynaklı bir temel modeli (varsayılan: Qwen3 4B) senin verinle ince ayar yapar.
Sonuç tamamen sana ait bir modeldir: ağırlıkları senin diskinde durur.

Gereken: NVIDIA ekran kartı ve  pip install -r egitim/requirements.txt
Ekran kartı belleği 14 GB'tan azsa (ör. RTX 5050 / 4060, 8 GB) model otomatik olarak
4-bit yüklenir (QLoRA); böylece 4B model 8 GB'a sığar.

Kullanım:
    python egitim/egit.py
    python egitim/egit.py --temel Qwen/Qwen2.5-1.5B-Instruct   # daha küçük ekran kartları için
"""

import argparse
import json
from pathlib import Path

import gc

import torch
from datasets import load_dataset
from peft import LoraConfig, PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
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
    ayri.add_argument("--max-uzunluk", type=int, default=0, help="token cinsinden en uzun örnek (0 = otomatik)")
    ayri.add_argument("--nicemleme", choices=["otomatik", "4bit", "yok"], default="otomatik",
                      help="4bit: az VRAM kullanır (QLoRA). otomatik: 14 GB altı kartlarda 4bit")
    ayri.add_argument("--max-adim", type=int, default=-1, help="test için adım sınırı")
    args = ayri.parse_args()

    veri = load_dataset("json", data_files=args.veri, split="train")
    print(f"{len(veri)} örnekle eğitim başlıyor. Temel model: {args.temel}")

    gpu = torch.cuda.is_available()
    bf16 = gpu and torch.cuda.is_bf16_supported()
    hesap_tipi = torch.bfloat16 if bf16 else (torch.float16 if gpu else torch.float32)
    vram = torch.cuda.get_device_properties(0).total_memory / 2**30 if gpu else 0
    if gpu:
        print(f"Ekran kartı: {torch.cuda.get_device_name(0)} ({vram:.1f} GB)")
    else:
        print("Uyarı: Ekran kartı (CUDA) bulunamadı; işlemcide eğitim çok yavaş olur.")

    dort_bit = args.nicemleme == "4bit" or (args.nicemleme == "otomatik" and gpu and vram < 14)
    max_uzunluk = args.max_uzunluk or (3072 if dort_bit else 4096)
    model_ayarlari = {"dtype": hesap_tipi}
    if dort_bit:
        print("Model 4-bit yükleniyor (QLoRA) — az bellekli ekran kartları için.")
        model_ayarlari["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=hesap_tipi, bnb_4bit_use_double_quant=True,
        )

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
        max_length=max_uzunluk,
        completion_only_loss=True,  # sadece asistanın cevaplarından öğren, senin mesajlarını ezberleme
        gradient_checkpointing=gpu,
        bf16=bf16,
        fp16=gpu and not bf16,
        use_cpu=not gpu,
        logging_steps=5,
        save_strategy="no",
        report_to="none",
        model_init_kwargs=model_ayarlari,
    )
    lora = LoraConfig(r=args.lora_r, lora_alpha=args.lora_r * 2, lora_dropout=0.05,
                      target_modules="all-linear", task_type="CAUSAL_LM")

    egitici = SFTTrainer(model=args.temel, args=ayarlar, train_dataset=veri, peft_config=lora)
    egitici.train()

    adaptor = cikti / "lora"
    egitici.model.save_pretrained(adaptor)
    print(f"LoRA adaptörü kaydedildi → {adaptor}")

    # Birleştirme: 4-bit ağırlıklarla birleştirmek kaliteyi düşürür; bu yüzden temel model tam
    # hassasiyette (işlemci belleğinde) yeniden yüklenip adaptör onun üzerine birleştirilir.
    del egitici
    gc.collect()
    if gpu:
        torch.cuda.empty_cache()
    print("Adaptör temel modelle birleştiriliyor (birkaç dakika sürebilir)…")
    birlesik = cikti / "birlesik"
    temel = AutoModelForCausalLM.from_pretrained(args.temel, dtype=torch.bfloat16, device_map="cpu")
    model = PeftModel.from_pretrained(temel, adaptor).merge_and_unload()
    model.save_pretrained(birlesik)
    AutoTokenizer.from_pretrained(args.temel).save_pretrained(birlesik)
    (cikti / "egitim-bilgisi.json").write_text(json.dumps({
        "temel": args.temel, "ornek_sayisi": len(veri), "epoch": args.epoch, "lora_r": args.lora_r,
        "dort_bit": dort_bit, "max_uzunluk": max_uzunluk,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Birleştirilmiş model kaydedildi → {birlesik}")
    print("Sıradaki adım: python egitim/ollamaya_yukle.py")


if __name__ == "__main__":
    main()
