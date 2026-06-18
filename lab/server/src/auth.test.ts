import { describe, it, expect } from "vitest";
import { safeEqual, isAuthorized, clientIp, RateLimiter, API_KEY_HEADER } from "./auth.js";

describe("safeEqual", () => {
  it("is true for equal strings", () => expect(safeEqual("abc", "abc")).toBe(true));
  it("is false for different strings of equal length", () =>
    expect(safeEqual("abc", "abd")).toBe(false));
  it("is false for different lengths", () => expect(safeEqual("abc", "abcd")).toBe(false));
});

describe("isAuthorized", () => {
  it("is OPEN when no expected key is configured (dev/localhost)", () => {
    expect(isAuthorized(undefined, undefined)).toBe(true);
    expect(isAuthorized("anything", "")).toBe(true);
  });
  it("requires a matching header when a key is configured", () => {
    expect(isAuthorized("secret", "secret")).toBe(true);
    expect(isAuthorized("wrong", "secret")).toBe(false);
    expect(isAuthorized(undefined, "secret")).toBe(false);
  });
  it("accepts an array header by taking the first value", () => {
    expect(isAuthorized(["secret", "x"], "secret")).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers Cloudflare's CF-Connecting-IP", () => {
    expect(clientIp({ "cf-connecting-ip": "1.2.3.4" }, "127.0.0.1")).toBe("1.2.3.4");
  });
  it("falls back to the first X-Forwarded-For entry", () => {
    expect(clientIp({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }, "127.0.0.1")).toBe("5.6.7.8");
  });
  it("falls back to the socket address, then 'unknown'", () => {
    expect(clientIp({}, "10.0.0.1")).toBe("10.0.0.1");
    expect(clientIp({}, undefined)).toBe("unknown");
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    let t = 1000;
    const rl = new RateLimiter(3, 1000, () => t);
    expect(rl.check("ip")).toBe(true);
    expect(rl.check("ip")).toBe(true);
    expect(rl.check("ip")).toBe(true);
    expect(rl.check("ip")).toBe(false); // 4th over limit of 3
  });
  it("resets after the window elapses", () => {
    let t = 1000;
    const rl = new RateLimiter(1, 1000, () => t);
    expect(rl.check("ip")).toBe(true);
    expect(rl.check("ip")).toBe(false);
    t += 1000; // window elapsed
    expect(rl.check("ip")).toBe(true);
  });
  it("tracks keys independently", () => {
    const rl = new RateLimiter(1, 1000, () => 0);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("b")).toBe(true);
    expect(rl.check("a")).toBe(false);
  });
  it("is disabled when limit <= 0", () => {
    const rl = new RateLimiter(0, 1000, () => 0);
    for (let i = 0; i < 100; i++) expect(rl.check("ip")).toBe(true);
  });
});

describe("API_KEY_HEADER", () => {
  it("is the lowercase header name node exposes", () => expect(API_KEY_HEADER).toBe("x-lab-key"));
});
