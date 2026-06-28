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
