#!/usr/bin/env bash
# Télécharge Piper (linux x86_64) + voix FR siwis-medium.
set -euo pipefail
cd "$(dirname "$0")/.."
MODELS_DIR="$(pwd)/models/piper"
BIN_DIR="$(pwd)/bin"
mkdir -p "$MODELS_DIR" "$BIN_DIR"

PIPER_VERSION="${PIPER_VERSION:-2023.11.14-2}"
VOICE="fr_FR-siwis-medium"
VOICE_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium"

echo "==> Piper binary → $BIN_DIR"
if [[ ! -x "$BIN_DIR/piper" ]]; then
  ARCHIVE="piper_linux_x86_64.tar.gz"
  URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/${ARCHIVE}"
  TMP="$(mktemp -d)"
  curl -fsSL "$URL" -o "$TMP/$ARCHIVE"
  tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
  # archive contient un dossier piper/
  if [[ -x "$TMP/piper/piper" ]]; then
    cp -a "$TMP/piper/." "$BIN_DIR/"
  else
    find "$TMP" -type f -name piper -executable -exec cp {} "$BIN_DIR/piper" \;
  fi
  chmod +x "$BIN_DIR/piper"
  rm -rf "$TMP"
fi

echo "==> Voix $VOICE → $MODELS_DIR"
if [[ ! -f "$MODELS_DIR/${VOICE}.onnx" ]]; then
  curl -fsSL "${VOICE_BASE}/${VOICE}.onnx" -o "$MODELS_DIR/${VOICE}.onnx"
  curl -fsSL "${VOICE_BASE}/${VOICE}.onnx.json" -o "$MODELS_DIR/${VOICE}.onnx.json"
fi

echo ""
echo "OK. Ajoutez à worker/.env :"
echo "  PIPER_BIN=$BIN_DIR/piper"
echo "  PIPER_MODEL_PATH=$MODELS_DIR/${VOICE}.onnx"
