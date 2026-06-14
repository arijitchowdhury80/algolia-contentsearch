/**
 * orchestrator — the autocorrect loop.
 *
 * Drives the pure decision core (loop.ts) through injected, app-agnostic SEAMS,
 * exactly as the judge talks to any LLM through one injected `LlmComplete`. The
 * loop itself knows nothing about Algolia, Agent Studio, prompts, or indices —
 * a config `C` is opaque. Algolia-specific wiring (deploy via agent_admin, run
 * answers via the harness, propose via an LLM) lives in the server adapters, so
 * the same loop ports to any system that can deploy a config and be evaluated.
 *
 * Each round: deploy a candidate → evaluate (dev, + held-out when validating) →
 * decideKeep vs the incumbent (grounding hard-constraint, above-noise gain,
 * overfit guard) → keep (candidate becomes live) or roll back (re-deploy
 * incumbent). History always reflects the LIVE system after each round, so the
 * pure stop/win checks read the trajectory of what is actually deployed.
 */
import { decideKeep, diagnoseWeakest, shouldStop } from "./loop.js";
import { summarizeSplit, type ScoredPanelAnswer } from "./summarize.js";
import type {
  LoopConfig,
  RoundResult,
  SplitMetrics,
  StopReason,
  WeakDimension,
} from "./types.js";

/** The app-specific capabilities the loop needs, injected by the caller. */
export interface AutocorrectSeams<C> {
  /** Make `config` the live system under test (deploy + activate). */
  deploy(config: C): Promise<void>;
  /** Run + judge the CURRENTLY-DEPLOYED config on a split → scored answers. */
  evaluate(split: "dev" | "held-out"): Promise<readonly ScoredPanelAnswer[]>;
  /** Propose the next candidate config from the current one + diagnosed weaknesses. */
  propose(
    current: C,
    weakest: readonly WeakDimension[],
    history: readonly RoundResult[],
  ): Promise<C>;
  /** Optional progress logger. */
  log?(msg: string): void;
}

export interface AutocorrectInput<C> {
  readonly seams: AutocorrectSeams<C>;
  readonly cfg: LoopConfig;
  /** The starting (incumbent) config at round 0. */
  readonly baseline: { readonly id: string; readonly config: C };
  /** Validate on held-out every N rounds (default 1 = every round). */
  readonly validateEvery?: number;
  /** How many weak dimensions to feed the proposer (default 3). */
  readonly diagnoseK?: number;
}

export interface AutocorrectResult<C> {
  readonly stopReason: StopReason;
  /** The best (live) config when the loop stopped. */
  readonly best: { readonly id: string; readonly config: C };
  /** One entry per round, reflecting the LIVE system after that round. */
  readonly history: readonly RoundResult[];
}

export async function runAutocorrect<C>(
  input: AutocorrectInput<C>,
): Promise<AutocorrectResult<C>> {
  const { seams, cfg, baseline } = input;
  const validateEvery = input.validateEvery ?? 1;
  const diagnoseK = input.diagnoseK ?? 3;
  const log = (m: string) => seams.log?.(m);

  const validateOn = (round: number) => round % validateEvery === 0;

  // --- Round 0: establish the incumbent (the baseline). --------------------
  await seams.deploy(baseline.config);
  let incumbent = { id: baseline.id, config: baseline.config };
  let incumbentRound = await measure(seams, 0, baseline.id, validateOn(0));
  const history: RoundResult[] = [incumbentRound];
  log(`round 0 (${baseline.id}): dev ours=${oursDev(incumbentRound, cfg.oursPanelId).toFixed(2)}`);

  // --- Mutation rounds. ----------------------------------------------------
  let round = 0;
  while (shouldStop(history, cfg) === "running") {
    round += 1;

    const weakest = diagnoseWeakest(incumbentRound.dev, cfg, diagnoseK);
    const candidateConfig = await seams.propose(incumbent.config, weakest, history);
    const candidateId = `${baseline.id}-r${round}`;

    await seams.deploy(candidateConfig);
    const candidateRound = await measure(seams, round, candidateId, validateOn(round));

    const decision = decideKeep(incumbentRound, candidateRound, cfg);
    if (decision.keep) {
      incumbent = { id: candidateId, config: candidateConfig };
      incumbentRound = candidateRound;
      history.push(candidateRound);
      log(`round ${round} (${candidateId}): KEEP (${decision.reason}) ours=${oursDev(candidateRound, cfg.oursPanelId).toFixed(2)}`);
    } else {
      // Roll back: the incumbent is the live system again. Record a round that
      // reflects the incumbent (re-stamped) so stop/win checks see the truth.
      await seams.deploy(incumbent.config);
      history.push({ ...incumbentRound, round, configId: incumbent.id });
      log(`round ${round} (${candidateId}): ROLLBACK (${decision.reason})`);
    }
  }

  const stopReason = shouldStop(history, cfg);
  log(`stopped: ${stopReason}; best=${incumbent.id}`);
  return { stopReason, best: incumbent, history };
}

/** Evaluate the live config on dev (+ held-out when validating) → RoundResult. */
async function measure<C>(
  seams: AutocorrectSeams<C>,
  round: number,
  configId: string,
  validate: boolean,
): Promise<RoundResult> {
  const devAnswers = await seams.evaluate("dev");
  const dev: SplitMetrics = summarizeSplit(devAnswers, "dev");
  if (!validate) return { round, configId, dev };
  const heldAnswers = await seams.evaluate("held-out");
  const heldOut: SplitMetrics = summarizeSplit(heldAnswers, "held-out");
  return { round, configId, dev, heldOut };
}

function oursDev(r: RoundResult, oursPanelId: string): number {
  // Loop-internal convenience for logging; the pure functions do the real math.
  const p = r.dev.panels.find((x) => x.panelId === oursPanelId);
  return p ? p.meanScore : 0;
}
