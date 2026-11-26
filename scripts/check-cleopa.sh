#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
blender_bin="${BLENDER_BIN:-blender}"
flags=(-b --factory-startup --python-exit-code 1)

(
  cd experiments/cleopa-blender
  "$blender_bin" "${flags[@]}" --python scripts/smoke_test.py
  "$blender_bin" "${flags[@]}" --python scripts/verify_project.py
)
(
  cd experiments/cleopa-painea
  "$blender_bin" "${flags[@]}" --python scripts/verify_episode.py
  "$blender_bin" "${flags[@]}" scenes/painea_care_poate_sa_astepte.blend \
    --python scripts/check_overlaps.py -- --step 1 "$@"
  ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 \
    "$root/experiments/cleopa-painea/renders/painea_care_poate_sa_astepte.mp4"
)
