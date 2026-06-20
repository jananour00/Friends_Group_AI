"use client";
import { UserButton, SignInButton, SignedIn, SignedOut, useUser } from "@clerk/nextjs";

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
  Sam: { defaultName: "Cora", color: "#8B5CF6", bg: "#1E1142", emoji: "💬", subtitle: "the Coordinator", accent: "#A78BFA" },
  Dev: { defaultName: "Felix", color: "#3B82F6", bg: "#0F2B4E", emoji: "🎯", subtitle: "the Fact Checker", accent: "#60A5FA" },
  Mina: { defaultName: "Paige", color: "#06B6D4", bg: "#0D2C3C", emoji: "🌸", subtitle: "the Pattern Detector", accent: "#22D3EE" },
  Theo: { defaultName: "Carter", color: "#8B5CF6", bg: "#1E1142", emoji: "📋", subtitle: "the Categorizer", accent: "#A78BFA" },
  Priya: { defaultName: "Connie", color: "#6D28D9", bg: "#160F32", emoji: "🌙", subtitle: "the Confidence Meter", accent: "#7C3AED" },
  Jordan: { defaultName: "Blair", color: "#0EA5E9", bg: "#0C2A47", emoji: "⚡", subtitle: "the Blindspot Finder", accent: "#38BDF8" },
} as const;

const dimLabels: Record<string, string> = {
  financial_trajectory: "Financial Trajectory",
  growth_rate: "Growth Rate",
  values_alignment: "Values Alignment",
  social_capital: "Social Capital",
  stability: "Stability",
};

// ─── Encryption Helpers (Responsible AI - AES-GCM Web Crypto) ─────────────────
async function getCryptoKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(password);
  const hash = await window.crypto.subtle.digest("SHA-256", rawKey);
  return window.crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptAES(password: string, plaintext: string): Promise<string> {
  try {
    const key = await getCryptoKey(password);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(plaintext)
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    let binary = "";
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.error("Encryption failed", e);
    return plaintext;
  }
}

async function decryptAES(password: string, base64: string): Promise<string> {
  try {
    const key = await getCryptoKey(password);
    const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    return base64;
  }
}

// ─── Score Bars ───────────────────────────────────────────────────────────────
function ScoreBar({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "10px 0" }}>
      <div style={{ fontSize: 12, color: "#B0B9C3", width: 100, flexShrink: 0, fontWeight: 500 }}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: "#1E293B", borderRadius: 4, overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)" }}>
          <div style={{ height: "100%", width: `${(a / 5) * 100}%`, background: "linear-gradient(90deg, #8B5CF6, #7C3AED)", borderRadius: 4, transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)", boxShadow: "0 0 8px rgba(139, 92, 246, 0.4)" }} />
        </div>
        <div style={{ fontSize: 11, color: "#A78BFA", width: 32, textAlign: "center", flexShrink: 0, fontWeight: 600 }}>{a}:{b}</div>
        <div style={{ flex: 1, height: 8, background: "#1E293B", borderRadius: 4, overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)" }}>
          <div style={{ height: "100%", width: `${(b / 5) * 100}%`, background: "linear-gradient(90deg, #3B82F6, #0EA5E9)", borderRadius: 4, transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)", boxShadow: "0 0 8px rgba(59, 130, 246, 0.4)" }} />
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
    <div style={{ display: "flex", gap: 6, padding: "12px 14px", background: "#1F2937", border: "1px solid #374151", borderRadius: "18px 18px 4px 18px", width: "fit-content", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
      {[0, 150, 300].map((delay) => (
        <span key={delay} style={{
          width: 8, height: 8, background: "#9CA3AF", borderRadius: "50%", display: "block",
          animation: `dotBounce 1.4s ${delay}ms infinite`,
          boxShadow: "0 1px 2px rgba(0,0,0,0.4)"
        }} />
      ))}
      <style>{`@keyframes dotBounce { 0%,60%,100%{transform:translateY(0);opacity:.5} 30%{transform:translateY(-6px);opacity:1} }`}</style>
    </div>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ msg, customNames }: { msg: ChatMessage; customNames: Record<string, string> }) {
  const isUser = msg.role === "user";
  const persona = msg.persona ? PERSONAS[msg.persona as keyof typeof PERSONAS] : null;
  const getFriendName = (name: string) => customNames[name] || (PERSONAS[name as keyof typeof PERSONAS] as any)?.defaultName || name;
  const [showCopyFeedback, setShowCopyFeedback] = false;
  const [hoveredBubble, setHoveredBubble] = false;

  const handleCopy = () => {
    const textToCopy = msg.type === "narratives" ? "Narratives received" : msg.type === "stance" ? "Stance analysis received" : msg.content;
    navigator.clipboard.writeText(textToCopy);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 2000);
  };

  const messageTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div style={{ display: "flex", gap: 12, maxWidth: "92%", alignSelf: isUser ? "flex-end" : "flex-start", flexDirection: isUser ? "row-reverse" : "row", animation: "slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", position: "relative" }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
      {!isUser && persona && (
        <div style={{
          width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0, marginTop: 16, background: persona.bg, border: `2.5px solid ${persona.color}`,
          boxShadow: `0 0 16px ${persona.color}66`, cursor: "pointer", transition: "all 0.3s ease"
        }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = `0 0 24px ${persona.color}`;
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = `0 0 16px ${persona.color}66`;
            e.currentTarget.style.transform = "scale(1)";
          }}
          title={`${getFriendName(msg.persona)} • Online`}
        >{persona.emoji}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {!isUser && msg.persona && (
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.8px", marginLeft: 4, color: persona?.color, textTransform: "uppercase" }}>
            {getFriendName(msg.persona)}
          </div>
        )}
        <div style={{
          padding: "12px 16px",
          borderRadius: isUser ? "18px 4px 18px 18px" : "18px 18px 4px 18px",
          fontSize: 14, lineHeight: 1.6,
          background: isUser ? "#3B82F6" : (persona?.bg ?? "#0D1B2A"),
          color: isUser ? "#ffffff" : "#E5E7EB",
          border: `2px solid ${isUser ? "#3B82F6" : (persona?.color ?? "#1F3A3A")}`,
          maxWidth: msg.type === "narratives" ? 560 : undefined,
          boxShadow: `0 0 20px ${isUser ? "#3B82F644" : (persona?.color + "44" ?? "#00000040")}`,
          cursor: "pointer", transition: "all 0.3s ease", position: "relative",
          onMouseEnter: (e: any) => {
            e.currentTarget.style.boxShadow = `0 0 32px ${isUser ? "#00FF88" : (persona?.color ?? "#0A0E27")}`;
            setHoveredBubble(true);
          },
          onMouseLeave: (e: any) => {
            e.currentTarget.style.boxShadow = `0 0 20px ${isUser ? "#00FF8844" : (persona?.color + "44" ?? "#00000040")}`;
            setHoveredBubble(false);
          }
        } as any}
          onMouseEnter={(e: any) => {
            e.currentTarget.style.boxShadow = `0 0 32px ${isUser ? "#3B82F6" : (persona?.color ?? "#0D1B2A")}`;
            setHoveredBubble(true);
          }}
          onMouseLeave={(e: any) => {
            e.currentTarget.style.boxShadow = `0 0 20px ${isUser ? "#3B82F644" : (persona?.color + "44" ?? "#00000040")}`;
            setHoveredBubble(false);
          }}
        >
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: isUser ? "auto" : 4, fontSize: 11, color: "#9CA3AF" }}>
          <span>{messageTime}</span>
          {isUser && <span title="Message delivered">✓✓</span>}
          {hoveredBubble && (
            <button onClick={handleCopy} style={{
              background: "none", border: "none", color: persona?.color ?? "#8B5CF6", cursor: "pointer", fontSize: 12, padding: 0,
              transition: "all 0.3s ease", fontWeight: 600
            }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.2)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              title="Copy message"
            >
              {showCopyFeedback ? "✓ Copied" : "📋 Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Group Info Panel ─────────────────────────────────────────────────────────
function GroupInfoPanel({ customNames }: { customNames: Record<string, string> }) {
  const getFriendName = (name: string) => customNames[name] || (PERSONAS[name as keyof typeof PERSONAS] as any)?.defaultName || name;
  const personaKeys = Object.keys(PERSONAS) as (keyof typeof PERSONAS)[];

  return (
    <div style={{
      width: 280, background: "#0D1B2A", borderLeft: "2px solid #8B5CF644", display: "flex", flexDirection: "column",
      padding: "20px 16px", gap: 16, overflowY: "auto", boxShadow: "-4px 0 20px rgba(139, 92, 246, 0.1)"
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#A78BFA", letterSpacing: "1px", textTransform: "uppercase" }}>
        Group Members
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {personaKeys.map(key => {
          const persona = PERSONAS[key];
          const name = getFriendName(key);
          return (
            <div key={key} style={{
              display: "flex", gap: 12, alignItems: "center", padding: "12px", borderRadius: 10,
              background: persona.bg, border: `1.5px solid ${persona.color}`, cursor: "pointer",
              transition: "all 0.3s ease", boxShadow: `0 0 12px ${persona.color}44`,
              onMouseEnter: (e: any) => {
                e.currentTarget.style.boxShadow = `0 0 20px ${persona.color}`;
                e.currentTarget.style.transform = "translateX(4px)";
              },
              onMouseLeave: (e: any) => {
                e.currentTarget.style.boxShadow = `0 0 12px ${persona.color}44`;
                e.currentTarget.style.transform = "translateX(0)";
              }
            } as any}
              onMouseEnter={(e: any) => {
                e.currentTarget.style.boxShadow = `0 0 20px ${persona.color}`;
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e: any) => {
                e.currentTarget.style.boxShadow = `0 0 12px ${persona.color}44`;
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              <div style={{
                fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36,
                borderRadius: "50%", background: persona.bg, border: `2px solid ${persona.color}`
              }}>
                {persona.emoji}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: persona.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {name}
                </div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                  {persona.subtitle}
                </div>
              </div>
              <div style={{
                width: 10, height: 10, borderRadius: "50%", background: persona.color,
                boxShadow: `0 0 8px ${persona.color}`, animation: "pulse 2s infinite"
              }} />
            </div>
          );
        })}
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "40px 20px", textAlign: "center", gap: 16 }}>
      <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, margin: 0, color: "#A78BFA", animation: "bounce 2s infinite" }}>🗺️ PathMapper</h1>
      <p style={{ color: "#9CA3AF", fontSize: 16, maxWidth: 380, lineHeight: 1.6, margin: 0 }}>Your decisions, thought through — not decided for you. Meet your AI friends who debate every angle.</p>
      <div style={{ marginTop: 24, width: "100%", maxWidth: 580, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 12, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 8px", fontWeight: 600 }}>Choose a scenario:</p>
        {examples.map((ex, i) => (
          <button key={i} onClick={() => onSend(ex.value)} style={{
            background: "#1E293B", border: "1.5px solid #334155", color: "#D1D5DB",
            padding: "16px 20px", borderRadius: 12, textAlign: "left", fontSize: 13, lineHeight: 1.6,
            cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", fontFamily: "inherit", fontWeight: 500,
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
          }}
            onMouseEnter={e => { 
              (e.target as HTMLElement).style.borderColor = "#A78BFA"; 
              (e.target as HTMLElement).style.backgroundColor = "#1E1142";
              (e.target as HTMLElement).style.color = "#A78BFA";
              (e.target as HTMLElement).style.boxShadow = "0 0 16px rgba(167, 139, 250, 0.2)";
            }}
            onMouseLeave={e => { 
              (e.target as HTMLElement).style.borderColor = "#334155"; 
              (e.target as HTMLElement).style.backgroundColor = "#1E293B";
              (e.target as HTMLElement).style.color = "#D1D5DB";
              (e.target as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
            }}
          >{ex.label}</button>
        ))}
      </div>
      <style>{`@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
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
  const { user, isLoaded: isClerkLoaded } = useUser();
  const encryptionKey = user?.id || "pathmapper-offline-key-secure-2026";

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
  const [settingsTab, setSettingsTab] = useState<"names" | "security">("names");
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showRateLimitCard, setShowRateLimitCard] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [lockPin, setLockPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [setupPinInput, setSetupPinInput] = useState("");
  const [setupPinError, setSetupPinError] = useState(false);
  
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [sessionToDeleteId, setSessionToDeleteId] = useState<string | null>(null);
  const [showResetNamesConfirm, setShowResetNamesConfirm] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(started);

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
    if (!isClerkLoaded) return;
    setHasMounted(true);
    setIsStorageLoaded(false);
    const load = async () => {
      try {
        const storedNames = localStorage.getItem("pathmapper_custom_names");
        if (storedNames) {
          let parsed = null;
          const trimmed = storedNames.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            parsed = JSON.parse(trimmed);
          } else {
            const decrypted = await decryptAES(encryptionKey, trimmed);
            parsed = JSON.parse(decrypted);
          }
          if (parsed) setCustomNames(parsed);
        }

        const storedPin = localStorage.getItem("pathmapper_lock_pin");
        if (storedPin) {
          const decrypted = await decryptAES(encryptionKey, storedPin);
          if (decrypted) setLockPin(decrypted);
        }
        
        const storedSessions = localStorage.getItem("pathmapper_sessions");
        if (storedSessions) {
          let parsed: ChatSession[] | null = null;
          const trimmed = storedSessions.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            parsed = JSON.parse(trimmed);
          } else {
            const decrypted = await decryptAES(encryptionKey, trimmed);
            parsed = JSON.parse(decrypted);
          }
          if (parsed) {
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
        }
        setIsStorageLoaded(true);
      } catch (e) {
        console.error("Failed to load local storage:", e);
        setIsStorageLoaded(true);
      }
    };
    load();
  }, [encryptionKey, isClerkLoaded]);

  // 1.5. Auto-save Sessions and Custom Names when they change (Async Encryption)
  // 1.5. Auto-save Sessions and Custom Names when they change (Async Encryption)
  useEffect(() => {
    if (!isClerkLoaded || !isStorageLoaded) return;
    const save = async () => {
      try {
        const encrypted = await encryptAES(encryptionKey, JSON.stringify(sessions));
        localStorage.setItem("pathmapper_sessions", encrypted);
      } catch (e) {
        console.error("Failed to save sessions:", e);
      }
    };
    save();
  }, [sessions, encryptionKey, isStorageLoaded, isClerkLoaded]);

  useEffect(() => {
    if (!isClerkLoaded || !isStorageLoaded) return;
    const save = async () => {
      try {
        const encrypted = await encryptAES(encryptionKey, JSON.stringify(customNames));
        localStorage.setItem("pathmapper_custom_names", encrypted);
      } catch (e) {
        console.error("Failed to save custom names:", e);
      }
    };
    save();
  }, [customNames, encryptionKey, isStorageLoaded, isClerkLoaded]);

  useEffect(() => {
    if (!isClerkLoaded || !isStorageLoaded) return;
    const save = async () => {
      try {
        // If the PIN is empty, don't write an empty pin to local storage if we want to prompt for first-time use.
        // Wait, actually writing empty pin is okay, or we can only write it if it's set.
        // If they clear it in settings we might want to save it as empty to prompt again.
        const encrypted = await encryptAES(encryptionKey, lockPin);
        localStorage.setItem("pathmapper_lock_pin", encrypted);
      } catch (e) {
        console.error("Failed to save lock PIN:", e);
      }
    };
    save();
  }, [lockPin, encryptionKey, isStorageLoaded, isClerkLoaded]);

  // 2. Sync Effect: Auto-save messages and pipeline state for current session
  useEffect(() => {
    if (!isClerkLoaded || !isStorageLoaded || !currentSessionId || isSwitchingRef.current || messages.length === 0) return;
    
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
      return next;
    });
  }, [messages, pipeline, currentSessionId, isStorageLoaded, isClerkLoaded]);

  // 3. Wiping localStorage on Logout
  const prevUserRef = useRef<any>(null);
  useEffect(() => {
    if (!isClerkLoaded) return;
    if (prevUserRef.current && !user) {
      localStorage.removeItem("pathmapper_sessions");
      localStorage.removeItem("pathmapper_current_session_id");
      localStorage.removeItem("pathmapper_custom_names");
      setSessions([]);
      setMessages([]);
      setPipeline(INITIAL);
      setStarted(false);
      setCurrentSessionId(null);
    }
    prevUserRef.current = user;
  }, [user, isClerkLoaded]);

  // 4. Inactivity Lock (15 Minutes)
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!hasMounted) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("mousemove", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("click", updateActivity);
    window.addEventListener("scroll", updateActivity);

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 15 * 60 * 1000) {
        setIsLocked(true);
      }
    }, 10000);

    return () => {
      window.removeEventListener("mousemove", updateActivity);
      window.removeEventListener("keydown", updateActivity);
      window.removeEventListener("click", updateActivity);
      window.removeEventListener("scroll", updateActivity);
      clearInterval(interval);
    };
  }, [hasMounted]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (isLocked) {
      setPinInput("");
      setPinError(false);
    }
  }, [isLocked]);

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
        if (data.error === "rate_limit_exceeded") {
          setShowRateLimitCard(true);
          setIsLoading(false);
          setTypingPersona(null);
          return;
        }
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

  const handleUnlock = () => {
    if (pinInput === lockPin) {
      setIsLocked(false);
      setPinInput("");
      setPinError(false);
      lastActivityRef.current = Date.now();
    } else {
      setPinError(true);
    }
  };

  const isDone = pipeline.phase === "done";
  const placeholder = pipeline.phase === "pre_friend" || pipeline.phase === "pre_friend_waiting"
    ? "Describe the decision you're facing..."
    : "Your response...";

  const typingConfig = typingPersona ? (PERSONAS[typingPersona as keyof typeof PERSONAS] || PERSONAS.Sam) : PERSONAS.Sam;

  return (
    <div style={{ display: "flex", height: "100dvh", width: "100vw", background: "#0D1B2A", color: "#E5E7EB", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflow: "hidden" }}>
      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-menu-btn {
            display: flex !important;
          }
          .desktop-sidebar-toggle-btn {
            display: none !important;
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
          .desktop-sidebar-toggle-btn {
            display: flex !important;
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
      <aside 
        className="desktop-sidebar" 
        style={{ 
          display: "flex", 
          flexDirection: "column", 
          width: isSidebarOpen ? 280 : 0, 
          borderRight: isSidebarOpen ? "1px solid #1E3A4C" : "0px solid transparent", 
          background: "#0F2140", 
          flexShrink: 0, 
          padding: isSidebarOpen ? "20px 14px" : "16px 0", 
          gap: 16,
          overflow: "hidden",
          transition: "width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), padding 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
        }}
      >
        <div style={{ width: 236, display: "flex", flexDirection: "column", gap: 16, height: "100%", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, paddingLeft: 8 }}>
            <span>🗺️</span> PathMapper
          </div>
          
          <button onClick={reset} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: "#8B5CF6", color: "#ffffff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.3s ease", boxShadow: "0 2px 8px rgba(139, 92, 246, 0.2)" }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#7C3AED";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.3)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "#8B5CF6";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(139, 92, 246, 0.2)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
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
      <div style={{ display: "flex", flex: 1, height: "100%" }}>
        <div className="main-chat-container" style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", background: "#0D1B2A", borderLeft: "1px solid #1E3A4C", borderRight: "1px solid #1E3A4C", position: "relative" }}>
        
        {/* Authenticated Application Header Row */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "2px solid #1E3A4C", flexShrink: 0, backgroundColor: "#0D1B2A", boxShadow: "0 0 20px rgba(139, 92, 246, 0.1)" }}>
          {/* Left Side: App Title and Subtitle */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Desktop Toggle Sidebar Button */}
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="desktop-sidebar-toggle-btn"
              style={{
                background: "none", border: "none", color: "#9CA3AF", cursor: "pointer",
                padding: 8, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8, transition: "all 0.3s ease"
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#1F2937";
                e.currentTarget.style.color = "#E5E7EB";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "#9CA3AF";
              }}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", color: "#F3F4F6" }}>
                <button
                  onClick={() => setShowHistoryDrawer(true)}
                  className="mobile-menu-btn"
                  style={{ display: "none", background: "none", border: "none", color: "#F3F4F6", cursor: "pointer", fontSize: 20, padding: 0, marginRight: 4 }}
                  aria-label="Open History"
                >
                  ☰
                </button>
                <span>🗺️</span> PathMapper
                <span style={{ fontSize: 11, background: "rgba(139, 92, 246, 0.15)", color: "#A78BFA", padding: "4px 10px", borderRadius: 12, fontWeight: 700, letterSpacing: "0.8px", border: "1px solid rgba(139, 92, 246, 0.3)" }}>BETA</span>
              </div>
              <span style={{ color: "#9CA3AF", fontSize: 12, fontWeight: 500 }}>
                Friends: {getFriendName("Sam")}, {getFriendName("Dev")}, {getFriendName("Mina")}, +3 more
              </span>
            </div>
          </div>

          {/* Right Side: Navigation Actions & Auth Layout */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => {
                setSettingsTab("names");
                setShowEditModal(true);
              }}
              style={{ background: "#1E293B", border: "1px solid #334155", color: "#D1D5DB", padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, transition: "all 0.3s ease" }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#334155";
                e.currentTarget.style.color = "#F3F4F6";
                e.currentTarget.style.borderColor = "#475569";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "#1E293B";
                e.currentTarget.style.color = "#D1D5DB";
                e.currentTarget.style.borderColor = "#334155";
              }}
            >
              ⚙️ Settings
            </button>

            {started && (
              <button onClick={reset} style={{ background: "#1E293B", border: "1px solid #334155", color: "#9CA3AF", padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, transition: "all 0.3s ease" }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#334155";
                  e.currentTarget.style.color = "#E5E7EB";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "#1E293B";
                  e.currentTarget.style.color = "#9CA3AF";
                }}
              >
                ➕ New
              </button>
            )}

            {/* Display when the user is completely signed out */}
            <SignedOut>
              <SignInButton mode="modal">
                <button style={{ background: "#8B5CF6", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.3s ease", boxShadow: "0 2px 8px rgba(139, 92, 246, 0.3)" }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "#7C3AED";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.4)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "#8B5CF6";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(139, 92, 246, 0.3)";
                  }}
                >
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

          {showRateLimitCard && (
            <div style={{
              background: "#2A1515", border: "1px solid #C45A5A44", borderRadius: 12,
              padding: 16, display: "flex", flexDirection: "column", gap: 12,
              animation: "fadeIn 0.2s ease"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ fontSize: 13, color: "#F0A0A0", fontWeight: 600 }}>API Quota Limit Reached</div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#D8A0A0", lineHeight: 1.5 }}>
                We've temporarily run out of AI API tokens for this demo. Please contact the developers at <strong>devs@pathmapper.ai</strong> to get this replenished, or try again shortly.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowRateLimitCard(false)}
                  style={{
                    background: "#222", border: "1px solid #444", color: "#ccc",
                    padding: "6px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1E3A4C", flexShrink: 0, background: "#0D1B2A" }}>
          {/* Export/Share Controls */}
          {started && messages.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  const chat = messages.map(m => `${m.persona || 'You'}: ${m.content}`).join('\n');
                  navigator.clipboard.writeText(chat);
                  alert('Chat copied to clipboard!');
                }}
                style={{
                  background: "#1E293B", border: "1px solid #8B5CF644", color: "#A78BFA", padding: "6px 12px",
                  borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600, transition: "all 0.3s ease"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#8B5CF644";
                  e.currentTarget.style.boxShadow = "0 0 12px rgba(139, 92, 246, 0.3)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "#1E293B";
                  e.currentTarget.style.boxShadow = "none";
                }}
                title="Copy entire chat to clipboard"
              >
                📋 Copy Chat
              </button>
              <button
                onClick={() => {
                  const chat = messages.map(m => `${m.persona || 'You'}: ${m.content}`).join('\n');
                  const blob = new Blob([chat], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `PathMapper-Chat-${Date.now()}.txt`;
                  a.click();
                }}
                style={{
                  background: "#1E293B", border: "1px solid #3B82F644", color: "#60A5FA", padding: "6px 12px",
                  borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600, transition: "all 0.3s ease"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#3B82F644";
                  e.currentTarget.style.boxShadow = "0 0 12px rgba(59, 130, 246, 0.3)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "#1E293B";
                  e.currentTarget.style.boxShadow = "none";
                }}
                title="Download chat as text file"
              >
                ⬇️ Export
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #1E3A4C", flexShrink: 0, background: "#0D1B2A" }}>
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
                  width: 40, height: 40, borderRadius: "50%",
                  background: isLoading || !input.trim() ? "#1E293B" : "#3B82F6",
                  border: `2px solid ${isLoading || !input.trim() ? "#1E293B" : "#3B82F6"}`,
                  cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, color: isLoading || !input.trim() ? "#6B7280" : "#ffffff", fontSize: 18, fontWeight: 700,
                  transition: "all 0.3s ease", boxShadow: isLoading || !input.trim() ? "none" : "0 0 16px rgba(59, 130, 246, 0.5)"
                }}
                onMouseEnter={e => {
                  if (!isLoading && input.trim()) {
                    e.currentTarget.style.boxShadow = "0 0 24px rgba(59, 130, 246, 0.8)";
                    e.currentTarget.style.transform = "scale(1.1)";
                  }
                }}
                onMouseLeave={e => {
                  if (!isLoading && input.trim()) {
                    e.currentTarget.style.boxShadow = "0 0 16px rgba(59, 130, 246, 0.5)";
                    e.currentTarget.style.transform = "scale(1)";
                  }
                }}
                aria-label="Send"
              >↑</button>
            </div>
          )}
          
          <div style={{ textAlign: "center", fontSize: 10, color: "#5F5F6F", marginTop: 8, letterSpacing: "0.2px" }}>
            PathMapper uses AI personas to help you think through your decision.
          </div>
        </div>

        {/* GROUP INFO PANEL */}
        {started && showGroupInfo && <GroupInfoPanel customNames={customNames} />}
        </div>
      </div>

      {/* SETTINGS & CUSTOMIZATION MODAL */}
      {showEditModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "#161622", border: "1px solid #2A2A4E", borderRadius: 16, width: "100%", maxWidth: 450, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Settings & Customization</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #2A2A3E", gap: 16, paddingBottom: 8 }}>
              <button
                onClick={() => setSettingsTab("names")}
                style={{
                  background: "none", border: "none", color: settingsTab === "names" ? "#E8E4DC" : "#8A8A9A",
                  fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "4px 8px",
                  borderBottom: settingsTab === "names" ? "2px solid #5B8A6A" : "2px solid transparent",
                  transition: "all 0.15s"
                }}
              >
                AI Friends
              </button>
              <button
                onClick={() => setSettingsTab("security")}
                style={{
                  background: "none", border: "none", color: settingsTab === "security" ? "#E8E4DC" : "#8A8A9A",
                  fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "4px 8px",
                  borderBottom: settingsTab === "security" ? "2px solid #5B8A6A" : "2px solid transparent",
                  transition: "all 0.15s"
                }}
              >
                Security PIN
              </button>
            </div>

            {settingsTab === "names" ? (
              <>
                <p style={{ margin: 0, fontSize: 12, color: "#8A8A9A" }}>Change the names of your AI friend group. These will show up in the chat conversation.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxHeight: 260, overflowY: "auto" }} className="sidebar-scroll">
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
                          setCustomNames(prev => ({ ...prev, [key]: val }));
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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                    <button onClick={() => setShowResetNamesConfirm(true)} style={{ background: "none", border: "1px solid #C45A5A33", color: "#C45A5A", padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                      Reset All
                    </button>
                    <button onClick={() => setShowEditModal(false)} style={{ background: "#5B8A6A", border: "none", color: "white", padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Done
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#8A8A9A", lineHeight: 1.5 }}>
                  Set a custom security PIN to lock/unlock your active session during inactivity.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#8A8A9A" }}>Unlock PIN</label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Enter security PIN (e.g. 1234)"
                    value={lockPin}
                    onChange={e => {
                      const val = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
                      setLockPin(val);
                    }}
                    style={{ background: "#0F0F16", border: "1px solid #2A2A3E", borderRadius: 8, padding: "10px 12px", color: "#E8E4DC", fontSize: 14, outline: "none", letterSpacing: "1px" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    onClick={() => {
                      if (lockPin.length < 4) {
                        alert("PIN must be at least 4 characters long.");
                      } else if (lockPin === "1234") {
                        alert("For security, '1234' is not allowed as a PIN. Please set a custom PIN.");
                      } else {
                        setShowEditModal(false);
                      }
                    }}
                    style={{ background: "#5B8A6A", border: "none", color: "white", padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Save & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Force PIN Setup Overlay (First Use Security Enforcement) */}
      {isStorageLoaded && (lockPin === "" || lockPin === "1234") && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(7, 7, 10, 0.85)", backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          zIndex: 9998, padding: 24, animation: "fadeIn 0.4s ease"
        }}>
          <div style={{
            background: "linear-gradient(135deg, #161624 0%, #0F0F1A 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 24,
            padding: "48px 36px", maxWidth: 420, width: "100%", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
            boxShadow: "0 0 50px rgba(91, 138, 106, 0.1), 0 20px 50px rgba(0,0,0,0.7)"
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", background: "rgba(91, 138, 106, 0.1)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
              border: "1px solid rgba(91, 138, 106, 0.2)", marginBottom: 4
            }}>
              🛡️
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#E8E4DC", letterSpacing: "-0.5px" }}>Set Security PIN</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#8A8A9A", lineHeight: 1.6 }}>
                To protect your decision-mapping privacy on shared devices, please set a custom security PIN. This will be required to unlock your session after 15 minutes of inactivity.
              </p>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <input
                type="text"
                placeholder="Enter new PIN (e.g. 5829)"
                value={setupPinInput}
                onChange={e => {
                  const val = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
                  setSetupPinInput(val);
                  setSetupPinError(false);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (setupPinInput.length < 4) {
                      setSetupPinError(true);
                    } else if (setupPinInput === "1234") {
                      alert("For security, '1234' is not allowed as a PIN. Please set a custom PIN.");
                    } else {
                      setLockPin(setupPinInput);
                      setSetupPinInput("");
                      setSetupPinError(false);
                    }
                  }
                }}
                style={{
                  width: "100%", background: "rgba(0, 0, 0, 0.3)", border: setupPinError ? "1px solid #C45A5A" : "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 12, padding: "14px 18px", color: "#E8E4DC", fontSize: 15,
                  textAlign: "center", letterSpacing: "2px", outline: "none", transition: "all 0.2s"
                }}
              />
              {setupPinError ? (
                <span style={{ color: "#C45A5A", fontSize: 12, fontWeight: 500 }}>PIN must be at least 4 characters long.</span>
              ) : (
                <span style={{ color: "#555", fontSize: 11 }}>Use letters or numbers. Minimum 4 characters.</span>
              )}
            </div>

            <button
              onClick={() => {
                if (setupPinInput.length < 4) {
                  setSetupPinError(true);
                } else if (setupPinInput === "1234") {
                  alert("For security, '1234' is not allowed as a PIN. Please set a custom PIN.");
                } else {
                  setLockPin(setupPinInput);
                  setSetupPinInput("");
                  setSetupPinError(false);
                }
              }}
              style={{
                width: "100%", background: "#5B8A6A", color: "white", border: "none",
                borderRadius: 12, padding: "14px 24px", fontSize: 14, fontWeight: 700,
                cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.5px"
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = "#6C9C7B"}
              onMouseLeave={e => (e.target as HTMLElement).style.background = "#5B8A6A"}
            >
              Confirm PIN
            </button>
          </div>
        </div>
      )}

      {/* Lock Screen Overlay (Responsible AI) */}
      {isLocked && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(7, 7, 10, 0.85)", backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: 24, animation: "fadeIn 0.3s ease"
        }}>
          <div style={{
            background: "linear-gradient(135deg, #161624 0%, #0F0F1A 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 24,
            padding: "48px 36px", maxWidth: 420, width: "100%", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
            boxShadow: "0 0 50px rgba(91, 138, 106, 0.05), 0 20px 50px rgba(0,0,0,0.7)"
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", background: "rgba(255, 255, 255, 0.03)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
              border: "1px solid rgba(255, 255, 255, 0.08)", marginBottom: 4
            }}>
              🔒
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#E8E4DC", letterSpacing: "-0.5px" }}>Session Locked</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#8A8A9A", lineHeight: 1.6 }}>
                For your privacy, this decision-mapping session has been locked due to 15 minutes of inactivity. Enter your unlock PIN to resume.
              </p>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <input
                type="password"
                placeholder="Enter PIN"
                value={pinInput}
                onChange={e => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") handleUnlock();
                }}
                style={{
                  width: "100%", background: "rgba(0, 0, 0, 0.3)", border: pinError ? "1px solid #C45A5A" : "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 12, padding: "14px 18px", color: "#E8E4DC", fontSize: 15,
                  textAlign: "center", letterSpacing: "4px", outline: "none", transition: "all 0.2s"
                }}
              />
              {pinError && (
                <span style={{ color: "#C45A5A", fontSize: 12, fontWeight: 500 }}>Incorrect PIN. Please try again.</span>
              )}
            </div>

            <button
              onClick={handleUnlock}
              style={{
                width: "100%", background: "#5B8A6A", color: "white", border: "none",
                borderRadius: 12, padding: "14px 24px", fontSize: 14, fontWeight: 700,
                cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.5px"
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = "#6C9C7B"}
              onMouseLeave={e => (e.target as HTMLElement).style.background = "#5B8A6A"}
            >
              Unlock Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
