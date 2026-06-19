export const PERSONAS = {
  "The Listener": {
    name: "The Listener",
    short: "Listener",
    color: "#7C9E87",       // sage green — warm, calm
    bg: "#F0F5F1",
    emoji: "🌿",
    description: "Warm, unhurried, pays close attention",
  },
  "The Analyst": {
    name: "The Analyst",
    short: "Analyst",
    color: "#4A6FA5",       // slate blue — clear, structured
    bg: "#EEF2F9",
    emoji: "🧭",
    description: "Direct, clear, presents the picture",
  },
  "The Advisor": {
    name: "The Advisor",
    short: "Advisor",
    color: "#8B6F47",       // warm brown — grounded, confident
    bg: "#F5F0EA",
    emoji: "🔑",
    description: "Calm, confident, hands back the decision",
  },
} as const;

export type PersonaKey = keyof typeof PERSONAS;
