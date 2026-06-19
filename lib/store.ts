import { create } from "zustand";
import type { ChatMessage, PipelineState } from "@/types/pipeline";

const INITIAL_PIPELINE: PipelineState = {
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

interface ChatStore {
  messages: ChatMessage[];
  pipeline: PipelineState;
  isLoading: boolean;
  error: string | null;
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setPipeline: (p: PipelineState) => void;
  reset: () => void;
  sendMessage: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  pipeline: INITIAL_PIPELINE,
  isLoading: false,
  error: null,

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: crypto.randomUUID(), timestamp: Date.now() },
      ],
    })),

  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  setPipeline: (p) => set({ pipeline: p }),
  reset: () =>
    set({ messages: [], pipeline: INITIAL_PIPELINE, isLoading: false, error: null }),

  sendMessage: async (text: string) => {
    const { pipeline, addMessage, setLoading, setError, setPipeline } = get();

    // Add user message immediately
    addMessage({ role: "user", content: text });
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: pipeline, user_message: text }),
      });

      if (!res.ok) throw new Error("Pipeline request failed");
      const data = await res.json();

      setPipeline(data.state);

      if (data.message) {
        addMessage({
          role: "system",
          content: data.message.content,
          persona: data.message.persona,
          type: data.message.type,
          metadata: data.message.metadata,
        });
      }

      // If narratives were returned, also queue stance as follow-up
      if (data.message?.type === "narratives" && data.state.stance) {
        setTimeout(() => {
          addMessage({
            role: "system",
            content: data.state.stance.lean,
            persona: "The Advisor",
            type: "stance",
            metadata: { stance: data.state.stance },
          });
        }, 800);
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  },
}));
