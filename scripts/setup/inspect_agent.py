#!/usr/bin/env python3
"""
Inspect an Agent Studio agent's full config on VVKSSPDMJX.
Dumps instructions (verbatim) + model + tools to stdout and to a file so we can
author a grounding-strict rewrite from the real starting point.

Usage: python3 inspect_agent.py [agent_id]   (defaults to the mirror agent)
"""
import json, os, sys, urllib.request, urllib.error

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
ENV = {}
with open(os.path.join(ROOT, ".env.local")) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1); ENV[k.strip()] = v.strip()

APP, KEY = ENV["ARIJIT-TEST_APP_ID"], ENV["ARIJIT-TEST_ADMIN_API_KEY"]
AGENT_ID = sys.argv[1] if len(sys.argv) > 1 else "02852440-8f57-4383-98bc-bffa5b357516"  # mirror

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"https://{APP}.algolia.net{path}", data=data, method=method,
        headers={"X-Algolia-Application-Id": APP, "X-Algolia-API-Key": KEY,
                 "Content-Type": "application/json", "User-Agent": "curl/8.4.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        b = e.read().decode(); return e.code, (json.loads(b) if b else {})

st, a = call("GET", f"/agent-studio/1/agents/{AGENT_ID}")
print(f"HTTP {st}  agent={AGENT_ID}")
if st != 200:
    print(json.dumps(a, indent=2)[:1000]); sys.exit(1)

print(f"name={a.get('name')}  model={a.get('model')}  status={a.get('status')}")
tools = a.get("tools") or []
for t in tools:
    print(f"tool: name={t.get('name')} type={t.get('type')} indices={[i.get('index') for i in (t.get('indices') or [])]}")
instr = a.get("instructions") or ""
print(f"\ninstructions: {len(instr)} chars")
out = os.path.join(os.path.dirname(__file__), "current_instructions.txt")
with open(out, "w") as f:
    f.write(instr)
print(f"(written verbatim to {out})")
print("\n===== INSTRUCTIONS (verbatim) =====\n")
print(instr)
