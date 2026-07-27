import { useState } from "react";
import { updateStory, type StoryOut } from "./api";

interface Props {
  story: StoryOut;
  onUpdated: (story: StoryOut) => void;
}

export default function StoryCard({ story, onUpdated }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [text, setText] = useState(story.final_md || story.draft_md);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const displayText = story.final_md || story.draft_md;
  const dirty = text !== displayText;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateStory(story.id, { final_md: text, status: "confirmed" });
      onUpdated(updated);
      setEditMode(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setText(story.final_md || story.draft_md);
    setEditMode(false);
    setError("");
  }

  const title = story.title || "我的故事";
  const dateStr = story.created_at.slice(0, 10);

  if (editMode) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <p className="text-sm text-stone-500">编辑你的故事</p>
          <div className="flex gap-2">
            <button
              onClick={cancel}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-40"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
        {error && <p className="px-4 pt-2 text-xs text-red-400">{error}</p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 resize-none bg-stone-50 p-5 text-[15px] leading-loose focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-stone-50">
      {/* 卡片主体 */}
      <div className="mx-auto my-6 w-full max-w-xl rounded-2xl bg-white shadow-md">
        {/* 顶部装饰色带 */}
        <div className="h-2 rounded-t-2xl bg-gradient-to-r from-amber-400 to-orange-300" />

        <div className="px-8 py-7">
          {/* 标题 */}
          <h2 className="mb-4 text-2xl font-bold leading-snug tracking-tight text-stone-800">
            {title}
          </h2>

          {/* 正文 */}
          <div className="prose prose-stone prose-sm max-w-none text-[15px] leading-loose text-stone-700">
            {displayText.split("\n").filter(Boolean).map((para, i) => (
              <p key={i} className="mb-3 last:mb-0">
                {para}
              </p>
            ))}
          </div>

          {/* 底部署名行 */}
          <div className="mt-8 flex items-center justify-between border-t border-stone-100 pt-4">
            <span className="text-xs text-stone-400">{dateStr} · 用 life-agent 记录</span>
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
  );
}
