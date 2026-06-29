#!/usr/bin/env bash
# Capture 12-Q answers from RC2 under 3 LLM configs (flash / flash-lite / inference).
# Boots the local dev-server once per config (clean provider-singleton isolation),
# runs the variant capture against localhost:3005, kills the server between runs.
set -uo pipefail

RC2=~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia
OUTDIR=/Users/arijitchowdhury/Dropbox/AI-Development/RAG/Algolia-Central2/scripts/setup/h2h/runs
mkdir -p "$OUTDIR"
cd "$RC2" || exit 1

INFER_KEY="$(node -e 'require("dotenv").config({path:".env.local"});process.stdout.write(process.env.ALGOLIA_INFERENCE_API_KEY||"")')"

wait_ready() {
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3005/api/search \
         -H 'Content-Type: application/json' -d '{"query":"ping","sessionId":"ready"}' --max-time 8 2>/dev/null | grep -q '200'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

run_config() {
  local label="$1"; shift
  echo "════════ CONFIG: $label ════════"
  # env for this config passed as KEY=VAL args
  env "$@" LOG_LEVEL=warn npx tsx dev-server.mjs > "/tmp/dev-$label.log" 2>&1 &
  local pid=$!
  echo "dev-server pid=$pid, waiting for ready..."
  if ! wait_ready; then echo "DEV SERVER NOT READY for $label — log:"; tail -15 "/tmp/dev-$label.log"; kill $pid 2>/dev/null; return 1; fi
  echo "ready. capturing 12 Qs..."
  DEMO_API_URL=http://localhost:3005 SYSTEM="$label" OUT_FILE="$OUTDIR/${label}_answers.json" npx tsx eval/h2h-variant.ts
  kill $pid 2>/dev/null; wait $pid 2>/dev/null
  sleep 2
}

run_config flash       LLM_PROVIDER=gemini LLM_MODEL=gemini-2.5-flash
run_config flash-lite  LLM_PROVIDER=gemini LLM_MODEL=gemini-2.5-flash-lite
run_config inference   LLM_PROVIDER=openai LLM_MODEL=medium LLM_BASE_URL=https://inference-us.api.enablers.algolia.net/v1 OPENAI_API_KEY="$INFER_KEY"

echo "════════ DONE ════════"
ls -la "$OUTDIR"
