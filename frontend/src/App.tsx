import { useCallback, useEffect, useState } from "react";
import {
  createSession,
  listSessions,
  stageLabel,
  type SessionSummary,
  type StoryOut,
} from "./api";
import Chat from "./Chat";
import Memories from "./Memories";
import Picker from "./Picker";
import Stories from "./Stories";

type View =
  | { type: "picker" }
  | { type: "chat"; sessionId: number }
  | { type: "stories" }
  | { type: "memories" };

export default function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [view, setView] = useState<View>({ type: "picker" });
  const [storiesKey, setStoriesKey] = useState(0);
  const [error, setError] = useState("");

  const refreshSessions = useCallback(() => {
    listSessions()
      .then(setSessions)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  async function startSession(cardId: string | null) {
    try {
      const s = await createSession(cardId ?? undefined);
      setView({ type: "chat", sessionId: s.id });
      setError("");
    } catch {
      setError("无法连接后端，请确认 backend 已启动（uvicorn app.main:app --port 8000）");
    }
  }

  function handleStoryCreated(_story: StoryOut) {
    setStoriesKey((k) => k + 1);
    setView({ type: "stories" });
  }

  const activeSessionId = view.type === "chat" ? view.sessionId : null;

  const navButton = (
    label: string,
    target: View,
    active: boolean,
  ) => (
    <button
      onClick={() => setView(target)}
      className={
        "flex-1 rounded-lg border px-2 py-2 text-sm transition " +
        (active
          ? "border-amber-600 bg-amber-50 text-amber-700"
          : "border-stone-300 hover:bg-stone-50")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full bg-stone-50 text-stone-800">
      {/* 侧边栏 */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3">
          <h1 className="text-base font-semibold">life-agent</h1>
          <p className="text-xs text-stone-400">把你的故事讲好</p>
        </div>

        <div className="space-y-2 p-3">
          <button
            onClick={() => setView({ type: "picker" })}
            className="w-full rounded-lg bg-stone-800 px-3 py-2 text-sm text-white transition hover:bg-stone-700"
          >
            ＋ 新访谈
          </button>
          <div className="flex gap-2">
            {navButton("我的故事", { type: "stories" }, view.type === "stories")}
            {navButton("TA 记得我", { type: "memories" }, view.type === "memories")}
          </div>
        </div>

        <p className="px-4 pb-1 pt-2 text-xs font-medium text-stone-400">历史访谈</p>
        <nav className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="px-4 py-2 text-xs text-stone-300">聊过之后会出现在这里</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setView({ type: "chat", sessionId: s.id })}
              className={
                "block w-full px-4 py-2.5 text-left hover:bg-stone-50 " +
                (activeSessionId === s.id ? "bg-amber-50" : "")
              }
            >
              <span className="line-clamp-1 text-sm text-stone-700">{s.title}</span>
              <span className="text-xs text-stone-400">
                {stageLabel(s.stage)} · {s.created_at.slice(5, 10)}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      {/* 主区域 */}
      <div className="min-w-0 flex-1">
        {error && <p className="p-4 text-center text-sm text-red-400">{error}</p>}
        {view.type === "picker" && <Picker onPick={(cardId) => void startSession(cardId)} />}
        {view.type === "chat" && (
          <Chat
            key={view.sessionId}
            sessionId={view.sessionId}
            onActivity={refreshSessions}
            onStoryCreated={handleStoryCreated}
          />
        )}
        {view.type === "stories" && <Stories refreshKey={storiesKey} />}
        {view.type === "memories" && <Memories />}
      </div>
    </div>
  );
}
