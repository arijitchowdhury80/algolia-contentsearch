/**
 * Tests for questions.ts — parsing the LOCKED v3 markdown test set. Locks the
 * id-format filter (rejects Cat 7's bold bait-class sub-headers), the category
 * tally, and the dev/held-out split, so a markdown edit that breaks the harness
 * fails loudly here rather than silently skewing a run.
 */
import { describe, it, expect } from "vitest";
import { parseQuestions } from "./questions.js";

describe("parseQuestions (v3 locked set, from disk)", () => {
  const qs = parseQuestions();

  it("parses exactly the 32 v3 questions", () => {
    expect(qs.length).toBe(32);
  });

  it("only accepts well-formed ids (N, N.M, or N<letter>) — no bait-class headers", () => {
    const malformed = qs.filter((q) => !/^\d+(\.\d+|[a-z])?$/i.test(q.id));
    expect(malformed).toEqual([]);
    // The Cat 7 bold sub-headers ("Competitor bait" etc.) must NOT be questions.
    expect(qs.some((q) => /bait|control/i.test(q.id))).toBe(false);
  });

  it("has the expected per-category tally", () => {
    const byCat: Record<number, number> = {};
    for (const q of qs) byCat[q.category] = (byCat[q.category] ?? 0) + 1;
    expect(byCat).toEqual({ 1: 4, 2: 4, 3: 4, 4: 3, 5: 3, 6: 3, 7: 5, 8: 6 });
  });

  it("splits 22 dev / 10 held-out per the locked mirror", () => {
    expect(qs.filter((q) => q.split === "dev").length).toBe(22);
    const held = qs.filter((q) => q.split === "held-out").map((q) => q.id);
    expect(held).toEqual(["1.4", "2.4", "3.4", "4.3", "5.3", "6.3", "7.4", "7.5", "8.5", "8.6"]);
  });

  it("flags Cat 7 (and only Cat 7) as refusal tests", () => {
    const refusal = qs.filter((q) => q.isRefusalTest).map((q) => q.id);
    expect(refusal).toEqual(["7.1", "7.2", "7.3", "7.4", "7.5"]);
  });

  it("leaves Cat 8 follow-ups undefined (each panel generates its own)", () => {
    const cat8 = qs.filter((q) => q.category === 8);
    expect(cat8.length).toBe(6);
    expect(cat8.every((q) => q.followUp === undefined)).toBe(true);
  });
});

describe("parseQuestions (markdown injection)", () => {
  it("rejects a bold sub-header bullet but keeps a real id on the same parse", () => {
    const md = [
      "## Cat 7 — Out-of-scope (grounded-refusal bait)",
      "",
      "- **Competitor bait** — a class of bait, not a question.",
      "- **7.1** What is the capital of France?",
    ].join("\n");
    const qs = parseQuestions(md);
    expect(qs.map((q) => q.id)).toEqual(["7.1"]);
    expect(qs[0].isRefusalTest).toBe(true);
  });
});
