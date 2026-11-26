#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ $# == 0 ]]; then
  set -- --render
fi
exec bash scripts/setup.sh "$@"
