/**
 * Tests for multiAgent.ts pure helpers.
 *
 * buildRetrievalQuery (keyword de-padding vs neural pass-through) and
 * routeSpecialists (entities/intent → specialist set) are pure and tested
 * directly. The fan-out orchestrate() has been retired in favour of
 * RC2-shape orchestrateEngagement (see orchestrate.test.ts).
 */
import { describe, it, expect } from "vitest";
import { routeSpecialists, buildRetrievalQuery } from "./multiAgent.js";

// --- buildRetrievalQuery + routeSpecialists (the plan's exact unit tests) -----

describe("routeSpecialists", () => {
  it("routes an API/docs question to Technical", () => {
    const r = routeSpecialists({ entities: ["typoTolerance"], intent: "how-to-config" });
    expect(r).toContain("technical");
  });
  it("can fan out to multiple specialists", () => {
    const r = routeSpecialists({ entities: ["pricing", "records"], intent: "troubleshoot-billing" });
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildRetrievalQuery", () => {
  it("keyword path uses bare concept terms (no Algolia padding)", () => {
    const q = buildRetrievalQuery("How do I add typo tolerance in Algolia?", "keyword");
    expect(q.toLowerCase()).not.toContain("algolia");
    expect(q.toLowerCase()).toContain("typo tolerance");
  });
  it("neural path keeps the natural-language question", () => {
    const q = buildRetrievalQuery("How do I add typo tolerance in Algolia?", "neural");
    expect(q).toMatch(/how do i/i);
  });
});

// --- routeSpecialists: more coverage of the deterministic mapping -----------

describe("routeSpecialists (intent + entity mapping)", () => {
  it("routes a troubleshoot intent to support", () => {
    expect(routeSpecialists({ entities: ["error"], intent: "troubleshoot" })).toContain("support");
  });
  it("routes a learning intent to academy", () => {
    expect(routeSpecialists({ entities: ["course"], intent: "learn" })).toContain("academy");
  });
  it("routes value/positioning intent to marketer", () => {
    expect(routeSpecialists({ entities: ["use cases"], intent: "compare-use-cases" })).toContain(
      "marketer",
    );
  });
  it("always returns at least one specialist (defaults to technical)", () => {
    const r = routeSpecialists({ entities: [], intent: "" });
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r).toContain("technical");
  });
  it("never returns duplicates", () => {
    const r = routeSpecialists({ entities: ["a", "b"], intent: "how-to-config" });
    expect(new Set(r).size).toBe(r.length);
  });
});

// --- buildRetrievalQuery: keyword de-padding edge cases ---------------------

describe("buildRetrievalQuery (keyword de-padding)", () => {
  it("strips framing words and keeps the concept", () => {
    const q = buildRetrievalQuery("What is vector search?", "keyword");
    expect(q.toLowerCase()).toContain("vector search");
    expect(q.toLowerCase()).not.toMatch(/\bwhat\b|\bis\b/);
  });
  it("does not produce an empty query for an all-stopword question", () => {
    const q = buildRetrievalQuery("How does it work?", "keyword");
    expect(q.trim().length).toBeGreaterThan(0);
  });
});

