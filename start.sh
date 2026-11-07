#!/usr/bin/env bash
set -euo pipefail

run() {
  /usr/bin/time -p "$@"
}

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$SCRIPT_DIR" != "${BASH_SOURCE[0]}" ]] || SCRIPT_DIR=.
cd "$SCRIPT_DIR"
PROJECT_DIR="$(run pwd -P)"
PORT="${PORT:-3000}"
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )) || { echo 'PORT must be an integer from 1 to 65535.' >&2; exit 1; }

STATIC_DIR="$PROJECT_DIR"
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  if [[ -f "$PROJECT_DIR/package-lock.json" || -f "$PROJECT_DIR/npm-shrinkwrap.json" ]]; then
    run npm ci
  else
    run npm install
  fi
  if run node -e 'const p=require(process.argv[1]); process.exit(p.scripts?.build ? 0 : 1)' "$PROJECT_DIR/package.json"; then
    run npm run build
    if [[ -d "$PROJECT_DIR/dist" ]]; then
      STATIC_DIR="$PROJECT_DIR/dist"
    elif [[ -d "$PROJECT_DIR/build" ]]; then
      STATIC_DIR="$PROJECT_DIR/build"
    fi
  fi
fi

[[ -f "$STATIC_DIR/index.html" ]] || { echo "No built index.html found in $STATIC_DIR" >&2; exit 1; }
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must be set for deployment metadata}"
run mkdir -p "$OPENCODE_WEB_DIR"
run python3 -c 'import json,os,sys; json.dump({"project":sys.argv[1],"directory":sys.argv[2]},open(sys.argv[3],"w"),separators=(",",":")); print()' \
  "$PROJECT_DIR" "$STATIC_DIR" "$OPENCODE_WEB_DIR/deployment-output.json"
echo "Serving $STATIC_DIR on port $PORT"
run python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$STATIC_DIR"
