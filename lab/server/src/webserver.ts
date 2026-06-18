/**
 * webserver — tiny on-demand capture API for the web UI's Case ① panel.
 *
 * The browser can't drive live algolia.com search (different app + WAF + CORS),
 * so the UI POSTs a query here and this server runs the Playwright capture
 * (lab/capture) and returns the rendered results. Node's built-in http only —
 * no framework dependency (native-Algolia / minimise-custom-code steer).
 *
 *   CAPTURE_PORT=8787 npx tsx src/webserver.ts
 *   POST /api/website  { "query": "..." }  ->  { answer, sources }
 *
 * Also serves the UI's live Analysis panel:
 *   POST /api/judge  { question, panels:[{panelId,answer,sources}], rounds? }
 *     -> { rounds, panels:[{panelId,judges,synthesizedScore,gateTripped,…}] }
 *   Judges the EXACT answers the browser rendered (indicative; the batch
 *   `cli judge` on a full transcript remains authoritative).
 *
 * DEPLOYMENT: this runs as a standalone always-on service (the judge is 30–90s
 * and needs a server-side LLM key — not a fit for Vercel serverless). It binds
 * the host's $PORT. `/api/website` (Playwright) is lazily imported only when hit,
 * so a JUDGE-ONLY host needs no browser installed — the live app's ① panel now
 * queries Algolia browser-direct and never calls /api/website in production.
 */
import { createServer } from "node:http";
import { makeActiveJudgeLlm } from "./activeJudgeLlm.js";
import {
  judgeLive,
  makeLlmScorer,
  DEFAULT_LIVE_ROUNDS,
  type LiveJudgeRequest,
} from "./liveJudge.js";
import { API_KEY_HEADER, isAuthorized, clientIp, RateLimiter } from "./auth.js";

// Hosts (Render/Railway/Fly) inject $PORT; fall back to CAPTURE_PORT for local dev.
const PORT = Number(process.env.PORT ?? process.env.CAPTURE_PORT ?? 8787);

// Protection for the public endpoint (see auth.ts). Both opt-in:
//  - LAB_API_KEY unset => auth OPEN (local dev / localhost-only deploy).
//  - RATE_LIMIT <= 0    => rate limit disabled.
const LAB_API_KEY = process.env.LAB_API_KEY;
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 30);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS ?? 60_000);
const limiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

const server = createServer(async (req, res) => {
  // Permissive CORS — search-only data, local dev tool.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", `Content-Type, ${API_KEY_HEADER}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Gate the cost-bearing API routes (judge/website): rate-limit then shared key.
  // /health stays open for the tunnel + uptime checks. No-op until LAB_API_KEY is set.
  if (req.method === "POST" && (req.url ?? "").startsWith("/api/")) {
    const ip = clientIp(req.headers, req.socket.remoteAddress ?? undefined);
    if (!limiter.check(ip)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "rate limit exceeded — slow down" }));
      return;
    }
    if (!isAuthorized(req.headers[API_KEY_HEADER], LAB_API_KEY)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }

  if (req.method === "POST" && (req.url ?? "").startsWith("/api/website")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { query } = JSON.parse(body || "{}") as { query?: string };
      if (!query || !query.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "query is required" }));
        return;
      }
      console.log(`[capture-api] capturing: ${query}`);
      // Lazy-load Playwright capture so a judge-only host boots without a browser.
      const { liveWebsiteCapture } = await import("./website.js");
      const out = await liveWebsiteCapture.captureWebsite(query);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  if (req.method === "POST" && (req.url ?? "").startsWith("/api/judge")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    // Stream per-panel progress as Server-Sent Events when the client asks for it
    // (Accept: text/event-stream) — otherwise return one JSON blob (back-compat).
    const wantsStream = (req.headers.accept ?? "").includes("text/event-stream");
    try {
      const judgeReq = JSON.parse(body || "{}") as LiveJudgeRequest;
      if (!judgeReq.question || !judgeReq.question.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "question is required" }));
        return;
      }
      if (!Array.isArray(judgeReq.panels) || judgeReq.panels.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "panels is required and must be non-empty" }));
        return;
      }
      // fastLive: the on-screen verdict is indicative → use the fast model.
      const { llm, provider, model } = await makeActiveJudgeLlm({ fastLive: true });
      const rounds = judgeReq.rounds ?? DEFAULT_LIVE_ROUNDS;
      console.log(
        `[judge-api] judging ${judgeReq.panels.length} panel(s) on ${provider}/${model}, rounds=${rounds}, stream=${wantsStream}`,
      );
      const judgeT0 = Date.now();
      const logDone = () =>
        console.log(`[judge-api] done in ${((Date.now() - judgeT0) / 1000).toFixed(1)}s`);

      if (wantsStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const send = (event: string, data: unknown) =>
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        send("phase", { phase: "judging", panels: judgeReq.panels.length, provider, model, rounds });
        const out = await judgeLive(judgeReq, makeLlmScorer(llm), (verdict) =>
          send("panel", verdict),
        );
        send("result", out);
        res.end();
        logDone();
        return;
      }

      const out = await judgeLive(judgeReq, makeLlmScorer(llm));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      logDone();
    } catch (e) {
      if (wantsStream && res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
        res.end();
      } else {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    }
    return;
  }

  if (req.method === "GET" && (req.url ?? "") === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`[lab-api] listening on :${PORT}  (POST /api/judge · POST /api/website · GET /health)`);
  console.log(
    `[lab-api] auth ${LAB_API_KEY ? "ENABLED (x-lab-key required)" : "OPEN (no LAB_API_KEY set)"} · rate-limit ${
      RATE_LIMIT > 0 ? `${RATE_LIMIT}/${RATE_WINDOW_MS}ms per IP` : "disabled"
    }`,
  );
});
