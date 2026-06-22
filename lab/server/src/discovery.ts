export type OnionSignal = "stack" | "scale" | "role" | "pain" | "industry" | "product" | "feature" | "solution";

export interface Dossier {
  signals: Partial<Record<OnionSignal, string>>;
  askedSignals: OnionSignal[];
  turnCount: number;
}

export function emptyDossier(): Dossier {
  return { signals: {}, askedSignals: [], turnCount: 0 };
}

const SHORT_TURN_MAX_WORDS = 3; // F-044

export function accumulate(
  dossier: Dossier,
  update: { signals?: Partial<Record<OnionSignal, string>>; asked?: OnionSignal },
  userInput: string,
): Dossier {
  const signals = { ...dossier.signals, ...(update.signals ?? {}) };
  const askedSignals = update.asked && !dossier.askedSignals.includes(update.asked)
    ? [...dossier.askedSignals, update.asked]
    : dossier.askedSignals;
  const isShort = userInput.trim().split(/\s+/).filter(Boolean).length <= SHORT_TURN_MAX_WORDS;
  const turnCount = isShort ? dossier.turnCount : dossier.turnCount + 1; // F-044: short reply doesn't advance
  return { signals, askedSignals, turnCount };
}

export function isQualified(dossier: Dossier): boolean {
  return Object.keys(dossier.signals).length >= 3 || dossier.turnCount >= 4;
}

const ONION_ORDER: OnionSignal[] = ["pain", "stack", "scale", "role", "industry", "product", "feature", "solution"];

export function nextUnaskedSignal(dossier: Dossier, candidate?: OnionSignal): OnionSignal | undefined {
  if (candidate && !dossier.askedSignals.includes(candidate)) return candidate;
  return ONION_ORDER.find((s) => !dossier.askedSignals.includes(s) && !(s in dossier.signals));
}
