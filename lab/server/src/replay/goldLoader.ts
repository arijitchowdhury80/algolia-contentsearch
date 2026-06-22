import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface GoldTurnRecord {
  turnIndex: number; userInput: string; answer: string;
  sources: Array<{ title: string; url: string }>;
  activePersona: string; handoff?: { specialist: string }; discoveryQuestion?: string;
}
export interface GoldEngagement {
  scenarioId: string; vertical: string; tier: "Q1" | "Q2";
  expectsHandoff: boolean; handoffTarget?: "elena" | "bruno";
  drivingSequence: string[]; turns: GoldTurnRecord[]; blessedBy: string | null;
}

export function loadGold(dir = join(process.cwd(), "..", "..", "lab", "replay", "gold")): GoldEngagement[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const eng = JSON.parse(readFileSync(join(dir, f), "utf8")) as GoldEngagement;
    if (!eng.blessedBy) throw new Error(`gold ${f} is not blessed — run Phase 0 bless step`);
    return eng;
  });
}
