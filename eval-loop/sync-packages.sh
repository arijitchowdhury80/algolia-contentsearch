#!/usr/bin/env bash
# Sync the canonical package sources into the plugin so eval-loop/ is a
# self-contained, portable artifact. Canonical source lives in lab/{judge,
# autocorrect}; this copies their src + package.json into eval-loop/packages/.
# Run from the repo root or anywhere: paths are resolved relative to this file.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

for pkg in judge autocorrect; do
  src="$ROOT/lab/$pkg"
  dst="$HERE/packages/$pkg"
  rm -rf "$dst"
  mkdir -p "$dst"
  cp -R "$src/src" "$dst/src"
  cp "$src/package.json" "$dst/package.json"
  [ -f "$src/tsconfig.json" ] && cp "$src/tsconfig.json" "$dst/tsconfig.json" || true
  echo "synced lab/$pkg -> packages/$pkg"
done
echo "done. eval-loop/packages/ is a snapshot of the canonical lab/ sources."
