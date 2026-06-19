# Backend container for the Algolia 2×2 Answer-Quality Lab (@lab/server).
# REPLACES the old VPS judge-only backend. Serves:
#   POST /api/answer  (4 panels: single agents + coded Maverick coordinator)
#   POST /api/judge   (3-judge batch / 1-judge live)
#   GET  /health
#
# The server runs TypeScript directly via tsx (no build step). It depends on the
# sibling workspace packages @lab/judge + @lab/autocorrect (file: deps that export
# ./src/index.ts), so the build context is the REPO ROOT and all three are copied in.
FROM node:22-slim
WORKDIR /app

# The file: workspace deps must exist before `npm install` in the server resolves them.
COPY lab/judge ./lab/judge
COPY lab/autocorrect ./lab/autocorrect

# Install server deps first (better layer caching). tsx is a devDep but is the
# runtime entrypoint, so a full install is intentional. The file: deps are linked.
COPY lab/server/package*.json ./lab/server/
WORKDIR /app/lab/server
RUN npm install --no-audit --no-fund

# App source. node_modules/output/.env are excluded via .dockerignore, so the
# install layer above survives and no secrets are baked into the image.
COPY lab/server/ ./

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Secrets (LAB_API_KEY, GOOGLE_API_KEY, ALGOLIA_ADMIN_API_KEY) + agent ids are
# injected at runtime via env_file / -e — never built into the image.
CMD ["npx", "tsx", "src/webserver.ts"]
