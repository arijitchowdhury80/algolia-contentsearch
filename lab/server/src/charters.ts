export type PersonaId = "maverick" | "elena" | "bruno";

export interface Charter {
  persona: PersonaId;
  sources: string[];
  agentEnvVar: string; // env var holding this agent's id, set by the create script
}

// Spec §5.3 charter matrix over the 9 source facet values.
export const CHARTERS: Record<PersonaId, Charter> = {
  maverick: {
    persona: "maverick",
    sources: ["Website", "Blog", "Resources", "Customer Stories", "Other", "Documentation"],
    agentEnvVar: "ALGOLIA_AGENT_MAVERICK_NEURAL_ID",
  },
  elena: {
    persona: "elena",
    sources: ["Resources", "Customer Stories", "Academy", "Developers", "Documentation", "Support"],
    agentEnvVar: "ALGOLIA_AGENT_ELENA_NEURAL_ID",
  },
  bruno: {
    persona: "bruno",
    sources: ["Developers", "Documentation", "Support"],
    agentEnvVar: "ALGOLIA_AGENT_BRUNO_NEURAL_ID",
  },
};

export function buildSourceFilter(sources: string[]): string {
  return sources.map((s) => `source:"${s}"`).join(" OR ");
}
