import { useEffect, useRef, useState } from "react";
import {
  generateStory,
  getMessages,
  sendMessage,
  stageLabel,
  transcribeAudio,
  type StoryOut,
} from "./api";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
}

const SKIP_TEXT = "这个话题我不太想聊，我们聊点别的吧";

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
  const [storyStep, setStoryStep] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);

  useEffect(() => {
    setLoaded(false);
    setSuggestions([]);
    getMessages(sessionId)
      .then((data) => {
        setStage(data.stage);
        setMessages(data.messages.map((m) => ({ role: m.role, text: m.text })));
      })
      .catch((err) => setMessages([{ role: "system", text: String(err) }]))
      .finally(() => setLoaded(true));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, suggestions]);

  const userTurns = messages.filter((m) => m.role === "user").length;

  async function deliver(text: string, audioPath = "") {
    if (!text || busy || !loaded) return;
    setInput("");
    setSuggestions([]);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    try {
      await sendMessage(
        sessionId,
        text,
        (ev) => {
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
          } else if (ev.type === "suggestions") {
            setSuggestions(ev.items);
          } else if (ev.type === "error") {
            setMessages((m) => [...m, { role: "system", text: ev.message }]);
          }
        },
        audioPath,
      );
    } catch (err) {
      setMessages((m) => [...m, { role: "system", text: String(err) }]);
    } finally {
      setBusy(false);
      onActivity(); // 侧边栏的会话标题与阶段跟着最新状态走
    }
  }

  // ---- 语音：按住说话（push-to-talk，绕开 VAD 的整个难题） ----

  async function startRecording() {
    if (busy || recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void finishRecording();
      };
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();
      recorder.start();
      setRecording(true);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "system", text: "无法使用麦克风：请允许浏览器的麦克风权限" },
      ]);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }

  async function finishRecording() {
    const duration = Date.now() - recordStartRef.current;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    if (duration < 500 || blob.size < 1000) return; // 误触
    setTranscribing(true);
    try {
      const { text, audio_path } = await transcribeAudio(sessionId, blob);
      await deliver(text, audio_path);
    } catch (err) {
      setMessages((m) => [...m, { role: "system", text: String(err) }]);
    } finally {
      setTranscribing(false);
    }
  }

  async function handleStory() {
    if (storyBusy) return;
    setStoryBusy(true);
    setStoryStep("正在起草故事稿…");
    let resultStory: StoryOut | null = null;
    try {
      await generateStory(sessionId, (ev) => {
        if (ev.type === "progress") {
          setStoryStep(ev.message);
        } else if (ev.type === "done") {
          resultStory = ev.story;
        } else if (ev.type === "error") {
          setMessages((m) => [...m, { role: "system", text: ev.message }]);
        }
      });
      if (resultStory) onStoryCreated(resultStory);
    } catch (err) {
      setMessages((m) => [...m, { role: "system", text: String(err) }]);
    } finally {
      setStoryBusy(false);
      setStoryStep("");
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
          {storyBusy ? storyStep || "正在写你的故事…" : "生成故事稿"}
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
        {/* 快捷回应：点选代替打字 */}
        {!busy && suggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => void deliver(s)}
                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 transition hover:bg-amber-100"
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => void deliver(SKIP_TEXT)}
              className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-400 transition hover:bg-stone-50"
            >
              换个话题
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {/* 按住说话 */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              void startRecording();
            }}
            onPointerUp={stopRecording}
            onPointerLeave={() => recording && stopRecording()}
            disabled={busy || transcribing}
            className={
              "select-none rounded-xl px-4 text-lg transition disabled:opacity-40 " +
              (recording
                ? "animate-pulse bg-red-500 text-white"
                : "border border-stone-300 hover:bg-stone-50")
            }
            title="按住说话，松开发送"
          >
            {transcribing ? "…" : "🎙️"}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void deliver(input.trim());
              }
            }}
            rows={1}
            placeholder={
              recording
                ? "松开手指，说的话会自动发出去…"
                : transcribing
                  ? "正在听清你刚说的话…"
                  : "打字，或按住 🎙️ 说话——说一半也没关系"
            }
            className="flex-1 resize-none rounded-xl border border-stone-300 px-3 py-2 text-[15px] focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={() => void deliver(input.trim())}
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
