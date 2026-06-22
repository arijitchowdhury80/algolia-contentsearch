import type { Source, LlmComplete } from "./types";

export type GapKind = "retrieval-gap" | "generation-gap";
export interface MissedClaim { claim: string; gap: GapKind }

export async function classifyGaps(
  missedGoldClaims: string[],
  candidateSources: Source[],
  llm: LlmComplete,
): Promise<MissedClaim[]> {
  const sourceText = candidateSources.map((s, i) => `[${i}] ${s.text}`).join("\n");
  const out: MissedClaim[] = [];
  for (const claim of missedGoldClaims) {
    let supported = false;
    try {
      const ans = (await llm(
        `Is the following CLAIM supported by ANY of these SOURCES? Answer only "yes" or "no".\nSOURCES:\n${sourceText}\nCLAIM: ${claim}`,
        { temperature: 0, tag: "gap" },
      )).trim().toLowerCase();
      supported = ans.startsWith("y");
    } catch {
      supported = false; // unknown → treat as retrieval-gap (don't blame the prompt-loop)
    }
    out.push({ claim, gap: supported ? "generation-gap" : "retrieval-gap" });
  }
  return out;
}
