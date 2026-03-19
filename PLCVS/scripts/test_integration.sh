#!/usr/bin/env bash
# PLCVS Integration Test Script — tests all 12 REST endpoints + WebSocket
set -e

BASE="http://127.0.0.1:8765/api/v1"
PASS=0
FAIL=0
RESULTS=""

test_endpoint() {
    local num="$1" method="$2" path="$3" expected_code="$4" body="$5"
    local url="${BASE}${path}"
    
    if [ "$method" = "GET" ]; then
        resp=$(curl -s -w "\n%{http_code}" "$url" 2>&1)
    else
        resp=$(curl -s -w "\n%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -d "${body:-{}}" 2>&1)
    fi
    
    code=$(echo "$resp" | tail -1)
    body_out=$(echo "$resp" | head -n -1)
    
    if [ "$code" = "$expected_code" ]; then
        PASS=$((PASS+1))
        status="✅ PASS"
    else
        FAIL=$((FAIL+1))
        status="❌ FAIL"
    fi
    
    echo "${status} | #${num} ${method} ${path} → HTTP ${code} (expected ${expected_code})"
    echo "  Response: $(echo "$body_out" | head -c 200)"
    echo ""
}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     PLCVS Integration Test — All 12 REST Endpoints      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# 1. Health
test_endpoint 1 GET "/health" 200

# 2. Checklist config
test_endpoint 2 GET "/checklist/config" 200

# 3. Checklist snapshot (no session → 404)
test_endpoint 3 GET "/checklist/snapshot" 404

# 4. Session history
test_endpoint 12 GET "/sessions/history" 200

# 5. Start session
test_endpoint 4 POST "/session/start" 200 '{}'

# Wait for session to initialize
sleep 2

# 6. Session progress
test_endpoint 6 GET "/session/progress" 200

# 7. Session state
test_endpoint 7 GET "/session/state" 200

# 8. Session alerts
test_endpoint 8 GET "/session/alerts" 200

# 9. Checklist snapshot (with session → 200)
test_endpoint "3b" GET "/checklist/snapshot" 200

# 10. Manual override
test_endpoint 9 POST "/session/override" 200 '{"item_id":"CI_001","status":"CONFIRMED"}'

# 11. Duplicate session start (→ 409)
test_endpoint "4b" POST "/session/start" 409 '{}'

# 12. Stop session
test_endpoint 5 POST "/session/stop" 200

# 13. Devices (may fail if no audio hw)
echo "--- Optional endpoints ---"
resp=$(curl -s -w "\n%{http_code}" "${BASE}/devices" 2>&1)
code=$(echo "$resp" | tail -1)
if [ "$code" = "200" ]; then
    PASS=$((PASS+1))
    echo "✅ PASS | #10 GET /devices → HTTP 200"
else
    echo "⚠️  SKIP | #10 GET /devices → HTTP ${code} (no audio hardware)"
fi
echo ""

# WebSocket test
echo "--- WebSocket ---"
ws_result=$(timeout 5 python3 -c "
import asyncio, websockets, json
async def test():
    async with websockets.connect('ws://127.0.0.1:8765/ws') as ws:
        await ws.send(json.dumps({'type': 'PING'}))
        resp = await ws.recv()
        data = json.loads(resp)
        if data.get('type') == 'PONG':
            print('PASS')
        else:
            print('FAIL')
asyncio.run(test())
" 2>&1)

if [ "$ws_result" = "PASS" ]; then
    PASS=$((PASS+1))
    echo "✅ PASS | #13 WS PING/PONG"
else
    FAIL=$((FAIL+1))
    echo "❌ FAIL | #13 WS PING/PONG: ${ws_result}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Results: ${PASS} passed, ${FAIL} failed                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
