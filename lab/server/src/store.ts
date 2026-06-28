/**
 * store — runId concept + transcript/score persistence on disk.
 *
 *   output/transcripts/<runId>.json  ← raw panel answers per question (run-tests)
 *   output/scores/<runId>.json       ← judge results per answer (judge)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PanelAnswer } from "./panels.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// lab/server/src → lab/server
const SERVER_ROOT = resolve(__dirname, "..");
export const OUTPUT_DIR = resolve(SERVER_ROOT, "output");
export const TRANSCRIPTS_DIR = resolve(OUTPUT_DIR, "transcripts");
export const SCORES_DIR = resolve(OUTPUT_DIR, "scores");

/** runId = sortable UTC timestamp, e.g. 20260612T021530Z. */
export function newRunId(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/** One panel's answer to one question, as stored in a transcript. */
export interface TranscriptPanel {
  panelId: string;
  panelLabel: string;
  /** 2×2 axes for the leaderboard/deltas. */
  arch: "single" | "multi";
  retrieval: "keyword" | "neural";
  /** Single panels: the agent that produced this. Multi: undefined (coordinator). */
  agentId?: string;
  index?: string;
  answer: PanelAnswer;
  /** The panel's generated follow-up question (the MULTI-TURN signal). */
  followUp?: string;
  /** Multi panels: the Maverick orchestration trace (JSON-serialisable). */
  trace?: unknown;
  latencyMs: number;
}

export interface TranscriptQuestion {
  questionId: string;
  category: number;
  split: "dev" | "held-out";
  prompt: string;
  followUp?: string;
  isRefusalTest: boolean;
  panels: TranscriptPanel[];
}

export interface Transcript {
  runId: string;
  createdAt: string;
  questionVersion: string;
  panelOrder: string[];
  questions: TranscriptQuestion[];
}

/** A judge score for one panel's answer to one question. */
export interface PanelScore {
  panelId: string;
  /** Stable verdict = mean pre-gate consensus, capped iff the gate VOTE tripped. */
  finalScore: number;
  /** Mean pre-gate consensus across rounds (the reproducible quality metric). */
  preGateScore: number;
  /** True iff verified violations reproduced in >= the vote threshold of rounds. */
  gateTripped: boolean;
  panelSpread: number;
  rationale: string;
  // --- multi-round stability fields (see judge aggregateRounds) ---
  /** How many judging rounds were averaged into this score. */
  rounds: number;
  /** Mean of the per-round pre-gate scores (alias of preGateScore, explicit). */
  meanPreGateScore: number;
  /** Population stdDev of per-round pre-gate scores — LOW = reproducible. */
  stdDevPreGateScore: number;
  /** Fraction of rounds whose hard gate tripped, 0-1. */
  gateTripFraction: number;
  /** Ambiguous grounding signal (evidence present but not a reproducible supermajority). */
  borderline: boolean;
  /** per-judge weighted scores, for transparency. */
  judgeScores: { judgeId: string; weightedScore: number }[];
  /** Mean raw score per rubric dimension (across judges + rounds) — autocorrect diagnosis. */
  dimensionMeans?: Readonly<Record<string, number>>;
  error?: string;
}

export interface ScoredQuestion {
  questionId: string;
  category: number;
  split: "dev" | "held-out";
  panels: PanelScore[];
}

export interface ScoreSet {
  runId: string;
  createdAt: string;
  judgeModel: string;
  questions: ScoredQuestion[];
}

function ensureDirs(): void {
  mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  mkdirSync(SCORES_DIR, { recursive: true });
}

export function saveTranscript(t: Transcript): string {
  ensureDirs();
  const path = resolve(TRANSCRIPTS_DIR, `${t.runId}.json`);
  writeFileSync(path, JSON.stringify(t, null, 2), "utf8");
  return path;
}

export function loadTranscript(runId: string): Transcript {
  const path = resolve(TRANSCRIPTS_DIR, `${runId}.json`);
  if (!existsSync(path)) {
    throw new Error(`No transcript for runId ${runId} at ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Transcript;
}

export function saveScores(s: ScoreSet): string {
  ensureDirs();
  const path = resolve(SCORES_DIR, `${s.runId}.json`);
  writeFileSync(path, JSON.stringify(s, null, 2), "utf8");
  return path;
}

export function loadScores(runId: string): ScoreSet {
  const path = resolve(SCORES_DIR, `${runId}.json`);
  if (!existsSync(path)) {
    throw new Error(`No scores for runId ${runId} at ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as ScoreSet;
}
