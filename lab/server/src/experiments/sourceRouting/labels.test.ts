import { describe, it, expect } from "vitest";
import { parseQuestions } from "../../questions.js";
import { LABELS, SPECIALIST_AGENT_ENV, SOURCE_LABELS } from "./labels.js";
import { EXTRA_QUESTIONS } from "./extraQuestions.js";

describe("LABELS coverage", () => {
  it("labels every locked v3 question", () => {
    for (const q of parseQuestions()) {
      expect(LABELS[q.id], `missing label for locked question ${q.id}`).toBeDefined();
    }
  });

  it("labels every extra (S1–S6) question", () => {
    for (const q of EXTRA_QUESTIONS) {
      expect(LABELS[q.id], `missing label for extra question ${q.id}`).toBeDefined();
    }
  });

  it("maps every sourceLabel to a real specialist env key", () => {
    for (const [id, l] of Object.entries(LABELS)) {
      expect(SOURCE_LABELS, `unknown sourceLabel on ${id}`).toContain(l.sourceLabel);
      expect(SPECIALIST_AGENT_ENV[l.sourceLabel], `no env var for ${id}`).toBeTruthy();
    }
  });

  it("exercises the academy specialist at least once (v3 has no clean academy Q)", () => {
    const hasAcademy = Object.values(LABELS).some((l) => l.sourceLabel === "academy");
    expect(hasAcademy).toBe(true);
  });
});
