import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "PathMapper — Decisions, Thought Through",
  description: "An AI-powered life decision simulator that resolves reasoning contradictions before mapping your paths.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <style>{`
            * { box-sizing: border-box; }
            html { background: #0F1419; }
            body { margin: 0; padding: 0; height: 100dvh; overflow: hidden; background: #0F1419; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #4B5563; }
            button { font-family: inherit; }
          `}</style>
        </head>
        <body style={{ margin: 0, padding: 0, height: "100dvh", overflow: "hidden", background: "#0F1419" }}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
