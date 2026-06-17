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
 * NOTE: runs LOCALLY (Playwright + ~15s/query; judge ~30–90s/query). Not
 * deployable to Vercel serverless (binary + timeout). A live deploy would need
 * a standalone service.
 */
import { createServer } from "node:http";
import { liveWebsiteCapture } from "./website.js";
import { makeActiveJudgeLlm } from "./activeJudgeLlm.js";
import {
  judgeLive,
  makeLlmScorer,
  DEFAULT_LIVE_ROUNDS,
  type LiveJudgeRequest,
} from "./liveJudge.js";

const PORT = Number(process.env.CAPTURE_PORT ?? 8787);

const server = createServer(async (req, res) => {
  // Permissive CORS — search-only data, local dev tool.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
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
      const { llm, provider, model } = await makeActiveJudgeLlm();
      const rounds = judgeReq.rounds ?? DEFAULT_LIVE_ROUNDS;
      console.log(
        `[judge-api] judging ${judgeReq.panels.length} panel(s) on ${provider}/${model}, rounds=${rounds}`,
      );
      const out = await judgeLive(judgeReq, makeLlmScorer(llm));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
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
  console.log(`[capture-api] listening on http://localhost:${PORT}  (POST /api/website)`);
});
