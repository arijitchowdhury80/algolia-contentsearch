// lab/server/src/replay/goldLoader.test.ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadGold } from "./goldLoader.js";

describe("loadGold", () => {
  it("loads blessed gold engagements from the fixtures dir", () => {
    const gold = loadGold(join(__dirname, "__fixtures__"));
    expect(gold.length).toBeGreaterThan(0);
    expect(gold[0].drivingSequence.length).toBe(gold[0].turns.length);
    expect(gold[0].blessedBy).toBe("arijit");
  });
});
