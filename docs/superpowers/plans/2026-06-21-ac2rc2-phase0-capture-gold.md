# AC2-RC2 Phase 0 — Capture the RC2 Gold Standard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument RC2 so every conversational turn is persisted losslessly, drive the 8 "V3" scenarios through it, and export 8 human-blessed *gold engagement records* in a schema AC2's replay harness and judge will consume.

**Architecture:** Two capture layers for de-risking. (1) A **lossless SSE tee** added to RC2's existing stream handler writes the raw event log per session — nothing can be lost even if our field-mapping is wrong. (2) A **pure parser** turns that raw log into a structured `GoldEngagement` record; because it reads the persisted raw log (not a live stream), we can fix the parser and re-export without re-running RC2. A Playwright **capture driver** (adapted from RC2's existing `e2e/v3-questions.spec.ts`, which already drives all 8 scenarios including the Q2 handoff clicks) makes the run reproducible; a **bless step** is the single human-in-the-loop gate (per spec §2.2). Final records are copied into the AC2 repo for Phase 1.

**Tech Stack:** TypeScript (RC2 is Vite + Node serverless, `@google/generative-ai`, Playwright e2e, Upstash Redis); Node ESM `.mjs` scripts; vitest for the pure parser (add if absent).

## Global Constraints

- **RC2 working copy:** `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia` (this is the gold *source*; `-OLD` is abandoned for AC2 *build* work, but RC2 itself lives here and is what we capture). Treat all edits as additive instrumentation — do **not** refactor RC2's engine.
- **RC2 retrieval is its own** (live Visibility app `1QDAWL72TQ`, index `ALGOLIA_WWW_PROD_V2`, read-only). Capture only records outputs; never write that index.
- **Gold is a blessed single sample, not a distribution** (spec §2.2). One reviewed run per scenario; no re-sampling for v1. The `blessedBy` field records the human gate.
- **The driving sequence is fixed from the gold** (spec §2.3). `drivingSequence = [question, ...followUps]` taken verbatim from `e2e/v3-questions.spec.ts`. AC2 will be replayed against this exact sequence regardless of what follow-up AC2 itself proposes.
- **The 8 scenarios** (spec §2.4, verbatim from `e2e/v3-questions.spec.ts`): `retail-q1`, `retail-q2`(→elena), `cpg-q1`, `cpg-q2`(→elena), `finserv-q1`, `finserv-q2`(→bruno), `healthcare-q1`, `healthcare-q2`(→bruno). Q1 = 2-turn discovery, no handoff; Q2 = 3-turn ending in a specialist deep-dive.
- **Schema is the contract.** The `GoldEngagement` / `GoldTurn` types defined in Task 1 are consumed verbatim by Phase 1's replay harness and judge. Do not change field names without updating Phase 1.
- **Drop the V3 rubric from the gold record** (spec §3.4). The `rubric` array in `v3-questions.spec.ts` is RC2's self-grading scaffold; it is NOT part of the gold (RC2's *answer* is now the reference). Carry only `id/vertical/question/followUps/expectsHandoff/handoffTarget`.

---

### Task 1: Gold record schema + pure SSE→record parser

The testable core. Everything else is plumbing around this. The parser reconstructs one engagement from the raw SSE event log so we never depend on a live stream to produce gold.

**Files:**
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/goldTypes.ts`
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/parseGold.ts`
- Test: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/parseGold.test.ts`

**Interfaces:**
- Produces (consumed by every later task AND by Phase 1):
  - `interface GoldSource { title: string; url: string; sourceType?: string; score?: number }`
  - `interface GoldSignals { onion: Record<string, string | null>; entities: Record<string, string | null>; lockedSignals: number; isQualified: boolean }`
  - `interface GoldTurn { turnIndex: number; userInput: string; answer: string; sources: GoldSource[]; activePersona: "maverick" | "elena" | "bruno"; handoff?: { specialist: "elena" | "bruno" }; discoveryQuestion?: string; askedSignal?: string; signals?: GoldSignals; voiceViolations: string[] }`
  - `interface GoldEngagement { scenarioId: string; vertical: string; tier: "Q1" | "Q2"; expectsHandoff: boolean; handoffTarget?: "elena" | "bruno"; drivingSequence: string[]; turns: GoldTurn[]; capturedAt: string; blessedBy: string | null }`
  - `interface RawSseEvent { event: string; data: unknown }`  ← one parsed SSE block from the raw log
  - `function parseTurn(events: RawSseEvent[], turnIndex: number, userInput: string): GoldTurn`
  - `function stripControlTags(content: string): string`  ← removes `<discovery_pivot…>` / `<specialist_handoff…>` tags from answer text

- [ ] **Step 1: Write the failing test**

```typescript
// gold/src/parseGold.test.ts
import { describe, it, expect } from "vitest";
import { parseTurn, stripControlTags, type RawSseEvent } from "./parseGold";

describe("stripControlTags", () => {
  it("removes discovery_pivot and specialist_handoff tags, keeps prose", () => {
    const raw =
      'Gymshark saw a **27% lift**. <discovery_pivot signal="stack">What stack are you on?</discovery_pivot>';
    expect(stripControlTags(raw)).toBe("Gymshark saw a **27% lift**.");
  });
});

describe("parseTurn", () => {
  const events: RawSseEvent[] = [
    { event: "chunk", data: { content: "Gymshark saw a **27% lift** with " } },
    { event: "chunk", data: { content: "Algolia. [case study](https://www.algolia.com/x) " } },
    {
      event: "chunk",
      data: {
        content:
          '<discovery_pivot signal="stack">What is your current search stack?</discovery_pivot>',
      },
    },
    {
      event: "signals",
      data: {
        onion_signals: { stack: null, scale: null, role: null, pain: null },
        extracted_signals: { brand: "Gymshark", industry: "retail", product: null, architecture_concepts: null },
        lockedSignals: 1,
        isQualified: false,
        reasoning_mode: "ae",
      },
    },
    {
      event: "final",
      data: {
        detectedSources: [
          { doc_title: "Gymshark Case Study", doc_url: "https://www.algolia.com/x", source_type: "Customer Stories", final_score: 0.91 },
        ],
        active_persona: "maverick",
        audit: { voiceViolations: [] },
      },
    },
  ];

  it("assembles answer, sources, signals, discovery question from the event log", () => {
    const turn = parseTurn(events, 0, "Tell me about retail wins");
    expect(turn.turnIndex).toBe(0);
    expect(turn.userInput).toBe("Tell me about retail wins");
    expect(turn.answer).toContain("27% lift");
    expect(turn.answer).not.toContain("<discovery_pivot");
    expect(turn.sources).toEqual([
      { title: "Gymshark Case Study", url: "https://www.algolia.com/x", sourceType: "Customer Stories", score: 0.91 },
    ]);
    expect(turn.activePersona).toBe("maverick");
    expect(turn.discoveryQuestion).toBe("What is your current search stack?");
    expect(turn.askedSignal).toBe("stack");
    expect(turn.signals?.entities.brand).toBe("Gymshark");
    expect(turn.signals?.lockedSignals).toBe(1);
    expect(turn.voiceViolations).toEqual([]);
  });

  it("detects a specialist handoff turn", () => {
    const handoffEvents: RawSseEvent[] = [
      { event: "chunk", data: { content: 'Bringing in Elena. <specialist_handoff specialist="elena">' } },
      { event: "final", data: { detectedSources: [], active_persona: "elena" } },
    ];
    const turn = parseTurn(handoffEvents, 2, "yes go");
    expect(turn.handoff).toEqual({ specialist: "elena" });
    expect(turn.activePersona).toBe("elena");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/parseGold.test.ts`
Expected: FAIL — cannot find module `./parseGold` (or `parseTurn is not a function`). If vitest is not installed, `npm i -D vitest` first, then re-run; expect the same module-not-found failure.

- [ ] **Step 3: Write the types**

```typescript
// gold/src/goldTypes.ts
export interface GoldSource {
  title: string;
  url: string;
  sourceType?: string;
  score?: number;
}
export interface GoldSignals {
  onion: Record<string, string | null>;
  entities: Record<string, string | null>;
  lockedSignals: number;
  isQualified: boolean;
}
export interface GoldTurn {
  turnIndex: number;
  userInput: string;
  answer: string;
  sources: GoldSource[];
  activePersona: "maverick" | "elena" | "bruno";
  handoff?: { specialist: "elena" | "bruno" };
  discoveryQuestion?: string;
  askedSignal?: string;
  signals?: GoldSignals;
  voiceViolations: string[];
}
export interface GoldEngagement {
  scenarioId: string;
  vertical: string;
  tier: "Q1" | "Q2";
  expectsHandoff: boolean;
  handoffTarget?: "elena" | "bruno";
  drivingSequence: string[];
  turns: GoldTurn[];
  capturedAt: string;
  blessedBy: string | null;
}
```

- [ ] **Step 4: Write the parser (minimal to pass)**

```typescript
// gold/src/parseGold.ts
import type { GoldSource, GoldSignals, GoldTurn } from "./goldTypes";
export type { GoldSource, GoldSignals, GoldTurn } from "./goldTypes";

export interface RawSseEvent {
  event: string;
  data: unknown;
}

const PIVOT_RE = /<discovery_pivot[^>]*>[\s\S]*?<\/discovery_pivot>/g;
const HANDOFF_RE = /<specialist_handoff[^>]*>/g;
const PIVOT_CAPTURE_RE = /<discovery_pivot\s+signal="([^"]+)"\s*>([\s\S]*?)<\/discovery_pivot>/;
const HANDOFF_CAPTURE_RE = /<specialist_handoff\s+specialist="(elena|bruno)"/;

export function stripControlTags(content: string): string {
  return content.replace(PIVOT_RE, "").replace(HANDOFF_RE, "").trim();
}

export function parseTurn(events: RawSseEvent[], turnIndex: number, userInput: string): GoldTurn {
  const rawAnswer = events
    .filter((e) => e.event === "chunk")
    .map((e) => (e.data as { content?: string }).content ?? "")
    .join("");

  const signalsEvt = events.find((e) => e.event === "signals")?.data as
    | { onion_signals?: Record<string, string | null>; extracted_signals?: Record<string, string | null>; lockedSignals?: number; isQualified?: boolean }
    | undefined;
  const finalEvt = events.find((e) => e.event === "final")?.data as
    | { detectedSources?: Array<{ doc_title?: string; doc_url?: string; source_type?: string; final_score?: number }>; active_persona?: string; audit?: { voiceViolations?: string[] } }
    | undefined;

  const pivot = PIVOT_CAPTURE_RE.exec(rawAnswer);
  const handoff = HANDOFF_CAPTURE_RE.exec(rawAnswer);

  const sources: GoldSource[] = (finalEvt?.detectedSources ?? []).map((s) => ({
    title: s.doc_title ?? "",
    url: s.doc_url ?? "",
    sourceType: s.source_type,
    score: s.final_score,
  }));

  const signals: GoldSignals | undefined = signalsEvt
    ? {
        onion: signalsEvt.onion_signals ?? {},
        entities: signalsEvt.extracted_signals ?? {},
        lockedSignals: signalsEvt.lockedSignals ?? 0,
        isQualified: signalsEvt.isQualified ?? false,
      }
    : undefined;

  const activePersona =
    (finalEvt?.active_persona as GoldTurn["activePersona"]) ??
    (handoff ? (handoff[1] as "elena" | "bruno") : "maverick");

  return {
    turnIndex,
    userInput,
    answer: stripControlTags(rawAnswer),
    sources,
    activePersona,
    handoff: handoff ? { specialist: handoff[1] as "elena" | "bruno" } : undefined,
    discoveryQuestion: pivot ? pivot[2].trim() : undefined,
    askedSignal: pivot ? pivot[1] : undefined,
    signals,
    voiceViolations: finalEvt?.audit?.voiceViolations ?? [],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/parseGold.test.ts`
Expected: PASS (3 tests).

> **Field-location caveat (read before Step 5 fails on real data):** the exact keys `detectedSources` / `final_score` / `active_persona` / `audit.voiceViolations` on the `final` event are our best read of RC2's `constructFinalEvent` (`lib/search/metadata_manager.ts`) and `stream_processor.ts`. If a real captured raw log (Task 6) shows different keys, this is exactly the case the raw-log layer protects against: fix the field names *here* and re-run the export — no RC2 re-run needed. Add a real captured event block as a fixture to this test when you have one.

- [ ] **Step 6: Commit**

```bash
cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia
git add gold/src/goldTypes.ts gold/src/parseGold.ts gold/src/parseGold.test.ts
git commit -m "feat(gold): gold engagement schema + pure SSE-to-record parser"
```

---

### Task 2: Lossless SSE capture tee in the stream handler

Add a side-effect tee to RC2's existing stream loop so every byte written to the client is also appended to a per-session raw log. Decoupled from engine internals (spec's ~1–2h instrumentation).

**Files:**
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/captureSink.ts`
- Modify: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/api-src/search.ts:313-325` (the `reader.read()` write loop)
- Test: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/captureSink.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `function parseSseBlocks(raw: string): RawSseEvent[]`  ← splits an SSE text buffer (blocks separated by `\n\n`, lines `event:` / `data:`) into structured events; JSON-parses `data`.
  - `function makeCaptureSink(opts: { scenarioId: string; sessionId: string; dir?: string }): { write(chunk: string): void; close(): void }`  ← appends raw chunks; on close writes `gold/raw/{scenarioId}__{sessionId}.sse` (raw text) so Task 4 can re-parse losslessly.

- [ ] **Step 1: Write the failing test**

```typescript
// gold/src/captureSink.test.ts
import { describe, it, expect } from "vitest";
import { parseSseBlocks } from "./captureSink";

describe("parseSseBlocks", () => {
  it("parses event/data blocks and JSON-decodes data", () => {
    const raw =
      'event: chunk\ndata: {"content":"hi"}\n\n' +
      'event: signals\ndata: {"lockedSignals":2,"isQualified":true}\n\n';
    const events = parseSseBlocks(raw);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "chunk", data: { content: "hi" } });
    expect((events[1].data as { lockedSignals: number }).lockedSignals).toBe(2);
  });

  it("keeps non-JSON data as a raw string and skips blank blocks", () => {
    const raw = "event: ping\ndata: keepalive\n\n\n\n";
    const events = parseSseBlocks(raw);
    expect(events).toEqual([{ event: "ping", data: "keepalive" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/captureSink.test.ts`
Expected: FAIL — cannot find module `./captureSink`.

- [ ] **Step 3: Write the capture sink + SSE block parser**

```typescript
// gold/src/captureSink.ts
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RawSseEvent } from "./parseGold";

export function parseSseBlocks(raw: string): RawSseEvent[] {
  const out: RawSseEvent[] = [];
  for (const block of raw.split("\n\n")) {
    const lines = block.split("\n");
    let event = "message";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
    }
    if (!dataStr) continue;
    let data: unknown = dataStr;
    try {
      data = JSON.parse(dataStr);
    } catch {
      /* keep raw string */
    }
    out.push({ event, data });
  }
  return out;
}

export function makeCaptureSink(opts: { scenarioId: string; sessionId: string; dir?: string }) {
  const dir = opts.dir ?? join(process.cwd(), "gold", "raw");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${opts.scenarioId}__${opts.sessionId}.sse`);
  writeFileSync(file, ""); // truncate any prior partial
  return {
    write(chunk: string) {
      appendFileSync(file, chunk);
    },
    close() {
      /* file already flushed via append */
    },
  };
}
```

- [ ] **Step 4: Wire the tee into `api-src/search.ts`**

Locate the stream write loop (around lines 313–325). The request carries the scenario tag via header `x-gold-scenario` (set by the driver in Task 3; absent for normal traffic → capture disabled). Read the existing `sessionId` already in scope in this handler.

```typescript
// near the top of the handler, after sessionId is resolved and BEFORE the read loop:
import { makeCaptureSink } from "../gold/src/captureSink"; // adjust relative path to this file
// ...
const goldScenario =
  (req.headers["x-gold-scenario"] as string | undefined)?.trim() || "";
const goldSink = goldScenario
  ? makeCaptureSink({ scenarioId: goldScenario, sessionId })
  : null;

// inside the existing read loop, alongside res.write(chunk):
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  res.write(chunk);
  goldSink?.write(chunk); // <-- ADDED: lossless tee
}
res.end();
goldSink?.close(); // <-- ADDED
```

> If `search.ts` is bundled (`scripts/bundle-api.mjs`), confirm the import resolves through the bundler; if the bundler chokes on the `gold/` import, inline `parseSseBlocks`/`makeCaptureSink` into a sibling file under `api-src/`. Keep the pure `parseSseBlocks` tested in `gold/src` either way.

- [ ] **Step 5: Run tests + typecheck**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/ && npx tsc --noEmit`
Expected: parser tests PASS; `tsc` clean (or no NEW errors vs. the pre-existing baseline — RC2 may already have unrelated type errors; capture only that the two added imports resolve).

- [ ] **Step 6: Commit**

```bash
git add gold/src/captureSink.ts gold/src/captureSink.test.ts api-src/search.ts
git commit -m "feat(gold): lossless SSE capture tee gated by x-gold-scenario header"
```

---

### Task 3: Scenario seed extraction + Playwright capture driver

Pull the 8 driving sequences out of `e2e/v3-questions.spec.ts` (dropping the rubric), and adapt the existing e2e flow into a driver that runs each scenario end-to-end (including the Q2 GO / "Proceed to Deep Dive" clicks) with the `x-gold-scenario` header set so the tee fires.

**Files:**
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/scenarios.ts`
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/capture.spec.ts` (Playwright; adapted from `e2e/v3-questions.spec.ts:659-887`)
- Test: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/scenarios.test.ts`

**Interfaces:**
- Consumes: `e2e/v3-questions.spec.ts` test cases (source of `question`/`followUps`/`expectsHandoff`/`handoffTarget`).
- Produces:
  - `interface GoldScenario { id: string; vertical: string; tier: "Q1" | "Q2"; drivingSequence: string[]; expectsHandoff: boolean; handoffTarget?: "elena" | "bruno" }`
  - `const GOLD_SCENARIOS: GoldScenario[]`  (all 8, verbatim sequences)
  - `function tierOf(id: string): "Q1" | "Q2"`

- [ ] **Step 1: Write the failing test**

```typescript
// gold/src/scenarios.test.ts
import { describe, it, expect } from "vitest";
import { GOLD_SCENARIOS, tierOf } from "./scenarios";

describe("GOLD_SCENARIOS", () => {
  it("has exactly the 8 V3 scenarios with correct handoff targets", () => {
    expect(GOLD_SCENARIOS.map((s) => s.id)).toEqual([
      "retail-q1", "retail-q2", "cpg-q1", "cpg-q2",
      "finserv-q1", "finserv-q2", "healthcare-q1", "healthcare-q2",
    ]);
    const byId = Object.fromEntries(GOLD_SCENARIOS.map((s) => [s.id, s]));
    expect(byId["retail-q2"].handoffTarget).toBe("elena");
    expect(byId["finserv-q2"].handoffTarget).toBe("bruno");
    expect(byId["healthcare-q2"].handoffTarget).toBe("bruno");
    expect(byId["retail-q1"].expectsHandoff).toBe(false);
  });

  it("Q1 drivingSequence is 2 turns, Q2 is 3 turns", () => {
    const byId = Object.fromEntries(GOLD_SCENARIOS.map((s) => [s.id, s]));
    expect(byId["retail-q1"].drivingSequence.length).toBe(2);
    expect(byId["retail-q2"].drivingSequence.length).toBe(3);
  });

  it("tierOf derives tier from the id suffix", () => {
    expect(tierOf("retail-q1")).toBe("Q1");
    expect(tierOf("healthcare-q2")).toBe("Q2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/scenarios.test.ts`
Expected: FAIL — cannot find module `./scenarios`.

- [ ] **Step 3: Extract the 8 scenarios**

Open `e2e/v3-questions.spec.ts` (cases at lines 67–534). For each case copy `question` + `followUps[]` verbatim into `drivingSequence = [question, ...followUps]`. Drop `rubric`. The handoff targets are fixed by the spec (retail-q2→elena, cpg-q2→elena, finserv-q2→bruno, healthcare-q2→bruno).

```typescript
// gold/src/scenarios.ts
export interface GoldScenario {
  id: string;
  vertical: string;
  tier: "Q1" | "Q2";
  drivingSequence: string[];
  expectsHandoff: boolean;
  handoffTarget?: "elena" | "bruno";
}

export function tierOf(id: string): "Q1" | "Q2" {
  return id.endsWith("-q2") ? "Q2" : "Q1";
}

// drivingSequence values are copied VERBATIM from e2e/v3-questions.spec.ts.
// Fill each array from the matching case's `question` + `followUps`.
export const GOLD_SCENARIOS: GoldScenario[] = [
  { id: "retail-q1", vertical: "retail", tier: "Q1", expectsHandoff: false,
    drivingSequence: ["<<retail-q1 question>>", "<<retail-q1 followUp 1>>"] },
  { id: "retail-q2", vertical: "retail", tier: "Q2", expectsHandoff: true, handoffTarget: "elena",
    drivingSequence: ["<<retail-q2 question>>", "<<retail-q2 followUp 1>>", "<<retail-q2 followUp 2>>"] },
  { id: "cpg-q1", vertical: "cpg", tier: "Q1", expectsHandoff: false,
    drivingSequence: ["<<cpg-q1 question>>", "<<cpg-q1 followUp 1>>"] },
  { id: "cpg-q2", vertical: "cpg", tier: "Q2", expectsHandoff: true, handoffTarget: "elena",
    drivingSequence: ["<<cpg-q2 question>>", "<<cpg-q2 followUp 1>>", "<<cpg-q2 followUp 2>>"] },
  { id: "finserv-q1", vertical: "finserv", tier: "Q1", expectsHandoff: false,
    drivingSequence: ["<<finserv-q1 question>>", "<<finserv-q1 followUp 1>>"] },
  { id: "finserv-q2", vertical: "finserv", tier: "Q2", expectsHandoff: true, handoffTarget: "bruno",
    drivingSequence: ["<<finserv-q2 question>>", "<<finserv-q2 followUp 1>>", "<<finserv-q2 followUp 2>>"] },
  { id: "healthcare-q1", vertical: "healthcare", tier: "Q1", expectsHandoff: false,
    drivingSequence: ["<<healthcare-q1 question>>", "<<healthcare-q1 followUp 1>>"] },
  { id: "healthcare-q2", vertical: "healthcare", tier: "Q2", expectsHandoff: true, handoffTarget: "bruno",
    drivingSequence: ["<<healthcare-q2 question>>", "<<healthcare-q2 followUp 1>>", "<<healthcare-q2 followUp 2>>"] },
];
```

> **No placeholders ship.** The `<<…>>` markers above are fill-ins you MUST replace with the verbatim strings from `e2e/v3-questions.spec.ts` before Step 5. If a Q1 case has a different turn count than 2, match the actual `followUps.length`. The test asserts 2/3 turns per the spec's stated structure; if the real spec differs, update both the data and the test to match the real spec (the spec file is ground truth, not this plan's assumption).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/scenarios.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the capture driver (Playwright)**

Adapt `e2e/v3-questions.spec.ts:659-887`. Two changes only: (a) set the `x-gold-scenario` header on the page context so the tee tags the session; (b) iterate `GOLD_SCENARIOS` instead of the rubric cases. Keep the existing turn-send + Q2 handoff (GO → "Proceed to Deep Dive") interactions verbatim.

```typescript
// gold/capture.spec.ts
import { test } from "@playwright/test";
import { GOLD_SCENARIOS } from "./src/scenarios";

const DEMO_URL = process.env.DEMO_URL ?? "http://localhost:5173";

for (const scenario of GOLD_SCENARIOS) {
  test(`capture ${scenario.id}`, async ({ browser }) => {
    // header makes RC2's tee write gold/raw/{scenario.id}__{sessionId}.sse
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-gold-scenario": scenario.id },
    });
    const page = await context.newPage();
    await page.goto(`${DEMO_URL}/chat`);

    for (let i = 0; i < scenario.drivingSequence.length; i++) {
      const turn = scenario.drivingSequence[i];
      // --- reuse the EXACT selectors/wait logic from e2e/v3-questions.spec.ts ---
      // 1. type `turn` into the composer and submit
      // 2. await the stream to settle (same "response complete" wait the e2e uses)
      // 3. if scenario.expectsHandoff and this is the handoff turn:
      //       click "GO", await handshake, click "Proceed to Deep Dive", await specialist stream
      // (Copy these blocks verbatim from v3-questions.spec.ts:670-797.)
    }
    await context.close();
  });
}
```

> This step is procedural (UI driving), not unit-testable. Its "test" is Task 6: after a run, `gold/raw/*.sse` files exist and parse cleanly. Copy the selector/wait blocks verbatim from the existing e2e spec — do not invent selectors.

- [ ] **Step 6: Commit**

```bash
git add gold/src/scenarios.ts gold/src/scenarios.test.ts gold/capture.spec.ts
git commit -m "feat(gold): 8 V3 scenario seeds + Playwright capture driver"
```

---

### Task 4: Export tool — raw logs → GoldEngagement records

Read each `gold/raw/{scenarioId}__{sessionId}.sse`, segment it into turns, run `parseTurn` per turn, and write `gold/records/{scenarioId}.json`.

**Files:**
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/exportGold.ts`
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/export.mjs` (CLI wrapper)
- Test: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/exportGold.test.ts`

**Interfaces:**
- Consumes: `parseSseBlocks` (Task 2), `parseTurn` (Task 1), `GOLD_SCENARIOS`/`tierOf` (Task 3), `GoldEngagement` (Task 1).
- Produces:
  - `function segmentTurns(events: RawSseEvent[]): RawSseEvent[][]`  ← splits a session's event stream into per-turn slices. A new turn begins at each `signals` event OR (fallback) each `pipeline_step` with `step === "session_load"`; tune to whichever marker the real logs show.
  - `function buildEngagement(scenario: GoldScenario, sessionEvents: RawSseEvent[], capturedAt: string): GoldEngagement`

- [ ] **Step 1: Write the failing test**

```typescript
// gold/src/exportGold.test.ts
import { describe, it, expect } from "vitest";
import { segmentTurns, buildEngagement } from "./exportGold";
import type { RawSseEvent } from "./parseGold";

const twoTurnSession: RawSseEvent[] = [
  { event: "signals", data: { lockedSignals: 0, isQualified: false } },
  { event: "chunk", data: { content: "Answer one." } },
  { event: "final", data: { detectedSources: [], active_persona: "maverick" } },
  { event: "signals", data: { lockedSignals: 1, isQualified: false } },
  { event: "chunk", data: { content: "Answer two." } },
  { event: "final", data: { detectedSources: [], active_persona: "maverick" } },
];

describe("segmentTurns", () => {
  it("splits a session into one slice per turn at signals boundaries", () => {
    const slices = segmentTurns(twoTurnSession);
    expect(slices).toHaveLength(2);
    expect(slices[0].some((e) => e.event === "chunk")).toBe(true);
  });
});

describe("buildEngagement", () => {
  it("aligns parsed turns to the scenario driving sequence 1:1", () => {
    const scenario = {
      id: "retail-q1", vertical: "retail", tier: "Q1" as const,
      drivingSequence: ["Q", "F1"], expectsHandoff: false,
    };
    const eng = buildEngagement(scenario, twoTurnSession, "2026-06-21T00:00:00Z");
    expect(eng.scenarioId).toBe("retail-q1");
    expect(eng.turns).toHaveLength(2);
    expect(eng.turns[0].userInput).toBe("Q");
    expect(eng.turns[1].userInput).toBe("F1");
    expect(eng.turns[1].answer).toBe("Answer two.");
    expect(eng.blessedBy).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/exportGold.test.ts`
Expected: FAIL — cannot find module `./exportGold`.

- [ ] **Step 3: Implement segment + build**

```typescript
// gold/src/exportGold.ts
import type { RawSseEvent } from "./parseGold";
import { parseTurn } from "./parseGold";
import type { GoldEngagement } from "./goldTypes";
import { tierOf, type GoldScenario } from "./scenarios";

export function segmentTurns(events: RawSseEvent[]): RawSseEvent[][] {
  const slices: RawSseEvent[][] = [];
  let current: RawSseEvent[] = [];
  for (const e of events) {
    if (e.event === "signals" && current.length > 0) {
      slices.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length > 0) slices.push(current);
  return slices;
}

export function buildEngagement(
  scenario: GoldScenario,
  sessionEvents: RawSseEvent[],
  capturedAt: string,
): GoldEngagement {
  const slices = segmentTurns(sessionEvents);
  const turns = slices.map((slice, i) =>
    parseTurn(slice, i, scenario.drivingSequence[i] ?? `<<missing turn ${i}>>`),
  );
  return {
    scenarioId: scenario.id,
    vertical: scenario.vertical,
    tier: scenario.tier ?? tierOf(scenario.id),
    expectsHandoff: scenario.expectsHandoff,
    handoffTarget: scenario.handoffTarget,
    drivingSequence: scenario.drivingSequence,
    turns,
    capturedAt,
    blessedBy: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/exportGold.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the CLI wrapper**

```javascript
// gold/export.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseSseBlocks } from "./src/captureSink.ts";
import { buildEngagement } from "./src/exportGold.ts";
import { GOLD_SCENARIOS } from "./src/scenarios.ts";

// Run with: npx tsx gold/export.mjs   (tsx resolves the .ts imports)
const rawDir = join(process.cwd(), "gold", "raw");
const outDir = join(process.cwd(), "gold", "records");
mkdirSync(outDir, { recursive: true });
const now = new Date().toISOString();

for (const scenario of GOLD_SCENARIOS) {
  const file = readdirSync(rawDir).find((f) => f.startsWith(`${scenario.id}__`));
  if (!file) {
    console.warn(`SKIP ${scenario.id}: no raw capture found`);
    continue;
  }
  const events = parseSseBlocks(readFileSync(join(rawDir, file), "utf8"));
  const eng = buildEngagement(scenario, events, now);
  writeFileSync(join(outDir, `${scenario.id}.json`), JSON.stringify(eng, null, 2));
  console.log(`WROTE ${scenario.id}.json — ${eng.turns.length} turns`);
}
```

> If `tsx` is not available, `npm i -D tsx`. The `.ts` imports in an `.mjs` run via `npx tsx gold/export.mjs`.

- [ ] **Step 6: Commit**

```bash
git add gold/src/exportGold.ts gold/src/exportGold.test.ts gold/export.mjs
git commit -m "feat(gold): export raw SSE captures into GoldEngagement records"
```

---

### Task 5: Bless step (the human gate)

A review CLI that prints each engagement turn-by-turn for Arijit, and on his OK stamps `blessedBy`. This is the single human-in-the-loop point (spec §2.2).

**Files:**
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/bless.ts`
- Create: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/bless.mjs` (CLI wrapper)
- Test: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/src/bless.test.ts`

**Interfaces:**
- Consumes: `GoldEngagement` (Task 1).
- Produces:
  - `function renderEngagement(eng: GoldEngagement): string`  ← human-readable transcript (turn, user input, answer, sources, persona, handoff).
  - `function stampBless(eng: GoldEngagement, who: string): GoldEngagement`  ← returns a copy with `blessedBy = who`.

- [ ] **Step 1: Write the failing test**

```typescript
// gold/src/bless.test.ts
import { describe, it, expect } from "vitest";
import { renderEngagement, stampBless } from "./bless";
import type { GoldEngagement } from "./goldTypes";

const eng: GoldEngagement = {
  scenarioId: "retail-q1", vertical: "retail", tier: "Q1",
  expectsHandoff: false, drivingSequence: ["Q", "F1"],
  turns: [
    { turnIndex: 0, userInput: "Q", answer: "A1", sources: [{ title: "T", url: "u" }], activePersona: "maverick", voiceViolations: [] },
    { turnIndex: 1, userInput: "F1", answer: "A2", sources: [], activePersona: "maverick", voiceViolations: [] },
  ],
  capturedAt: "2026-06-21T00:00:00Z", blessedBy: null,
};

describe("renderEngagement", () => {
  it("includes scenario id, both user inputs, and both answers", () => {
    const out = renderEngagement(eng);
    expect(out).toContain("retail-q1");
    expect(out).toContain("Q");
    expect(out).toContain("A1");
    expect(out).toContain("A2");
  });
});

describe("stampBless", () => {
  it("sets blessedBy without mutating the input", () => {
    const blessed = stampBless(eng, "arijit");
    expect(blessed.blessedBy).toBe("arijit");
    expect(eng.blessedBy).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/bless.test.ts`
Expected: FAIL — cannot find module `./bless`.

- [ ] **Step 3: Implement render + stamp**

```typescript
// gold/src/bless.ts
import type { GoldEngagement } from "./goldTypes";

export function renderEngagement(eng: GoldEngagement): string {
  const lines: string[] = [`=== ${eng.scenarioId} (${eng.tier}, ${eng.vertical}) ===`];
  for (const t of eng.turns) {
    lines.push(`\n--- Turn ${t.turnIndex} [${t.activePersona}] ---`);
    lines.push(`USER: ${t.userInput}`);
    lines.push(`ANSWER:\n${t.answer}`);
    if (t.handoff) lines.push(`HANDOFF → ${t.handoff.specialist}`);
    if (t.discoveryQuestion) lines.push(`NEXT Q: ${t.discoveryQuestion}`);
    lines.push(`SOURCES: ${t.sources.map((s) => s.title || s.url).join(", ") || "(none)"}`);
    if (t.voiceViolations.length) lines.push(`VOICE VIOLATIONS: ${t.voiceViolations.join("; ")}`);
  }
  return lines.join("\n");
}

export function stampBless(eng: GoldEngagement, who: string): GoldEngagement {
  return { ...eng, blessedBy: who };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia && npx vitest run gold/src/bless.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the CLI wrapper**

```javascript
// gold/bless.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { renderEngagement, stampBless } from "./src/bless.ts";

// Run: npx tsx gold/bless.mjs
const dir = join(process.cwd(), "gold", "records");
const rl = createInterface({ input: stdin, output: stdout });
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const path = join(dir, file);
  const eng = JSON.parse(readFileSync(path, "utf8"));
  if (eng.blessedBy) { console.log(`(already blessed) ${file}`); continue; }
  console.log("\n" + renderEngagement(eng));
  const ans = (await rl.question(`\nBless ${file} as gold? [y/N/edit] `)).trim().toLowerCase();
  if (ans === "y") {
    writeFileSync(path, JSON.stringify(stampBless(eng, "arijit"), null, 2));
    console.log(`BLESSED ${file}`);
  } else {
    console.log(`SKIPPED ${file} — re-capture or hand-edit, then re-run.`);
  }
}
await rl.close();
```

- [ ] **Step 6: Commit**

```bash
git add gold/src/bless.ts gold/src/bless.test.ts gold/bless.mjs
git commit -m "feat(gold): human bless review CLI for gold engagement records"
```

---

### Task 6: Capture run — produce 8 blessed gold records and hand off to AC2

The end-to-end procedural run. No new code; this is the operation that yields the deliverable and validates the whole pipeline against real RC2 output.

**Files:**
- Create (output): `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/gold/records/*.json` (8 files)
- Create (output): `/Users/arijitchowdhury/Dropbox/AI-Development/RAG/Algolia-Central2/lab/replay/gold/*.json` (copies — the path Phase 1 reads)

- [ ] **Step 1: Start RC2 locally**

```bash
cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia
# ensure .env has ALGOLIA_*, UPSTASH_REDIS_*, GOOGLE_API_KEY/GEMINI_API_KEY (see .env.vercel.example)
npm run dev:all   # frontend :5173 + api
```
Verify: open `http://localhost:5173/chat`, send one message, confirm a streamed answer renders.

- [ ] **Step 2: Run the capture driver for all 8 scenarios**

```bash
cd ~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia
DEMO_URL=http://localhost:5173 npx playwright test gold/capture.spec.ts
```
Expected: 8 passing capture tests; `gold/raw/` now contains 8 `*.sse` files (one per scenario).
Verify: `ls gold/raw/` shows `retail-q1__*.sse` … `healthcare-q2__*.sse`.

> If Arijit prefers to hand-drive (literal human touch), skip the driver: with the dev server up, set the header manually (a browser extension or a tiny proxy) OR add a `?goldScenario=retail-q1` query param read in `search.ts` alongside the header, and run each scenario by hand in the UI. The tee captures identically. The driver is the reproducible default; hand-driving is the spec's stated preference — offer Arijit the choice at run time.

- [ ] **Step 3: Export raw → records**

```bash
npx tsx gold/export.mjs
```
Expected: `WROTE retail-q1.json — 2 turns` … through `healthcare-q2.json — 3 turns` (8 files in `gold/records/`).
Verify field mapping on ONE file: `cat gold/records/retail-q2.json | python3 -m json.tool | head -60` — confirm `answer` has prose (not control tags), `sources` non-empty, `turns[2].handoff.specialist === "elena"`. **If a field is empty/wrong, fix `parseGold.ts`/`exportGold.ts` against the raw `.sse` (Task 1 caveat) and re-run export — do NOT re-run RC2.**

- [ ] **Step 4: Add a real fixture + re-green the unit tests**

Copy one real turn's event block from a `.sse` file into `parseGold.test.ts` as an additional fixture asserting the real field shapes. Run `npx vitest run gold/src/` → all PASS. This locks the real wire shape into the test suite.

- [ ] **Step 5: Bless the 8 records**

```bash
npx tsx gold/bless.mjs
```
Arijit reviews each transcript and answers `y` for the ones that represent RC2 at its best. Re-capture any he rejects (re-run Step 2 for that one scenario) until all 8 carry `"blessedBy": "arijit"`.
Verify: `grep -L '"blessedBy": "arijit"' gold/records/*.json` returns nothing (all blessed).

- [ ] **Step 6: Copy gold into the AC2 repo + commit both sides**

```bash
mkdir -p /Users/arijitchowdhury/Dropbox/AI-Development/RAG/Algolia-Central2/lab/replay/gold
cp gold/records/*.json /Users/arijitchowdhury/Dropbox/AI-Development/RAG/Algolia-Central2/lab/replay/gold/
# RC2 side:
git add gold/records/*.json && git commit -m "chore(gold): 8 blessed RC2 gold engagement records (v1 corpus)"
# AC2 side:
cd /Users/arijitchowdhury/Dropbox/AI-Development/RAG/Algolia-Central2
git add lab/replay/gold/*.json
git commit -m "feat(replay): import 8 blessed RC2 gold records as the v1 reference corpus"
```

**Phase 0 done when:** `lab/replay/gold/` in the AC2 repo holds 8 `GoldEngagement` JSON files, each `blessedBy: "arijit"`, each with a 1:1 `drivingSequence`↔`turns` alignment, prose answers, real sources, and (for the 4 Q2s) a `handoff` on the final turn matching the spec's target. This is the precondition for Phase 1's replay harness and judge.

---

## Self-Review

**Spec coverage (against the design spec §2):**
- §2.1 reference-based grading — gold record IS the answer key (schema Task 1). ✓
- §2.2 capture→replay→measure — tee (Task 2) + driver (Task 3) + export (Task 4) + bless (Task 5) + run (Task 6); human-in-the-loop = bless. ✓
- §2.3 divergence rule — `drivingSequence` fixed from gold (Tasks 1, 3, Global Constraints). ✓
- §2.4 gold scenario set — 8 V3 scenarios, rubric dropped (Task 3, Global Constraints). ✓
- §3.4 "drop V3 binary rubric" — enforced in Task 3 (rubric not carried). ✓

**Placeholder scan:** The only intentional fill-ins are the `<<…>>` driving-sequence strings in Task 3 Step 3 (flagged loudly: must be copied verbatim from `v3-questions.spec.ts` before the step's test passes) and `<<missing turn N>>` (a runtime guard, not a plan placeholder). No "TBD"/"add error handling"/"similar to Task N" anywhere.

**Type consistency:** `GoldEngagement`/`GoldTurn`/`GoldSource`/`GoldSignals`/`RawSseEvent`/`GoldScenario` are defined once (Tasks 1, 3) and reused by name in Tasks 4, 5, 6 with matching fields (`scenarioId`, `drivingSequence`, `turns`, `blessedBy`, `handoff.specialist`). `parseTurn`, `parseSseBlocks`, `segmentTurns`, `buildEngagement`, `renderEngagement`, `stampBless`, `tierOf` signatures match across producer/consumer tasks.

**Known assumption to verify against reality (not a gap, a flagged risk):** the exact `final`-event field keys (`detectedSources`, `final_score`, `active_persona`, `audit.voiceViolations`) and the turn-boundary marker (`signals` event) are our best read of RC2's code; Task 6 Step 3–4 verify them against a real capture and the raw-log layer makes any correction a parser-only fix.
