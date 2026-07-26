import { useEffect, useRef, useState } from "react";
import {
  generateStory,
  getMessages,
  sendMessage,
  stageLabel,
  type StoryOut,
} from "./api";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
}

const OPENING =
  "你好呀。不用想着「讲故事」这回事，我们就随便聊聊——最近有什么事，哪怕很小的事，在你心里停留了一会儿？";

export default function Chat({
  sessionId,
  onActivity,
  onStoryCreated,
}: {
  sessionId: number;
  onActivity: () => void;
  onStoryCreated: (story: StoryOut) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("warmup");
  const [storyBusy, setStoryBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoaded(false);
    getMessages(sessionId)
      .then((data) => {
        setStage(data.stage);
        setMessages(
          data.messages.length
            ? data.messages.map((m) => ({ role: m.role, text: m.text }))
            : [{ role: "assistant", text: OPENING }],
        );
      })
      .catch((err) => setMessages([{ role: "system", text: String(err) }]))
      .finally(() => setLoaded(true));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const userTurns = messages.filter((m) => m.role === "user").length;

  async function handleSend() {
    const text = input.trim();
    if (!text || busy || !loaded) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    try {
      await sendMessage(sessionId, text, (ev) => {
        if (ev.type === "delta") {
          setMessages((m) => {
            const next = [...m];
            next[next.length - 1] = {
              role: "assistant",
              text: next[next.length - 1].text + ev.text,
            };
            return next;
          });
        } else if (ev.type === "done") {
          setStage(ev.stage);
        } else if (ev.type === "error") {
          setMessages((m) => [...m, { role: "system", text: ev.message }]);
        }
      });
    } catch (err) {
      setMessages((m) => [...m, { role: "system", text: String(err) }]);
    } finally {
      setBusy(false);
      onActivity(); // 侧边栏的会话标题与阶段跟着最新状态走
    }
  }

  async function handleStory() {
    if (storyBusy) return;
    setStoryBusy(true);
    try {
      const story = await generateStory(sessionId);
      onStoryCreated(story);
    } catch (err) {
      setMessages((m) => [...m, { role: "system", text: String(err) }]);
    } finally {
      setStoryBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">访谈 #{sessionId}</h2>
          <p className="text-xs text-stone-400">阶段：{stageLabel(stage)}</p>
        </div>
        <button
          onClick={handleStory}
          disabled={storyBusy || userTurns < 3}
          title={userTurns < 3 ? "多聊几轮，故事的细节够了再生成" : ""}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-700 disabled:opacity-40"
        >
          {storyBusy ? "正在写你的故事…" : "生成故事稿"}
        </button>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) =>
          m.role === "system" ? (
            <p key={i} className="text-center text-xs text-red-400">
              {m.text}
            </p>
          ) : (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <div
                className={
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed " +
                  (m.role === "user"
                    ? "bg-amber-600 text-white"
                    : "border border-stone-200 bg-white")
                }
              >
                {m.text || (busy && i === messages.length - 1 ? "正在听你说…" : "…")}
              </div>
            </div>
          ),
        )}
        {storyBusy && (
          <p className="text-center text-xs text-stone-400">
            正在整理你的故事，并逐句核对细节（大约需要十几秒）…
          </p>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="想到什么说什么，说一半也没关系…（Enter 发送，Shift+Enter 换行）"
            className="flex-1 resize-none rounded-xl border border-stone-300 px-3 py-2 text-[15px] focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={busy || !input.trim()}
            className="rounded-xl bg-stone-800 px-4 text-sm text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            {busy ? "…" : "发送"}
          </button>
        </div>
      </footer>
    </div>
  );
}
