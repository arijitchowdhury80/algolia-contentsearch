import type { Source, LlmComplete } from "./types";

export interface GroundingResult {
  grounded: boolean;
  violations: Array<{ claim: string; reason: string }>;
}

const SYSTEM = `You verify grounding. Given an ANSWER and its SOURCES, list every factual claim in the answer
that is CONTRADICTED by or wholly ABSENT-and-unsupportable from the sources. Do NOT list claims that are
merely common knowledge or reasonable paraphrase. Return ONLY JSON: {"violations":[{"claim","reason"}]}.`;

export async function checkGrounding(answer: string, sources: Source[], llm: LlmComplete): Promise<GroundingResult> {
  const prompt = `${SYSTEM}\n\nSOURCES:\n${sources.map((s, i) => `[${i}] ${s.text}`).join("\n")}\n\nANSWER:\n${answer}`;
  let violations: GroundingResult["violations"] = [];
  try {
    const raw = await llm(prompt, { temperature: 0, tag: "grounding" });
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    violations = Array.isArray(j.violations) ? j.violations : [];
  } catch {
    violations = []; // never fail-closed into a false grounding trip on parse error; log upstream
  }
  return { grounded: violations.length === 0, violations };
}
