export type SSEEvent =
  | { type: "delta"; text: string }
  | { type: "done"; stage: string; turns: number }
  | { type: "safety" }
  | { type: "suggestions"; items: string[] }
  | { type: "error"; message: string };

export type StorySSEEvent =
  | { type: "progress"; step: string; message: string }
  | { type: "done"; story: StoryOut }
  | { type: "error"; message: string };

export interface TopicCard {
  id: string;
  icon: string;
  title: string;
  hint: string;
}

export interface Reaction {
  reader: string;
  desc: string;
  resonated: boolean;
  line: string;
}

export interface MemoryOut {
  id: number;
  text: string;
  created_at: string;
}

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
  title: string;
  draft_md: string;
  final_md: string;
  status: string;
  reactions: Reaction[];
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

export const createSession = (cardId?: string) =>
  request<{ id: number; opening: string }>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card_id: cardId ?? null }),
  });

export const listCards = () => request<TopicCard[]>("/api/cards");

export const transcribeAudio = async (sessionId: number, blob: Blob) => {
  const form = new FormData();
  form.append("file", blob, "voice.webm");
  const res = await fetch(`/api/sessions/${sessionId}/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `转写失败（${res.status}）`);
  }
  return res.json() as Promise<{ text: string; audio_path: string }>;
};

export const storyReactions = (storyId: number) =>
  request<StoryOut>(`/api/stories/${storyId}/reactions`, { method: "POST" });

export const listMemories = () => request<MemoryOut[]>("/api/memories");

export const deleteMemory = (id: number) =>
  request<{ ok: boolean }>(`/api/memories/${id}`, { method: "DELETE" });

export const listSessions = () => request<SessionSummary[]>("/api/sessions");

export const getMessages = (sessionId: number) =>
  request<{ stage: string; messages: ChatMessageOut[] }>(`/api/sessions/${sessionId}/messages`);

export const generateStory = async (
  sessionId: number,
  onEvent: (ev: StorySSEEvent) => void,
): Promise<void> => {
  const res = await fetch(`/api/sessions/${sessionId}/story`, { method: "POST" });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `故事稿生成失败（${res.status}）`);
  }
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
        onEvent(JSON.parse(line.slice(6)) as StorySSEEvent);
      } catch {
        // 忽略无法解析的分片
      }
    }
  }
};

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
  audioPath = "",
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, audio_path: audioPath }),
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
