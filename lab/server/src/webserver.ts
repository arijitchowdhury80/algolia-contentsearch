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
 * NOTE: runs LOCALLY (Playwright + ~15s/query). Not deployable to Vercel
 * serverless (binary + timeout). A live deploy would need a standalone service.
 */
import { createServer } from "node:http";
import { liveWebsiteCapture } from "./website.js";

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
