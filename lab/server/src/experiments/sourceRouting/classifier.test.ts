import { describe, it, expect } from "vitest";
import { parseSourceVerdict, routeBySource, makeSourceClassifier } from "./classifier.js";

describe("parseSourceVerdict", () => {
  it("extracts each exact one-word label", () => {
    expect(parseSourceVerdict("support")).toBe("support");
    expect(parseSourceVerdict("academy")).toBe("academy");
    expect(parseSourceVerdict("technical")).toBe("technical");
    expect(parseSourceVerdict("marketer")).toBe("marketer");
  });

  it("extracts from messy model text", () => {
    expect(parseSourceVerdict("I'd pick **support**.")).toBe("support");
    expect(parseSourceVerdict("Answer: Technical")).toBe("technical");
    expect(parseSourceVerdict("This is marketing/positioning")).toBe("marketer");
  });

  it("prefers the specific domain when both appear (technical support → support)", () => {
    expect(parseSourceVerdict("technical support issue")).toBe("support");
  });

  it("defaults to technical on garbage or empty", () => {
    expect(parseSourceVerdict("banana")).toBe("technical");
    expect(parseSourceVerdict("")).toBe("technical");
  });
});

describe("routeBySource (oracle passthrough)", () => {
  it("returns the hand-label verbatim", () => {
    expect(routeBySource({ sourceLabel: "academy", intent: "learn" })).toBe("academy");
    expect(routeBySource({ sourceLabel: "support", intent: "troubleshoot", span: true })).toBe("support");
  });
});

describe("makeSourceClassifier (real router)", () => {
  it("routes via the injected llm", async () => {
    const classify = makeSourceClassifier(async () => "support");
    expect(await classify("my indexing API returns 403")).toBe("support");
  });

  it("defaults to technical when the llm throws", async () => {
    const classify = makeSourceClassifier(async () => {
      throw new Error("boom");
    });
    expect(await classify("anything")).toBe("technical");
  });
});
