#!/usr/bin/env bash
# Smoke test del flujo MVP (requiere backend en :3000 y variables en .env).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "== Health =="
curl -sf "$BASE/health" | head -c 200
echo

EMAIL="smoke_$(date +%s)@test.local"
PASS="smoke-pass-12345"

echo "== Register =="
REG=$(curl -sf -c "$COOKIE_JAR" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Agency\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$REG" | head -c 120
echo

echo "== Create case =="
CASE=$(curl -sf -b "$COOKIE_JAR" -X POST "$BASE/api/cases" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Cliente Smoke","email":"cliente@test.local"}')
CASE_ID=$(echo "$CASE" | node -pe "JSON.parse(require('fs').readFileSync(0)).case.id")
TOKEN=$(echo "$CASE" | node -pe "JSON.parse(require('fs').readFileSync(0)).case.magicToken")
DOC_ID=$(echo "$CASE" | node -pe "JSON.parse(require('fs').readFileSync(0)).case.documents.find(d=>d.key==='proof_address').id")
echo "case=$CASE_ID token=$TOKEN doc=$DOC_ID"

echo "== GET magic =="
curl -sf "$BASE/api/magic/$TOKEN" | node -pe "const c=JSON.parse(require('fs').readFileSync(0)).case; console.log('docs',c.documents.length,'progress',c.progress)"

echo "== Upload proof_address (PNG mínimo) =="
PNG=$(node -pe "Buffer.from('89504e470d0a1a0a0000000d494844520000000108060000001f15c4890000000a49444154789c6300010000000500010d0a2db40000000049454e44ae426082','hex')")
TMP=$(mktemp --suffix=.png)
echo -n "$PNG" > "$TMP"
UP=$(curl -sf -X POST "$BASE/api/magic/$TOKEN/upload" -F "docId=$DOC_ID" -F "file=@$TMP;type=image/png")
rm -f "$TMP"
echo "$UP" | node -pe "const c=JSON.parse(require('fs').readFileSync(0)).case; console.log('progress',c.progress)"

echo "== Reject document =="
curl -sf -b "$COOKIE_JAR" -X PATCH "$BASE/api/cases/$CASE_ID/documents/$DOC_ID/review" \
  -H "Content-Type: application/json" \
  -d '{"status":"rejected","feedbackMessage":"Documento ilegible en smoke test"}' \
  | node -pe "const c=JSON.parse(require('fs').readFileSync(0)).case; console.log('hasRejectedDocuments',c.hasRejectedDocuments)"

echo "== GET cases list =="
curl -sf -b "$COOKIE_JAR" "$BASE/api/cases" \
  | node -pe "const r=JSON.parse(require('fs').readFileSync(0)).cases.find(c=>c.id==='$CASE_ID'); console.log(JSON.stringify({progress:r.progress,hasRejectedDocuments:r.hasRejectedDocuments}))"

echo "Smoke OK"
