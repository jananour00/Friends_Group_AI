"use client";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage, DimensionScores, NarrativeOutput, ScoringOutput, StanceOutput, PipelinePhase, PipelineState } from "@/types/pipeline";

const INITIAL: PipelineState = {
  raw_input: "",
  consolidated_input: "",
  pre_friend_metadata: null,
  pre_friend_turns: 0,
  extraction: null,
  resolved_premises: [],
  current_checkpoint: null,
  narratives: null,
  scores: null,
  stance: null,
  phase: "pre_friend",
  pending_question: null,
  pending_checkpoint_type: null,
};

const PERSONAS = {
  Sam: { defaultName: "Cora", color: "#8A8A9A", bg: "#16161F", emoji: "💬", subtitle: "the Coordinator" },
  Dev: { defaultName: "Felix", color: "#E06B4E", bg: "#2A1512", emoji: "🎯", subtitle: "the Fact Checker" },
  Mina: { defaultName: "Paige", color: "#D4839A", bg: "#2A1520", emoji: "🌸", subtitle: "the Pattern Detector" },
  Theo: { defaultName: "Carter", color: "#4AAAA5", bg: "#122A28", emoji: "📋", subtitle: "the Categorizer" },
  Priya: { defaultName: "Connie", color: "#9B7ED8", bg: "#1E162A", emoji: "🌙", subtitle: "the Confidence Meter" },
  Jordan: { defaultName: "Blair", color: "#D4A843", bg: "#2A2210", emoji: "⚡", subtitle: "the Blindspot Finder" },
} as const;

const dimLabels: Record<string, string> = {
  financial_trajectory: "Financial Trajectory",
  growth_rate: "Growth Rate",
  values_alignment: "Values Alignment",
  social_capital: "Social Capital",
  stability: "Stability",
};

// ─── Score Bars ───────────────────────────────────────────────────────────────
function ScoreBar({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#999", width: 120, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, height: 6, background: "#1E1E2E", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(a / 5) * 100}%`, background: "#3A6A9C", borderRadius: 3, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ fontSize: 10, color: "#777", width: 28, textAlign: "center", flexShrink: 0 }}>{a}:{b}</div>
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
  const dims = ["financial_trajectory", "growth_rate", "values_alignment", "social_capital", "stability"] as Array<keyof DimensionScores>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Path cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: narratives.path_a_label, path: narratives.path_a, color: "#4A7FBF", bg: "#0d1a2a", note: scores.social_capital_note_a },
          { label: narratives.path_b_label, path: narratives.path_b, color: "#B08A5A", bg: "#1a1200", note: scores.social_capital_note_b },
        ].map(({ label, path, color, bg, note }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color, marginBottom: 8 }}>{label}</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "#C0B8AC", margin: "0 0 10px" }}>{path.body}</p>
            <div style={{ fontSize: 11, color: "#888", background: "#0a0a10", borderRadius: 6, padding: "6px 10px", lineHeight: 1.5, marginBottom: note ? 8 : 0 }}>
              <span style={{ fontWeight: 600, color: "#aaa" }}>Flip if: </span>{path.flip_condition}
            </div>
            {note && (
              <div style={{ fontSize: 10, color: "#C08A3E", background: "#2A1F10", padding: "6px 10px", borderRadius: 6, lineHeight: 1.4 }}>
                ⚠️ {note}
              </div>
            )}
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
          <ScoreBar key={d} label={dimLabels[d] || d} a={scores.path_a[d]} b={scores.path_b[d]} />
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
function ChatBubble({ msg, customNames }: { msg: ChatMessage; customNames: Record<string, string> }) {
  const isUser = msg.role === "user";
  const persona = msg.persona ? PERSONAS[msg.persona as keyof typeof PERSONAS] : null;
  const getFriendName = (name: string) => customNames[name] || (PERSONAS[name as keyof typeof PERSONAS] as any)?.defaultName || name;

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
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", marginLeft: 2, color: persona?.color }}>
            {getFriendName(msg.persona)}
          </div>
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
    {
      label: "👤 Alex (25, Software Engineer) — Stay at stable job vs. join startup",
      value: "I've been at my current company for two years — solid pay, good work-life balance, I know everyone. Then this startup reached out and it's genuinely tempting. Better salary, equity, and the problem they're working on is actually interesting. But startups fail and I have rent. I keep thinking about a job I had before this where things went badly and I had to start over from scratch. The startup would be a step up technically but I'm not sure I'm ready. I guess what I want most is to grow — but also I don't know, I like knowing what to expect. My partner just got promoted and we're thinking about moving in together this year so the timing feels off too."
    },
    {
      label: "👤 Layla (23, Research Assistant) — Accept PhD offer vs. take industry research role",
      value: "I got into a really good PhD program — it's exactly the area I've been working toward. But I also have an offer from a company doing applied research in the same field, better pay obviously, and honestly I'm just tired. Five years of undergrad and research assistant work and I don't know if I have another four to six years of this in me right now. My supervisor keeps telling me the PhD is the right move and I respect him enormously, I've worked with him for two years. But I also wonder if I'm just doing it because it's what people like me are supposed to do. The industry role feels like giving up somehow, even though I know that's not rational. I want to do meaningful research either way. I just don't know if I can keep pushing at this pace."
    },
    {
      label: "👤 Omar (26, Marketing Analyst) — Stay in marketing vs. switch to UX design",
      value: "I've been a marketing analyst for three years and I'm good at it but it feels hollow. I've been teaching myself UX design on the side for about eight months — I actually love it, it's the most engaged I've felt about work in years. There's a bootcamp that could fast-track a transition but it's expensive and there's no guarantee. My friend made a similar switch two years ago and is doing really well now, so it feels possible. I want to do work that actually matters and helps people. But my parents sacrificed a lot for me to have a stable career and I don't want to throw that away. The marketing job pays well. I keep wondering if I'm just romanticizing design because it's new and different, or if this is actually what I should be doing."
    }
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "40px 20px", textAlign: "center", gap: 12 }}>
      <div style={{ fontSize: 52 }}>🗺️</div>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, margin: 0 }}>PathMapper</h1>
      <p style={{ color: "#888", fontSize: 15, maxWidth: 340, lineHeight: 1.5, margin: 0 }}>Your decisions, thought through — not decided for you.</p>
      <div style={{ marginTop: 16, width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 4px" }}>Select a scenario to start:</p>
        {examples.map((ex, i) => (
          <button key={i} onClick={() => onSend(ex.value)} style={{
            background: "#161622", border: "1px solid #2A2A3E", color: "#B0A898",
            padding: "14px 18px", borderRadius: 10, textAlign: "left", fontSize: 13, lineHeight: 1.5,
            cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit"
          }}
            onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = "#5B8A6A"; (e.target as HTMLElement).style.color = "#E8E4DC"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = "#2A2A3E"; (e.target as HTMLElement).style.color = "#B0A898"; }}
          >{ex.label}</button>
        ))}
      </div>
    </div>
  );
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  pipeline: PipelineState;
  updatedAt: number;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PathMapperApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [typingPersona, setTypingPersona] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  
  // Custom states for persistence and editing
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [sessionToDeleteId, setSessionToDeleteId] = useState<string | null>(null);
  const [showResetNamesConfirm, setShowResetNamesConfirm] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timeoutRefs = useRef<any[]>([]);
  const isSwitchingRef = useRef(false);

  const getFriendName = useCallback((name: string) => {
    return customNames[name] || (PERSONAS[name as keyof typeof PERSONAS] as any)?.defaultName || name;
  }, [customNames]);

  const addMsg = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) =>
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }]), []);

  // 1. Mount Effect: Load data from localStorage safely
  useEffect(() => {
    setHasMounted(true);
    try {
      const storedNames = localStorage.getItem("pathmapper_custom_names");
      if (storedNames) setCustomNames(JSON.parse(storedNames));
      
      const storedSessions = localStorage.getItem("pathmapper_sessions");
      if (storedSessions) {
        const parsed = JSON.parse(storedSessions) as ChatSession[];
        setSessions(parsed);
        
        const activeId = localStorage.getItem("pathmapper_current_session_id");
        if (activeId) {
          const activeSession = parsed.find(s => s.id === activeId);
          if (activeSession) {
            isSwitchingRef.current = true;
            setCurrentSessionId(activeId);
            setMessages(activeSession.messages);
            setPipeline(activeSession.pipeline);
            setStarted(true);
            setTimeout(() => {
              isSwitchingRef.current = false;
            }, 0);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load local storage:", e);
    }
  }, []);

  // 2. Sync Effect: Auto-save messages and pipeline state for current session
  useEffect(() => {
    if (!hasMounted || !currentSessionId || isSwitchingRef.current || messages.length === 0) return;
    
    setSessions(prev => {
      const sessionIndex = prev.findIndex(s => s.id === currentSessionId);
      let next: ChatSession[];
      
      if (sessionIndex === -1) {
        const firstMsg = messages[0]?.content ?? "New Decision";
        const title = firstMsg.slice(0, 45) + (firstMsg.length > 45 ? "..." : "");
        const newSession: ChatSession = {
          id: currentSessionId,
          title,
          messages,
          pipeline,
          updatedAt: Date.now(),
        };
        next = [newSession, ...prev];
      } else {
        next = prev.map((s, idx) => {
          if (idx === sessionIndex) {
            return {
              ...s,
              messages,
              pipeline,
              updatedAt: Date.now(),
            };
          }
          return s;
        });
      }
      
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      localStorage.setItem("pathmapper_sessions", JSON.stringify(next));
      return next;
    });
  }, [messages, pipeline, currentSessionId, hasMounted]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Load an existing session
  const loadSession = (session: ChatSession) => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    isSwitchingRef.current = true;
    
    setCurrentSessionId(session.id);
    localStorage.setItem("pathmapper_current_session_id", session.id);
    setMessages(session.messages);
    setPipeline(session.pipeline);
    setStarted(true);
    setError(null);
    setTypingPersona(null);
    setShowHistoryDrawer(false); // Close mobile drawer if open
    
    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 0);
  };

  // Start renaming a session
  const startRenameSession = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingSessionTitle(session.title);
  };

  // Save renamed session title
  const saveSessionTitle = (id: string) => {
    if (!editingSessionTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    
    setSessions(prev => {
      const next = prev.map(s => {
        if (s.id === id) {
          return { ...s, title: editingSessionTitle.trim(), updatedAt: Date.now() };
        }
        return s;
      });
      localStorage.setItem("pathmapper_sessions", JSON.stringify(next));
      return next;
    });
    
    setEditingSessionId(null);
  };

  // Trigger inline delete request
  const askDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDeleteId(id);
  };

  // Confirm and execute inline delete
  const confirmDeleteSession = (id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem("pathmapper_sessions", JSON.stringify(next));
      return next;
    });

    if (currentSessionId === id) {
      reset();
    }
    setSessionToDeleteId(null);
  };

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || typingPersona) return;

    let activeId = currentSessionId;
    if (!activeId) {
      activeId = crypto.randomUUID();
      setCurrentSessionId(activeId);
      localStorage.setItem("pathmapper_current_session_id", activeId);
    }

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setStarted(true);
    setError(null);
    addMsg({ role: "user", content: trimmed });
    setIsLoading(true);
    setTypingPersona(null);

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

      setIsLoading(false);

      const targetPersona = data.message?.persona || "Sam";
      setTypingPersona(targetPersona);

      await new Promise<void>(resolve => {
        const id = setTimeout(resolve, 1500);
        timeoutRefs.current.push(id);
      });

      setTypingPersona(null);
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
        setTypingPersona(targetPersona);

        await new Promise<void>(resolve => {
          const id = setTimeout(resolve, 1500);
          timeoutRefs.current.push(id);
        });

        setTypingPersona(null);

        addMsg({
          role: "system",
          content: data.state.stance.lean,
          persona: data.message.persona,
          type: "stance",
          metadata: { stance: data.state.stance },
        });
      }
    } catch (err) {
      setIsLoading(false);
      setTypingPersona(null);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Something went wrong: ${msg}`);
      console.error("Send error:", err);
    }
  }, [pipeline, isLoading, typingPersona, addMsg, currentSessionId]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const reset = () => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    setMessages([]);
    setPipeline(INITIAL);
    setStarted(false);
    setInput("");
    setError(null);
    setTypingPersona(null);
    setCurrentSessionId(null);
    localStorage.removeItem("pathmapper_current_session_id");
  };

  const isDone = pipeline.phase === "done";
  const placeholder = pipeline.phase === "pre_friend" || pipeline.phase === "pre_friend_waiting"
    ? "Describe the decision you're facing..."
    : "Your response...";

  const typingConfig = typingPersona ? (PERSONAS[typingPersona as keyof typeof PERSONAS] || PERSONAS.Sam) : PERSONAS.Sam;

  return (
    <div style={{ display: "flex", height: "100dvh", width: "100vw", background: "#0A0A10", color: "#E8E4DC", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflow: "hidden" }}>
      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-menu-btn {
            display: flex !important;
          }
          .main-chat-container {
            border-left: none !important;
            border-right: none !important;
          }
        }
        @media (min-width: 769px) {
          .desktop-sidebar {
            display: flex !important;
          }
          .mobile-menu-btn {
            display: none !important;
          }
        }
        /* Custom scrollbar for sidebar */
        .sidebar-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: #2A2A3E;
          border-radius: 4px;
        }
      `}</style>

      {/* DESKTOP SIDEBAR */}
      <aside className="desktop-sidebar" style={{ display: "flex", flexDirection: "column", width: 260, borderRight: "1px solid #1E1E2E", background: "#0A0A10", flexShrink: 0, padding: "16px 12px", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, paddingLeft: 8 }}>
          <span>🗺️</span> PathMapper
        </div>
        
        <button onClick={reset} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#1C1C2C", color: "#E8E4DC", border: "1px solid #2A2A3E", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background 0.2s" }}>
          <span>➕</span> New Decision
        </button>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }} className="sidebar-scroll">
          <div style={{ fontSize: 11, fontWeight: 600, color: "#555", letterSpacing: "0.8px", textTransform: "uppercase", paddingLeft: 8, marginTop: 10 }}>History</div>
          {sessions.length === 0 ? (
            <div style={{ padding: "12px 8px", fontSize: 12, color: "#555", fontStyle: "italic" }}>No previous decisions yet.</div>
          ) : (
            sessions.map(s => {
              const isActive = currentSessionId === s.id;
              const isEditing = editingSessionId === s.id;
              const isDeleting = sessionToDeleteId === s.id;

              if (isDeleting) {
                return (
                  <div
                    key={s.id}
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8,
                      background: "#2A1515", border: "1px solid #C45A5A44", animation: "fadeIn 0.2s ease"
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#F0A0A0", fontWeight: 600 }}>Delete this decision?</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => confirmDeleteSession(s.id)}
                        style={{ flex: 1, background: "#C45A5A", border: "none", color: "white", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setSessionToDeleteId(null)}
                        style={{ flex: 1, background: "#222", border: "1px solid #444", color: "#ccc", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={s.id}
                  onClick={() => loadSession(s)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8,
                    background: isActive ? "#161B2A" : "transparent",
                    border: `1px solid ${isActive ? "#3E5B8E66" : "transparent"}`,
                    cursor: "pointer", transition: "all 0.15s", color: isActive ? "#9FC0F0" : "#A0A0B0",
                    position: "relative"
                  }}
                  onMouseEnter={e => {
                    if (!isActive && !isEditing) e.currentTarget.style.background = "#141420";
                  }}
                  onMouseLeave={e => {
                    if (!isActive && !isEditing) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1, marginRight: 8 }}>
                    {isEditing ? (
                      <input
                        value={editingSessionTitle}
                        onChange={e => setEditingSessionTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveSessionTitle(s.id);
                          if (e.key === "Escape") setEditingSessionId(null);
                        }}
                        onBlur={() => saveSessionTitle(s.id)}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        style={{
                          background: "#0F0F16", border: "1px solid #3E5B8E", borderRadius: 4,
                          padding: "4px 6px", color: "#E8E4DC", fontSize: 13, width: "100%", outline: "none"
                        }}
                      />
                    ) : (
                      <>
                        <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.title}
                        </div>
                        <div style={{ fontSize: 10, color: "#555" }}>
                          {new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </div>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                      <button
                        onClick={e => startRenameSession(s, e)}
                        style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: 4 }}
                        title="Rename decision"
                        onMouseEnter={e => e.currentTarget.style.color = "#E8E4DC"}
                        onMouseLeave={e => e.currentTarget.style.color = "#666"}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={e => askDeleteSession(s.id, e)}
                        style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: 4 }}
                        title="Delete history"
                        onMouseEnter={e => e.currentTarget.style.color = "#E05A5A"}
                        onMouseLeave={e => e.currentTarget.style.color = "#666"}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {showHistoryDrawer && (
        <div
          onClick={() => setShowHistoryDrawer(false)}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 280, height: "100%", background: "#0A0A10", borderRight: "1px solid #1E1E2E", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700 }}>
                <span>🗺️</span> PathMapper
              </div>
              <button onClick={() => setShowHistoryDrawer(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>

            <button onClick={() => { reset(); setShowHistoryDrawer(false); }} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#1C1C2C", color: "#E8E4DC", border: "1px solid #2A2A3E", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span>➕</span> New Decision
            </button>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#555", letterSpacing: "0.8px", textTransform: "uppercase", paddingLeft: 8, marginTop: 10 }}>History</div>
              {sessions.length === 0 ? (
                <div style={{ padding: "12px 8px", fontSize: 12, color: "#555", fontStyle: "italic" }}>No previous decisions yet.</div>
              ) : (
                sessions.map(s => {
                  const isActive = currentSessionId === s.id;
                  const isEditing = editingSessionId === s.id;
                  const isDeleting = sessionToDeleteId === s.id;

                  if (isDeleting) {
                    return (
                      <div
                        key={s.id}
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8,
                          background: "#2A1515", border: "1px solid #C45A5A44", animation: "fadeIn 0.2s ease"
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#F0A0A0", fontWeight: 600 }}>Delete this decision?</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => confirmDeleteSession(s.id)}
                            style={{ flex: 1, background: "#C45A5A", border: "none", color: "white", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                          >
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => setSessionToDeleteId(null)}
                            style={{ flex: 1, background: "#222", border: "1px solid #444", color: "#ccc", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={s.id}
                      onClick={() => loadSession(s)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8,
                        background: isActive ? "#161B2A" : "transparent",
                        border: `1px solid ${isActive ? "#3E5B8E66" : "transparent"}`,
                        cursor: "pointer", color: isActive ? "#9FC0F0" : "#A0A0B0"
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1, marginRight: 8 }}>
                        {isEditing ? (
                          <input
                            value={editingSessionTitle}
                            onChange={e => setEditingSessionTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") saveSessionTitle(s.id);
                              if (e.key === "Escape") setEditingSessionId(null);
                            }}
                            onBlur={() => saveSessionTitle(s.id)}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                            style={{
                              background: "#0F0F16", border: "1px solid #3E5B8E", borderRadius: 4,
                              padding: "4px 6px", color: "#E8E4DC", fontSize: 13, width: "100%", outline: "none"
                            }}
                          />
                        ) : (
                          <>
                            <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {s.title}
                            </div>
                            <div style={{ fontSize: 10, color: "#555" }}>
                              {new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </div>
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                          <button
                            onClick={e => startRenameSession(s, e)}
                            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: 4 }}
                            title="Rename decision"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={e => askDeleteSession(s.id, e)}
                            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: 4 }}
                            title="Delete history"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN CHAT AREA */}
      <div className="main-chat-container" style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", background: "#0F0F16", borderLeft: "1px solid #1E1E2E", borderRight: "1px solid #1E1E2E", position: "relative" }}>
        
        {/* Authenticated Application Header Row */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #1E1E2E", flexShrink: 0 }}>
          {/* Left Side: App Title and Subtitle */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
              <button
                onClick={() => setShowHistoryDrawer(true)}
                className="mobile-menu-btn"
                style={{ display: "none", background: "none", border: "none", color: "#E8E4DC", cursor: "pointer", fontSize: 18, padding: 0, marginRight: 4 }}
                aria-label="Open History"
              >
                ☰
              </button>
              <span>🗺️</span> PathMapper
              <span style={{ fontSize: 11, background: "#1E2A3A", color: "#6A9FD8", padding: "2px 8px", borderRadius: 20, fontWeight: 600, letterSpacing: "0.5px" }}>BETA</span>
            </div>
            <span style={{ color: "#8A8A9A", fontSize: 12 }}>
              Active friends: {getFriendName("Sam")}, {getFriendName("Dev")}, {getFriendName("Mina")}, {getFriendName("Theo")}, {getFriendName("Priya")}, {getFriendName("Jordan")}
            </span>
          </div>

          {/* Right Side: Navigation Actions & Auth Layout */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setShowEditModal(true)}
              style={{ background: "none", border: "1px solid #2A2A3E", color: "#B8B8C8", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 }}
            >
              ✏️ Edit Friends
            </button>

            {started && (
              <button onClick={reset} style={{ background: "none", border: "1px solid #2A2A3E", color: "#888", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                New decision
              </button>
            )}

            {/* Display when the user is completely signed out */}
            <SignedOut>
              <SignInButton mode="modal">
                <button style={{ background: "#5B8A6A", color: "white", border: "none", padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}>
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>

            {/* Display when a valid session token is found */}
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {!started
            ? <WelcomeScreen onSend={send} />
            : messages.map(msg => <ChatBubble key={msg.id} msg={msg} customNames={customNames} />)
          }

          {typingPersona && (
            <div style={{ display: "flex", gap: 10, alignSelf: "flex-start", maxWidth: "92%" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0, marginTop: 18, background: typingConfig.bg, border: `2px solid ${typingConfig.color}`
              }}>{typingConfig.emoji}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: typingConfig.color, marginLeft: 2 }}>
                  {getFriendName(typingPersona)}
                </div>
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

      {/* CUSTOM NAMES EDITOR MODAL */}
      {showEditModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "#161622", border: "1px solid #2A2A4E", borderRadius: 16, width: "100%", maxWidth: 450, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Customize Friend Names</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#8A8A9A" }}>Change the names of your AI friend group. These will show up in the chat conversation.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxHeight: 300, overflowY: "auto" }}>
              {Object.entries(PERSONAS).map(([key, config]) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: config.color, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>{config.emoji}</span> {config.defaultName} <span style={{ color: "#555", fontSize: 10 }}>— {config.subtitle}</span>
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. ${config.defaultName}`}
                    value={customNames[key] || ""}
                    onChange={e => {
                      const val = e.target.value;
                      setCustomNames(prev => {
                        const next = { ...prev, [key]: val };
                        localStorage.setItem("pathmapper_custom_names", JSON.stringify(next));
                        return next;
                      });
                    }}
                    style={{ background: "#0F0F16", border: "1px solid #2A2A3E", borderRadius: 8, padding: "8px 10px", color: "#E8E4DC", fontSize: 13, outline: "none" }}
                  />
                </div>
              ))}
            </div>
            {showResetNamesConfirm ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#2A1515", border: "1px solid #C45A5A44", borderRadius: 12, padding: 12, marginTop: 8, animation: "fadeIn 0.2s ease" }}>
                <div style={{ fontSize: 12, color: "#F0A0A0", fontWeight: 600 }}>Reset all friend names to default? This cannot be undone.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      setCustomNames({});
                      localStorage.removeItem("pathmapper_custom_names");
                      setShowResetNamesConfirm(false);
                    }}
                    style={{ flex: 1, background: "#C45A5A", border: "none", color: "white", padding: "6px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                  >
                    Yes, Reset
                  </button>
                  <button
                    onClick={() => setShowResetNamesConfirm(false)}
                    style={{ flex: 1, background: "#222", border: "1px solid #444", color: "#ccc", padding: "6px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button onClick={() => setShowResetNamesConfirm(true)} style={{ background: "none", border: "1px solid #C45A5A33", color: "#C45A5A", padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                  Reset All
                </button>
                <button onClick={() => setShowEditModal(false)} style={{ background: "#5B8A6A", border: "none", color: "white", padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
