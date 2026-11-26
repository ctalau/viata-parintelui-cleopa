#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:---site}" in
  --site|--render|--animation) mode="${1:---site}" ;;
  *) echo 'Utilizare: ./setup.sh [--render | --site | --animation]' >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  echo 'Alege un singur mod: --render, --site sau --animation.' >&2
  exit 2
fi

require_program() {
  command -v "$1" >/dev/null || { echo "Instalează $1 și adaugă-l în PATH." >&2; exit 1; }
}

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
  echo 'Instalează Node.js 24 înainte de setup.' >&2
  exit 1
fi
if [[ "$mode" != --site ]]; then
  require_program ffmpeg
  require_program ffprobe
  if [[ -n "${CHROMIUM_BIN:-}" ]]; then require_program "$CHROMIUM_BIN"; fi
fi
if [[ "$mode" == --animation ]]; then
  require_program blender
  require_program python3
fi

npm ci
if [[ "$mode" == --animation ]]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install -r scripts/requirements-animation.txt
  blender --version | sed -n '1p'
fi
if [[ "$mode" != --site && -z "${CHROMIUM_BIN:-}" ]]; then
  npx playwright install chromium
fi
npm run build
printf '\nPornește atelierul cu npm run preview.\n'
if [[ "$mode" != --site ]]; then
  printf 'Randează un clip cu npm run render:scene -- painea-pe-masa.\n'
fi
