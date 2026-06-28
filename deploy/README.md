# VPS Deploy — 2×2 Lab Backend (replaces the old judge backend)

The new `@lab/server` **subsumes** the old judge-only service — it now also serves
`/api/answer` (the 4 panels). These steps replace the old container on your
Hostinger VPS (Docker + Caddy). The old backend is retired.

Endpoints: `POST /api/answer` · `POST /api/judge` · `GET /health`.

## Prereqs (already on your VPS)
- Docker + Docker Compose v2
- Caddy (your existing reverse proxy) for HTTPS

## 1. Get the code on the VPS
```bash
ssh <your-vps>
cd /srv/ac2-lab            # pick a dir; git clone this repo (or pull if already there)
git checkout refactor/2x2-answer-quality-lab   # until merged to main
```

## 2. Configure env (secrets live on the VPS only — never committed)
```bash
cp deploy/.env.example deploy/.env
# fill the three __FILL__ secrets in deploy/.env:
#   LAB_API_KEY            = the shared secret (same one Vercel sends as x-lab-key)
#   GOOGLE_API_KEY         = Gemini key
#   ALGOLIA_ADMIN_API_KEY  = CENTRAL admin key (server-side only)
#   VITE_ALGOLIA_SEARCH_API_KEY = the minted search-only key
# the 10 agent ids + provider id + model are pre-filled.
```

## 3. Stop + remove the OLD judge backend
```bash
docker compose -f <old-compose-path> down    # or: docker stop <old> && docker rm <old>
docker ps                                     # confirm the old one is gone
```

## 4. Build + start the new backend
```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f   # expect: [lab-api] listening on :8787
curl -s http://127.0.0.1:8787/health                  # health ok
```

## 5. Point Caddy at it
Replace the old site block with `deploy/Caddyfile.example` (reuses
`judge.contentengagement.info` → `127.0.0.1:8787`), then:
```bash
caddy reload   # or: systemctl reload caddy
curl -s https://judge.contentengagement.info/health
```

## 6. Wire the Vercel frontend
In Vercel (Production): set `VITE_LAB_API_URL = https://judge.contentengagement.info`
and redeploy. The frontend POSTs `/api/answer` + `/api/judge` with the `x-lab-key`
shared secret.

## 7. End-to-end smoke (from your laptop)
```bash
curl -s -X POST https://judge.contentengagement.info/api/answer \
  -H 'content-type: application/json' -H 'x-lab-key: <secret>' \
  -d '{"question":"How does Algolia handle typo tolerance?","panels":["P1"]}'
```

## Updating later
```bash
git pull && docker compose -f deploy/docker-compose.yml up -d --build
```

> Note: `render.yaml` is retained only as an alternative host blueprint — it is not
> used for the VPS path. Delete it if you want a single source of truth.
