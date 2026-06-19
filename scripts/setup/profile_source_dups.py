#!/usr/bin/env python3
"""Profile duplication in the live Visibility source index before we copy it.

Read-only. Browses English records and characterizes:
- total vs unique-by-url (the real seed size after dedup)
- duplicate urls (same page indexed multiple times)
- spread by `environment` batch tag and `source`
HTTP goes through curl (trusts the corporate cert chain). Creds from .env.local (never printed).
"""
import json, subprocess, urllib.parse
from collections import Counter

def load_env(path=".env.local"):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

env = load_env()
APP = env["VISIBILITY_APP_ID"]
# search key lacks the browse ACL; use the write key for the READ-ONLY browse only
# (we never issue a write op against Visibility — it stays read-only).
KEY = env.get("VISIBILITY_WRITE_API_KEY") or env["VISIBILITY_API_KEY"]
IDX = env.get("VISIBILITY_INDEX_NAME", "ALGOLIA_WWW_PROD_V2")
URL = f"https://{APP}-dsn.algolia.net/1/indexes/{IDX}/browse"

def curl_post(body):
    p = subprocess.run(
        ["curl", "-s", "-X", "POST", URL,
         "-H", f"X-Algolia-API-Key: {KEY}",
         "-H", f"X-Algolia-Application-Id: {APP}",
         "-H", "Content-Type: application/json",
         "--data", json.dumps(body)],
        capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(f"curl failed: {p.stderr[:300]}")
    return json.loads(p.stdout)

def browse(filters):
    recs, cursor = [], None
    params = ("filters=" + urllib.parse.quote(filters) +
              "&hitsPerPage=1000"
              "&attributesToRetrieve=" + urllib.parse.quote(
                  json.dumps(["objectID", "url", "language_code", "environment", "source"])))
    while True:
        body = {"cursor": cursor} if cursor else {"params": params}
        d = curl_post(body)
        if "hits" not in d:
            raise RuntimeError(f"unexpected response: {str(d)[:300]}")
        recs.extend(d["hits"])
        cursor = d.get("cursor")
        if not cursor:
            break
    return recs

def norm_env(v):
    if isinstance(v, list):
        return ",".join(map(str, v)) if v else "(none)"
    return v if v else "(none)"

for label, flt in [("ALL", ""), ("EN-only", "language_code:en")]:
    recs = browse(flt)
    n = len(recs)
    urls = [r.get("url", "(no-url)") for r in recs]
    uniq = len(set(urls))
    url_counts = Counter(urls)
    dups = {u: c for u, c in url_counts.items() if c > 1}
    extra = sum(c - 1 for c in dups.values())
    print(f"\n===== {label} =====")
    print(f"records browsed : {n}")
    print(f"unique urls     : {uniq}")
    print(f"duplicate urls  : {len(dups)} urls have >1 copy  (= {extra} extra/removable records)")
    print(f"after url-dedup : {uniq} records")
    print("by environment  :", dict(Counter(norm_env(r.get('environment')) for r in recs).most_common()))
    print("by source       :", dict(Counter(r.get('source', '(none)') for r in recs).most_common()))
    if dups:
        print("top duplicated urls:")
        for u, c in sorted(dups.items(), key=lambda x: -x[1])[:8]:
            print(f"   {c}x  {u}")
