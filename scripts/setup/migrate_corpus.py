#!/usr/bin/env python3
"""
Migrate the Algolia.com www corpus into our own app (VVKSSPDMJX) for the A/B.

Source : app 1QDAWL72TQ (VISIBILITY), index ALGOLIA_WWW_PROD_V2  [READ-ONLY]
Dest   : app VVKSSPDMJX (ARIJIT-TEST, full admin)
  - ALGOLIA_WWW_PROD_V2   = faithful mirror (source settings verbatim) -> A/B "their index" baseline (col 3)
  - visibility_www_tuned  = copy of the mirror + keyword fix (removeWordsIfNoResults) -> col 4

Reads creds from ../../.env.local (handles hyphenated ARIJIT-TEST_* names).
Pure stdlib (urllib); no npm deps. Read-only on the source; never touches the live index.
"""
import json, os, time, urllib.request, urllib.error

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
ENV = {}
with open(os.path.join(ROOT, ".env.local")) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()

SRC_APP = ENV["VISIBILITY_APP_ID"]
SRC_KEY = ENV["VISIBILITY_WRITE_API_KEY"]      # has 'browse'
SRC_IDX = "ALGOLIA_WWW_PROD_V2"
DST_APP = ENV["ARIJIT-TEST_APP_ID"]
DST_KEY = ENV["ARIJIT-TEST_ADMIN_API_KEY"]
MIRROR  = "ALGOLIA_WWW_PROD_V2"
TUNED   = "visibility_www_tuned"

def call(app, key, method, path, body=None, host=None):
    h = host or f"https://{app}.algolia.net"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(h + path, data=data, method=method, headers={
        "X-Algolia-Application-Id": app,
        "X-Algolia-API-Key": key,
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

def wait_task(app, key, index, task_id):
    for _ in range(60):
        _, d = call(app, key, "GET", f"/1/indexes/{index}/task/{task_id}")
        if d.get("status") == "published":
            return True
        time.sleep(1)
    return False

print(f"[1/6] Reading source settings {SRC_IDX} on {SRC_APP} ...")
st, settings = call(SRC_APP, SRC_KEY, "GET", f"/1/indexes/{SRC_IDX}/settings")
assert st == 200, f"settings read failed {st}: {settings}"
# Strip keys that shouldn't be force-copied
for k in ["replicas", "primary"]:
    settings.pop(k, None)
print(f"      got {len(settings)} setting keys")

print(f"[2/6] Applying source settings to mirror {MIRROR} on {DST_APP} ...")
st, d = call(DST_APP, DST_KEY, "PUT", f"/1/indexes/{MIRROR}/settings", settings)
assert st == 200, f"settings write failed {st}: {d}"
wait_task(DST_APP, DST_KEY, MIRROR, d["taskID"])

print(f"[3/6] Browsing source records and copying to mirror (batches of 1000) ...")
cursor, total, last_task = None, 0, None
while True:
    body = {"hitsPerPage": 1000}
    if cursor:
        body = {"cursor": cursor}
    st, page = call(SRC_APP, SRC_KEY, "POST", f"/1/indexes/{SRC_IDX}/browse", body)
    assert st == 200, f"browse failed {st}: {page}"
    hits = page.get("hits", [])
    if hits:
        reqs = [{"action": "addObject", "body": h} for h in hits]
        st, d = call(DST_APP, DST_KEY, "POST", f"/1/indexes/{MIRROR}/batch", {"requests": reqs})
        assert st == 200, f"batch save failed {st}: {d}"
        last_task = d["taskID"]
        total += len(hits)
        print(f"      copied {total} ...")
    cursor = page.get("cursor")
    if not cursor:
        break
if last_task:
    wait_task(DST_APP, DST_KEY, MIRROR, last_task)
print(f"      done: {total} records copied to {MIRROR}")

print(f"[4/6] Copying mirror -> {TUNED} (same app) ...")
st, d = call(DST_APP, DST_KEY, "POST", f"/1/indexes/{MIRROR}/operation",
             {"operation": "copy", "destination": TUNED})
assert st == 200, f"copy failed {st}: {d}"
wait_task(DST_APP, DST_KEY, TUNED, d["taskID"])

print(f"[5/6] Applying keyword fix to {TUNED} (removeWordsIfNoResults=lastWords) ...")
st, d = call(DST_APP, DST_KEY, "PUT", f"/1/indexes/{TUNED}/settings",
             {"removeWordsIfNoResults": "lastWords"})
assert st == 200, f"tuned settings failed {st}: {d}"
wait_task(DST_APP, DST_KEY, TUNED, d["taskID"])

print(f"[6/6] Verifying record counts ...")
for idx in (MIRROR, TUNED):
    st, d = call(DST_APP, DST_KEY, "POST", f"/1/indexes/{idx}/query", {"query": "", "hitsPerPage": 0})
    st2, idxs = call(DST_APP, DST_KEY, "GET", "/1/indexes")
    raw = next((i.get("entries") for i in idxs.get("items", []) if i["name"] == idx), "?")
    print(f"      {idx}: {raw} raw records (nbHits distinct={d.get('nbHits')})")

# Quick proof the keyword fix works: a full-NL query that returned 0 on the strict index
NL = "How do I add Algolia search to a React app?"
print(f"\n[proof] full-NL query on mirror vs tuned: \"{NL}\"")
for idx in (MIRROR, TUNED):
    st, d = call(DST_APP, DST_KEY, "POST", f"/1/indexes/{idx}/query", {"query": NL, "hitsPerPage": 3})
    print(f"      {idx}: nbHits={d.get('nbHits')}  top={(d.get('hits') or [{}])[0].get('title','-')[:60]}")
print("\nMigration complete.")
