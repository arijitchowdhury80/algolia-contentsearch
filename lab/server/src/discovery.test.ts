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
