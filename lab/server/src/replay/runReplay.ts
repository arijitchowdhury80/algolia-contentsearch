import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadGold } from "./goldLoader.js";
import { replayEngagement, type ReplayedTurn } from "./replay.js";
import { summarize, type ScorecardTurn } from "./scorecard.js";
import {
  judgeArtifactMultiRound,
  DEFAULT_JUDGE_CONFIG,
  type Artifact,
  type LlmComplete,
} from "@lab/judge";
import { makeAnswerDeps, makePinnedLlm } from "../answerService.js";

/** Rounds for the offline gym verdict (latency irrelevant; favour stability). */
export const REPLAY_ROUNDS = 3;

/**
 * Build a judge Artifact from one replayed AC2 turn. Grounding is checked against
 * AC2's OWN retrieved sources (never the gold/RC2 sources — Phase 3's win/tie/loss
 * yardstick is separate). The dossier's discovery signals feed the Coverage
 * checklist via extractedEntities. Pure.
 */
export function buildReplayArtifact(rt: ReplayedTurn): Artifact {
  const dossier = rt.candidate.dossier;
  const signals = dossier?.signals ?? {};
  const hasSignals = Object.keys(signals).length > 0;
  return {
    type: "algolia-answer",
    prompt: rt.userInput,
    content: rt.candidate.answer,
    sources: rt.candidate.sources.map((s, i) => ({
      id: String(i),
      text: `${s.title} ${s.url}`,
      label: s.title,
    })),
    ...(hasSignals
      ? { extractedEntities: { signals: { ...signals } } }
      : {}),
  };
}

/** Score one replayed turn via the mature engine; absolute composite + dims. */
export async function judgeReplayTurn(
  scenarioId: string,
  mode: "single" | "multi",
  rt: ReplayedTurn,
  llm: LlmComplete,
  rounds = REPLAY_ROUNDS,
): Promise<ScorecardTurn> {
  const artifact = buildReplayArtifact(rt);
  const result = await judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, llm, rounds);
  return {
    scenarioId,
    mode,
    turnIndex: rt.turnIndex,
    composite: result.aggregate.finalScore,
    gated: result.aggregate.gateTripped,
    dimensions: { ...result.aggregate.dimensionMeans },
  };
}

export async function runReplay(opts: { goldDir: string; outDir: string }) {
  const gold = loadGold(opts.goldDir);
  const deps = await makeAnswerDeps();
  const { llm, provider } = await makePinnedLlm();
  const turns: ScorecardTurn[] = [];

  for (const eng of gold) {
    for (const mode of ["single", "multi"] as const) {
      const replayed = await replayEngagement(eng, mode, deps as never);
      for (const rt of replayed.turns) {
        turns.push(await judgeReplayTurn(eng.scenarioId, mode, rt, llm));
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
