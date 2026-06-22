# AC2-RC2 Phase 1 — Build the Headless Gym — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable (skeleton-quality) "gym": neural-retrieval RC2-cast agents on Agent Studio (Maverick/Elena/Bruno), a thin coordinator doing RC2-shape routing (Maverick → baton → ONE specialist, NOT fan-out), real token streaming, a reference-based engagement-level judge, and a replay harness that drives the captured gold through AC2 and scores "% of floor" per turn. Stop at a runnable gym — NO judge validation (Phase 1.5) and NO improvement loop (Phase 2).

**Architecture:** A thin coordinator (TypeScript in `lab/server/src/`) owns the discovery state machine (Onion Protocol, ported from RC2), baton routing, and the grounding/§3.5 audits, and calls Agent Studio agents for generation + neural retrieval. The current parallel-fan-out `multiAgent.ts` is replaced by single-specialist routing. The judge (`lab/judge/`) is reframed from absolute/vacuum scoring to reference-based engagement-turn scoring against the captured RC2 gold, with grounding and voice as code checks and a per-criterion isolated LLM judge for the rest. A replay harness loads `lab/replay/gold/*.json` (Phase 0 output) and runs each driving sequence through the single-neural and multi-neural panels.

**Tech Stack:** TypeScript (Node ESM), vitest (both `lab/server` and `lab/judge` have it), Algolia Agent Studio HTTP API (`/agent-studio/1/...`, ai-sdk-4 line protocol), neural-enabled Algolia indices, OpenAI/Gemini providers via Agent Studio. Pure-logic-first, fake-LLM/fake-runner seams for tests.

## Global Constraints

- **Build home app:** CENTRAL `0EXRPAXB56`. Indices `AC2_WWW_*`. Agents `ac2-*`. Read keys from `.env.local` (root + `web/.env.local` merged by `lab/server/src/config.ts`) — NEVER hardcode keys.
- **Keyword is dropped (spec §1).** The contest is **neural single vs neural multi** only. Use the two neural indices: single panel → `AC2_WWW_SINGLE_NEURAL`, multi panel → `AC2_WWW_MULTI_NEURAL` (already neural-enabled per the dashboard training done in a prior session). Do not build or wire keyword panels.
- **Routing is RC2-shape, NOT fan-out (spec §5.1).** Multi-agent = Maverick discovery → classify need → baton to the ONE fitting specialist (Elena **or** Bruno) → deep-dive → yield. Replace `lab/server/src/multiAgent.ts`'s parallel `mapWithConcurrency` fan-out + `SYNTHESIZE_SYSTEM` merge.
- **Cast = RC2 personas, ported verbatim (spec §5.2)** from `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/config/system/PERSONAS.md`: Maverick (AE/value, personality retained), Elena (SE/impl), Bruno (SA/arch).
- **Charters = source-facet allowlists (spec §5.3).** Maverick: Website, Blog, Resources, Customer Stories, Other, Documentation(high-level). Elena: Resources, Customer Stories, Academy, Developers, Documentation, Support. Bruno: Developers, Documentation, Support. Facet values are case-sensitive; multi-word values ("Customer Stories") must be quoted in the filter string.
- **Agent Studio wire contract** (verified in `scripts/setup/agent_admin.mjs`, `create_central_agents.mjs`): base `https://${APP}.algolia.net/agent-studio/1/...`; headers `X-Algolia-Application-Id`, `X-Algolia-API-Key` (admin key), `Content-Type: application/json`, **`User-Agent: curl/8.4.0` (REQUIRED)**. Run: `POST /agent-studio/1/agents/{id}/completions?compatibilityMode=ai-sdk-4` body `{messages:[{role,content}]}`; response = ai-sdk-4 line protocol (`0:"text"`, `3:error`, `a:`/`9:` tool/source frames).
- **Fairness invariant (carried from prior work):** all panels use the SAME pinned model+provider+grounding policy. The single vs multi difference is ONLY orchestration. Resolve the one provider via `lab/server/src/provider.ts` / `answerService.makePinnedLlm`.
- **Judge is reference-based, engagement-level, gold-anchored (spec §3).** Drop the 3-temperament skeptic/referee/advocate model for the reward role. Grounding (#6) = code check; voice (#7) = code check (port `validateMaverickVoice`). Coverage misses carry the §3.5 retrieval-gap/generation-gap tag.
- **Grade outputs, not paths (spec §3.4).** The judge scores answers vs gold; it never inspects which retrieval strategy AC2 used (except the §3.5 support check, which inspects only the *resulting* source set).
- **Skeleton quality is intended.** Do NOT hand-tune agent prompts to beat the floor — the Phase 2 loop does that. Ship correct plumbing with honest, plain prompts.
- **Out of scope (do NOT build):** Phase 1.5 judge-vs-Arijit validation, the Phase 2 improvement loop, the product UI/two-pane surface (spec §10.6), gold expansion to 50–100.

---

## GROUP A — Neural RC2-cast agents on Agent Studio

### Task A1: Charter source-filter builder (pure)

The one piece of agent setup worth a unit test: turning a charter's source allowlist into a correct Algolia filter string.

**Files:**
- Create: `lab/server/src/charters.ts`
- Test: `lab/server/src/charters.test.ts`

**Interfaces:**
- Produces:
  - `type PersonaId = "maverick" | "elena" | "bruno"`
  - `interface Charter { persona: PersonaId; sources: string[]; agentEnvVar: string }`
  - `const CHARTERS: Record<PersonaId, Charter>`
  - `function buildSourceFilter(sources: string[]): string`  ← `source:"A" OR source:"B"` with quoted values

- [ ] **Step 1: Write the failing test**

```typescript
// lab/server/src/charters.test.ts
import { describe, it, expect } from "vitest";
import { buildSourceFilter, CHARTERS } from "./charters";

describe("buildSourceFilter", () => {
  it("quotes each value and joins with OR", () => {
    expect(buildSourceFilter(["Documentation", "Customer Stories"]))
      .toBe('source:"Documentation" OR source:"Customer Stories"');
  });
  it("handles a single source", () => {
    expect(buildSourceFilter(["Support"])).toBe('source:"Support"');
  });
});

describe("CHARTERS", () => {
  it("encodes the spec §5.3 allowlists", () => {
    expect(CHARTERS.bruno.sources.sort()).toEqual(["Developers", "Documentation", "Support"]);
    expect(CHARTERS.maverick.sources).toContain("Customer Stories");
    expect(CHARTERS.maverick.sources).not.toContain("Academy"); // Maverick disallowed Academy
    expect(CHARTERS.elena.sources).toContain("Academy");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/charters.test.ts`
Expected: FAIL — cannot find module `./charters`.

- [ ] **Step 3: Implement charters**

```typescript
// lab/server/src/charters.ts
export type PersonaId = "maverick" | "elena" | "bruno";

export interface Charter {
  persona: PersonaId;
  sources: string[];
  agentEnvVar: string; // env var holding this agent's id, set by the create script
}

// Spec §5.3 charter matrix over the 9 source facet values.
export const CHARTERS: Record<PersonaId, Charter> = {
  maverick: {
    persona: "maverick",
    sources: ["Website", "Blog", "Resources", "Customer Stories", "Other", "Documentation"],
    agentEnvVar: "ALGOLIA_AGENT_MAVERICK_NEURAL_ID",
  },
  elena: {
    persona: "elena",
    sources: ["Resources", "Customer Stories", "Academy", "Developers", "Documentation", "Support"],
    agentEnvVar: "ALGOLIA_AGENT_ELENA_NEURAL_ID",
  },
  bruno: {
    persona: "bruno",
    sources: ["Developers", "Documentation", "Support"],
    agentEnvVar: "ALGOLIA_AGENT_BRUNO_NEURAL_ID",
  },
};

export function buildSourceFilter(sources: string[]): string {
  return sources.map((s) => `source:"${s}"`).join(" OR ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/charters.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/charters.ts lab/server/src/charters.test.ts
git commit -m "feat(coordinator): charter source-filter builder per spec §5.3"
```

---

### Task A2: Port RC2 persona instructions + create the 3 neural agents

Procedural infra. Reuse the proven `create_central_agents.mjs` pattern; create `ac2-maverick-neural`, `ac2-elena-neural`, `ac2-bruno-neural` bound to the neural indices with charter filters, instructions ported from RC2's `PERSONAS.md`.

**Files:**
- Create: `scripts/setup/instructions_maverick.md`, `scripts/setup/instructions_elena.md`, `scripts/setup/instructions_bruno.md`
- Create: `scripts/setup/create_rc2_agents.mjs`
- Modify: `.env.local` (script appends `ALGOLIA_AGENT_{MAVERICK,ELENA,BRUNO}_NEURAL_ID`)

**Interfaces:**
- Consumes: `CHARTERS`, `buildSourceFilter` (Task A1); provider id `ALGOLIA_PROVIDER_GEMINI_ID` (or active provider) + model from `.env.local`.

- [ ] **Step 1: Port persona instructions (copy from source — not freeform)**

For each persona, open `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/config/system/PERSONAS.md` (Maverick lines 16–43, Elena 56–86, Bruno 89–120) and copy its role, motto, voice, allowed/disallowed scope, and output format into the matching `instructions_*.md`. Also port the global protocols RC2 enforces (SEE framework, Quote-First, mandatory source linking, strict markdown, zero-greeting) — these live in RC2's system config alongside PERSONAS.md; copy them verbatim into each file's header. Append one line per file: "Retrieve ONLY within your charter sources; never assert anything not in a retrieved source (strict grounding)." Keep these honest and plain — do NOT over-tune (skeleton quality; Phase 2 optimizes).

> This is a verbatim port from a named source file, not a placeholder. The content is RC2's, copied — the spec mandates "personas ported verbatim."

- [ ] **Step 2: Write the create script (reuse create_central_agents.mjs pattern)**

```javascript
// scripts/setup/create_rc2_agents.mjs
// Pattern lifted from create_central_agents.mjs (same auth, same POST shapes, idempotent reuse).
import { readFileSync, appendFileSync } from "node:fs";
import { CHARTERS, buildSourceFilter } from "../../lab/server/src/charters.ts"; // run via npx tsx

const APP = process.env.ALGOLIA_APP_ID; // 0EXRPAXB56
const KEY = process.env.ALGOLIA_ADMIN_API_KEY;
const PROVIDER = process.env.ALGOLIA_PROVIDER_GEMINI_ID || process.env.ALGOLIA_AGENT_PROVIDER_ID;
const MODEL = process.env.ALGOLIA_AGENT_MODEL || "gemini-2.5-pro";
const BASE = `https://${APP}.algolia.net/agent-studio/1`;
const H = {
  "X-Algolia-Application-Id": APP,
  "X-Algolia-API-Key": KEY,
  "Content-Type": "application/json",
  "User-Agent": "curl/8.4.0", // REQUIRED
};
// All 3 personas retrieve over the MULTI_NEURAL index (multi panel); the single panel reuses Maverick.
const INDEX = "AC2_WWW_MULTI_NEURAL";
const FILES = { maverick: "instructions_maverick.md", elena: "instructions_elena.md", bruno: "instructions_bruno.md" };

for (const persona of ["maverick", "elena", "bruno"]) {
  const charter = CHARTERS[persona];
  const body = {
    name: `ac2-${persona}-neural`,
    instructions: readFileSync(new URL(FILES[persona], import.meta.url), "utf8"),
    model: MODEL,
    providerId: PROVIDER,
    tools: [{
      name: "algolia_search_index",
      type: "algolia_search_index",
      indices: [{
        index: INDEX,
        description: `Neural search over the Algolia corpus, scoped to ${persona}'s charter.`,
        enhancedDescription: "",
        searchParameters: { filters: buildSourceFilter(charter.sources) },
      }],
    }],
    status: "published",
  };
  const res = await fetch(`${BASE}/agents`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`create ${persona} failed: ${res.status} ${JSON.stringify(json)}`);
  await fetch(`${BASE}/agents/${json.id}/publish`, { method: "POST", headers: H, body: "{}" });
  appendFileSync(new URL("../../.env.local", import.meta.url), `\n${charter.agentEnvVar}=${json.id}`);
  console.log(`created+published ac2-${persona}-neural → ${json.id}`);
}
```

- [ ] **Step 3: Run the script**

Run: `npx tsx scripts/setup/create_rc2_agents.mjs`
Expected: three `created+published …` lines; `.env.local` gains `ALGOLIA_AGENT_MAVERICK_NEURAL_ID`, `…_ELENA_…`, `…_BRUNO_…`.

- [ ] **Step 4: Smoke each agent + bait-test grounding**

Run: `node scripts/setup/agent_admin.mjs bait $ALGOLIA_AGENT_MAVERICK_NEURAL_ID` (repeat for elena, bruno).
Expected: each answers an in-index query with sources; refuses/avoids fabrication on the bait queries. (Skeleton prompts may not be perfect — record results; Phase 2 improves. The bar here is "runs + retrieves + roughly grounds," not "passes all bait.")

- [ ] **Step 5: Commit**

```bash
git add scripts/setup/instructions_maverick.md scripts/setup/instructions_elena.md scripts/setup/instructions_bruno.md scripts/setup/create_rc2_agents.mjs
git commit -m "feat(agents): create neural RC2-cast agents (Maverick/Elena/Bruno) with charters"
# NOTE: do NOT commit .env.local (it holds keys + the new agent ids; it is gitignored).
```

---

## GROUP B — Real token streaming

### Task B1: Incremental ai-sdk-4 stream parser (pure, stateful)

The current `parseAgentStream(raw)` parses a fully-buffered string. We need a stateful parser that consumes partial chunks and emits tokens as they arrive.

**Files:**
- Create: `lab/server/src/streamParser.ts`
- Test: `lab/server/src/streamParser.test.ts`

**Interfaces:**
- Consumes: the ai-sdk-4 line protocol (`0:"text"`, `3:error`, `a:`/`9:` source frames) — same protocol `agentRunner.parseAgentStream` already decodes.
- Produces:
  - `interface StreamSource { title: string; url: string; source?: string }`
  - `interface IncrementalStreamParser { push(chunk: string): { tokens: string[]; sources: StreamSource[]; error?: string }; end(): { answer: string; sources: StreamSource[]; error?: string } }`
  - `function makeStreamParser(): IncrementalStreamParser`  ← buffers partial lines across chunk boundaries; decodes complete `0:`/`3:`/`a:`/`9:` lines; de-dupes sources by url||title.

- [ ] **Step 1: Write the failing test**

```typescript
// lab/server/src/streamParser.test.ts
import { describe, it, expect } from "vitest";
import { makeStreamParser } from "./streamParser";

describe("makeStreamParser", () => {
  it("emits text tokens incrementally and reassembles the full answer", () => {
    const p = makeStreamParser();
    const a = p.push('0:"Hello "\n0:"world"');
    expect(a.tokens).toEqual(["Hello ", "world"]);
    const fin = p.end();
    expect(fin.answer).toBe("Hello world");
  });

  it("buffers a line split across chunk boundaries", () => {
    const p = makeStreamParser();
    const a = p.push('0:"Hel'); // incomplete line, no newline
    expect(a.tokens).toEqual([]);
    const b = p.push('lo"\n');  // completes it
    expect(b.tokens).toEqual(["Hello"]);
  });

  it("collects sources from a: frames and de-dupes by url", () => {
    const p = makeStreamParser();
    const frame = 'a:' + JSON.stringify({ result: { hits: [
      { title: "Doc", url: "https://a.com/x" },
      { title: "Doc dup", url: "https://a.com/x" },
    ] } }) + "\n";
    p.push(frame);
    expect(p.end().sources).toEqual([{ title: "Doc", url: "https://a.com/x" }]);
  });

  it("surfaces a 3: error frame", () => {
    const p = makeStreamParser();
    p.push('3:"rate limited"\n');
    expect(p.end().error).toBe("rate limited");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/streamParser.test.ts`
Expected: FAIL — cannot find module `./streamParser`.

- [ ] **Step 3: Implement the incremental parser**

```typescript
// lab/server/src/streamParser.ts
export interface StreamSource { title: string; url: string; source?: string }

export interface IncrementalStreamParser {
  push(chunk: string): { tokens: string[]; sources: StreamSource[]; error?: string };
  end(): { answer: string; sources: StreamSource[]; error?: string };
}

export function makeStreamParser(): IncrementalStreamParser {
  let buffer = "";
  let answer = "";
  let error: string | undefined;
  const sources: StreamSource[] = [];
  const seen = new Set<string>();

  function addSource(s: StreamSource) {
    const key = s.url || s.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    sources.push(s);
  }

  function consumeLine(line: string, tokens: string[]) {
    const t = line.trim();
    if (!t) return;
    const i = t.indexOf(":");
    if (i === -1) return;
    const prefix = t.slice(0, i);
    const payload = t.slice(i + 1);
    if (prefix === "0") {
      try { const text = JSON.parse(payload); answer += text; tokens.push(text); } catch { /* skip */ }
    } else if (prefix === "3") {
      try { error = JSON.parse(payload); } catch { error = payload; }
    } else if (prefix === "a" || prefix === "9") {
      try {
        const r = JSON.parse(payload).result;
        const hits = Array.isArray(r) ? r : (r?.hits ?? []);
        for (const h of hits) if (h && (h.url || h.title)) addSource({ title: h.title ?? "", url: h.url ?? "", source: h.source });
      } catch { /* skip */ }
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      const tokens: string[] = [];
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        consumeLine(line, tokens);
      }
      return { tokens, sources: [...sources], error };
    },
    end() {
      if (buffer.trim()) consumeLine(buffer, []); // flush trailing line without newline
      buffer = "";
      return { answer, sources, error };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/streamParser.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/streamParser.ts lab/server/src/streamParser.test.ts
git commit -m "feat(stream): incremental ai-sdk-4 stream parser with token emit"
```

---

### Task B2: Streaming agent runner (replace `await res.text()` buffering)

Rewire `agentRunner.ts` so `makeAgentStudioRunner` reads `res.body` incrementally through the Task B1 parser and invokes an `onToken` callback. Keep the existing non-streaming `AgentRunner` signature working (callers that don't pass `onToken` still get the final `AgentRunResult`).

**Files:**
- Modify: `lab/server/src/agentRunner.ts` (replace line ~173 `const raw = await res.text();` and the parse path)
- Test: `lab/server/src/agentRunner.test.ts` (extend or create)

**Interfaces:**
- Consumes: `makeStreamParser` (Task B1).
- Produces (extends existing):
  - `interface AgentRunResult { answer: string; sources: StreamSource[]; error?: string }` (unchanged shape; `sources` now `StreamSource[]`)
  - `type OnToken = (token: string) => void`
  - `type AgentRunner = (agentId: string, question: string, history?: Array<{role:string;content:string}>, onToken?: OnToken) => Promise<AgentRunResult>`
  - `function makeAgentStudioRunner(cfg: AgentStudioConfig): AgentRunner` (now streams)

- [ ] **Step 1: Write the failing test (fake fetch yielding a chunked body)**

```typescript
// lab/server/src/agentRunner.test.ts
import { describe, it, expect, vi } from "vitest";
import { makeAgentStudioRunner } from "./agentRunner";

function fakeStreamingFetch(chunks: string[]) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    body: {
      getReader() {
        const enc = new TextEncoder();
        let i = 0;
        return {
          read: async () =>
            i < chunks.length
              ? { done: false, value: enc.encode(chunks[i++]) }
              : { done: true, value: undefined },
        };
      },
    },
  })) as unknown as typeof fetch;
}

describe("makeAgentStudioRunner (streaming)", () => {
  it("calls onToken per text frame and returns the assembled answer", async () => {
    const fetchImpl = fakeStreamingFetch(['0:"Hello "\n', '0:"world"\n']);
    const run = makeAgentStudioRunner({ appId: "APP", apiKey: "KEY", fetchImpl });
    const tokens: string[] = [];
    const res = await run("agent-1", "hi", [], (t) => tokens.push(t));
    expect(tokens).toEqual(["Hello ", "world"]);
    expect(res.answer).toBe("Hello world");
    expect(res.error).toBeUndefined();
  });

  it("still works without an onToken callback", async () => {
    const fetchImpl = fakeStreamingFetch(['0:"ok"\n']);
    const run = makeAgentStudioRunner({ appId: "APP", apiKey: "KEY", fetchImpl });
    const res = await run("agent-1", "hi");
    expect(res.answer).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/agentRunner.test.ts`
Expected: FAIL — either streaming not implemented (no `onToken` calls) or `body.getReader` unused (old code calls `res.text()`).

- [ ] **Step 3: Rewire the runner to stream**

Replace the fetch+parse block in `makeAgentStudioRunner` (the `const raw = await res.text(); return parseAgentStream(raw);` path, ~line 144–184) with an incremental reader. Keep the URL/headers/body construction (the ai-sdk-4 completions POST) exactly as-is.

```typescript
// inside makeAgentStudioRunner, after `const res = await fetchImpl(url, { method:"POST", headers, body })`:
import { makeStreamParser, type StreamSource } from "./streamParser";
// ...
if (!res.ok) {
  return { answer: "", sources: [], error: `agent ${agentId} HTTP ${res.status}` };
}
const reader = (res.body as ReadableStream<Uint8Array>).getReader();
const decoder = new TextDecoder();
const parser = makeStreamParser();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const { tokens } = parser.push(decoder.decode(value, { stream: true }));
  if (onToken) for (const tk of tokens) onToken(tk);
}
const final = parser.end();
return { answer: final.answer, sources: final.sources, error: final.error };
```

Update `parseAgentStream` callers: the old pure `parseAgentStream(raw)` may still be used by tests of fully-buffered input — keep it exported, but the live runner now uses `makeStreamParser`. Ensure `AgentRunResult.sources` is typed `StreamSource[]` and the `AgentRunner` type gains the optional `onToken` param.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/agentRunner.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); `tsc` clean. Fix any caller whose `AgentRunner` invocation now mismatches the new optional param (it's optional, so existing callers compile unchanged).

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/agentRunner.ts lab/server/src/agentRunner.test.ts
git commit -m "feat(stream): stream Agent Studio responses incrementally via onToken"
```

---

## GROUP C — The thin coordinator (RC2-shape routing)

### Task C1: The Brain — intent/entity/query/next-question extraction

One LLM call that turns a user turn + prior dossier into structured signals. Ported in spirit from RC2 `signal_extractor.ts:extractSignals`.

**Files:**
- Create: `lab/server/src/brain.ts`
- Test: `lab/server/src/brain.test.ts`

**Interfaces:**
- Consumes: `LlmComplete` (the `(prompt, opts?) => Promise<string>` seam already in the codebase, `lab/server/src` provider adapters).
- Produces:
  - `interface BrainOutput { intent: string; entities: { brand?: string; industry?: string; product?: string; concepts?: string[] }; expandedQuery: string; proposedQuestion?: string; askedSignal?: string }`
  - `const BRAIN_SYSTEM: string`
  - `function parseBrain(raw: string): BrainOutput`  ← tolerant JSON parse (extract first `{...}` block)
  - `async function runBrain(userInput: string, dossier: Dossier, llm: LlmComplete): Promise<BrainOutput>`

- [ ] **Step 1: Write the failing test**

```typescript
// lab/server/src/brain.test.ts
import { describe, it, expect } from "vitest";
import { parseBrain, runBrain } from "./brain";
import { emptyDossier } from "./discovery";

describe("parseBrain", () => {
  it("parses a JSON brain output, tolerating prose wrapper", () => {
    const raw = 'Sure:\n{"intent":"discovery","entities":{"brand":"Gymshark","industry":"retail"},"expandedQuery":"gymshark retail search relevance","proposedQuestion":"What stack are you on?","askedSignal":"stack"}';
    const out = parseBrain(raw);
    expect(out.intent).toBe("discovery");
    expect(out.entities.brand).toBe("Gymshark");
    expect(out.expandedQuery).toContain("gymshark");
    expect(out.askedSignal).toBe("stack");
  });
});

describe("runBrain", () => {
  it("falls back to the raw user query on LLM failure (spec §8)", async () => {
    const llm = async () => { throw new Error("LLM down"); };
    const out = await runBrain("how do I do faceted search", emptyDossier(), llm);
    expect(out.expandedQuery).toBe("how do I do faceted search");
    expect(out.intent).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/brain.test.ts`
Expected: FAIL — cannot find module `./brain` (and `./discovery`, created in C2; create C2 first if executing strictly in order, or stub `emptyDossier`).

> **Ordering note:** C1's test imports `emptyDossier` from C2. Implement Task C2 first, OR temporarily inline a minimal dossier literal in this test and swap to the import after C2. Recommended: execute C2 before C1.

- [ ] **Step 3: Implement the brain**

```typescript
// lab/server/src/brain.ts
import type { LlmComplete } from "./types"; // or wherever LlmComplete is declared in lab/server
import type { Dossier } from "./discovery";

export interface BrainOutput {
  intent: string;
  entities: { brand?: string; industry?: string; product?: string; concepts?: string[] };
  expandedQuery: string;
  proposedQuestion?: string;
  askedSignal?: string;
}

export const BRAIN_SYSTEM = `You extract structured signals from one user turn in a sales-discovery conversation about Algolia.
Return ONLY JSON: {intent, entities:{brand,industry,product,concepts[]}, expandedQuery, proposedQuestion, askedSignal}.
- intent: one of "discovery","implementation","architecture","value".
- expandedQuery: a neural-search-friendly rephrasing of what to retrieve.
- proposedQuestion: the single best next discovery question (Onion Protocol) given what is still unknown; omit if already well-qualified.
- askedSignal: which onion signal that question targets (stack|scale|role|pain|industry|product|feature|solution).`;

export function parseBrain(raw: string): BrainOutput {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON in brain output");
  const j = JSON.parse(match[0]);
  return {
    intent: j.intent ?? "unknown",
    entities: j.entities ?? {},
    expandedQuery: j.expandedQuery ?? "",
    proposedQuestion: j.proposedQuestion,
    askedSignal: j.askedSignal,
  };
}

export async function runBrain(userInput: string, dossier: Dossier, llm: LlmComplete): Promise<BrainOutput> {
  try {
    const prompt = `${BRAIN_SYSTEM}\n\nKNOWN SO FAR: ${JSON.stringify(dossier.signals)}\nUSER TURN: ${userInput}`;
    const raw = await llm(prompt, { temperature: 0, tag: "brain" });
    const out = parseBrain(raw);
    if (!out.expandedQuery) out.expandedQuery = userInput; // never retrieve on empty
    return out;
  } catch {
    return { intent: "unknown", entities: {}, expandedQuery: userInput }; // spec §8 fallback
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/brain.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/brain.ts lab/server/src/brain.test.ts
git commit -m "feat(coordinator): brain signal extraction with raw-query fallback"
```

---

### Task C2: Discovery state machine (Onion Protocol)

Pure logic: accumulate the dossier across turns, never re-ask a locked signal, apply the F-044 short-turn rule, cap discovery at ≤4 turns, decide qualification.

**Files:**
- Create: `lab/server/src/discovery.ts`
- Test: `lab/server/src/discovery.test.ts`

**Interfaces:**
- Produces:
  - `type OnionSignal = "stack" | "scale" | "role" | "pain" | "industry" | "product" | "feature" | "solution"`
  - `interface Dossier { signals: Partial<Record<OnionSignal, string>>; askedSignals: OnionSignal[]; turnCount: number }`
  - `function emptyDossier(): Dossier`
  - `function accumulate(dossier: Dossier, update: { signals?: Partial<Record<OnionSignal,string>>; asked?: OnionSignal }, userInput: string): Dossier`  ← applies F-044: a short reply (≤3 words) enriches signals but does NOT increment topic/turn reset
  - `function isQualified(dossier: Dossier): boolean`  ← ≥3 locked signals OR turnCount ≥ 4
  - `function nextUnaskedSignal(dossier: Dossier, candidate?: OnionSignal): OnionSignal | undefined`  ← never returns an already-asked signal

- [ ] **Step 1: Write the failing test**

```typescript
// lab/server/src/discovery.test.ts
import { describe, it, expect } from "vitest";
import { emptyDossier, accumulate, isQualified, nextUnaskedSignal } from "./discovery";

describe("discovery state machine", () => {
  it("accumulates signals and records asked signals", () => {
    let d = emptyDossier();
    d = accumulate(d, { signals: { industry: "retail" }, asked: "stack" }, "we are a retailer");
    expect(d.signals.industry).toBe("retail");
    expect(d.askedSignals).toContain("stack");
    expect(d.turnCount).toBe(1);
  });

  it("F-044: a short reply enriches but does not increment turnCount", () => {
    let d = emptyDossier();
    d = accumulate(d, { signals: { stack: "Shopify" } }, "Shopify"); // 1 word
    expect(d.signals.stack).toBe("Shopify");
    expect(d.turnCount).toBe(0); // short turn did not count as a full topic turn
  });

  it("never re-asks a locked signal", () => {
    let d = emptyDossier();
    d = accumulate(d, { asked: "stack" }, "a full sentence reply here");
    expect(nextUnaskedSignal(d, "stack")).not.toBe("stack");
  });

  it("qualifies at 3 locked signals", () => {
    let d = emptyDossier();
    d = accumulate(d, { signals: { industry: "retail", stack: "Shopify", scale: "10M skus" } }, "long reply about our setup");
    expect(isQualified(d)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/discovery.test.ts`
Expected: FAIL — cannot find module `./discovery`.

- [ ] **Step 3: Implement the state machine**

```typescript
// lab/server/src/discovery.ts
export type OnionSignal = "stack" | "scale" | "role" | "pain" | "industry" | "product" | "feature" | "solution";

export interface Dossier {
  signals: Partial<Record<OnionSignal, string>>;
  askedSignals: OnionSignal[];
  turnCount: number;
}

export function emptyDossier(): Dossier {
  return { signals: {}, askedSignals: [], turnCount: 0 };
}

const SHORT_TURN_MAX_WORDS = 3; // F-044

export function accumulate(
  dossier: Dossier,
  update: { signals?: Partial<Record<OnionSignal, string>>; asked?: OnionSignal },
  userInput: string,
): Dossier {
  const signals = { ...dossier.signals, ...(update.signals ?? {}) };
  const askedSignals = update.asked && !dossier.askedSignals.includes(update.asked)
    ? [...dossier.askedSignals, update.asked]
    : dossier.askedSignals;
  const isShort = userInput.trim().split(/\s+/).filter(Boolean).length <= SHORT_TURN_MAX_WORDS;
  const turnCount = isShort ? dossier.turnCount : dossier.turnCount + 1; // F-044: short reply doesn't advance
  return { signals, askedSignals, turnCount };
}

export function isQualified(dossier: Dossier): boolean {
  return Object.keys(dossier.signals).length >= 3 || dossier.turnCount >= 4;
}

const ONION_ORDER: OnionSignal[] = ["pain", "stack", "scale", "role", "industry", "product", "feature", "solution"];

export function nextUnaskedSignal(dossier: Dossier, candidate?: OnionSignal): OnionSignal | undefined {
  if (candidate && !dossier.askedSignals.includes(candidate)) return candidate;
  return ONION_ORDER.find((s) => !dossier.askedSignals.includes(s) && !(s in dossier.signals));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/discovery.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/discovery.ts lab/server/src/discovery.test.ts
git commit -m "feat(coordinator): Onion Protocol discovery state machine (F-044, no-repeat, qualify)"
```

---

### Task C3: Baton router — classify need → ONE specialist

Decide whether to hand off and to whom (Elena for implementation, Bruno for architecture). One LLM classification with a deterministic fallback. NOT a fan-out.

**Files:**
- Create: `lab/server/src/baton.ts`
- Test: `lab/server/src/baton.test.ts`

**Interfaces:**
- Consumes: `LlmComplete`, `BrainOutput` (C1), `Dossier` (C2).
- Produces:
  - `type SpecialistId = "elena" | "bruno"`
  - `interface BatonDecision { handoff: boolean; specialist?: SpecialistId; rationale: string }`
  - `function routeByIntent(intent: string): SpecialistId | undefined`  ← deterministic: implementation→elena, architecture→bruno
  - `async function decideBaton(brain: BrainOutput, dossier: Dossier, llm: LlmComplete): Promise<BatonDecision>`  ← only proposes handoff once qualified; picks ONE specialist

- [ ] **Step 1: Write the failing test**

```typescript
// lab/server/src/baton.test.ts
import { describe, it, expect } from "vitest";
import { routeByIntent, decideBaton } from "./baton";
import { emptyDossier, accumulate } from "./discovery";

describe("routeByIntent", () => {
  it("maps implementation→elena, architecture→bruno", () => {
    expect(routeByIntent("implementation")).toBe("elena");
    expect(routeByIntent("architecture")).toBe("bruno");
    expect(routeByIntent("discovery")).toBeUndefined();
  });
});

describe("decideBaton", () => {
  it("does not hand off while unqualified", async () => {
    const llm = async () => "elena";
    const d = emptyDossier();
    const out = await decideBaton({ intent: "implementation", entities: {}, expandedQuery: "x" }, d, llm);
    expect(out.handoff).toBe(false);
  });

  it("hands off to exactly one specialist once qualified", async () => {
    const llm = async () => "bruno";
    let d = emptyDossier();
    d = accumulate(d, { signals: { industry: "finserv", stack: "AWS", scale: "global" } }, "long qualifying reply");
    const out = await decideBaton({ intent: "architecture", entities: {}, expandedQuery: "x" }, d, llm);
    expect(out.handoff).toBe(true);
    expect(out.specialist).toBe("bruno");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/baton.test.ts`
Expected: FAIL — cannot find module `./baton`.

- [ ] **Step 3: Implement the router**

```typescript
// lab/server/src/baton.ts
import type { LlmComplete } from "./types";
import type { BrainOutput } from "./brain";
import { type Dossier, isQualified } from "./discovery";

export type SpecialistId = "elena" | "bruno";

export interface BatonDecision {
  handoff: boolean;
  specialist?: SpecialistId;
  rationale: string;
}

export function routeByIntent(intent: string): SpecialistId | undefined {
  if (intent === "implementation") return "elena";
  if (intent === "architecture") return "bruno";
  return undefined;
}

export async function decideBaton(brain: BrainOutput, dossier: Dossier, llm: LlmComplete): Promise<BatonDecision> {
  if (!isQualified(dossier)) return { handoff: false, rationale: "still in discovery; not yet qualified" };
  // deterministic first; LLM only to disambiguate when intent is unclear
  let specialist = routeByIntent(brain.intent);
  if (!specialist) {
    try {
      const ans = (await llm(
        `Pick ONE specialist for this need. Reply exactly "elena" (implementation/how-to) or "bruno" (architecture/scale/security).\nINTENT: ${brain.intent}\nQUERY: ${brain.expandedQuery}`,
        { temperature: 0, tag: "baton" },
      )).trim().toLowerCase();
      specialist = ans.includes("bruno") ? "bruno" : "elena";
    } catch {
      specialist = "elena"; // safe default
    }
  }
  return { handoff: true, specialist, rationale: `qualified; routed to ${specialist}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/baton.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/baton.ts lab/server/src/baton.test.ts
git commit -m "feat(coordinator): single-specialist baton router (no fan-out)"
```

---

### Task C4: `orchestrateEngagement` — RC2-shape orchestration (replaces fan-out)

Compose C1–C3 + the streaming runner into the multi-agent path: Maverick discovery → (if qualified) baton → ONE specialist deep-dive → yield. The single-agent path is Maverick alone. This replaces `multiAgent.ts`'s `orchestrate()`.

**Files:**
- Create: `lab/server/src/orchestrate.ts`
- Modify: `lab/server/src/answer.ts` (multi path calls `orchestrateEngagement` instead of old `orchestrate`)
- Test: `lab/server/src/orchestrate.test.ts`
- Delete (after green): the fan-out body of `lab/server/src/multiAgent.ts` (`SYNTHESIZE_SYSTEM`, parallel `mapWithConcurrency` over specialists). Keep `buildRetrievalQuery` if still used.

**Interfaces:**
- Consumes: `runBrain`/`BrainOutput` (C1), discovery (C2), `decideBaton` (C3), `AgentRunner`/`OnToken` (B2), `CHARTERS`/`PersonaId` (A1).
- Produces:
  - `interface EngagementTurnResult { answer: string; sources: StreamSource[]; persona: PersonaId; handoff?: { specialist: SpecialistId }; proposedQuestion?: string; dossier: Dossier }`
  - `interface OrchestrateDeps { runAgent: AgentRunner; llm: LlmComplete; agentIds: Record<PersonaId, string> }`
  - `async function orchestrateEngagement(userInput: string, dossier: Dossier, mode: "single" | "multi", deps: OrchestrateDeps, onToken?: OnToken): Promise<EngagementTurnResult>`

- [ ] **Step 1: Write the failing test (fake runner + fake llm)**

```typescript
// lab/server/src/orchestrate.test.ts
import { describe, it, expect } from "vitest";
import { orchestrateEngagement } from "./orchestrate";
import { emptyDossier, accumulate } from "./discovery";

const agentIds = { maverick: "mav", elena: "ele", bruno: "bru" };
const fakeRun = async (id: string) => ({
  answer: id === "mav" ? "Maverick value answer." : "Specialist deep dive.",
  sources: [{ title: "S", url: "u" }],
});
// brain returns implementation intent + qualifies quickly
const fakeLlm = async (p: string) =>
  p.includes("structured signals")
    ? '{"intent":"implementation","entities":{"industry":"retail"},"expandedQuery":"q","proposedQuestion":"scale?","askedSignal":"scale"}'
    : "elena";

describe("orchestrateEngagement", () => {
  it("single mode = Maverick only, never hands off", async () => {
    const r = await orchestrateEngagement("hi", emptyDossier(), "single", { runAgent: fakeRun, llm: fakeLlm, agentIds });
    expect(r.persona).toBe("maverick");
    expect(r.handoff).toBeUndefined();
    expect(r.answer).toContain("Maverick");
  });

  it("multi mode hands off to ONE specialist once qualified and returns the deep-dive", async () => {
    let d = emptyDossier();
    d = accumulate(d, { signals: { industry: "retail", stack: "Shopify", scale: "big" } }, "long qualifying reply");
    const r = await orchestrateEngagement("how do I build it", d, "multi", { runAgent: fakeRun, llm: fakeLlm, agentIds });
    expect(r.handoff?.specialist).toBe("elena");
    expect(r.persona).toBe("elena");
    expect(r.answer).toContain("deep dive");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/orchestrate.test.ts`
Expected: FAIL — cannot find module `./orchestrate`.

- [ ] **Step 3: Implement orchestration**

```typescript
// lab/server/src/orchestrate.ts
import type { LlmComplete } from "./types";
import type { AgentRunner, OnToken } from "./agentRunner";
import type { StreamSource } from "./streamParser";
import { runBrain } from "./brain";
import { type Dossier, accumulate } from "./discovery";
import { decideBaton, type SpecialistId } from "./baton";
import type { PersonaId } from "./charters";

export interface EngagementTurnResult {
  answer: string;
  sources: StreamSource[];
  persona: PersonaId;
  handoff?: { specialist: SpecialistId };
  proposedQuestion?: string;
  dossier: Dossier;
}

export interface OrchestrateDeps {
  runAgent: AgentRunner;
  llm: LlmComplete;
  agentIds: Record<PersonaId, string>;
}

export async function orchestrateEngagement(
  userInput: string,
  dossier: Dossier,
  mode: "single" | "multi",
  deps: OrchestrateDeps,
  onToken?: OnToken,
): Promise<EngagementTurnResult> {
  const brain = await runBrain(userInput, dossier, deps.llm);
  const nextDossier = accumulate(
    dossier,
    { signals: pickSignals(brain), asked: brain.askedSignal as never },
    userInput,
  );

  // Maverick always answers first (value / discovery).
  const mav = await deps.runAgent(deps.agentIds.maverick, brain.expandedQuery, [], onToken);

  if (mode === "single") {
    return {
      answer: mav.answer, sources: mav.sources, persona: "maverick",
      proposedQuestion: brain.proposedQuestion, dossier: nextDossier,
    };
  }

  // multi: decide baton; if no handoff yet, the multi panel's answer is Maverick's (still discovering).
  const baton = await decideBaton(brain, nextDossier, deps.llm);
  if (!baton.handoff || !baton.specialist) {
    return {
      answer: mav.answer, sources: mav.sources, persona: "maverick",
      proposedQuestion: brain.proposedQuestion, dossier: nextDossier,
    };
  }
  const spec = await deps.runAgent(deps.agentIds[baton.specialist], brain.expandedQuery, [], onToken);
  return {
    answer: spec.answer, sources: spec.sources, persona: baton.specialist,
    handoff: { specialist: baton.specialist }, proposedQuestion: brain.proposedQuestion,
    dossier: nextDossier,
  };
}

function pickSignals(brain: { entities: { industry?: string; product?: string } }) {
  const s: Record<string, string> = {};
  if (brain.entities.industry) s.industry = brain.entities.industry;
  if (brain.entities.product) s.product = brain.entities.product;
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/orchestrate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Point `answer.ts` multi path at the new orchestrator + retire the fan-out**

In `lab/server/src/answer.ts`, the multi-panel branch (lines ~148–164) currently calls `deps.orchestrate(...)`. Replace with `orchestrateEngagement(question, dossier, "multi", ...)` and map `EngagementTurnResult` → `PanelAnswerResult` (`answer`, `sources`, `followUp = proposedQuestion`, `trace` with persona/handoff). Single-panel branch (lines ~168–191) now calls `orchestrateEngagement(question, dossier, "single", ...)` instead of a bare `runAgent`, so both panels share the brain/discovery path (fairness). Then remove the fan-out body from `multiAgent.ts` (`SYNTHESIZE_SYSTEM`, the parallel specialist loop). Update `multiAgent.test.ts` — delete tests for the removed fan-out; keep `buildRetrievalQuery` tests if that helper survives.

- [ ] **Step 6: Run the full server suite + typecheck**

Run: `cd lab/server && npx vitest run && npx tsc --noEmit`
Expected: PASS; `tsc` clean. Fix `answer.ts`/`answerService.ts` type wiring (the `AnswerDeps` may need `agentIds: Record<PersonaId,string>` instead of the old `specialistAgents` map).

- [ ] **Step 7: Commit**

```bash
git add lab/server/src/orchestrate.ts lab/server/src/orchestrate.test.ts lab/server/src/answer.ts lab/server/src/multiAgent.ts lab/server/src/multiAgent.test.ts
git commit -m "feat(coordinator): RC2-shape single-specialist orchestration; retire parallel fan-out"
```

---

## GROUP D — Reference-based engagement-level judge

### Task D1: Reference artifact types + grounding code-check

New judge input that carries the gold reference, plus the hard-floor grounding check implemented in code (claim extraction + support against the candidate's OWN sources).

**Files:**
- Create: `lab/judge/src/referenceTypes.ts`
- Create: `lab/judge/src/grounding.ts`
- Test: `lab/judge/src/grounding.test.ts`

**Interfaces:**
- Consumes: `LlmComplete`, `Source` (existing `lab/judge/src/types.ts`).
- Produces:
  - `interface ReferenceTurnArtifact { userInput: string; candidateAnswer: string; candidateSources: Source[]; goldAnswer: string; goldSources: Source[]; turnRole: "discovery" | "deepdive"; expectedSpecialist?: "elena" | "bruno" }`
  - `interface GroundingResult { grounded: boolean; violations: Array<{ claim: string; reason: string }> }`
  - `async function checkGrounding(answer: string, sources: Source[], llm: LlmComplete): Promise<GroundingResult>`  ← extracts factual claims, marks any not supported by `sources` as a CONTRADICTION-class violation (hard floor); "unverifiable but not contradicted" does NOT trip (consistent with the prior grounding-floor decision)

- [ ] **Step 1: Write the failing test**

```typescript
// lab/judge/src/grounding.test.ts
import { describe, it, expect } from "vitest";
import { checkGrounding } from "./grounding";
import type { Source } from "./types";

const sources: Source[] = [{ id: "1", text: "Gymshark increased conversion by 27% with Algolia.", label: "case" }];

describe("checkGrounding", () => {
  it("passes an answer whose claims are all in sources", async () => {
    const llm = async () => '{"violations":[]}';
    const r = await checkGrounding("Gymshark saw a 27% lift.", sources, llm);
    expect(r.grounded).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("trips on a contradicted/unsupported claim", async () => {
    const llm = async () => '{"violations":[{"claim":"Nike used Algolia","reason":"absent from sources"}]}';
    const r = await checkGrounding("Nike used Algolia for 50% growth.", sources, llm);
    expect(r.grounded).toBe(false);
    expect(r.violations[0].claim).toContain("Nike");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/judge && npx vitest run src/grounding.test.ts`
Expected: FAIL — cannot find module `./grounding`.

- [ ] **Step 3: Implement reference types + grounding check**

```typescript
// lab/judge/src/referenceTypes.ts
import type { Source } from "./types";
export interface ReferenceTurnArtifact {
  userInput: string;
  candidateAnswer: string;
  candidateSources: Source[];
  goldAnswer: string;
  goldSources: Source[];
  turnRole: "discovery" | "deepdive";
  expectedSpecialist?: "elena" | "bruno";
}
```

```typescript
// lab/judge/src/grounding.ts
import type { Source, LlmComplete } from "./types";

export interface GroundingResult {
  grounded: boolean;
  violations: Array<{ claim: string; reason: string }>;
}

const SYSTEM = `You verify grounding. Given an ANSWER and its SOURCES, list every factual claim in the answer
that is CONTRADICTED by or wholly ABSENT-and-unsupportable from the sources. Do NOT list claims that are
merely common knowledge or reasonable paraphrase. Return ONLY JSON: {"violations":[{"claim","reason"}]}.`;

export async function checkGrounding(answer: string, sources: Source[], llm: LlmComplete): Promise<GroundingResult> {
  const prompt = `${SYSTEM}\n\nSOURCES:\n${sources.map((s, i) => `[${i}] ${s.text}`).join("\n")}\n\nANSWER:\n${answer}`;
  let violations: GroundingResult["violations"] = [];
  try {
    const raw = await llm(prompt, { temperature: 0, tag: "grounding" });
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    violations = Array.isArray(j.violations) ? j.violations : [];
  } catch {
    violations = []; // never fail-closed into a false grounding trip on parse error; log upstream
  }
  return { grounded: violations.length === 0, violations };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/judge && npx vitest run src/grounding.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/judge/src/referenceTypes.ts lab/judge/src/grounding.ts lab/judge/src/grounding.test.ts
git commit -m "feat(judge): reference artifact types + code-based grounding hard-floor check"
```

---

### Task D2: Voice code-gate (port `validateMaverickVoice`, per-persona)

Port RC2's `validateMaverickVoice` (spec §3.3) and add Elena/Bruno variants so voice is a code check, not an LLM vibe.

**Files:**
- Create: `lab/judge/src/voice.ts`
- Test: `lab/judge/src/voice.test.ts`

**Interfaces:**
- Produces:
  - `interface VoiceResult { compliant: boolean; violations: string[] }`
  - `function validateVoice(persona: "maverick" | "elena" | "bruno", answer: string, opts: { substantive: boolean }): VoiceResult`

- [ ] **Step 1: Write the failing test**

```typescript
// lab/judge/src/voice.test.ts
import { describe, it, expect } from "vitest";
import { validateVoice } from "./voice";

describe("validateVoice (maverick, ported from RC2)", () => {
  it("flags a code block (Maverick is banned from code)", () => {
    const r = validateVoice("maverick", "Here:\n```js\nx\n```", { substantive: true });
    expect(r.compliant).toBe(false);
    expect(r.violations.join(" ")).toMatch(/code block/i);
  });
  it("flags a doc-bot opener", () => {
    const r = validateVoice("maverick", "To enable search, the feature is configured...", { substantive: true });
    expect(r.compliant).toBe(false);
  });
  it("flags missing algolia.com citation on a substantive answer", () => {
    const r = validateVoice("maverick", "Gymshark grew fast with great search and a real win here.", { substantive: true });
    expect(r.violations.join(" ")).toMatch(/citation|algolia\.com/i);
  });
  it("passes a compliant Maverick answer", () => {
    const r = validateVoice("maverick", "Gymshark crushed it — 27% lift. [proof](https://www.algolia.com/x) with NeuralSearch.", { substantive: true });
    expect(r.compliant).toBe(true);
  });
});

describe("validateVoice (bruno allows code)", () => {
  it("does NOT flag a code block for Bruno", () => {
    const r = validateVoice("bruno", "```ts\nconst x=1\n```\nScales fine.", { substantive: true });
    expect(r.violations.join(" ")).not.toMatch(/code block/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/judge && npx vitest run src/voice.test.ts`
Expected: FAIL — cannot find module `./voice`.

- [ ] **Step 3: Port the gate (from `rc2-algolia/lib/search/persona_loader.ts:563-605`)**

Copy the regexes/word-ceiling/anchor checks verbatim from RC2's `validateMaverickVoice` for the `maverick` branch. For `elena`/`bruno`, drop the code-block ban (they may show code) and the doc-bot-opener ban is relaxed; keep the citation requirement on substantive answers for all three.

```typescript
// lab/judge/src/voice.ts
export interface VoiceResult { compliant: boolean; violations: string[] }

const CODE_BLOCK_RE = /```[\s\S]*?```/;
const DOC_BOT_OPENER_RE = /^\s*(to\s+[a-z]+\s|in\s+order\s+to\s|the\s+(?:[a-z]+\s+){1,4}(is|are|can|lets?|provides?|offers?|allows?|helps?)\s)/i;
const ALGOLIA_LINK_RE = /\]\(https?:\/\/(?:www\.)?algolia\.com[^\s)]*\)/i;
const MAX_WORDS = 400;
const MIN_WORDS_SUBSTANTIVE = 50;

export function validateVoice(
  persona: "maverick" | "elena" | "bruno",
  answer: string,
  opts: { substantive: boolean },
): VoiceResult {
  const violations: string[] = [];
  const words = answer.trim().split(/\s+/).filter(Boolean);

  if (persona === "maverick") {
    if (CODE_BLOCK_RE.test(answer)) violations.push("Code block present — Maverick is banned from code.");
    if (DOC_BOT_OPENER_RE.test(answer)) violations.push("Doc-bot opener detected — open with a value hook.");
    if (words.length > MAX_WORDS) violations.push(`Encyclopedic word count (${words.length} > ${MAX_WORDS}).`);
  }
  if (opts.substantive) {
    if (words.length < MIN_WORDS_SUBSTANTIVE) violations.push(`Too thin (${words.length} < ${MIN_WORDS_SUBSTANTIVE} words).`);
    if (!ALGOLIA_LINK_RE.test(answer)) violations.push("No markdown algolia.com citation on a substantive answer.");
  }
  return { compliant: violations.length === 0, violations };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/judge && npx vitest run src/voice.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/judge/src/voice.ts lab/judge/src/voice.test.ts
git commit -m "feat(judge): per-persona voice code-gate ported from RC2 validateMaverickVoice"
```

---

### Task D3: §3.5 retrieval-gap vs generation-gap classifier

The spec-patch's keystone: for each gold claim AC2's answer missed, decide whether it was absent from AC2's retrieved sources (retrieval-gap) or present-but-unused (generation-gap).

**Files:**
- Create: `lab/judge/src/gapClassifier.ts`
- Test: `lab/judge/src/gapClassifier.test.ts`

**Interfaces:**
- Consumes: `LlmComplete`, `Source`.
- Produces:
  - `type GapKind = "retrieval-gap" | "generation-gap"`
  - `interface MissedClaim { claim: string; gap: GapKind }`
  - `async function classifyGaps(missedGoldClaims: string[], candidateSources: Source[], llm: LlmComplete): Promise<MissedClaim[]>`  ← for each claim, asks isolated "is this claim supported by ANY of these sources?"; yes→generation-gap, no→retrieval-gap

- [ ] **Step 1: Write the failing test**

```typescript
// lab/judge/src/gapClassifier.test.ts
import { describe, it, expect } from "vitest";
import { classifyGaps } from "./gapClassifier";
import type { Source } from "./types";

const sources: Source[] = [{ id: "1", text: "Algolia NeuralSearch blends keyword and vector retrieval." }];

describe("classifyGaps", () => {
  it("labels a claim supported by sources but missing from the answer as generation-gap", async () => {
    const llm = async () => "yes"; // claim IS supported by the source set
    const out = await classifyGaps(["NeuralSearch blends keyword and vector"], sources, llm);
    expect(out[0].gap).toBe("generation-gap");
  });
  it("labels a claim absent from sources as retrieval-gap", async () => {
    const llm = async () => "no"; // not in the source set at all
    const out = await classifyGaps(["Algolia offers a Shopify plugin"], sources, llm);
    expect(out[0].gap).toBe("retrieval-gap");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/judge && npx vitest run src/gapClassifier.test.ts`
Expected: FAIL — cannot find module `./gapClassifier`.

- [ ] **Step 3: Implement the classifier**

```typescript
// lab/judge/src/gapClassifier.ts
import type { Source, LlmComplete } from "./types";

export type GapKind = "retrieval-gap" | "generation-gap";
export interface MissedClaim { claim: string; gap: GapKind }

export async function classifyGaps(
  missedGoldClaims: string[],
  candidateSources: Source[],
  llm: LlmComplete,
): Promise<MissedClaim[]> {
  const sourceText = candidateSources.map((s, i) => `[${i}] ${s.text}`).join("\n");
  const out: MissedClaim[] = [];
  for (const claim of missedGoldClaims) {
    let supported = false;
    try {
      const ans = (await llm(
        `Is the following CLAIM supported by ANY of these SOURCES? Answer only "yes" or "no".\nSOURCES:\n${sourceText}\nCLAIM: ${claim}`,
        { temperature: 0, tag: "gap" },
      )).trim().toLowerCase();
      supported = ans.startsWith("y");
    } catch {
      supported = false; // unknown → treat as retrieval-gap (don't blame the prompt-loop)
    }
    out.push({ claim, gap: supported ? "generation-gap" : "retrieval-gap" });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/judge && npx vitest run src/gapClassifier.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/judge/src/gapClassifier.ts lab/judge/src/gapClassifier.test.ts
git commit -m "feat(judge): §3.5 retrieval-gap vs generation-gap classifier"
```

---

### Task D4: Per-criterion reference judges + "% of floor" aggregation

The LLM-judged criteria (coverage, depth, on-point, right-expert, good-next-question), each scored in isolation as ratio-to-gold, plus the aggregation (grounding hard gate from D1, voice from D2; ADR-2b default = unweighted mean of the rest).

**Files:**
- Create: `lab/judge/src/referenceCriteria.ts`
- Test: `lab/judge/src/referenceCriteria.test.ts`

**Interfaces:**
- Consumes: `ReferenceTurnArtifact` (D1), `LlmComplete`, `MissedClaim` (D3).
- Produces:
  - `type CriterionId = "coverage" | "depth" | "onPoint" | "rightExpert" | "nextQuestion"`
  - `interface CriterionScore { id: CriterionId; pctOfGold: number; rationale: string; missedClaims?: MissedClaim[] }`
  - `async function scoreCriterion(id: CriterionId, art: ReferenceTurnArtifact, llm: LlmComplete): Promise<CriterionScore>`  ← isolated call per criterion; coverage additionally returns missed claims for D3
  - `function aggregatePctOfFloor(scores: CriterionScore[], grounded: boolean, voiceCompliant: boolean): { pctOfFloor: number; gated: boolean }`  ← grounding gate caps to 0 if not grounded; ADR-2b unweighted mean otherwise

- [ ] **Step 1: Write the failing test**

```typescript
// lab/judge/src/referenceCriteria.test.ts
import { describe, it, expect } from "vitest";
import { scoreCriterion, aggregatePctOfFloor, type CriterionScore } from "./referenceCriteria";
import type { ReferenceTurnArtifact } from "./referenceTypes";

const art: ReferenceTurnArtifact = {
  userInput: "retail wins?",
  candidateAnswer: "Gymshark saw a 27% lift.",
  candidateSources: [{ id: "1", text: "Gymshark 27% lift with Algolia." }],
  goldAnswer: "Gymshark saw a 27% lift; Lacoste improved conversion too.",
  goldSources: [{ id: "g", text: "..." }],
  turnRole: "discovery",
};

describe("scoreCriterion", () => {
  it("parses a pct-of-gold score and rationale", async () => {
    const llm = async () => '{"pctOfGold":80,"rationale":"covered Gymshark, missed Lacoste","missedClaims":["Lacoste improved conversion"]}';
    const s = await scoreCriterion("coverage", art, llm);
    expect(s.id).toBe("coverage");
    expect(s.pctOfGold).toBe(80);
  });
});

describe("aggregatePctOfFloor", () => {
  const scores: CriterionScore[] = [
    { id: "coverage", pctOfGold: 80, rationale: "" },
    { id: "depth", pctOfGold: 100, rationale: "" },
    { id: "onPoint", pctOfGold: 120, rationale: "" },
  ];
  it("ADR-2b: unweighted mean when grounded + voice OK", () => {
    const r = aggregatePctOfFloor(scores, true, true);
    expect(r.gated).toBe(false);
    expect(r.pctOfFloor).toBe(100); // (80+100+120)/3
  });
  it("grounding gate caps to 0 when not grounded", () => {
    const r = aggregatePctOfFloor(scores, false, true);
    expect(r.gated).toBe(true);
    expect(r.pctOfFloor).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/judge && npx vitest run src/referenceCriteria.test.ts`
Expected: FAIL — cannot find module `./referenceCriteria`.

- [ ] **Step 3: Implement criteria + aggregation**

```typescript
// lab/judge/src/referenceCriteria.ts
import type { LlmComplete } from "./types";
import type { ReferenceTurnArtifact } from "./referenceTypes";
import type { MissedClaim } from "./gapClassifier";

export type CriterionId = "coverage" | "depth" | "onPoint" | "rightExpert" | "nextQuestion";

export interface CriterionScore {
  id: CriterionId;
  pctOfGold: number;
  rationale: string;
  missedClaims?: MissedClaim[];
}

const PROMPTS: Record<CriterionId, (a: ReferenceTurnArtifact) => string> = {
  coverage: (a) => `Compare CANDIDATE to GOLD. What % of GOLD's substantive points does CANDIDATE cover? List GOLD points CANDIDATE missed.\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale","missedClaims":[...]} (100=matched, >100=exceeded).`,
  depth: (a) => `Is CANDIDATE as DEEP as GOLD (specificity, mechanism, numbers)? GOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
  onPoint: (a) => `Did CANDIDATE use the user's stated situation as well as GOLD did?\nUSER: ${a.userInput}\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
  rightExpert: (a) => `Does CANDIDATE deliver the deep-dive the correct expert would, matching GOLD's expert answer (judge by CONTENT, not agent name)?\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
  nextQuestion: (a) => `Does CANDIDATE's discovery follow-up peel the onion as well as GOLD's?\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
};

export async function scoreCriterion(id: CriterionId, art: ReferenceTurnArtifact, llm: LlmComplete): Promise<CriterionScore> {
  try {
    const raw = await llm(PROMPTS[id](art), { temperature: 0, tag: `crit:${id}` });
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      id,
      pctOfGold: typeof j.pctOfGold === "number" ? j.pctOfGold : 0,
      rationale: j.rationale ?? "",
      missedClaims: Array.isArray(j.missedClaims) ? j.missedClaims.map((c: string) => ({ claim: c, gap: "retrieval-gap" as const })) : undefined,
    };
  } catch {
    return { id, pctOfGold: 0, rationale: "judge parse/Unknown — insufficient evidence" }; // "Unknown" out (spec §3.4)
  }
}

export function aggregatePctOfFloor(
  scores: CriterionScore[],
  grounded: boolean,
  voiceCompliant: boolean,
): { pctOfFloor: number; gated: boolean } {
  if (!grounded) return { pctOfFloor: 0, gated: true }; // hard floor
  const base = scores.length ? scores.reduce((s, c) => s + c.pctOfGold, 0) / scores.length : 0;
  // voice is a code-gate; a non-compliant voice applies a light penalty (kept simple per ADR-2b default)
  const pct = voiceCompliant ? base : base * 0.9;
  return { pctOfFloor: Math.round(pct), gated: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/judge && npx vitest run src/referenceCriteria.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lab/judge/src/referenceCriteria.ts lab/judge/src/referenceCriteria.test.ts
git commit -m "feat(judge): per-criterion reference scoring + %-of-floor aggregation (ADR-2b default)"
```

---

### Task D5: `judgeEngagementTurn` entry point

Compose D1–D4 into one engagement-turn verdict, wiring coverage's missed claims through the §3.5 classifier.

**Files:**
- Create: `lab/judge/src/judgeReference.ts`
- Modify: `lab/judge/src/index.ts` (export the new entry)
- Test: `lab/judge/src/judgeReference.test.ts`

**Interfaces:**
- Consumes: D1 `checkGrounding`/`ReferenceTurnArtifact`, D2 `validateVoice`, D3 `classifyGaps`, D4 `scoreCriterion`/`aggregatePctOfFloor`.
- Produces:
  - `interface TurnVerdict { pctOfFloor: number; gated: boolean; grounded: boolean; voice: VoiceResult; criteria: CriterionScore[]; missedClaims: MissedClaim[] }`
  - `async function judgeEngagementTurn(art: ReferenceTurnArtifact, persona: "maverick"|"elena"|"bruno", llm: LlmComplete): Promise<TurnVerdict>`

- [ ] **Step 1: Write the failing test**

```typescript
// lab/judge/src/judgeReference.test.ts
import { describe, it, expect } from "vitest";
import { judgeEngagementTurn } from "./judgeReference";
import type { ReferenceTurnArtifact } from "./referenceTypes";

const art: ReferenceTurnArtifact = {
  userInput: "retail wins?",
  candidateAnswer: "Gymshark saw a 27% lift. [proof](https://www.algolia.com/x) with NeuralSearch and real impact across the funnel for shoppers.",
  candidateSources: [{ id: "1", text: "Gymshark 27% lift with Algolia NeuralSearch." }],
  goldAnswer: "Gymshark saw a 27% lift; Lacoste improved too.",
  goldSources: [{ id: "g", text: "..." }],
  turnRole: "discovery",
};

describe("judgeEngagementTurn", () => {
  it("produces a %-of-floor verdict with grounding, voice, criteria, and gap tags", async () => {
    // route llm by tag-bearing prompt content
    const llm = async (p: string) => {
      if (p.includes("verify grounding") || p.includes("CONTRADICTED")) return '{"violations":[]}';
      if (p.startsWith("Is the following CLAIM")) return "no"; // missed Lacoste claim → retrieval-gap
      return '{"pctOfGold":80,"rationale":"ok","missedClaims":["Lacoste improved too"]}';
    };
    const v = await judgeEngagementTurn(art, "maverick", llm);
    expect(v.grounded).toBe(true);
    expect(v.gated).toBe(false);
    expect(v.pctOfFloor).toBeGreaterThan(0);
    expect(v.missedClaims.some((m) => m.gap === "retrieval-gap")).toBe(true);
    expect(v.criteria.map((c) => c.id)).toContain("coverage");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/judge && npx vitest run src/judgeReference.test.ts`
Expected: FAIL — cannot find module `./judgeReference`.

- [ ] **Step 3: Implement the entry point**

```typescript
// lab/judge/src/judgeReference.ts
import type { LlmComplete } from "./types";
import type { ReferenceTurnArtifact } from "./referenceTypes";
import { checkGrounding } from "./grounding";
import { validateVoice, type VoiceResult } from "./voice";
import { classifyGaps, type MissedClaim } from "./gapClassifier";
import { scoreCriterion, aggregatePctOfFloor, type CriterionScore, type CriterionId } from "./referenceCriteria";

export interface TurnVerdict {
  pctOfFloor: number;
  gated: boolean;
  grounded: boolean;
  voice: VoiceResult;
  criteria: CriterionScore[];
  missedClaims: MissedClaim[];
}

export async function judgeEngagementTurn(
  art: ReferenceTurnArtifact,
  persona: "maverick" | "elena" | "bruno",
  llm: LlmComplete,
): Promise<TurnVerdict> {
  // discovery turns judge the next-question; deepdive turns judge the expert match
  const critIds: CriterionId[] = art.turnRole === "deepdive"
    ? ["coverage", "depth", "onPoint", "rightExpert"]
    : ["coverage", "depth", "onPoint", "nextQuestion"];

  const [grounding, ...criteria] = await Promise.all([
    checkGrounding(art.candidateAnswer, art.candidateSources, llm),
    ...critIds.map((id) => scoreCriterion(id, art, llm)),
  ]);

  const voice = validateVoice(persona, art.candidateAnswer, { substantive: art.candidateAnswer.trim().split(/\s+/).length >= 30 });

  // §3.5: tag coverage's missed claims by gap kind
  const rawMissed = criteria.find((c) => c.id === "coverage")?.missedClaims?.map((m) => m.claim) ?? [];
  const missedClaims = await classifyGaps(rawMissed, art.candidateSources, llm);

  const agg = aggregatePctOfFloor(criteria, grounding.grounded, voice.compliant);
  return {
    pctOfFloor: agg.pctOfFloor,
    gated: agg.gated,
    grounded: grounding.grounded,
    voice,
    criteria,
    missedClaims,
  };
}
```

Add to `lab/judge/src/index.ts`: `export { judgeEngagementTurn, type TurnVerdict } from "./judgeReference";` plus re-exports of `ReferenceTurnArtifact`, `classifyGaps`, etc.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/judge && npx vitest run src/judgeReference.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lab/judge/src/judgeReference.ts lab/judge/src/index.ts lab/judge/src/judgeReference.test.ts
git commit -m "feat(judge): judgeEngagementTurn — reference-based engagement-turn verdict"
```

---

## GROUP E — Replay harness

### Task E1: Gold loader

Load the Phase 0 gold records and expose them typed.

**Files:**
- Create: `lab/server/src/replay/goldLoader.ts`
- Test: `lab/server/src/replay/goldLoader.test.ts`
- Fixture: `lab/server/src/replay/__fixtures__/sample-gold.json` (one minimal GoldEngagement)

**Interfaces:**
- Produces (must match Phase 0's `GoldEngagement`):
  - `interface GoldEngagement { scenarioId: string; vertical: string; tier: "Q1"|"Q2"; expectsHandoff: boolean; handoffTarget?: "elena"|"bruno"; drivingSequence: string[]; turns: GoldTurnRecord[]; blessedBy: string | null }`
  - `interface GoldTurnRecord { turnIndex: number; userInput: string; answer: string; sources: Array<{title:string;url:string}>; activePersona: string; handoff?: {specialist:string}; discoveryQuestion?: string }`
  - `function loadGold(dir?: string): GoldEngagement[]`  ← reads `lab/replay/gold/*.json`, throws on an unblessed record

- [ ] **Step 1: Write the failing test**

```typescript
// lab/server/src/replay/goldLoader.test.ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadGold } from "./goldLoader";

describe("loadGold", () => {
  it("loads blessed gold engagements from the fixtures dir", () => {
    const gold = loadGold(join(__dirname, "__fixtures__"));
    expect(gold.length).toBeGreaterThan(0);
    expect(gold[0].drivingSequence.length).toBe(gold[0].turns.length);
    expect(gold[0].blessedBy).toBe("arijit");
  });
});
```

Create the fixture `lab/server/src/replay/__fixtures__/sample-gold.json`:

```json
{
  "scenarioId": "retail-q1", "vertical": "retail", "tier": "Q1",
  "expectsHandoff": false, "drivingSequence": ["Tell me retail wins", "We use Shopify"],
  "turns": [
    { "turnIndex": 0, "userInput": "Tell me retail wins", "answer": "Gymshark 27% lift.", "sources": [{"title":"GS","url":"u"}], "activePersona": "maverick", "discoveryQuestion": "What stack?" },
    { "turnIndex": 1, "userInput": "We use Shopify", "answer": "Shopify + Algolia works great.", "sources": [], "activePersona": "maverick" }
  ],
  "capturedAt": "2026-06-21T00:00:00Z", "blessedBy": "arijit"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/replay/goldLoader.test.ts`
Expected: FAIL — cannot find module `./goldLoader`.

- [ ] **Step 3: Implement the loader**

```typescript
// lab/server/src/replay/goldLoader.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface GoldTurnRecord {
  turnIndex: number; userInput: string; answer: string;
  sources: Array<{ title: string; url: string }>;
  activePersona: string; handoff?: { specialist: string }; discoveryQuestion?: string;
}
export interface GoldEngagement {
  scenarioId: string; vertical: string; tier: "Q1" | "Q2";
  expectsHandoff: boolean; handoffTarget?: "elena" | "bruno";
  drivingSequence: string[]; turns: GoldTurnRecord[]; blessedBy: string | null;
}

export function loadGold(dir = join(process.cwd(), "..", "..", "lab", "replay", "gold")): GoldEngagement[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const eng = JSON.parse(readFileSync(join(dir, f), "utf8")) as GoldEngagement;
    if (!eng.blessedBy) throw new Error(`gold ${f} is not blessed — run Phase 0 bless step`);
    return eng;
  });
}
```

> Adjust the default `dir` to the correct relative path from `lab/server`'s runtime CWD to `lab/replay/gold`. The CLI (E3) passes an absolute path, so the default only matters for ad-hoc use.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/replay/goldLoader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/replay/goldLoader.ts lab/server/src/replay/goldLoader.test.ts "lab/server/src/replay/__fixtures__/sample-gold.json"
git commit -m "feat(replay): gold engagement loader (blessed-only)"
```

---

### Task E2: `replayEngagement` — drive AC2 against the fixed sequence

Feed a gold engagement's driving sequence to AC2 (single + multi), aligning turns 1:1 (spec §2.3). Carry the dossier across turns. Return AC2's per-turn outputs paired with the gold turn.

**Files:**
- Create: `lab/server/src/replay/replay.ts`
- Test: `lab/server/src/replay/replay.test.ts`

**Interfaces:**
- Consumes: `orchestrateEngagement`/`OrchestrateDeps`/`EngagementTurnResult` (C4), `emptyDossier` (C2), `GoldEngagement` (E1).
- Produces:
  - `interface ReplayedTurn { turnIndex: number; userInput: string; gold: GoldTurnRecord; candidate: EngagementTurnResult }`
  - `interface ReplayedEngagement { scenarioId: string; mode: "single"|"multi"; turns: ReplayedTurn[] }`
  - `async function replayEngagement(gold: GoldEngagement, mode: "single"|"multi", deps: OrchestrateDeps): Promise<ReplayedEngagement>`

- [ ] **Step 1: Write the failing test**

```typescript
// lab/server/src/replay/replay.test.ts
import { describe, it, expect } from "vitest";
import { replayEngagement } from "./replay";
import type { GoldEngagement } from "./goldLoader";

const gold: GoldEngagement = {
  scenarioId: "retail-q1", vertical: "retail", tier: "Q1", expectsHandoff: false,
  drivingSequence: ["Tell me retail wins", "We use Shopify"],
  turns: [
    { turnIndex: 0, userInput: "Tell me retail wins", answer: "gold A0", sources: [], activePersona: "maverick" },
    { turnIndex: 1, userInput: "We use Shopify", answer: "gold A1", sources: [], activePersona: "maverick" },
  ],
  blessedBy: "arijit",
};

const deps = {
  runAgent: async (id: string) => ({ answer: `cand from ${id}`, sources: [] }),
  llm: async () => '{"intent":"discovery","entities":{},"expandedQuery":"q"}',
  agentIds: { maverick: "mav", elena: "ele", bruno: "bru" },
};

describe("replayEngagement", () => {
  it("aligns candidate turns 1:1 with the fixed driving sequence", async () => {
    const r = await replayEngagement(gold, "single", deps);
    expect(r.turns).toHaveLength(2);
    expect(r.turns[0].userInput).toBe("Tell me retail wins");
    expect(r.turns[1].gold.answer).toBe("gold A1");
    expect(r.turns[0].candidate.answer).toContain("cand from mav");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/replay/replay.test.ts`
Expected: FAIL — cannot find module `./replay`.

- [ ] **Step 3: Implement replay**

```typescript
// lab/server/src/replay/replay.ts
import { orchestrateEngagement, type OrchestrateDeps, type EngagementTurnResult } from "../orchestrate";
import { emptyDossier, type Dossier } from "../discovery";
import type { GoldEngagement, GoldTurnRecord } from "./goldLoader";

export interface ReplayedTurn {
  turnIndex: number; userInput: string; gold: GoldTurnRecord; candidate: EngagementTurnResult;
}
export interface ReplayedEngagement {
  scenarioId: string; mode: "single" | "multi"; turns: ReplayedTurn[];
}

export async function replayEngagement(
  gold: GoldEngagement,
  mode: "single" | "multi",
  deps: OrchestrateDeps,
): Promise<ReplayedEngagement> {
  let dossier: Dossier = emptyDossier();
  const turns: ReplayedTurn[] = [];
  // The driving sequence is FIXED from gold (spec §2.3); AC2's own follow-up does not steer.
  for (let i = 0; i < gold.drivingSequence.length; i++) {
    const userInput = gold.drivingSequence[i];
    const candidate = await orchestrateEngagement(userInput, dossier, mode, deps);
    dossier = candidate.dossier;
    turns.push({ turnIndex: i, userInput, gold: gold.turns[i], candidate });
  }
  return { scenarioId: gold.scenarioId, mode, turns };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lab/server && npx vitest run src/replay/replay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/replay/replay.ts lab/server/src/replay/replay.test.ts
git commit -m "feat(replay): drive AC2 against the fixed gold driving sequence (1:1 turns)"
```

---

### Task E3: `runReplay` CLI — replay all gold, judge each turn, write scorecard

The capstone that proves the gym runs: load gold → replay single + multi → judge each turn vs gold → write a scorecard JSON.

**Files:**
- Create: `lab/server/src/replay/runReplay.ts`
- Create: `lab/server/src/replay/scorecard.ts`
- Test: `lab/server/src/replay/scorecard.test.ts`

**Interfaces:**
- Consumes: `loadGold` (E1), `replayEngagement` (E2), `judgeEngagementTurn`/`ReferenceTurnArtifact` (D5), `makeAnswerDeps`/`makePinnedLlm` (`answerService.ts`), `CHARTERS` (A1).
- Produces:
  - `interface ScorecardTurn { scenarioId: string; mode: "single"|"multi"; turnIndex: number; pctOfFloor: number; gated: boolean; retrievalGaps: number; generationGaps: number }`
  - `function summarize(turns: ScorecardTurn[]): { meanPctOfFloor: number; gatedCount: number; perScenario: Record<string, number> }`
  - `async function runReplay(opts): Promise<{ turns: ScorecardTurn[]; summary: ReturnType<typeof summarize> }>`  ← the orchestration; writes `lab/replay/results/scorecard-<provider>.json`

- [ ] **Step 1: Write the failing test (pure summarize)**

```typescript
// lab/server/src/replay/scorecard.test.ts
import { describe, it, expect } from "vitest";
import { summarize, type ScorecardTurn } from "./scorecard";

const turns: ScorecardTurn[] = [
  { scenarioId: "retail-q1", mode: "single", turnIndex: 0, pctOfFloor: 80, gated: false, retrievalGaps: 1, generationGaps: 0 },
  { scenarioId: "retail-q1", mode: "single", turnIndex: 1, pctOfFloor: 100, gated: false, retrievalGaps: 0, generationGaps: 2 },
  { scenarioId: "cpg-q1", mode: "multi", turnIndex: 0, pctOfFloor: 0, gated: true, retrievalGaps: 0, generationGaps: 0 },
];

describe("summarize", () => {
  it("computes mean %-of-floor, gated count, and per-scenario means", () => {
    const s = summarize(turns);
    expect(s.meanPctOfFloor).toBe(60); // (80+100+0)/3
    expect(s.gatedCount).toBe(1);
    expect(s.perScenario["retail-q1"]).toBe(90); // (80+100)/2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/replay/scorecard.test.ts`
Expected: FAIL — cannot find module `./scorecard`.

- [ ] **Step 3: Implement scorecard summarize + the runner**

```typescript
// lab/server/src/replay/scorecard.ts
export interface ScorecardTurn {
  scenarioId: string; mode: "single" | "multi"; turnIndex: number;
  pctOfFloor: number; gated: boolean; retrievalGaps: number; generationGaps: number;
}

export function summarize(turns: ScorecardTurn[]) {
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const perScenario: Record<string, number> = {};
  const byScenario = new Map<string, number[]>();
  for (const t of turns) {
    if (!byScenario.has(t.scenarioId)) byScenario.set(t.scenarioId, []);
    byScenario.get(t.scenarioId)!.push(t.pctOfFloor);
  }
  for (const [k, v] of byScenario) perScenario[k] = mean(v);
  return {
    meanPctOfFloor: mean(turns.map((t) => t.pctOfFloor)),
    gatedCount: turns.filter((t) => t.gated).length,
    perScenario,
  };
}
```

```typescript
// lab/server/src/replay/runReplay.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadGold } from "./goldLoader";
import { replayEngagement } from "./replay";
import { summarize, type ScorecardTurn } from "./scorecard";
import { judgeEngagementTurn } from "../../../judge/src/judgeReference"; // adjust to the judge package import path
import type { ReferenceTurnArtifact } from "../../../judge/src/referenceTypes";
import { makeAnswerDeps, makePinnedLlm } from "../answerService";

export async function runReplay(opts: { goldDir: string; outDir: string }) {
  const gold = loadGold(opts.goldDir);
  const deps = await makeAnswerDeps(); // provides runAgent + agentIds (Maverick/Elena/Bruno)
  const { llm, provider } = await makePinnedLlm();
  const turns: ScorecardTurn[] = [];

  for (const eng of gold) {
    for (const mode of ["single", "multi"] as const) {
      const replayed = await replayEngagement(eng, mode, deps as never);
      for (const rt of replayed.turns) {
        const isDeep = rt.turnIndex === eng.turns.length - 1 && eng.expectsHandoff;
        const art: ReferenceTurnArtifact = {
          userInput: rt.userInput,
          candidateAnswer: rt.candidate.answer,
          candidateSources: rt.candidate.sources.map((s, i) => ({ id: String(i), text: `${s.title} ${s.url}` })),
          goldAnswer: rt.gold.answer,
          goldSources: rt.gold.sources.map((s, i) => ({ id: String(i), text: `${s.title} ${s.url}` })),
          turnRole: isDeep ? "deepdive" : "discovery",
          expectedSpecialist: eng.handoffTarget,
        };
        const v = await judgeEngagementTurn(art, rt.candidate.persona, llm);
        turns.push({
          scenarioId: eng.scenarioId, mode, turnIndex: rt.turnIndex,
          pctOfFloor: v.pctOfFloor, gated: v.gated,
          retrievalGaps: v.missedClaims.filter((m) => m.gap === "retrieval-gap").length,
          generationGaps: v.missedClaims.filter((m) => m.gap === "generation-gap").length,
        });
      }
    }
  }
  const summary = summarize(turns);
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, `scorecard-${provider}.json`), JSON.stringify({ turns, summary }, null, 2));
  return { turns, summary };
}
```

> Fix the cross-package import path (`../../../judge/src/...`) to however `lab/server` already imports `lab/judge` (check an existing judge import in `liveJudge.ts`/`judgeStep.ts` and mirror it — likely a workspace package name like `@lab/judge`).

- [ ] **Step 4: Run the pure test + typecheck**

Run: `cd lab/server && npx vitest run src/replay/scorecard.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Add a CLI entry + smoke-run against the real gym**

Add to `lab/server/package.json` scripts: `"replay": "tsx src/replay/cli.ts"`. Create `src/replay/cli.ts` that calls `runReplay({ goldDir: <abs path to lab/replay/gold>, outDir: <abs path to lab/replay/results> })` and prints the summary.

Run (real, end-to-end — needs the agents from Task A2 + a working provider):
```bash
cd lab/server && npm run replay
```
Expected: a `lab/replay/results/scorecard-<provider>.json` with a `summary.meanPctOfFloor` number and per-scenario figures. **The gym is runnable.** Skeleton numbers will be low/uneven — that is correct (Phase 2 improves them). The acceptance bar is: it runs end-to-end, produces a scorecard, and the §3.5 gap counts are populated.

- [ ] **Step 6: Commit**

```bash
git add lab/server/src/replay/runReplay.ts lab/server/src/replay/scorecard.ts lab/server/src/replay/scorecard.test.ts lab/server/src/replay/cli.ts lab/server/package.json
git commit -m "feat(replay): runReplay CLI — replay+judge all gold into a %-of-floor scorecard"
```

---

## GROUP F — Wire-up & live smoke

### Task F1: Simplify panels to neural single + neural multi; wire deps

Reduce `panels.ts` to the two neural panels and update `answerService.makeAnswerDeps` to supply `agentIds: {maverick, elena, bruno}` to the orchestrator.

**Files:**
- Modify: `lab/server/src/panels.ts` (keep only `SINGLE_NEURAL` + `MULTI_NEURAL`)
- Modify: `lab/server/src/answerService.ts` (`makeAnswerDeps` reads `ALGOLIA_AGENT_{MAVERICK,ELENA,BRUNO}_NEURAL_ID`)
- Test: `lab/server/src/panels.test.ts` (update)

**Interfaces:**
- Produces: `AnswerDeps` now carries `agentIds: Record<PersonaId, string>` (replacing the old `specialistAgents` 4-charter map).

- [ ] **Step 1: Update the failing test**

```typescript
// lab/server/src/panels.test.ts  (replace prior 4-panel assertions)
import { describe, it, expect } from "vitest";
import { getPanels } from "./panels";

describe("panels (neural-only)", () => {
  it("exposes exactly two neural panels: single and multi", () => {
    const panels = getPanels();
    expect(panels.map((p) => p.retrieval)).toEqual(["neural", "neural"]);
    expect(panels.map((p) => p.arch).sort()).toEqual(["multi", "single"]);
    expect(panels.find((p) => p.arch === "single")?.indexName).toBe("AC2_WWW_SINGLE_NEURAL");
    expect(panels.find((p) => p.arch === "multi")?.indexName).toBe("AC2_WWW_MULTI_NEURAL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/panels.test.ts`
Expected: FAIL — still returns 4 panels / keyword entries.

- [ ] **Step 3: Trim panels + wire deps**

In `panels.ts` reduce `INDEX_NAMES`/`buildPanels` to two entries (single→`AC2_WWW_SINGLE_NEURAL`, multi→`AC2_WWW_MULTI_NEURAL`), both `retrieval: "neural"`. In `answerService.ts` `makeAnswerDeps`, build `agentIds = { maverick: env.ALGOLIA_AGENT_MAVERICK_NEURAL_ID!, elena: env.ALGOLIA_AGENT_ELENA_NEURAL_ID!, bruno: env.ALGOLIA_AGENT_BRUNO_NEURAL_ID! }` and pass it into the deps the orchestrator consumes; drop the old `specialistAgents` keyword/neural map.

- [ ] **Step 4: Run suite + typecheck**

Run: `cd lab/server && npx vitest run && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lab/server/src/panels.ts lab/server/src/answerService.ts lab/server/src/panels.test.ts
git commit -m "refactor(panels): neural-only single+multi; wire Maverick/Elena/Bruno agent ids"
```

---

### Task F2: End-to-end streaming smoke via `/api/answer`

Confirm token streaming flows agent → coordinator → SSE `delta`, so the demo feels alive (spec §5.6). Add a `delta` SSE event to the webserver and assert it fires.

**Files:**
- Modify: `lab/server/src/webserver.ts` (`/api/answer` SSE: emit `event: delta` with `{panelId, token}` via the `onToken` from the streaming runner)
- Modify: `lab/server/src/answer.ts` / `answerService.runAnswerPanels` (thread an `onToken` callback per panel)
- Test: `lab/server/src/webserver.test.ts` (or an integration test with a fake runner asserting delta events)

**Interfaces:**
- Produces: new SSE event `event: delta\ndata: {"panelId","token"}` interleaved before each panel's final `event: panel`.

- [ ] **Step 1: Write the failing test (fake deps, capture SSE writes)**

```typescript
// lab/server/src/webserver.test.ts (focused integration)
import { describe, it, expect } from "vitest";
import { runAnswerPanels } from "./answerService";

describe("streaming /api/answer", () => {
  it("emits per-token deltas before the final panel payload", async () => {
    const events: Array<{ kind: string; token?: string }> = [];
    const fakeDeps = {
      // minimal AnswerDeps with a runAgent that calls onToken twice
      runAgent: async (_id: string, _q: string, _h: unknown, onToken?: (t: string) => void) => {
        onToken?.("Hel"); onToken?.("lo"); return { answer: "Hello", sources: [] };
      },
      llm: async () => '{"intent":"discovery","entities":{},"expandedQuery":"q"}',
      agentIds: { maverick: "mav", elena: "ele", bruno: "bru" },
    } as never;
    await runAnswerPanels(
      { question: "hi", panels: ["single"] } as never,
      fakeDeps,
      (p: { panelId: string }) => events.push({ kind: "panel" }),
      undefined,
      (panelId: string, token: string) => events.push({ kind: "delta", token }), // new onToken arg
    );
    const deltas = events.filter((e) => e.kind === "delta").map((e) => e.token);
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(events.some((e) => e.kind === "panel")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lab/server && npx vitest run src/webserver.test.ts`
Expected: FAIL — `runAnswerPanels` has no `onToken` param yet / no deltas emitted.

- [ ] **Step 3: Thread `onToken` through to SSE**

Add an optional `onToken?: (panelId: string, token: string) => void` to `runAnswerPanels` and pass a per-panel closure down through `producePanelAnswer` → `orchestrateEngagement` → `runAgent`. In `webserver.ts` `/api/answer`, when streaming, wire `onToken` to `res.write('event: delta\ndata: ' + JSON.stringify({panelId, token}) + '\n\n')`. Keep the existing `panel`/`result`/`error` events.

- [ ] **Step 4: Run suite + typecheck**

Run: `cd lab/server && npx vitest run && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Live smoke (real server, optional but recommended)**

```bash
cd lab/server && PORT=8787 npm run dev   # or the existing start script
curl -N -X POST localhost:8787/api/answer -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"question":"How does Algolia NeuralSearch work?","panels":["single","multi"]}'
```
Expected: a stream of `event: delta` lines arriving incrementally (not all at once), then `event: panel` per panel, then `event: result`.

- [ ] **Step 6: Commit**

```bash
git add lab/server/src/webserver.ts lab/server/src/answer.ts lab/server/src/answerService.ts lab/server/src/webserver.test.ts
git commit -m "feat(stream): per-token SSE deltas through /api/answer (live streaming)"
```

---

## Self-Review

**Spec coverage (against design spec §3, §4-precondition, §5, §6, §8, §9):**
- §5.1 RC2-shape routing, no fan-out → Task C4 (`orchestrateEngagement`) + retire `multiAgent` fan-out. ✓
- §5.2 RC2 cast ported verbatim → Task A2 (instructions from PERSONAS.md). ✓
- §5.3 source charters → Task A1 (`CHARTERS`/`buildSourceFilter`) + A2 (applied to agent tool filters). ✓
- §5.5 Onion Protocol discovery (F-044, no-repeat, ≤4 turns, qualify) → Task C2; brain → C1; baton → C3. ✓
- §5.6 real token streaming → Tasks B1, B2, F2. ✓
- §3.1–3.3 reference-based, engagement-level, grounding+voice code checks → Tasks D1, D2, D4, D5. ✓
- §3.5 retrieval/generation classifier → Task D3, wired in D5, surfaced in scorecard (E3). ✓
- §3.3 "% of floor", exceeding rewarded → Task D4 (`pctOfGold` can exceed 100; aggregation keeps it). ✓
- §2.3 divergence rule (fixed driving sequence) → Task E2 (`replayEngagement` iterates `gold.drivingSequence`, AC2 follow-up doesn't steer). ✓
- §6 data flow (brain → maverick → baton → specialist → judge) → C1→C4 + E3. ✓
- §8 error handling (brain fallback, isolated failures, missing follow-up, judge "Unknown", grounding cap) → C1 fallback, D4 "Unknown" out, D1/D4 grounding gate. ✓ (Per-panel isolation: `runAnswerPanels` already runs panels independently; preserve that in F1/F2.)
- §9 testing (pure-logic units, replay determinism) → every task is TDD; replay test E2 asserts 1:1 alignment. ✓
- Provider/agents on `0EXRPAXB56` → A2 reuses `create_central_agents.mjs` pattern + existing `setup_providers.mjs`. ✓
- Explicitly OUT (Phase 1.5 validation, Phase 2 loop, UI) → not present. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Two legitimate copy-from-source steps (A2 persona instructions from PERSONAS.md; D2 voice regexes from `persona_loader.ts`) name exact source files + line ranges. Cross-package/relative import paths (E3 judge import, E1 gold dir) are flagged with explicit "adjust to the workspace's actual import" notes — these depend on the repo's workspace aliasing, which the implementer confirms against an existing import.

**Type consistency:** `PersonaId`/`SpecialistId`, `BrainOutput`, `Dossier`, `EngagementTurnResult`, `OrchestrateDeps`, `StreamSource`, `ReferenceTurnArtifact`, `CriterionScore`, `MissedClaim`/`GapKind`, `TurnVerdict`, `GoldEngagement`/`GoldTurnRecord`, `ScorecardTurn` are each defined once and consumed by name downstream. `runAgent`'s new optional `onToken` is threaded consistently B2 → C4 → E2/F2. `agentIds: Record<PersonaId,string>` is the single agent-binding shape across A1/C4/E3/F1. Phase 0's `GoldEngagement` field names (`scenarioId`, `drivingSequence`, `turns`, `blessedBy`, `handoff.specialist`) match E1's loader exactly.

**One known integration risk (flagged, not a gap):** the `lab/server` ↔ `lab/judge` import mechanism (workspace package name vs. relative path) must be confirmed against an existing judge import in `liveJudge.ts`/`judgeStep.ts` before E3/D5 compile cleanly. Mirror whatever the codebase already does.
