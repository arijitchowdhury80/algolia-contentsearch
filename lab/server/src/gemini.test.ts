/**
 * Tests for the Gemini adapter's transient-error resilience. A 700+ call run must
 * not die on a single 502 or a dropped connection — these were observed poisoning
 * scores and aborting the autocorrect loop.
 */
import { describe, it, expect, vi } from "vitest";
import { makeGeminiComplete } from "./gemini.js";

const okBody = JSON.stringify({
  candidates: [{ content: { parts: [{ text: "ANSWER" }] }, finishReason: "STOP" }],
});
const resp = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

const client = (fetchImpl: typeof fetch) =>
  makeGeminiComplete({ apiKey: "k", model: "gemini-2.5-pro", fetchImpl, backoffBaseMs: 1 } as never);

describe("gemini transient-error resilience", () => {
  it("retries on 502 (was previously fatal) and succeeds", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(resp(502, "<html>bad gateway</html>"))
      .mockResolvedValueOnce(resp(200, okBody));
    const out = await client(f as never)("hi");
    expect(out).toBe("ANSWER");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("retries on a thrown network error (fetch failed)", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(resp(200, okBody));
    const out = await client(f as never)("hi");
    expect(out).toBe("ANSWER");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("still throws on a non-retryable 400", async () => {
    const f = vi.fn().mockResolvedValue(resp(400, "bad request"));
    await expect(client(f as never)("hi")).rejects.toThrow(/Gemini 400/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries on persistent network failure", async () => {
    const f = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const c = makeGeminiComplete({
      apiKey: "k", model: "m", fetchImpl: f as never, backoffBaseMs: 1, maxRetries: 2,
    } as never);
    await expect(c("hi")).rejects.toThrow(/fetch failed|after 2 retries/);
    expect(f).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
