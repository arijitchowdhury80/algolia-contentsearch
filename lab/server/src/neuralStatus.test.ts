import { describe, it, expect } from "vitest";
import {
  NEURAL_INDEXES,
  interpretNeuralModes,
  fetchNeuralModes,
  makeNeuralStatusReader,
} from "./neuralStatus.js";

const [SINGLE_N, MULTI_N] = NEURAL_INDEXES;

describe("interpretNeuralModes", () => {
  it("maps neuralSearch → true for each neural index", () => {
    expect(
      interpretNeuralModes({ [SINGLE_N]: "neuralSearch", [MULTI_N]: "neuralSearch" }),
    ).toEqual({ [SINGLE_N]: true, [MULTI_N]: true });
  });

  it("maps keyword / undefined / missing → false (conservative)", () => {
    expect(interpretNeuralModes({ [SINGLE_N]: "keyword" })).toEqual({
      [SINGLE_N]: false,
      [MULTI_N]: false,
    });
    expect(interpretNeuralModes({})).toEqual({
      [SINGLE_N]: false,
      [MULTI_N]: false,
    });
  });

  it("handles a mixed flip (one index live, one still aggregating)", () => {
    expect(
      interpretNeuralModes({ [SINGLE_N]: "neuralSearch", [MULTI_N]: "keyword" }),
    ).toEqual({ [SINGLE_N]: true, [MULTI_N]: false });
  });
});

/** Fake fetch: returns the given mode per index URL; can be set to fail. */
function fakeFetch(
  modeFor: (ix: string) => { ok: boolean; mode?: string } | "throw",
): { impl: typeof fetch; calls: () => number } {
  let calls = 0;
  const impl = (async (url: string) => {
    calls++;
    const ix = NEURAL_INDEXES.find((n) => String(url).includes(n))!;
    const r = modeFor(ix);
    if (r === "throw") throw new Error("network");
    return { ok: r.ok, json: async () => ({ mode: r.mode }) };
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}

describe("fetchNeuralModes", () => {
  it("returns the live mode for each index", async () => {
    const { impl } = fakeFetch((ix) => ({
      ok: true,
      mode: ix === SINGLE_N ? "neuralSearch" : "keyword",
    }));
    expect(await fetchNeuralModes({ appId: "APP", apiKey: "KEY", fetchImpl: impl })).toEqual({
      [SINGLE_N]: "neuralSearch",
      [MULTI_N]: "keyword",
    });
  });

  it("yields undefined for a non-ok response (e.g. 412 still aggregating)", async () => {
    const { impl } = fakeFetch(() => ({ ok: false }));
    expect(await fetchNeuralModes({ appId: "APP", apiKey: "KEY", fetchImpl: impl })).toEqual({
      [SINGLE_N]: undefined,
      [MULTI_N]: undefined,
    });
  });

  it("yields undefined when the request throws (backend/network down)", async () => {
    const { impl } = fakeFetch(() => "throw");
    expect(await fetchNeuralModes({ appId: "APP", apiKey: "KEY", fetchImpl: impl })).toEqual({
      [SINGLE_N]: undefined,
      [MULTI_N]: undefined,
    });
  });
});

describe("makeNeuralStatusReader (TTL cache)", () => {
  it("caches within the TTL and refetches after it", async () => {
    let clock = 1000;
    const { impl, calls } = fakeFetch(() => ({ ok: true, mode: "neuralSearch" }));
    const reader = makeNeuralStatusReader({
      appId: "APP",
      apiKey: "KEY",
      fetchImpl: impl,
      now: () => clock,
      ttlMs: 30_000,
    });

    const first = await reader();
    expect(first).toEqual({ [SINGLE_N]: true, [MULTI_N]: true });
    expect(calls()).toBe(NEURAL_INDEXES.length); // one getSettings per index

    clock = 1000 + 10_000; // within TTL
    await reader();
    expect(calls()).toBe(NEURAL_INDEXES.length); // served from cache, no extra fetch

    clock = 1000 + 31_000; // past TTL
    await reader();
    expect(calls()).toBe(NEURAL_INDEXES.length * 2); // refetched
  });
});
