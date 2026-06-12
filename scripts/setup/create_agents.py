#!/usr/bin/env python3
"""
Create OUR Agent Studio agents on VVKSSPDMJX by cloning the live Beta's config.

Steps:
  1. Fetch the live Beta agent (ebff018c on 1QDAWL72TQ) — reuse its instructions + search tool verbatim.
  2. Register an OpenAI provider on VVKSSPDMJX from OPENAI_API_KEY (idempotent).
  3. Create two agents (same cloned config), each pointed at a different index:
       - visibility-agent-mirror  -> ALGOLIA_WWW_PROD_V2     (A/B col 3, "our agent / their index")
       - visibility-agent-tuned   -> visibility_www_tuned    (A/B col 4, "our agent / our index")
     Surgical fix from the Stage-0 audit: strip the stray `---collect` prompt artifact.
  4. Smoke-test each with a completions call; report grounded answer / hits / errors.
  5. Print the agent IDs to add to the app .env.

Pure stdlib. Reads ../../.env.local (handles hyphenated ARIJIT-TEST_* names).
"""
import json, os, time, urllib.request, urllib.error

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
ENV = {}
with open(os.path.join(ROOT, ".env.local")) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1); ENV[k.strip()] = v.strip()

SRC_APP, SRC_KEY = ENV["VISIBILITY_APP_ID"], ENV["VISIBILITY_API_KEY"]
BETA_ID = "ebff018c-66e1-44df-b33a-2a58a0188840"
DST_APP, DST_KEY = ENV["ARIJIT-TEST_APP_ID"], ENV["ARIJIT-TEST_ADMIN_API_KEY"]
OPENAI_KEY = ENV["OPENAI_API_KEY"]
MODEL = "gpt-5.2"  # match the Beta for a fair agent-vs-agent comparison

def call(app, key, method, path, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"https://{app}.algolia.net{path}", data=data, method=method,
        headers={"X-Algolia-Application-Id": app, "X-Algolia-API-Key": key, "Content-Type": "application/json",
                 "User-Agent": "curl/8.4.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            b = r.read().decode()
            return r.status, (b if raw else json.loads(b))
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        return e.code, (b if raw else (json.loads(b) if b else {}))

print("[1/5] Fetch live Beta config (tool shape) + load hardened instructions ...")
st, beta = call(SRC_APP, SRC_KEY, "GET", f"/agent-studio/1/agents/{BETA_ID}")
assert st == 200, f"beta fetch {st}: {beta}"
beta_tool = (beta.get("tools") or [{}])[0]
tool_desc = (beta_tool.get("indices") or [{}])[0]
# Grounding pivot (2026-06-10): instead of cloning the Beta's sales-discovery
# prompt verbatim, OUR agents use the GROUNDING-HARDENED instructions in
# instructions_v2.md (strict "answer only from the index, else refuse"; no
# training-data facts; no invented customers/metrics/quotes/URLs). This replaces
# the removed custom code auditor — grounding is now enforced in the agent itself
# and verified by `agent_admin.mjs bait`. We still reuse the Beta's search-tool shape.
with open(os.path.join(os.path.dirname(__file__), "instructions_v2.md")) as f:
    instructions = f.read().strip()
print(f"      instructions {len(instructions)} chars (hardened v2); tool={beta_tool.get('name')}")

print("[2/5] Register OpenAI provider on VVKSSPDMJX (idempotent) ...")
st, provs = call(DST_APP, DST_KEY, "GET", "/agent-studio/1/providers")
existing = next((p for p in (provs.get("data") or []) if p.get("providerName") == "openai"), None)
if existing:
    provider_id = existing["id"]; print(f"      reuse provider {provider_id}")
else:
    st, p = call(DST_APP, DST_KEY, "POST", "/agent-studio/1/providers", {
        "name": "OpenAI (ours)", "providerName": "openai",
        "input": {"apiKey": OPENAI_KEY, "baseUrl": "https://api.openai.com/v1"}})
    assert st in (200, 201), f"provider create {st}: {p}"
    provider_id = p["id"]; print(f"      created provider {provider_id}")

def make_agent(name, index):
    tool = {"name": "algolia_search_index", "type": "algolia_search_index",
            "indices": [{"index": index,
                         "description": tool_desc.get("description", "Search the Algolia website index."),
                         "enhancedDescription": tool_desc.get("enhancedDescription", "")}]}
    body = {"name": name, "instructions": instructions, "model": MODEL,
            "providerId": provider_id, "tools": [tool], "status": "published"}
    st, a = call(DST_APP, DST_KEY, "POST", "/agent-studio/1/agents", body)
    return st, a

print("[3/5] Create our two agents ...")
agents = {}
for name, index in [("visibility-agent-mirror", "ALGOLIA_WWW_PROD_V2"),
                    ("visibility-agent-tuned", "visibility_www_tuned")]:
    st, a = make_agent(name, index)
    assert st in (200, 201), f"{name} create {st}: {a}"
    aid = a["id"]; agents[name] = aid
    stp, _ = call(DST_APP, DST_KEY, "POST", f"/agent-studio/1/agents/{aid}/publish", {})  # publish is a separate action
    print(f"      {name} -> {aid}  (index {index})  published_http={stp}")

print("[4/5] Smoke-test each agent (completions) ...")
def smoke(agent_id, q):
    st, raw = call(DST_APP, DST_KEY, "POST",
        f"/agent-studio/1/agents/{agent_id}/completions?compatibilityMode=ai-sdk-4",
        {"messages": [{"role": "user", "content": q}]}, raw=True)
    text, err, hits = "", None, 0
    for line in raw.splitlines():
        if line.startswith("0:"):
            try: text += json.loads(line[2:])
            except: pass
        elif line.startswith("3:"):
            err = line[2:][:200]
        elif line.startswith("a:") or line.startswith("9:"):
            hits += line.count('"url"')
    return st, text.strip(), err, hits

Q = "How do I add Algolia search to a React app?"
for name, aid in agents.items():
    st, text, err, hits = smoke(aid, Q)
    if err: print(f"      {name}: ERROR {err}")
    else:   print(f"      {name}: ok, ~{hits} hit-urls, answer[:160]={text[:160]!r}")

print("[5/5] Add these to the app .env:")
print(f"      VITE_OUR_AGENT_MIRROR_ID={agents['visibility-agent-mirror']}")
print(f"      VITE_OUR_AGENT_TUNED_ID={agents['visibility-agent-tuned']}")
print("Done.")
