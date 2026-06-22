import type { Source } from "./types";

export interface ReferenceTurnArtifact {
  userInput: string;
  candidateAnswer: string;
  candidateSources: Source[];
  goldAnswer: string;
  goldSources: Source[];
  turnRole: "discovery" | "deepdive";
  expectedSpecialist?: "elena" | "bruno";
}
