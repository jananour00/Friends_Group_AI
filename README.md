# PathMapper v1.2
### USAII Global AI Hackathon 2026 — Undergraduate Track, Brief 3

> **PathMapper** is an AI-powered life decision simulator that helps users unpack complex career or life dilemmas, resolving reasoning biases and contradictions through a group-chat style interaction before mapping two contrasting paths.

---

## 🚀 Quick Start (5 minutes)

### 1. Get Free API Keys
* **Gemini API Key** → Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey)
* **Groq API Key** *(Optional)* → Get a key at [Groq Console](https://console.groq.com/keys) (The application will automatically fall back to Gemini if your Groq key is rate-limited or missing).

### 2. Install & Run

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.local.template .env
# Open .env and paste your GEMINI_API_KEY and GROQ_API_KEY

# Run development server
npm run dev

# Open http://localhost:3000 in your browser
```

### 3. Deploy to Vercel

```bash
npx vercel
# Add the environment variables in your Vercel project settings:
# - GEMINI_API_KEY
# - GROQ_API_KEY
```

---

## 🛠️ Architecture & Core Pipelines

```
User Input
  │
  ├──► Step 1: Richness Gate (Gemini 2.0)
  │            Verifies input depth. Prompts user for missing signals if needed.
  │
  ├──► Step 2: Signal Extraction (Groq/Gemini)
  │            Identifies contradictions, bundling, repetition, hedging, and omissions.
  │
  ├──► Step 3: Checkpoint Selection
  │            Selects the highest-priority reasoning checkpoint to address.
  │
  ├──► Step 4: Actor-Critic Response Loop (Groq + Gemini Critic)
  │            Groq generates the draft message. Gemini evaluates the tone:
  │              - If robotic/clinical: Gemini requests revision with feedback (up to 2 times).
  │              - If human & empathetic: Approved and sent.
  │
  ├──► Step 5: Path Narratives (Gemini 2.0)
  │            Constructs two vivid first-person future paths.
  │
  ├──► Step 6: Path Scoring & Stance (TypeScript + Gemini)
  │            Scores paths across 5 dimensions and delivers a final advice stance.
```

### Key Technical Enhancements:

* **Groq-to-Gemini Actor-Critic Loop:** For conversational turns, Groq acts as the generator for speed, while Gemini acts as an editorial critic (`verifyResponseWithGemini`) evaluating style constraints (WhatsApp casual tone, max 2-3 sentences, empathy). Gemini can reject and request up to **2 revisions** with feedback.
* **Stable Production Fallback:** Powered by `gemini-2.0-flash` with strict JSON mode configurations (`responseMimeType: "application/json"`) to prevent early truncation, safety recitation filters, or markdown syntax failures when fallback is active.
* **Typing Indicator Sync:** The frontend simulates typing for the **exact friend** who sent the message (Dev, Mina, Theo, Priya, Jordan) for 1.5 seconds before rendering their chat bubble, aligning the UI animation with the chat participant.
* **Single Route Server Execution:** Evaluates all steps server-side under `/api/chat` to eliminate redundant HTTP hops, 405 CORS issues, and state mismatch.

---

## ⚙️ Environment Variables

Copy `.env.local.template` to `.env` and fill in the values:

```env
# -----------------------------------------------------------------------------
# API Keys (Required)
# -----------------------------------------------------------------------------
GEMINI_API_KEY=AIzaSy...           # Get free at https://aistudio.google.com
GROQ_API_KEY=gsk_...               # Get free at https://console.groq.com

# -----------------------------------------------------------------------------
# App configuration
# -----------------------------------------------------------------------------
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 🤝 Responsible AI

* **Risk:** Users may treat PathMapper's lean advice as a definitive choice.
* **Mitigation:** The advisor persona always terminates the session with an explicit "handback" stating exactly what only the human agent can decide.
* **Human-in-the-Loop:** PathMapper acts as a mirror highlighting trade-offs rather than providing final decisions.
