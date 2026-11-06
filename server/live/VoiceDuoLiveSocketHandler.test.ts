import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { attachVoiceDuoLiveWebSocket } from "./VoiceDuoLiveSocketHandler.js";

function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (check()) { clearInterval(timer); resolve(); }
      else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for live duo event"));
      }
    }, 20);
  });
}

test("voice duo live: opens two independent sessions and alternates bounded turns", async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const callbacks: Array<{ onmessage: (message: any) => void }> = [];
  const calls: Array<{ speaker: string; text: string }> = [];
  const activeSessions = new Set<unknown>();

  const fakeAI = {
    live: {
      connect: async (options: any) => {
        const index = callbacks.length;
        const speaker = index === 0 ? "leanna" : "roxane";
        callbacks.push(options.callbacks);
        return {
          sendRealtimeInput: () => {},
          sendClientContent: (payload: any) => {
            const text = payload.turns?.[0]?.parts?.[0]?.text || "";
            calls.push({ speaker, text });
            queueMicrotask(() => options.callbacks.onmessage({
              serverContent: {
                outputTranscription: { text: `${speaker} réponse ${calls.filter(c => c.speaker === speaker).length}` },
                modelTurn: { parts: [] },
                turnComplete: true,
              },
            }));
          },
          close: () => {},
        };
      },
    },
  };

  attachVoiceDuoLiveWebSocket(wss, {
    getCurrentProfile: () => ({
      aiName: "Leanna",
      aiVoice: "Aoede",
      duoName: "Roxane",
      duoVoice: "Kore",
      language: "fr",
    }),
    createGeminiAI: () => fakeAI as any,
    activeGeminiSessions: activeSessions,
  });

  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url || "/", "http://localhost").pathname !== "/voice-duo-live") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/voice-duo-live`);
  const events: any[] = [];
  ws.on("message", data => {
    try { events.push(JSON.parse(data.toString())); } catch { /* binary audio ignored */ }
  });

  try {
    await waitFor(() => events.some(event => event.type === "ready"));
    assert.equal(callbacks.length, 2, "two Gemini Live sessions must be created");
    assert.equal(activeSessions.size, 2, "both sessions must be tracked for shutdown");

    ws.send(JSON.stringify({ type: "text", text: "Comparez deux options." }));
    await waitFor(() => events.some(event => event.type === "listening" && event.reason === "turn_limit"));

    const speakers = events.filter(event => event.type === "transcript").map(event => event.speaker);
    assert.deepEqual(speakers, ["leanna", "roxane", "leanna", "roxane", "leanna"]);
    assert.equal(calls.length, 5, "one user prompt plus four autonomous turns are expected");
    assert.ok(calls[1].text.includes("Leanna vient de dire"));
    assert.ok(calls[2].text.includes("Roxane vient de dire"));
  } finally {
    ws.terminate();
    for (const client of wss.clients) client.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    server.close();
    server.closeAllConnections();
  }
});
