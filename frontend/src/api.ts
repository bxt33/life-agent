export type SSEEvent =
  | { type: "delta"; text: string }
  | { type: "done"; stage: string; turns: number }
  | { type: "safety" }
  | { type: "error"; message: string };

export interface SessionSummary {
  id: number;
  stage: string;
  title: string;
  created_at: string;
}

export interface ChatMessageOut {
  id: number;
  role: "user" | "assistant";
  text: string;
}

export interface StoryOut {
  id: number;
  session_id: number;
  draft_md: string;
  final_md: string;
  status: string;
  created_at: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `请求失败（${res.status}）`);
  }
  return res.json();
}

export const createSession = () => request<{ id: number }>("/api/sessions", { method: "POST" });

export const listSessions = () => request<SessionSummary[]>("/api/sessions");

export const getMessages = (sessionId: number) =>
  request<{ stage: string; messages: ChatMessageOut[] }>(`/api/sessions/${sessionId}/messages`);

export const generateStory = (sessionId: number) =>
  request<StoryOut>(`/api/sessions/${sessionId}/story`, { method: "POST" });

export const listStories = () => request<StoryOut[]>("/api/stories");

export const updateStory = (id: number, patch: { final_md?: string; status?: string }) =>
  request<StoryOut>(`/api/stories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

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

export const STAGE_LABELS: Record<string, string> = {
  warmup: "刚开始聊",
  explore: "寻找故事",
  deepen: "深入细节",
  emotion: "聊聊感受",
  wrapup: "收尾确认",
  done: "访谈完成",
};

export const stageLabel = (stage: string) => STAGE_LABELS[stage] ?? stage;
