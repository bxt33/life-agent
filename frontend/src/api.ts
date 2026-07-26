export type SSEEvent =
  | { type: "delta"; text: string }
  | { type: "done"; stage: string; turns: number }
  | { type: "safety" }
  | { type: "error"; message: string };

export async function createSession(): Promise<{ id: number }> {
  const res = await fetch("/api/sessions", { method: "POST" });
  if (!res.ok) throw new Error("创建会话失败");
  return res.json();
}

export async function sendMessage(
  sessionId: number,
  text: string,
  onEvent: (ev: SSEEvent) => void,
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) throw new Error(`发送失败（${res.status}）`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as SSEEvent);
      } catch {
        // 忽略无法解析的分片
      }
    }
  }
}

export interface StoryOut {
  id: number;
  session_id: number;
  draft_md: string;
  final_md: string;
  status: string;
}

export async function generateStory(sessionId: number): Promise<StoryOut> {
  const res = await fetch(`/api/sessions/${sessionId}/story`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `生成失败（${res.status}）`);
  }
  return res.json();
}
