"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage, DimensionScores, NarrativeOutput, ScoringOutput, StanceOutput } from "@/types/pipeline";

type PipelinePhase = "input" | "checkpoint_loop" | "awaiting_user" | "narratives" | "scores" | "done";

interface PipelineState {
  raw_input: string;
  extraction: unknown;
  resolved_premises: unknown[];
  current_checkpoint: unknown;
  narratives: NarrativeOutput | null;
  scores: ScoringOutput | null;
  stance: StanceOutput | null;
  phase: PipelinePhase;
  pending_question: string | null;
  pending_checkpoint_type: string | null;
}

const INITIAL: PipelineState = {
  raw_input: "",
  extraction: null,
  resolved_premises: [],
  current_checkpoint: null,
  narratives: null,
  scores: null,
  stance: null,
  phase: "input",
  pending_question: null,
  pending_checkpoint_type: null,
};

const PERSONAS = {
  "The Listener": { color: "#5B8A6A", bg: "#1a2e22", emoji: "🌿" },
  "The Analyst":  { color: "#4A7FBF", bg: "#1a2338", emoji: "🧭" },
  "The Advisor":  { color: "#B08A5A", bg: "#2a1f10", emoji: "🔑" },
} as const;

// ─── Score Bars ───────────────────────────────────────────────────────────────
function ScoreBar({ label, a, b, labelA, labelB }: { label: string; a: number; b: number; labelA: string; labelB: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#666", width: 64, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, height: 6, background: "#1E1E2E", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(a / 5) * 100}%`, background: "#3A6A9C", borderRadius: 3, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ fontSize: 10, color: "#555", width: 28, textAlign: "center", flexShrink: 0 }}>{a}:{b}</div>
        <div style={{ flex: 1, height: 6, background: "#1E1E2E", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(b / 5) * 100}%`, background: "#9C7A3A", borderRadius: 3, transition: "width 0.6s ease" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Narrative Cards ──────────────────────────────────────────────────────────
function NarrativeCards({ narratives, scores }: { narratives: NarrativeOutput; scores: ScoringOutput }) {
  const totalA = Object.values(scores.path_a).reduce((s, v) => s + v, 0);
  const totalB = Object.values(scores.path_b).reduce((s, v) => s + v, 0);
  const dims = ["financial", "growth", "values", "social", "stability"] as Array<keyof DimensionScores>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Path cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: narratives.path_a_label, path: narratives.path_a, color: "#4A7FBF", bg: "#0d1a2a" },
          { label: narratives.path_b_label, path: narratives.path_b, color: "#B08A5A", bg: "#1a1200" },
        ].map(({ label, path, color, bg }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color, marginBottom: 8 }}>{label}</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "#C0B8AC", margin: "0 0 10px" }}>{path.body}</p>
            <div style={{ fontSize: 11, color: "#555", background: "#0a0a10", borderRadius: 6, padding: "6px 10px", lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: "#777" }}>Flip if: </span>{path.flip_condition}
            </div>
          </div>
        ))}
      </div>

      {/* Scores */}
      <div style={{ background: "#111118", border: "1px solid #2A2A3E", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 11, fontWeight: 600 }}>
          <span style={{ color: "#4A7FBF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{narratives.path_a_label}</span>
          <span style={{ color: "#444", flex: 1, textAlign: "center" }}>vs</span>
          <span style={{ color: "#B08A5A", textTransform: "uppercase", letterSpacing: "0.5px" }}>{narratives.path_b_label}</span>
        </div>
        {dims.map((d) => (
          <ScoreBar key={d} label={d.charAt(0).toUpperCase() + d.slice(1)} a={scores.path_a[d]} b={scores.path_b[d]} labelA={narratives.path_a_label} labelB={narratives.path_b_label} />
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 10, borderTop: "1px solid #1E1E2E", fontSize: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#4A7FBF" }}>{totalA}/25</span>
          <span style={{ color: "#444", flex: 1, textAlign: "center" }}>Total</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#B08A5A" }}>{totalB}/25</span>
        </div>
      </div>
    </div>
  );
}

// ─── Stance Card ──────────────────────────────────────────────────────────────
function StanceCard({ stance }: { stance: StanceOutput }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: "#E8E4DC" }}>{stance.lean}</div>
      <div style={{ fontSize: 12, color: "#888", background: "#0a0a10", borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 }}>
        <span style={{ fontWeight: 600 }}>This changes if: </span>{stance.flip_condition}
      </div>
      <div style={{ fontSize: 13, color: "#A0988E", lineHeight: 1.7 }}>{stance.handback}</div>
    </div>
  );
}

// ─── Typing Dots ──────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "14px 18px", background: "#161622", border: "1px solid #2A2A3E", borderRadius: "4px 18px 18px 18px", width: "fit-content" }}>
      {[0, 200, 400].map((delay) => (
        <span key={delay} style={{
          width: 7, height: 7, background: "#555", borderRadius: "50%", display: "block",
          animation: `dotBounce 1.2s ${delay}ms infinite`
        }} />
      ))}
      <style>{`@keyframes dotBounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-5px);opacity:1} }`}</style>
    </div>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const persona = msg.persona ? PERSONAS[msg.persona as keyof typeof PERSONAS] : null;

  return (
    <div style={{ display: "flex", gap: 10, maxWidth: "92%", alignSelf: isUser ? "flex-end" : "flex-start", flexDirection: isUser ? "row-reverse" : "row", animation: "fadeIn 0.2s ease" }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {!isUser && persona && (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, flexShrink: 0, marginTop: 18, background: persona.bg, border: `2px solid ${persona.color}`
        }}>{persona.emoji}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {!isUser && msg.persona && (
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", marginLeft: 2, color: persona?.color }}>{msg.persona}</div>
        )}
        <div style={{
          padding: "12px 16px",
          borderRadius: isUser ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
          fontSize: 14, lineHeight: 1.6,
          background: isUser ? "#2A4A3A" : (persona?.bg ?? "#161622"),
          color: isUser ? "#D4EDDA" : "#E0D8D0",
          border: `1px solid ${isUser ? "#3A6A4A33" : (persona ? persona.color + "44" : "#2A2A3E")}`,
          maxWidth: msg.type === "narratives" ? 560 : undefined,
        }}>
          {msg.type === "narratives" && msg.metadata ? (
            <NarrativeCards
              narratives={(msg.metadata as { narratives: NarrativeOutput; scores: ScoringOutput }).narratives}
              scores={(msg.metadata as { narratives: NarrativeOutput; scores: ScoringOutput }).scores}
            />
          ) : msg.type === "stance" && msg.metadata ? (
            <StanceCard stance={(msg.metadata as { stance: StanceOutput }).stance} />
          ) : (
            <p style={{ margin: 0 }}>{msg.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────
function WelcomeScreen({ onSend }: { onSend: (text: string) => void }) {
  const examples = [
    "I'm deciding whether to stay at my current job or join a startup. The startup pays less but has equity and faster growth.",
    "Should I move to Dubai for a better salary or stay close to family in Cairo? My partner's situation complicates things.",
    "I'm torn between doing a master's degree or just working — I love learning but I need income now.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "40px 20px", textAlign: "center", gap: 12 }}>
      <div style={{ fontSize: 52 }}>🗺️</div>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, margin: 0 }}>PathMapper</h1>
      <p style={{ color: "#888", fontSize: 15, maxWidth: 340, lineHeight: 1.5, margin: 0 }}>Your decisions, thought through — not decided for you.</p>
      <div style={{ marginTop: 16, width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 4px" }}>Try one of these:</p>
        {examples.map((ex, i) => (
          <button key={i} onClick={() => onSend(ex)} style={{
            background: "#161622", border: "1px solid #2A2A3E", color: "#B0A898",
            padding: "12px 16px", borderRadius: 10, textAlign: "left", fontSize: 13, lineHeight: 1.5,
            cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit"
          }}
            onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = "#5B8A6A"; (e.target as HTMLElement).style.color = "#E8E4DC"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = "#2A2A3E"; (e.target as HTMLElement).style.color = "#B0A898"; }}
          >{ex}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PathMapperApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addMsg = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) =>
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }]), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setStarted(true);
    setError(null);
    addMsg({ role: "user", content: trimmed });
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: pipeline, user_message: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail ?? data.error ?? `Server error ${res.status}`);
      }

      setPipeline(data.state);

      if (data.message) {
        addMsg({
          role: "system",
          content: data.message.content,
          persona: data.message.persona,
          type: data.message.type,
          metadata: data.message.metadata,
        });
      }

      // Stance comes as a second message after narratives
      if (data.message?.type === "narratives" && data.state?.stance) {
        setTimeout(() => {
          addMsg({
            role: "system",
            content: data.state.stance.lean,
            persona: "The Advisor",
            type: "stance",
            metadata: { stance: data.state.stance },
          });
        }, 700);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Something went wrong: ${msg}`);
      console.error("Send error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [pipeline, isLoading, addMsg]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const reset = () => { setMessages([]); setPipeline(INITIAL); setStarted(false); setInput(""); setError(null); };

  const isDone = pipeline.phase === "done";
  const placeholder = pipeline.phase === "input" ? "Describe the decision you're facing..." : "Your response...";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", maxWidth: 800, margin: "0 auto", background: "#0F0F16", color: "#E8E4DC", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #1E1E2E", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
          <span>🗺️</span> PathMapper
          <span style={{ fontSize: 11, background: "#1E2A3A", color: "#6A9FD8", padding: "2px 8px", borderRadius: 20, fontWeight: 600, letterSpacing: "0.5px" }}>BETA</span>
        </div>
        {started && (
          <button onClick={reset} style={{ background: "none", border: "1px solid #2A2A3E", color: "#888", padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
            New decision
          </button>
        )}
      </header>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {!started
          ? <WelcomeScreen onSend={send} />
          : messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)
        }

        {isLoading && (
          <div style={{ display: "flex", gap: 10, alignSelf: "flex-start", maxWidth: "92%" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, marginTop: 18, background: "#1a2e22", border: "2px solid #5B8A6A" }}>🌿</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#5B8A6A", marginLeft: 2 }}>The Listener</div>
              <TypingDots />
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: "#C45A5A", padding: "8px 12px", background: "#2A1010", border: "1px solid #C45A5A33", borderRadius: 8, textAlign: "center" }}>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "#C45A5A", cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1E1E2E", flexShrink: 0, background: "#0F0F16" }}>
        {isDone ? (
          <div style={{ textAlign: "center", fontSize: 12, color: "#555" }}>
            Analysis complete. {" "}
            <button onClick={reset} style={{ background: "none", border: "none", color: "#5B8A6A", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>
              Start a new decision →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "#161622", border: "1px solid #2A2A3E", borderRadius: 14, padding: "10px 12px" }}>
            <textarea
              ref={textareaRef}
              placeholder={placeholder}
              value={input}
              rows={1}
              disabled={isLoading}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKey}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#E8E4DC", fontSize: 14, lineHeight: 1.5, resize: "none",
                maxHeight: 120, overflowY: "auto", fontFamily: "inherit"
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={isLoading || !input.trim()}
              style={{
                width: 34, height: 34, borderRadius: "50%",
                background: isLoading || !input.trim() ? "#2A2A3E" : "#5B8A6A",
                border: "none", cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, color: "white", fontSize: 16, transition: "background 0.15s"
              }}
              aria-label="Send"
            >↑</button>
          </div>
        )}
      </div>
    </div>
  );
}
