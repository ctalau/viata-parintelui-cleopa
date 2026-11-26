#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
  echo 'Instalează Node.js 24 înainte de setup.' >&2
  exit 1
fi
npm ci

case "${1:-}" in
  '') ;;
  --animation)
    for program in blender python3 ffmpeg ffprobe; do
      command -v "$program" >/dev/null || { echo "Lipsește $program." >&2; exit 1; }
    done
    python3 -m venv .venv
    .venv/bin/python -m pip install -r scripts/requirements-animation.txt
    blender --version | sed -n '1p'
    if [[ -z "${CHROMIUM_BIN:-}" ]]; then
      npx playwright install chromium
    fi
    ;;
  *) echo 'Utilizare: bash scripts/setup.sh [--animation]' >&2; exit 2 ;;
esac
npm run build
