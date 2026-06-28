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
