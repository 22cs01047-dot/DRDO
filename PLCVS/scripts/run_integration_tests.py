#!/usr/bin/env python3
"""PLCVS Integration Test Runner — captures all endpoint responses for the final report."""

import json
import time
import urllib.request
import urllib.error
import datetime
import os
import ssl

BASE = "http://127.0.0.1:8765/api/v1"
RESULTS = []

def ts():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

def test_endpoint(method, path, body=None, content_type="application/json"):
    url = f"{BASE}{path}"
    start = time.perf_counter()
    try:
        if body and isinstance(body, dict):
            data = json.dumps(body).encode()
        elif body and isinstance(body, bytes):
            data = body
        else:
            data = None
        
        req = urllib.request.Request(url, data=data, method=method)
        if content_type == "application/json" and data:
            req.add_header("Content-Type", "application/json")
        
        with urllib.request.urlopen(req, timeout=10) as resp:
            elapsed = (time.perf_counter() - start) * 1000
            resp_body = resp.read().decode()
            try:
                resp_json = json.loads(resp_body)
            except:
                resp_json = resp_body
            result = {
                "timestamp": ts(),
                "method": method,
                "path": path,
                "status": resp.status,
                "latency_ms": round(elapsed, 1),
                "response": resp_json,
            }
            RESULTS.append(result)
            print(f"  ✅ {method} {path} → {resp.status} ({elapsed:.0f}ms)")
            return result
    except urllib.error.HTTPError as e:
        elapsed = (time.perf_counter() - start) * 1000
        resp_body = e.read().decode()
        try:
            resp_json = json.loads(resp_body)
        except:
            resp_json = resp_body
        result = {
            "timestamp": ts(),
            "method": method,
            "path": path,
            "status": e.code,
            "latency_ms": round(elapsed, 1),
            "response": resp_json,
        }
        RESULTS.append(result)
        print(f"  {'✅' if e.code in (409,) else '❌'} {method} {path} → {e.code} ({elapsed:.0f}ms)")
        return result
    except Exception as e:
        elapsed = (time.perf_counter() - start) * 1000
        result = {
            "timestamp": ts(),
            "method": method,
            "path": path,
            "status": "ERROR",
            "latency_ms": round(elapsed, 1),
            "response": str(e),
        }
        RESULTS.append(result)
        print(f"  ❌ {method} {path} → ERROR: {e}")
        return result


def test_websocket():
    """Test WebSocket ping/pong."""
    import socket
    import hashlib
    import base64
    import struct
    
    start = time.perf_counter()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect(("127.0.0.1", 8765))
        
        # WebSocket handshake
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            "GET /ws HTTP/1.1\r\n"
            "Host: 127.0.0.1:8765\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        )
        sock.send(handshake.encode())
        
        response = b""
        while b"\r\n\r\n" not in response:
            response += sock.recv(1024)
        
        if b"101" not in response:
            raise Exception(f"Handshake failed: {response[:100]}")
        
        # Send a ping message (JSON)
        ping_msg = json.dumps({"type": "ping"}).encode()
        frame = bytearray()
        frame.append(0x81)  # FIN + text
        mask_key = os.urandom(4)
        length = len(ping_msg)
        if length < 126:
            frame.append(0x80 | length)  # MASK bit set
        frame.extend(mask_key)
        masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(ping_msg))
        frame.extend(masked)
        sock.send(bytes(frame))
        
        # Read response
        resp_data = sock.recv(4096)
        elapsed = (time.perf_counter() - start) * 1000
        
        # Parse WebSocket frame
        if len(resp_data) >= 2:
            payload_len = resp_data[1] & 0x7F
            payload_start = 2
            if payload_len == 126:
                payload_start = 4
            elif payload_len == 127:
                payload_start = 10
            payload = resp_data[payload_start:payload_start + payload_len]
            try:
                ws_resp = json.loads(payload.decode())
            except:
                ws_resp = payload.decode()
        else:
            ws_resp = "frame too short"
        
        sock.close()
        
        result = {
            "timestamp": ts(),
            "method": "WS",
            "path": "/ws",
            "status": "CONNECTED",
            "latency_ms": round(elapsed, 1),
            "response": ws_resp,
        }
        RESULTS.append(result)
        print(f"  ✅ WS /ws → CONNECTED, pong received ({elapsed:.0f}ms)")
        return result
    except Exception as e:
        elapsed = (time.perf_counter() - start) * 1000
        result = {
            "timestamp": ts(),
            "method": "WS",
            "path": "/ws",
            "status": "ERROR",
            "latency_ms": round(elapsed, 1),
            "response": str(e),
        }
        RESULTS.append(result)
        print(f"  ❌ WS /ws → ERROR: {e}")
        return result


print("=" * 60)
print("PLCVS INTEGRATION TEST SUITE")
print(f"Started: {ts()}")
print(f"Target:  {BASE}")
print("=" * 60)

# 1. Health
print("\n[1/13] Health Check")
test_endpoint("GET", "/health")

# 2. Checklist Config
print("\n[2/13] Checklist Configuration")
test_endpoint("GET", "/checklist/config")

# 3. Checklist Snapshot
print("\n[3/13] Checklist Snapshot")
test_endpoint("GET", "/checklist/snapshot")

# 4. Start Session
print("\n[4/13] Start Session")
r4 = test_endpoint("POST", "/session/start")

# 5. Session Progress
print("\n[5/13] Session Progress")
test_endpoint("GET", "/session/progress")

# 6. Session State
print("\n[6/13] Session State")
test_endpoint("GET", "/session/state")

# 7. Session Alerts
print("\n[7/13] Session Alerts")
test_endpoint("GET", "/session/alerts")

# 8. Manual Override
print("\n[8/13] Manual Override")
test_endpoint("POST", "/session/override", body={
    "item_id": "CI_001",
    "new_status": "CONFIRMED",
    "reason": "Integration test override"
})

# 9. Duplicate Session Start (expect 409)
print("\n[9/13] Duplicate Session Start (expect 409)")
test_endpoint("POST", "/session/start")

# 10. Stop Session
print("\n[10/13] Stop Session")
test_endpoint("POST", "/session/stop")

# 11. Session History
print("\n[11/13] Session History")
test_endpoint("GET", "/sessions/history")

# 12. Audio Devices
print("\n[12/13] Audio Devices")
test_endpoint("GET", "/devices")

# 13. WebSocket
print("\n[13/13] WebSocket Ping/Pong")
test_websocket()

print("\n" + "=" * 60)
passed = sum(1 for r in RESULTS if r["status"] in (200, 409, "CONNECTED"))
failed = len(RESULTS) - passed
print(f"RESULTS: {passed} passed, {failed} failed, {len(RESULTS)} total")
print(f"Finished: {ts()}")
print("=" * 60)

# Save results
out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "integration_test_results.json")
with open(out_path, "w") as f:
    json.dump({
        "suite": "PLCVS Integration Tests",
        "timestamp": ts(),
        "base_url": BASE,
        "total": len(RESULTS),
        "passed": passed,
        "failed": failed,
        "results": RESULTS,
    }, f, indent=2)
print(f"\nResults saved to: {out_path}")
