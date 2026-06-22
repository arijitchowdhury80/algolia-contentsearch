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
