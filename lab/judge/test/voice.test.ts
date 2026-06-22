import { describe, it, expect } from "vitest";
import { validateVoice } from "../src/voice.js";

describe("validateVoice (maverick, ported from RC2)", () => {
  it("flags a code block (Maverick is banned from code)", () => {
    const r = validateVoice("maverick", "Here:\n```js\nx\n```", { substantive: true });
    expect(r.compliant).toBe(false);
    expect(r.violations.join(" ")).toMatch(/code block/i);
  });
  it("flags a doc-bot opener", () => {
    const r = validateVoice("maverick", "To enable search, the feature is configured...", { substantive: true });
    expect(r.compliant).toBe(false);
  });
  it("flags missing algolia.com citation on a substantive answer", () => {
    const r = validateVoice("maverick", "Gymshark grew fast with great search and a real win here.", { substantive: true });
    expect(r.violations.join(" ")).toMatch(/citation|algolia\.com/i);
  });
  it("passes a compliant Maverick answer", () => {
    const r = validateVoice("maverick", "Gymshark crushed it — 27% lift. [proof](https://www.algolia.com/x) with NeuralSearch.", { substantive: true });
    expect(r.compliant).toBe(true);
  });
});

describe("validateVoice (bruno allows code)", () => {
  it("does NOT flag a code block for Bruno", () => {
    const r = validateVoice("bruno", "```ts\nconst x=1\n```\nScales fine.", { substantive: true });
    expect(r.violations.join(" ")).not.toMatch(/code block/i);
  });
});
