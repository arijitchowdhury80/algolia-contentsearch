import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadGold } from "./goldLoader.js";
import { replayEngagement } from "./replay.js";
import { summarize, type ScorecardTurn } from "./scorecard.js";
import { judgeEngagementTurn } from "@lab/judge";
import type { ReferenceTurnArtifact } from "@lab/judge";
import { makeAnswerDeps, makePinnedLlm } from "../answerService.js";

export async function runReplay(opts: { goldDir: string; outDir: string }) {
  const gold = loadGold(opts.goldDir);
  const deps = await makeAnswerDeps();
  const { llm, provider } = await makePinnedLlm();
  const turns: ScorecardTurn[] = [];

  for (const eng of gold) {
    for (const mode of ["single", "multi"] as const) {
      const replayed = await replayEngagement(eng, mode, deps as never);
      for (const rt of replayed.turns) {
        const isDeep = rt.turnIndex === eng.turns.length - 1 && eng.expectsHandoff;
        const art: ReferenceTurnArtifact = {
          userInput: rt.userInput,
          candidateAnswer: rt.candidate.answer,
          candidateSources: rt.candidate.sources.map((s, i) => ({
            id: String(i),
            text: `${s.title} ${s.url}`,
          })),
          goldAnswer: rt.gold.answer,
          goldSources: rt.gold.sources.map((s, i) => ({
            id: String(i),
            text: `${s.title} ${s.url}`,
          })),
          turnRole: isDeep ? "deepdive" : "discovery",
          expectedSpecialist: eng.handoffTarget,
        };
        const v = await judgeEngagementTurn(art, rt.candidate.persona, llm);
        turns.push({
          scenarioId: eng.scenarioId,
          mode,
          turnIndex: rt.turnIndex,
          pctOfFloor: v.pctOfFloor,
          gated: v.gated,
          retrievalGaps: v.missedClaims.filter((m) => m.gap === "retrieval-gap").length,
          generationGaps: v.missedClaims.filter((m) => m.gap === "generation-gap").length,
        });
      }
    }
  }

  const summary = summarize(turns);
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(
    join(opts.outDir, `scorecard-${provider}.json`),
    JSON.stringify({ turns, summary }, null, 2),
  );

  return { turns, summary };
}
