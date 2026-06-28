/**
 * nativeMemoryProbe — Backlog B: does Agent Studio's NATIVE conversation memory
 * carry context turn-to-turn WITHOUT replaying messages[]?
 *
 * AC2 today does manual replay (passes the prior turn as messages[] history) and
 * uses NO memory store (no Redis — that was rc2). If native memory carries
 * context from a conversation `id` alone, we never need to add a store OR keep
 * the manual replay for conversation context. (The discovery Onion STATE always
 * stays custom — native memory is a transcript store, not a state engine.)
 *
 * Wire (Protocol Read Receipt):
 *   POST https://{APP}.algolia.net/agent-studio/1/agents/{id}/completions?compatibilityMode=ai-sdk-4
 *     headers: X-Algolia-Application-Id, X-Algolia-API-Key, Content-Type,
 *              User-Agent: curl/8.4.0           (agentRunner.ts:160-169, verified live)
 *     body:    { id: "<alg_cnv_*>", messages: [{ role:"user", content }] }
 *       - top-level `id` = conversation id  (rc3 maverick-agent-behavior.test.ts:73;
 *         docs/research/agent-studio-docs/03-capabilities.md:139-150; format alg_cnv_*)
 *       - memory is ON by default (05-api-reference.md:307; ?memory=false disables)
 *   Response parsed by the verified parseAgentStream (ai-sdk-4 line protocol).
 *
 * Test design (a same-id vs fresh-id contrast isolates memory):
 *   T1(convA): establish an in-corpus topic ("What is Algolia NeuralSearch?").
 *   T2(convA, SAME id, NO replay): pronoun "How do I turn it on for an index?"
 *   T3(convB, FRESH id, NO replay): the SAME pronoun question, cold.
 *   If T2 resolves "it" → NeuralSearch but T3 does not, native memory carried context.
 *
 *   Usage: npx tsx src/experiments/nativeMemoryProbe.ts
 */
import { getEnv } from "../config.js";
import { parseAgentStream } from "../agentRunner.js";

interface Turn {
  answer: string;
  sources: { title: string; url: string }[];
  error?: string;
  httpStatus: number;
}

let msgCounter = 0;

async function complete(
  cfg: { appId: string; apiKey: string; agentId: string },
  conversationId: string | undefined,
  content: string,
): Promise<Turn> {
  // messages[].id = alg_msg_* (capabilities.md:139-150) — supply it in case memory
  // keys off per-message ids, not just the conversation id.
  const body: Record<string, unknown> = {
    messages: [{ id: `alg_msg_probe_${Date.now()}_${msgCounter++}`, role: "user", content }],
  };
  if (conversationId) body.id = conversationId; // top-level conversation id
  const res = await fetch(
    `https://${cfg.appId}.algolia.net/agent-studio/1/agents/${cfg.agentId}/completions?compatibilityMode=ai-sdk-4`,
    {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": cfg.appId,
        "X-Algolia-API-Key": cfg.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "curl/8.4.0",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    return { answer: "", sources: [], error: `HTTP ${res.status}`, httpStatus: res.status };
  }
  const raw = await res.text();
  const parsed = parseAgentStream(raw);
  return {
    answer: parsed.answer,
    sources: parsed.sources.map((s) => ({ title: s.title, url: s.url })),
    ...(parsed.error ? { error: parsed.error } : {}),
    httpStatus: res.status,
  };
}

/**
 * Non-streamed variant: POST ...?stream=false returns a JSON CompletionResponse
 * with a top-level `id` (rc3 maverick-agent-behavior.test.ts:55-62). We capture
 * that server-assigned id and reuse it on the next turn — in case native memory
 * only engages for the SERVER's conversation id, not a client-invented one.
 */
async function completeJson(
  cfg: { appId: string; apiKey: string; agentId: string },
  conversationId: string | undefined,
  content: string,
): Promise<{ id?: string; answer: string; httpStatus: number; error?: string }> {
  const body: Record<string, unknown> = {
    messages: [{ id: `alg_msg_probe_${Date.now()}_${msgCounter++}`, role: "user", content }],
  };
  if (conversationId) body.id = conversationId;
  const res = await fetch(
    `https://${cfg.appId}.algolia.net/agent-studio/1/agents/${cfg.agentId}/completions?stream=false&compatibilityMode=ai-sdk-4`,
    {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": cfg.appId,
        "X-Algolia-API-Key": cfg.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "curl/8.4.0",
      },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) return { answer: "", httpStatus: res.status, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  try {
    const j = JSON.parse(text) as { id?: string; content?: string };
    return { id: j.id, answer: j.content ?? "", httpStatus: res.status };
  } catch {
    // stream=false not honored → fell back to the line protocol; parse that.
    const p = parseAgentStream(text);
    return { answer: p.answer, httpStatus: res.status };
  }
}

/** Heuristic: does the answer show it understood the pronoun referent (NeuralSearch)? */
function mentionsNeural(s: string): boolean {
  return /neural\s*search|neuralsearch|\bneural\b|semantic search|vector search/i.test(s);
}

async function main(): Promise<void> {
  const env = getEnv();
  const cfg = {
    appId: env.ALGOLIA_APP_ID ?? "",
    apiKey: env.ALGOLIA_ADMIN_API_KEY ?? env.ALGOLIA_SEARCH_API_KEY ?? "",
    agentId: env.ALGOLIA_AGENT_MAVERICK_NEURAL_ID ?? "",
  };
  if (!cfg.appId || !cfg.apiKey || !cfg.agentId) {
    throw new Error(
      `missing env: appId=${!!cfg.appId} apiKey=${!!cfg.apiKey} agentId=${!!cfg.agentId}`,
    );
  }

  // A stable, prefixed conversation id (rc3 didn't strictly enforce the prefix).
  const convA = `alg_cnv_probe_${Date.now()}`;
  const convB = `alg_cnv_fresh_${Date.now()}`;
  const T1 = "What is Algolia NeuralSearch?";
  // Direct recall — can't be dodged by the agent's scripted discovery clarifier.
  const RECALL = "In one sentence, what was the topic of my previous question to you?";
  const PERSIST_DELAY_MS = 5000;

  process.stderr.write(`[native-memory] agent ${cfg.agentId} on ${cfg.appId}\n`);

  process.stderr.write(`[native-memory] T1 (convA establish: NeuralSearch)...\n`);
  const t1 = await complete(cfg, convA, T1);
  process.stderr.write(`[native-memory] waiting ${PERSIST_DELAY_MS}ms for transcript persistence...\n`);
  await new Promise((r) => setTimeout(r, PERSIST_DELAY_MS));
  process.stderr.write(`[native-memory] T2 (convA, SAME id, direct recall, NO replay)...\n`);
  const t2 = await complete(cfg, convA, RECALL);
  process.stderr.write(`[native-memory] T3 (convB, FRESH id, same recall Q, cold control)...\n`);
  const t3 = await complete(cfg, convB, RECALL);

  // Recall succeeds when the SAME-id turn names the prior topic (neural/search) and
  // the cold FRESH-id turn cannot (it has no prior question to recall).
  const t2Recalled = mentionsNeural(t2.answer);
  const t3Recalled = mentionsNeural(t3.answer);
  const verdict =
    t2.error || t3.error
      ? "ERROR — see turns"
      : t2Recalled && !t3Recalled
        ? "MEMORY CARRIES — same-id T2 recalled the prior topic (NeuralSearch); cold fresh-id T3 could not"
        : t2Recalled && t3Recalled
          ? "INCONCLUSIVE — both 'recalled' neural (agent may mention it unprompted)"
          : !t2Recalled
            ? "MEMORY DID NOT CARRY (or grounding suppressed it) — same-id T2 could not name the prior topic"
            : "INCONCLUSIVE";

  // --- Confound check: reuse the SERVER-returned conversation id (stream=false) ---
  process.stderr.write(`[native-memory] T1b (stream=false, capture server id)...\n`);
  const t1b = await completeJson(cfg, undefined, T1);
  const serverId = t1b.id;
  await new Promise((r) => setTimeout(r, PERSIST_DELAY_MS));
  process.stderr.write(`[native-memory] T2b (reuse server id=${serverId ?? "<none>"}, recall)...\n`);
  const t2b = serverId
    ? await completeJson(cfg, serverId, RECALL)
    : { answer: "", httpStatus: 0, error: "no server id returned by T1b" };
  const t2bRecalled = mentionsNeural(t2b.answer);
  const serverIdVerdict = t2b.error
    ? `serverId test ERROR: ${t2b.error}`
    : t2bRecalled
      ? "MEMORY CARRIES when reusing the SERVER-returned id"
      : "MEMORY DID NOT CARRY even with the server-returned id";

  const out = {
    config: { appId: cfg.appId, agentId: cfg.agentId, convA, convB, serverId },
    turns: {
      T1: { q: T1, answer: t1.answer, neural: mentionsNeural(t1.answer), err: t1.error, http: t1.httpStatus },
      T2_sameId: { q: RECALL, answer: t2.answer, neural: t2Recalled, err: t2.error, http: t2.httpStatus },
      T3_freshId: { q: RECALL, answer: t3.answer, neural: t3Recalled, err: t3.error, http: t3.httpStatus },
      T1b_serverIdCapture: { answer: t1b.answer.slice(0, 120), id: serverId, err: t1b.error, http: t1b.httpStatus },
      T2b_reuseServerId: { q: RECALL, answer: t2b.answer, neural: t2bRecalled, err: t2b.error, http: t2b.httpStatus },
    },
    verdict,
    serverIdVerdict,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.stderr.write(`[native-memory] VERDICT(client-id): ${verdict}\n`);
  process.stderr.write(`[native-memory] VERDICT(server-id): ${serverIdVerdict}\n`);
}

main().catch((e) => {
  process.stderr.write(`[native-memory] error: ${(e as Error).message}\n`);
  process.exit(1);
});
