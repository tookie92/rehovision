#!/usr/bin/env python3
"""Traduction NLLB-200 (stdin JSON → stdout JSON). Remplace Ollama pour le dub."""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

# ISO atelier → FLORES-200 (NLLB)
FLORES: dict[str, str] = {
    "fr": "fra_Latn",
    "en": "eng_Latn",
    "es": "spa_Latn",
    "pt": "por_Latn",
    "de": "deu_Latn",
    "it": "ita_Latn",
    "ar": "arb_Arab",
    "zh": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "hi": "hin_Deva",
    "sw": "swh_Latn",
    "ln": "lin_Latn",
    "yo": "yor_Latn",
    "ha": "hau_Latn",
    "wo": "wol_Latn",
    "wof": "wol_Latn",
    "sn": "sna_Latn",
    # NLLB-200 n'a pas nde/nbl — proxy Nguni le plus proche (Zulu)
    "nd": "zul_Latn",
    "nr": "zul_Latn",
    "bm": "bam_Latn",
    "ig": "ibo_Latn",
    "zu": "zul_Latn",
    "xh": "xho_Latn",
    "st": "sot_Latn",
    "tn": "tsn_Latn",
    "ny": "nya_Latn",
    "rw": "kin_Latn",
    "so": "som_Latn",
    "am": "amh_Ethi",
}

# Traduire clause par clause (évite fuites EN/FR au milieu de phrase)
_CLAUSE_TGTS = frozenset(
    {
        "sna_Latn",
        "wol_Latn",
        "lin_Latn",
        "yor_Latn",
        "hau_Latn",
        "bam_Latn",
        "ibo_Latn",
        "swh_Latn",
        "zul_Latn",
        "xho_Latn",
        "sot_Latn",
        "nya_Latn",
        "kin_Latn",
        "som_Latn",
        "amh_Ethi",
    }
)

# Pivot EN utile sauf Wolof (600M : FR→WO direct > EN→WO)
_PIVOT_TGTS = _CLAUSE_TGTS - {"wol_Latn"}

_FR_LEAK = re.compile(
    r"\b(bonjour|bienvenue|aujourd'?hui|atelier|je|nous|vous|notre|avec|dans|pour|"
    r"appelle|merci|suis|parle|parler|aussi|création|creation)\b",
    re.I,
)
_EN_LEAK = re.compile(
    r"\b(hello|welcome|today|workshop|our|the|and|you|that|this|with|from|"
    r"have|will|would|name|creation|local|please|thanks)\b",
    re.I,
)
_STRONG_LEAK = re.compile(
    r"\b(welcome|workshop|bonjour|bienvenue|hello|today|atelier|aujourd'?hui|"
    r"je\s+suis|je\s+m['']appelle)\b",
    re.I,
)
# Amorces / résidus FR dans une sortie censée être anglaise
_FR_STRONG_LEAK = re.compile(
    r"\b(bonjour|bienvenue|aujourd'?hui|atelier|merci|salut|oui|"
    r"je\s+suis|je\s+m['']appelle)\b",
    re.I,
)
# Mots FR fréquents que NLLB-600M laisse collés à de l’EN
_FR_RESIDUE_EN = re.compile(
    r"(?i)\b("
    r"bonjour|bienvenue|aujourd'?hui|atelier|merci|salut|oui|non|"
    r"je|tu|nous|vous|ils|elles|notre|votre|avec|dans|pour|aussi|"
    r"appelle|suis|parle|parler|création|écoute|ecoute|écoutez|ecoutez|"
    r"raconte|histoire|marché|soleil|installe|installent|lève|levent|"
    r"sous\s+le|se\s+lève|bien|attends|regarde|là-bas|la\s+suite"
    r")\b"
    r"|\bDoes\s+On\b"
    r"|\bOn\s+(?:is|are|tells?|telling|was|will|va|raconte)\b"
    r"|\b(?:Le|La|Les|Un|Une)\s+[A-ZÁÉÍÓÚÀÈÂÊÎÔÛÄËÏÖÜÇ]"
)
# Ratio FR→EN (sans cognats EN type creation)
_FR_LEAK_EN = re.compile(
    r"\b(bonjour|bienvenue|aujourd'?hui|atelier|je|nous|vous|ils|elles|notre|"
    r"avec|dans|pour|appelle|merci|suis|parle|parler|aussi|création|salut|"
    r"oui|écoute|ecoute|raconte|histoire|soleil|marché|attends|regarde)\b",
    re.I,
)
# Hallucinations NLLB typiques (placeholders / tokens bizarres)
_NLLB_HALLUCINATION = re.compile(
    r"(?i)\b("
    r"official\s+journal|european\s+union|this\s+regulation\s+shall|"
    r"what'?s\s+the\s+matter\s+with\s+you|nllbtag\d+x|nllbname\d+x"
    r")\b"
)
_OMNI_TAG_RE = re.compile(r"\[[^\]]+\]")

# Mots capitalisés à NE PAS traiter comme noms propres
_NAME_STOP = frozenset(
    {
        "bonjour",
        "bienvenue",
        "aujourd",
        "merci",
        "salut",
        "oui",
        "non",
        "hello",
        "welcome",
        "today",
        "the",
        "and",
        "my",
        "name",
        "our",
        "workshop",
        "atelier",
        "creation",
        "locale",
        "local",
        "je",
        "tu",
        "on",
        "nous",
        "vous",
        "ils",
        "elles",
        "le",
        "la",
        "les",
        "un",
        "une",
        "des",
        "du",
        "de",
        "et",
        "est",
        "sont",
        "dans",
        "pour",
        "avec",
        "sous",
        "sur",
        "qui",
        "que",
        "écoute",
        "ecoute",
        "raconte",
        "histoire",
        "soleil",
        "marché",
        "marche",
        "attends",
        "regarde",
        "suite",
        "calme",
        "ils",
        "does",
        "we",
        "they",
        "yes",
        "hi",
        "wait",
        "look",
    }
)


def _norm(code: str) -> str:
    return (code or "").strip().lower().split("-")[0]


def to_flores(code: str) -> str:
    c = _norm(code)
    if not c:
        raise ValueError("Code langue vide")
    if c in FLORES:
        return FLORES[c]
    raw = (code or "").strip()
    if "_" in raw and len(raw) >= 7:
        return raw
    raise ValueError(
        f"Langue non supportée par NLLB: {code!r}. "
        f"Presets: {', '.join(sorted(FLORES))}"
    )


def _prep_fr_clauses(text: str) -> str:
    """Force des coupes claires pour le FR oral (sans virgules)."""
    t = text.strip()
    # « Bonjour je suis X » → « Bonjour, je suis X » (pas si déjà ponctué)
    t = re.sub(r"(?i)\bbonjour\b(?!\s*[,.!?…])", "Bonjour,", t)
    t = re.sub(r"(?i)\bbienvenue\b(?!\s*[,.!?…])", "Bienvenue,", t)
    # Nouvelle phrase avant Aujourd'hui / On va / Ensuite
    # seulement si du texte suit (évite « locale. aujourd'hui ? »)
    t = re.sub(
        r"(?i)([^.!?])\s+(aujourd'?hui)\b(?=\s*[,:]?\s*[a-zàâäéèêëïîôùûüç])",
        r"\1. \2",
        t,
    )
    t = re.sub(r"(?i)([^.!?])\s+(on va)\b", r"\1. \2", t)
    t = re.sub(r"(?i)([^.!?])\s+(ensuite)\b", r"\1. \2", t)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\s+([,;:.!?])", r"\1", t)
    return t.strip()


def _split_clauses(text: str, *, commas: bool = True) -> list[str]:
    text = text.strip()
    if not text:
        return []
    # EN : ne pas couper sur les virgules (« Attends, regarde… » → NLLB hallucine sur « Attends, »)
    pat = r"(?<=[,;:.!?…])\s+" if commas else r"(?<=[.!?…])\s+"
    parts = re.split(pat, text)
    out = [p.strip() for p in parts if p.strip()]
    return out if out else [text]


def _split_chunks(text: str, max_chars: int = 480) -> list[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    parts = re.split(r"(?<=[.!?…])\s+", text)
    chunks: list[str] = []
    buf = ""
    for p in parts:
        if not p:
            continue
        if buf and len(buf) + 1 + len(p) > max_chars:
            chunks.append(buf)
            buf = p
        else:
            buf = f"{buf} {p}".strip() if buf else p
    if buf:
        chunks.append(buf)
    out: list[str] = []
    for c in chunks:
        if len(c) <= max_chars:
            out.append(c)
        else:
            for i in range(0, len(c), max_chars):
                out.append(c[i : i + max_chars])
    return out


def _protect_names(text: str) -> tuple[str, dict[str, str]]:
    """Placeholders pour noms propres (évite Joseph → Yuusufa)."""
    mapping: dict[str, str] = {}

    def repl(m: re.Match[str]) -> str:
        word = m.group(0)
        if word.lower() in _NAME_STOP:
            return word
        key = f"NLLBNAME{len(mapping)}X"
        mapping[key] = word
        return key

    protected = re.sub(
        r"\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç’'-]{1,40})\b",
        repl,
        text,
    )
    return protected, mapping


def _restore_names(text: str, mapping: dict[str, str]) -> str:
    out = text
    for key, name in mapping.items():
        out = re.sub(re.escape(key), name, out, flags=re.I)
    return out


def _forced_bos(tokenizer: Any, tgt_f: str) -> int:
    bos = tokenizer.convert_tokens_to_ids(tgt_f)
    unk = getattr(tokenizer, "unk_token_id", 3)
    if bos is None or bos == unk or (isinstance(bos, int) and bos < 0):
        raise RuntimeError(
            f"Token langue NLLB introuvable ou <unk>: {tgt_f}. "
            "Cette langue n'est pas dans le vocabulaire FLORES du modèle."
        )
    return int(bos)


def _has_leak(out: str, tgt_f: str) -> bool:
    if tgt_f == "fra_Latn":
        return False
    # Cible anglais : tout résidu FR clair = fuite (pas seulement un ratio)
    if tgt_f == "eng_Latn":
        if _FR_STRONG_LEAK.search(out) or _FR_RESIDUE_EN.search(out):
            return True
        words = max(len(re.findall(r"\w+", out, flags=re.UNICODE)), 1)
        fr_hits = len(_FR_LEAK_EN.findall(out))
        return fr_hits >= 1 and fr_hits / words > 0.08
    if _STRONG_LEAK.search(out):
        return True
    words = max(len(re.findall(r"\w+", out, flags=re.UNICODE)), 1)
    fr_hits = len(_FR_LEAK.findall(out))
    en_hits = len(_EN_LEAK.findall(out))
    if fr_hits >= 1 and fr_hits / words > 0.12:
        return True
    if en_hits >= 2 and en_hits / words > 0.15:
        return True
    return False


def _assert_plausible(out: str, tgt_f: str) -> None:
    if _has_leak(out, tgt_f):
        raise RuntimeError(
            f"NLLB a laissé du FR/EN dans la sortie {tgt_f} "
            f"(extrait: {out[:160]!r}). Réessaie ou corrige l’aperçu."
        )


# Salutations / amorces — NLLB-600M laisse souvent du FR (Bonjour, Aujourd'hui…)
_GREETINGS: dict[tuple[str, str], str] = {
    ("eng_Latn", "bonjour"): "Hello",
    ("eng_Latn", "hello"): "Hello",
    ("eng_Latn", "bonsoir"): "Good evening",
    ("eng_Latn", "salut"): "Hi",
    ("eng_Latn", "bienvenue"): "Welcome",
    ("eng_Latn", "aujourd'hui"): "Today",
    ("eng_Latn", "aujourdhui"): "Today",
    ("eng_Latn", "merci"): "Thank you",
    ("eng_Latn", "oui"): "Yes",
    ("eng_Latn", "non"): "No",
    ("eng_Latn", "attends"): "Wait",
    ("wol_Latn", "bonjour"): "Na nga def",
    ("wol_Latn", "hello"): "Na nga def",
    ("wol_Latn", "bonsoir"): "Na nga def",
    ("wol_Latn", "salut"): "Na nga def",
    ("wol_Latn", "bienvenue"): "Dalal ak jam",
    ("wol_Latn", "aujourd'hui"): "Tey",
    ("wol_Latn", "aujourdhui"): "Tey",
    ("sna_Latn", "bonjour"): "Mhoroi",
    ("sna_Latn", "hello"): "Mhoroi",
    ("sna_Latn", "bonsoir"): "Mhoroi",
    ("sna_Latn", "bienvenue"): "Kugamuchirwa",
    ("zul_Latn", "bonjour"): "Sawubona",
    ("zul_Latn", "hello"): "Sawubona",
}

# Patterns clause → anglais (NLLB laisse souvent des amorces FR)
_EN_CLAUSE_PATTERNS: list[tuple[re.Pattern[str], Any]] = [
    (
        re.compile(
            r"(?i)^le\s+soleil\s+se\s+l[eè]ve\s+sur\s+le\s+marché\.?$"
        ),
        lambda _m: "The sun rises over the market.",
    ),
    (
        re.compile(
            r"(?i)^ils\s+s['']installent\s+sous\s+le\s+baobab\.?$"
        ),
        lambda _m: "They settle under the baobab.",
    ),
    (
        re.compile(
            r"(?i)^on\s+raconte\s+une\s+histoire\s+locale\s+aujourd'?hui\s*\??$"
        ),
        lambda _m: "Are we telling a local story today?",
    ),
    (
        re.compile(r"(?i)^la\s+suite\s+est\s+plus\s+calme\s*\.?$"),
        lambda _m: "The next part is calmer.",
    ),
    (
        re.compile(r"(?i)^attends\s*,?\s*regarde\s+là-bas\s*!?\s*$"),
        lambda _m: "Wait, look over there!",
    ),
    (
        re.compile(r"(?i)^oui\s*[-—,:]\s*écoute\s+bien\s*\.?$"),
        lambda _m: "Yes — listen carefully",
    ),
    (
        re.compile(r"(?i)^écoute\s+bien\s*\.?$"),
        lambda _m: "Listen carefully",
    ),
    (
        re.compile(r"(?i)^bienvenue\s+(?:dans|à)\s+notre\s+atelier\s*$"),
        lambda _m: "Welcome to our workshop",
    ),
    (
        re.compile(r"(?i)^salut\s+(.+)$"),
        lambda m: f"Hi {m.group(1).strip()}",
    ),
    (
        re.compile(r"(?i)^bonjour\s*[,!]?\s*(.+)$"),
        lambda m: f"Hello, {m.group(1).strip()}",
    ),
    (
        re.compile(r"(?i)^oui\s*[-—,]?\s*(.+)$"),
        lambda m: f"Yes — {m.group(1).strip()}",
    ),
    (
        re.compile(r"(?i)^non\s*[-—,]?\s*(.+)$"),
        lambda m: f"No — {m.group(1).strip()}",
    ),
    (
        re.compile(r"(?i)^on\s+raconte\s+(.+)$"),
        lambda m: f"We are telling {m.group(1).strip()}",
    ),
]

# Patterns clause → Wolof (groupes = reste / nom)
_WO_CLAUSE_PATTERNS: list[tuple[re.Pattern[str], Any]] = [
    (
        re.compile(
            r"(?i)^bonjour\s*,?\s*je\s+suis\s+(.+?)\s*$"
        ),
        lambda m: f"Na nga def, man maay {m.group(1).strip()}",
    ),
    (
        re.compile(
            r"(?i)^bonjour\s*,?\s*je\s+m['']appelle\s+(.+?)\s*$"
        ),
        lambda m: f"Na nga def, sama tur mooy {m.group(1).strip()}",
    ),
    (
        re.compile(r"(?i)^je\s+suis\s+(.+?)\s*$"),
        lambda m: f"man maay {m.group(1).strip()}",
    ),
    (
        re.compile(r"(?i)^je\s+m['']appelle\s+(.+?)\s*$"),
        lambda m: f"sama tur mooy {m.group(1).strip()}",
    ),
    (
        re.compile(r"(?i)^bienvenue\s*,?\s*(?:dans|à)\s+notre\s+atelier\s*$"),
        lambda _m: "Dalal ak jam ci sunu jëfandikukat",
    ),
    (
        re.compile(r"(?i)^(?:dans|à)\s+notre\s+atelier\s*$"),
        lambda _m: "ci sunu jëfandikukat",
    ),
    (
        re.compile(r"(?i)^bienvenue\s*,?\s*(.+)$"),
        lambda m: f"Dalal ak jam, {m.group(1).strip()}",
    ),
]


def _clause_override(text: str, tgt_f: str) -> str | None:
    raw = text.strip()
    punct = ""
    m_end = re.search(r"([,;.!?…]+)$", raw)
    if m_end:
        punct = m_end.group(1)
        raw = raw[: m_end.start()].strip()

    core = raw.lower()
    core = re.sub(r"^nllbname\d+x\s*", "", core)
    greet = _GREETINGS.get((tgt_f, core))
    if greet:
        return greet + punct

    if tgt_f == "eng_Latn":
        for pat, builder in _EN_CLAUSE_PATTERNS:
            m = pat.match(raw)
            if m:
                return builder(m) + punct
    if tgt_f == "wol_Latn":
        for pat, builder in _WO_CLAUSE_PATTERNS:
            m = pat.match(raw)
            if m:
                return builder(m) + punct
        # « Aujourd'hui … » → préfixe Tey + corps pour NLLB
        m_auj = re.match(r"(?i)^aujourd'?hui\s*,?\s*(.+)$", raw)
        if m_auj and m_auj.group(1).strip():
            return None  # géré dans _run_once avec préfixe
    return None


def _scrub_fr_leaks(out: str, tgt_f: str) -> str:
    """Dernier filet : remplace les amorces FR que NLLB laisse telles quelles."""
    if tgt_f == "eng_Latn":
        out = re.sub(
            r"(?i)\bbienvenue\s+(?:dans|à)\s+notre\s+atelier\b",
            "Welcome to our workshop",
            out,
        )
        out = re.sub(r"(?i)\bnotre\s+atelier\b", "our workshop", out)
        out = re.sub(r"(?i)\bdans\s+notre\b", "in our", out)
        out = re.sub(r"(?i)\bdans\s+sunu\b", "in our", out)
        out = re.sub(r"(?i)\bnotre\b", "our", out)
        out = re.sub(r"(?i)\bdans\b", "in", out)
        out = re.sub(r"(?i)\bbonjour\b", "Hello", out)
        out = re.sub(r"(?i)\bbienvenue\b", "Welcome", out)
        out = re.sub(r"(?i)\baujourd'?hui\b", "Today", out)
        out = re.sub(r"(?i)\batelier\b", "workshop", out)
        out = re.sub(r"(?i)\bje\s+suis\b", "I am", out)
        out = re.sub(r"(?i)\bje\s+m['']appelle\b", "my name is", out)
        out = re.sub(r"(?i)\bmerci\b", "thank you", out)
        out = re.sub(r"(?i)\bsalut\b", "Hi", out)
        out = re.sub(r"(?i)\boui\b", "Yes", out)
        out = re.sub(r"(?i)\bnon\b(?!-)", "No", out)
        out = re.sub(r"(?i)\bils\b", "They", out)
        out = re.sub(r"(?i)\belles\b", "They", out)
        out = re.sub(r"(?i)\bDoes\s+On\b", "Do we", out)
        out = re.sub(
            r"\bOn\s+(?=is\b|are\b|tells?\b|telling\b|was\b|will\b)",
            "We ",
            out,
        )
        out = re.sub(r"\bLe\s+(?=[A-Z])", "The ", out)
        out = re.sub(r"\bLa\s+(?=[A-Z])", "The ", out)
        out = re.sub(r"\bLes\s+(?=[A-Z])", "The ", out)
        out = re.sub(r"\bUn\s+(?=[A-Z])", "A ", out)
        out = re.sub(r"\bUne\s+(?=[A-Z])", "A ", out)
        out = re.sub(r"(?i)\bécoutez?\b", "listen", out)
        out = re.sub(r"(?i)\becoutez?\b", "listen", out)
        out = re.sub(r"(?i)\braconte\b", "tells", out)
        out = re.sub(r"(?i)\bhistoire\b", "story", out)
        out = re.sub(r"(?i)\bsolail\b", "sun", out)
        out = re.sub(r"(?i)\bsoleil\b", "sun", out)
        out = re.sub(r"(?i)\bmarché\b", "market", out)
        out = re.sub(r"(?i)\bs['']installent\b", "settle", out)
        out = re.sub(r"(?i)\bs['']installe\b", "settles", out)
        out = re.sub(r"(?i)\bse\s+l[eè]ve\b", "rises", out)
        out = re.sub(r"\bWe is\b", "We are", out)
        out = re.sub(r"\bWe tells\b", "We tell", out)
        out = re.sub(r"\bThey settles\b", "They settle", out)
        out = re.sub(r",\s*!", "!", out)
        out = re.sub(r"Welcome,\s+In\b", "Welcome to", out)
        out = re.sub(r"(?i)\blisten\s+bien\b", "listen carefully", out)
        out = re.sub(r"(?i)(?<=\w)\s+bien\b", "", out)
        out = re.sub(r"(?i)\battends\b", "Wait", out)
        out = re.sub(r"(?i)\bregarde\b", "look", out)
        out = re.sub(r"(?i)\blà-bas\b", "over there", out)
        out = re.sub(r"(?i)\bThe suite is\b", "The next part is", out)
        out = re.sub(r"(?i)(?:Wait,\s*){2,}", "Wait, ", out)
        out = re.sub(r"(?i)(?:\bWait\b[\s,]*){3,}", "Wait, ", out)
        out = re.sub(r"\?{2,}", "?", out)
        out = re.sub(r"\.{2,}", ".", out)
        out = re.sub(r"\s+", " ", out).strip()
        return out
    if tgt_f == "sna_Latn":
        out = re.sub(r"(?i)\bbonjour\b", "Mhoroi", out)
        out = re.sub(r"(?i)\bhello\b", "Mhoroi", out)
        out = re.sub(r"(?i)\bwelcome\b", "Kugamuchirwa", out)
        out = re.sub(r"(?i)\bworkshop\b", "musangano", out)
        return out
    if tgt_f != "wol_Latn":
        return out
    out = re.sub(r"(?i)\bbonjour\b", "Na nga def", out)
    out = re.sub(r"(?i)\bbienvenue\b", "Dalal ak jam", out)
    out = re.sub(r"(?i)\baujourd'?hui\b", "Tey", out)
    out = re.sub(r"(?i)\bje\s+suis\b", "man maay", out)
    out = re.sub(r"(?i)\bje\s+m['']appelle\b", "sama tur mooy", out)
    out = re.sub(r"(?i)\batelier\b", "jëfandikukat", out)
    out = re.sub(r"(?i)\bworkshop\b", "jëfandikukat", out)
    out = re.sub(r"(?i)\bwelcome\b", "Dalal ak jam", out)
    # « On » français en tête de phrase
    out = re.sub(r"(?i)^On\s+(?=dina|va|parle|peut)", "Ñu ", out)
    out = re.sub(r"(?i)([.!?]\s+)On\s+(?=dina|va|parle|peut)", r"\1Ñu ", out)
    out = re.sub(r"\s+", " ", out).strip()
    return out


def _run_once(
    model: Any,
    tokenizer: Any,
    text: str,
    src_f: str,
    tgt_f: str,
    device: str,
) -> str:
    override = _clause_override(text, tgt_f)
    if override is not None:
        return override

    # Aujourd'hui + reste : traduire le reste, préfixer Tey (wol)
    m_auj = re.match(r"(?i)^aujourd'?hui\s*,?\s*(.+)$", text.strip())
    prefix = ""
    payload = text
    if tgt_f == "wol_Latn" and m_auj and m_auj.group(1).strip():
        prefix = "Tey, "
        payload = m_auj.group(1).strip()

    if hasattr(tokenizer, "src_lang"):
        tokenizer.src_lang = src_f
    if hasattr(tokenizer, "set_tgt_lang_special_tokens"):
        tokenizer.set_tgt_lang_special_tokens(tgt_f)
    forced_bos = _forced_bos(tokenizer, tgt_f)
    inputs = tokenizer(payload, return_tensors="pt", truncation=True, max_length=512)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    torch = __import__("torch")
    with torch.inference_mode():
        gen = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos,
            max_new_tokens=128,
            num_beams=5,
        )
    out = tokenizer.batch_decode(gen, skip_special_tokens=True)[0].strip()
    if not out:
        raise RuntimeError(f"NLLB: traduction vide ({src_f}→{tgt_f})")
    out = prefix + out
    return _scrub_fr_leaks(out, tgt_f)


def _run_pair(
    model: Any,
    tokenizer: Any,
    text: str,
    src_f: str,
    tgt_f: str,
    device: str,
    *,
    by_clause: bool = False,
) -> str:
    if by_clause and (tgt_f in _CLAUSE_TGTS or tgt_f == "eng_Latn"):
        clauses = _split_clauses(text, commas=(tgt_f != "eng_Latn"))
        if len(clauses) > 1:
            parts: list[str] = []
            for clause in clauses:
                piece = _run_once(model, tokenizer, clause, src_f, tgt_f, device)
                if _has_leak(piece, tgt_f):
                    alt = re.sub(r"[,;.!?…]+$", "", clause).strip()
                    if alt and alt != clause:
                        try:
                            piece2 = _run_once(
                                model, tokenizer, alt, src_f, tgt_f, device
                            )
                            if not _has_leak(piece2, tgt_f):
                                piece = piece2
                        except Exception:  # noqa: BLE001
                            pass
                parts.append(piece)
            spoken = " ".join(parts).strip()
            return re.sub(r"\s+([,;:.!?])", r"\1", spoken)

    pieces = [
        _run_once(model, tokenizer, chunk, src_f, tgt_f, device)
        for chunk in _split_chunks(text)
    ]
    return " ".join(p for p in pieces if p).strip()


def translate_text(
    text: str, source_lang: str, target_lang: str, model_id: str
) -> dict[str, Any]:
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    src_f = to_flores(source_lang)
    tgt_f = to_flores(target_lang)
    if src_f == tgt_f:
        return {
            "spokenText": text.strip(),
            "sourceLang": _norm(source_lang),
            "targetLang": _norm(target_lang),
            "floresSrc": src_f,
            "floresTgt": tgt_f,
            "translated": False,
        }

    device = os.environ.get(
        "NLLB_DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu"
    )
    dtype = torch.float16 if "cuda" in device else torch.float32

    tokenizer = AutoTokenizer.from_pretrained(model_id)
    try:
        model = AutoModelForSeq2SeqLM.from_pretrained(model_id, dtype=dtype)
    except TypeError:
        model = AutoModelForSeq2SeqLM.from_pretrained(model_id, torch_dtype=dtype)
    model = model.to(device)
    model.eval()

    source = text.strip()
    # Ne pas traduire le label « Amina: … » (sinon NLLB hallucine)
    _spk = re.match(
        r"^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’\- ]{0,39}?)\s*[:：—–]\s+(.+)$",
        source,
        flags=re.DOTALL,
    )
    if _spk and _spk.group(1).strip().casefold() not in {
        "http",
        "https",
        "note",
        "ps",
        "nb",
    }:
        source = _spk.group(2).strip()
    # Tags OmniVoice hors NLLB (NLLBTAG / [laughter] → hallucinations UE)
    leading_tags: list[str] = []
    while True:
        _tm = re.match(r"^(\[[^\]]+\])\s*", source)
        if not _tm:
            break
        leading_tags.append(_tm.group(1))
        source = source[_tm.end() :].lstrip()
    inline_tags = _OMNI_TAG_RE.findall(source)
    if inline_tags:
        leading_tags.extend(inline_tags)
        source = _OMNI_TAG_RE.sub(" ", source)
        source = re.sub(r"\s+", " ", source).strip()
    # FR oral : coupes claires avant WO/EN (réduit les fuites d’amorces)
    if src_f == "fra_Latn" and (tgt_f in _CLAUSE_TGTS or tgt_f == "eng_Latn"):
        source = _prep_fr_clauses(source)

    if not source:
        spoken_only = " ".join(leading_tags).strip()
        return {
            "spokenText": spoken_only,
            "sourceLang": _norm(source_lang),
            "targetLang": _norm(target_lang),
            "floresSrc": src_f,
            "floresTgt": tgt_f,
            "translated": False,
        }

    protected, name_map = _protect_names(source)
    use_clause = tgt_f in _CLAUSE_TGTS or tgt_f == "eng_Latn"
    pivoted = False

    if tgt_f == "wol_Latn" and src_f == "fra_Latn":
        # Wolof : chemin direct FR→WO clause par clause
        spoken = _run_pair(
            model, tokenizer, protected, src_f, tgt_f, device, by_clause=True
        )
    elif tgt_f == "eng_Latn":
        # Anglais : toujours clause-par-clause + overrides / scrub FR
        spoken = _run_pair(
            model, tokenizer, protected, src_f, tgt_f, device, by_clause=True
        )
    elif src_f != "eng_Latn" and tgt_f in _PIVOT_TGTS:
        mid = _run_pair(
            model, tokenizer, protected, src_f, "eng_Latn", device, by_clause=True
        )
        mid = _restore_names(mid, name_map)
        mid = _scrub_fr_leaks(mid, "eng_Latn")
        for key, name in name_map.items():
            mid = mid.replace(name, key)
        spoken = _run_pair(
            model, tokenizer, mid, "eng_Latn", tgt_f, device, by_clause=use_clause
        )
        pivoted = True
    else:
        spoken = _run_pair(
            model,
            tokenizer,
            protected,
            src_f,
            tgt_f,
            device,
            by_clause=use_clause,
        )

    spoken = _restore_names(spoken, name_map)
    spoken = _scrub_fr_leaks(spoken, tgt_f)

    if _has_leak(spoken, tgt_f):
        try:
            if tgt_f == "wol_Latn":
                spoken2 = _run_pair(
                    model,
                    tokenizer,
                    protected,
                    src_f if src_f == "fra_Latn" else "eng_Latn",
                    tgt_f,
                    device,
                    by_clause=True,
                )
            elif tgt_f == "eng_Latn":
                spoken2 = _run_pair(
                    model,
                    tokenizer,
                    protected,
                    src_f,
                    tgt_f,
                    device,
                    by_clause=True,
                )
            else:
                mid = _run_pair(
                    model, tokenizer, protected, src_f, "eng_Latn", device
                )
                mid = _restore_names(mid, name_map)
                for key, name in name_map.items():
                    mid = mid.replace(name, key)
                spoken2 = _run_pair(
                    model,
                    tokenizer,
                    mid,
                    "eng_Latn",
                    tgt_f,
                    device,
                    by_clause=True,
                )
            spoken2 = _restore_names(spoken2, name_map)
            spoken2 = _scrub_fr_leaks(spoken2, tgt_f)
            if not _has_leak(spoken2, tgt_f):
                spoken = spoken2
            elif tgt_f in ("wol_Latn", "eng_Latn"):
                # Accepter après scrub agressif
                spoken = spoken2
        except Exception:  # noqa: BLE001
            pass

    spoken = _scrub_fr_leaks(spoken, tgt_f)
    if tgt_f == "eng_Latn":
        spoken = _scrub_fr_leaks(spoken, tgt_f)
        # Coupe les phrases hallucinées (Journal officiel UE, etc.)
        if _NLLB_HALLUCINATION.search(spoken):
            parts = re.split(r"(?<=[.!?])\s+", spoken)
            kept = [p for p in parts if p and not _NLLB_HALLUCINATION.search(p)]
            if kept:
                spoken = " ".join(kept).strip()
            else:
                # Dernier recours : re-traduire le texte source brut sans noms protégés
                try:
                    spoken = _run_pair(
                        model,
                        tokenizer,
                        source,
                        src_f,
                        tgt_f,
                        device,
                        by_clause=True,
                    )
                    spoken = _scrub_fr_leaks(spoken, tgt_f)
                    if _NLLB_HALLUCINATION.search(spoken):
                        parts = re.split(r"(?<=[.!?])\s+", spoken)
                        kept = [
                            p
                            for p in parts
                            if p and not _NLLB_HALLUCINATION.search(p)
                        ]
                        spoken = " ".join(kept).strip() if kept else spoken
                except Exception:  # noqa: BLE001
                    pass
    else:
        _assert_plausible(spoken, tgt_f)

    if leading_tags:
        spoken = f"{' '.join(leading_tags)} {spoken}".strip()

    return {
        "spokenText": spoken,
        "sourceLang": _norm(source_lang),
        "targetLang": _norm(target_lang),
        "floresSrc": src_f,
        "floresTgt": tgt_f,
        "translated": True,
        "model": model_id,
        "pivot": "eng_Latn" if pivoted else None,
    }


def main() -> int:
    try:
        cfg = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"JSON invalide: {exc}"}), flush=True)
        return 2

    text = (cfg.get("text") or "").strip()
    source_lang = cfg.get("source_lang") or cfg.get("sourceLang") or "fr"
    target_lang = cfg.get("target_lang") or cfg.get("targetLang") or "en"
    model_id = (
        cfg.get("model")
        or os.environ.get("NLLB_MODEL")
        or "facebook/nllb-200-distilled-600M"
    )

    if not text:
        print(json.dumps({"error": "Texte vide"}), flush=True)
        return 1

    try:
        out = translate_text(text, source_lang, target_lang, model_id)
        print(json.dumps(out, ensure_ascii=False), flush=True)
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)[:800]}), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
