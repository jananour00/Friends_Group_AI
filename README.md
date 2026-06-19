# PathMapper v1
### USAII Global AI Hackathon 2026 — Undergraduate Track, Brief 3

> AI-powered life decision simulator that resolves reasoning contradictions before mapping your two paths.

---

## Quick Start (5 minutes)

### 1. Get Free API Keys

**Gemini** → https://aistudio.google.com/app/apikey  
**Groq** → https://console.groq.com/keys (optional — falls back to Gemini if not set)

### 2. Install & Run

```bash
npm install
cp .env.local.template .env.local
# Paste your keys into .env.local
npm run dev
# Open http://localhost:3000
```

### 3. Deploy to Vercel

```bash
npx vercel
# Add env vars in Vercel dashboard: GEMINI_API_KEY, GROQ_API_KEY, NEXT_PUBLIC_BASE_URL
```

---

## Architecture

```
User input
  ↓
Step 1 — Gemini: Extract values + signals (contradiction, repetition, bundling, hedging, omission)
  ↓
Step 2 — Gemini: Select highest-priority unresolved checkpoint
  ↓
Step 3 — Groq (fast) / Gemini: Generate question → user answers → extract resolved premise
  ↩ Loop steps 2–3 until no checkpoints remain
  ↓
Step 4 — Gemini: Generate 2 first-person narratives constrained by resolved premises
  ↓
Step 5 — Pure TypeScript: Score each path across 5 dimensions (no LLM)
  ↓
Step 6 — Gemini: Deliver lean + flip condition + handback
```

**Key fix in v2:** The pipeline runs entirely server-side in a single `/api/chat` POST — 
no internal HTTP calls between routes (eliminates all 405 errors). Each step is a direct 
function call with proper error propagation.

---

## Environment Variables

```env
GEMINI_API_KEY=your_key_here       # Required — get free at aistudio.google.com
GROQ_API_KEY=your_key_here         # Optional — falls back to Gemini if missing
NEXT_PUBLIC_BASE_URL=http://localhost:3000  # Change to your Vercel URL in production
```

---

## Responsible AI

- **Risk:** Users may treat PathMapper's lean as the decision itself
- **Mitigation:** The Advisor always ends with an explicit handback naming what only the human can know
- **Human-in-the-loop:** The dimension weighting is yours — PathMapper surfaces tradeoffs, not answers
