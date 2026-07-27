import { useEffect, useRef, useState } from "react";
import { getMessages, storyReactions, updateStory, type Reaction, type StoryOut } from "./api";

interface Props {
  story: StoryOut;
  onUpdated: (story: StoryOut) => void;
}

export default function StoryCard({ story, onUpdated }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [text, setText] = useState(story.final_md || story.draft_md);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // reactions：用本地状态驱动，父组件 story.reactions 是初始值
  const [reactions, setReactions] = useState<Reaction[]>(story.reactions);
  const [reactionsLoading, setReactionsLoading] = useState(false);
  const fetchedRef = useRef(false); // 每个卡片实例只自动触发一次

  // 用户原话
  const [userQuotes, setUserQuotes] = useState<string[]>([]);
  const [showQuotes, setShowQuotes] = useState(false);

  // 复制分享
  const [copied, setCopied] = useState(false);

  // 卡片入场动画
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // 自动触发读者反应（首次，无缓存）
  useEffect(() => {
    if (reactions.length > 0 || fetchedRef.current) return;
    fetchedRef.current = true;
    setReactionsLoading(true);
    storyReactions(story.id)
      .then((updated) => {
        setReactions(updated.reactions);
        onUpdated(updated);
      })
      .catch(() => {
        // 静默失败：读者反应是增值而非核心
      })
      .finally(() => setReactionsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 拉取用户在访谈中说的原话
  useEffect(() => {
    getMessages(story.session_id)
      .then(({ messages }) => {
        const quotes = messages
          .filter((m) => m.role === "user")
          .map((m) => m.text.trim())
          .filter((t) => t.length >= 3 && t.length <= 150);
        setUserQuotes(quotes);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.session_id]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await updateStory(story.id, {
        final_md: text,
        status: "confirmed",
      });
      onUpdated(updated);
      setEditMode(false);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function copyShare() {
    const title = story.title || "我的故事";
    const body = story.final_md || story.draft_md;
    const shareText = `${title}\n\n${body}\n\n— 用 life-agent 记录`;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* 部分浏览器不支持 clipboard API */
    }
  }

  const displayText = story.final_md || story.draft_md;
  const title = story.title || "我的故事";
  const dateStr = story.created_at.slice(0, 10);

  // ── 编辑模式 ──────────────────────────────────────────
  if (editMode) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <p className="text-sm text-stone-500">编辑你的故事</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setText(story.final_md || story.draft_md);
                setEditMode(false);
              }}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-40"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
        {saveError && <p className="px-4 pt-2 text-xs text-red-400">{saveError}</p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 resize-none bg-stone-50 p-5 text-[15px] leading-loose focus:outline-none"
        />
      </div>
    );
  }

  // ── 卡片模式 ──────────────────────────────────────────
  return (
    <div
      className={
        "flex flex-col pb-12 transition-opacity duration-500 " +
        (visible ? "opacity-100" : "opacity-0")
      }
    >
      {/* ── 故事卡片主体 ── */}
      <div className="mx-auto mt-8 w-full max-w-xl rounded-2xl bg-white shadow-lg">
        <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-amber-400 via-orange-300 to-rose-300" />

        <div className="px-8 py-8">
          <h2 className="mb-6 text-[22px] font-bold leading-snug tracking-tight text-stone-800">
            {title}
          </h2>

          <div className="space-y-4 text-[15px] leading-[1.95] text-stone-700">
            {displayText
              .split("\n")
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-stone-100 pt-4">
            <span className="text-xs text-stone-400">{dateStr} · 用 life-agent 记录</span>
            <div className="flex items-center gap-4">
              <button
                onClick={copyShare}
                className={
                  "text-xs transition " +
                  (copied ? "text-amber-600" : "text-stone-400 hover:text-amber-600")
                }
              >
                {copied ? "已复制 ✓" : "复制分享"}
              </button>
              <button
                onClick={() => setEditMode(true)}
                className="text-xs text-stone-400 transition hover:text-amber-600"
              >
                编辑
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 读者反应 ── */}
      <div className="mx-auto mt-4 w-full max-w-xl">
        {reactionsLoading && (
          <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-sm">
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full bg-amber-400"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full bg-amber-400"
              style={{ animationDelay: "160ms" }}
            />
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full bg-amber-400"
              style={{ animationDelay: "320ms" }}
            />
            <span className="ml-1 text-sm text-stone-400">有三个人正在读你的故事…</span>
          </div>
        )}

        {!reactionsLoading && reactions.length > 0 && (
          <div className="rounded-2xl bg-white px-6 py-5 shadow-sm">
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-stone-400">
              三位陌生读者读完之后
            </p>
            <div className="space-y-5">
              {reactions.map((r) => (
                <div key={r.reader} className="flex items-start gap-3">
                  <span
                    className={
                      "mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                      (r.resonated
                        ? "bg-amber-100 text-amber-700"
                        : "bg-stone-100 text-stone-400")
                    }
                  >
                    {r.resonated ? "有共鸣" : "旁观者"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-700">{r.reader}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-500">{r.line}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 你说的原话（可折叠，对比用） ── */}
      {userQuotes.length > 0 && (
        <div className="mx-auto mt-3 w-full max-w-xl">
          <button
            onClick={() => setShowQuotes((v) => !v)}
            className="flex w-full items-center gap-2 rounded-2xl bg-white px-6 py-4 text-left shadow-sm transition hover:bg-stone-50"
          >
            <span className="text-xs font-medium text-stone-400">你当时说的原话</span>
            <span className="ml-auto text-[10px] text-stone-300">{showQuotes ? "▲ 收起" : "▼ 展开"}</span>
          </button>

          {showQuotes && (
            <div className="mt-1 rounded-2xl bg-white px-6 py-5 shadow-sm">
              <p className="mb-4 text-xs text-stone-300">
                以下是你在访谈中说的话——就是从这些，变成了上面那篇文字。
              </p>
              <div className="space-y-2.5">
                {userQuotes.map((q, i) => (
                  <p key={i} className="text-sm italic leading-relaxed text-stone-400">
                    &ldquo;{q}&rdquo;
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
