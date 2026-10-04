#!/usr/bin/env python3
"""Génération ACE-Step hors process worker (stdin JSON → stdout path)."""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
import re


def _caption_for_vocals(caption: str) -> str:
    """Retire le biais « instrumental » et demande des voix chantées."""
    c = caption.strip()
    c = re.sub(r"(?i)\binstrumentals?\b", "", c)
    c = re.sub(r"(?i)\b(no|without|sans)\s+vocals?\b", "", c)
    c = re.sub(r"\s{2,}", " ", c).strip(" ,;-")
    if not re.search(r"(?i)\b(vocal|vocals|sing|sung|chant|voice|voix)\b", c):
        c = f"{c}, with clear sung vocals".strip(", ")
    return c[:500]


def main() -> int:
    cfg = json.load(sys.stdin)
    root = cfg["project_root"]
    os.chdir(root)
    if root not in sys.path:
        sys.path.insert(0, root)

    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    from acestep.llm_inference import LLMHandler

    dit = AceStepHandler()
    dit.initialize_service(
        project_root=root,
        config_path=cfg.get("config_path", "acestep-v15-turbo"),
        device=cfg.get("device", "cuda"),
    )
    llm = LLMHandler()
    llm.initialize(
        checkpoint_dir=cfg.get("checkpoint_dir", str(Path(root) / "checkpoints")),
        lm_model_path=cfg.get("lm_model_path", "acestep-5Hz-lm-0.6B"),
        backend=cfg.get("lm_backend", "pt"),
        device=cfg.get("device", "cuda"),
    )

    duration_s = max(1, min(int(cfg["duration_s"]), 600))
    save_dir = Path(cfg["save_dir"])
    save_dir.mkdir(parents=True, exist_ok=True)
    out = Path(cfg["out"])

    instrumental = bool(cfg.get("instrumental", True))
    lyrics = str(cfg.get("lyrics") or "").strip()
    caption = str(cfg.get("prompt") or "").strip()[:500]
    if instrumental or not lyrics or lyrics.lower() in ("[instrumental]", "instrumental"):
        lyrics = "[Instrumental]"
        instrumental = True
    else:
        # Caption « … instrumental … » tue les voix même si lyrics sont fournies
        caption = _caption_for_vocals(caption)

    fade_out = cfg.get("fade_out_duration")
    if fade_out is None:
        # ~10% de la durée, borné 1.5–4s — évite le cut brutal
        fade_out = max(1.5, min(4.0, float(duration_s) * 0.1))
    else:
        fade_out = float(fade_out)
    fade_in = float(cfg.get("fade_in_duration") or 0.05)

    bpm = cfg.get("bpm")
    if bpm is not None:
        try:
            bpm = int(bpm)
            if bpm < 30 or bpm > 300:
                bpm = None
        except (TypeError, ValueError):
            bpm = None

    keyscale = str(cfg.get("keyscale") or "").strip()
    timesignature = cfg.get("timesignature")
    if timesignature is not None and timesignature != "":
        # ACE accepte 2/3/4/6 ou chaînes type "4/4"
        ts_raw = str(timesignature).strip()
        if ts_raw in ("2", "3", "4", "6"):
            timesignature = int(ts_raw)
        elif "/" in ts_raw:
            timesignature = ts_raw
        else:
            timesignature = ""
    else:
        timesignature = ""

    params_kw: dict = {
        "caption": caption,
        "lyrics": lyrics[:4096],
        "instrumental": instrumental,
        "duration": float(duration_s),
        "seed": int(cfg["seed"]) if cfg.get("seed") is not None else -1,
        "inference_steps": int(cfg.get("inference_steps", 8)),
        "fade_in_duration": fade_in,
        "fade_out_duration": fade_out,
    }
    if bpm is not None:
        params_kw["bpm"] = bpm
    if keyscale:
        params_kw["keyscale"] = keyscale
    if timesignature != "":
        params_kw["timesignature"] = timesignature

    print(
        f"[acestep] instr={instrumental} lyrics_len={len(lyrics)} "
        f"fade_out={fade_out:.1f}s caption={caption[:80]!r}",
        file=sys.stderr,
    )
    params = GenerationParams(**params_kw)
    config = GenerationConfig(
        batch_size=1,
        audio_format=cfg.get("audio_format", "wav"),
    )
    result = generate_music(dit, llm, params, config, save_dir=str(save_dir))
    if not getattr(result, "success", False):
        err = getattr(result, "error", "erreur inconnue")
        print(f"ACE-Step a échoué: {err}", file=sys.stderr)
        return 1
    audios = getattr(result, "audios", None) or []
    if not audios:
        print("ACE-Step: aucun audio", file=sys.stderr)
        return 1
    first = audios[0]
    src = Path(first["path"] if isinstance(first, dict) else first)
    if not src.exists():
        print(f"Fichier ACE-Step introuvable: {src}", file=sys.stderr)
        return 1
    shutil.copy2(src, out)
    print(str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
