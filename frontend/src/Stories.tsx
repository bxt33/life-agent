import { useEffect, useState } from "react";
import { listStories, updateStory, type StoryOut } from "./api";
import StoryCard from "./StoryCard";

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  confirmed: "已确认",
  published: "已发布",
};

export default function Stories({ refreshKey }: { refreshKey: number }) {
  const [stories, setStories] = useState<StoryOut[]>([]);
  const [current, setCurrent] = useState<StoryOut | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "edit">("card");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listStories()
      .then((data) => {
        setStories(data);
        if (data.length && !current) select(data[0]);
      })
      .catch((err) => setError(String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function select(story: StoryOut) {
    setCurrent(story);
    setText(story.final_md || story.draft_md);
    setViewMode("card");
    setError("");
  }

  function onCardUpdated(updated: StoryOut) {
    setStories((all) => all.map((s) => (s.id === updated.id ? updated : s)));
    setCurrent(updated);
  }

  async function confirmEdit() {
    if (!current || saving) return;
    setSaving(true);
    try {
      const updated = await updateStory(current.id, { final_md: text, status: "confirmed" });
      setStories((all) => all.map((s) => (s.id === updated.id ? updated : s)));
      setCurrent(updated);
      setViewMode("card");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!stories.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-400">
        还没有故事。完成一次访谈后点「生成故事稿」，它会出现在这里。
      </div>
    );
  }

  const dirty = current !== null && text !== (current.final_md || current.draft_md);

  return (
    <div className="flex h-full">
      {/* 侧边栏 */}
      <aside className="w-52 shrink-0 overflow-y-auto border-r border-stone-200 bg-white">
        {stories.map((s) => (
          <button
            key={s.id}
            onClick={() => select(s)}
            className={
              "block w-full border-b border-stone-100 px-3 py-3 text-left text-sm transition hover:bg-stone-50 " +
              (current?.id === s.id ? "bg-amber-50" : "")
            }
          >
            <span className="line-clamp-1 font-medium text-stone-700">
              {s.title || (s.final_md || s.draft_md).slice(0, 18) || "未命名故事"}
            </span>
            <span className="mt-0.5 block text-xs text-stone-400">
              {STATUS_LABELS[s.status] ?? s.status} · {s.created_at.slice(0, 10)}
            </span>
          </button>
        ))}
      </aside>

      {current && (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* 顶部工具栏：仅显示卡片/编辑切换 */}
          <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 py-2.5">
            <div className="flex rounded-lg border border-stone-200 p-0.5">
              <button
                onClick={() => setViewMode("card")}
                className={
                  "rounded px-3 py-1 text-xs transition " +
                  (viewMode === "card"
                    ? "bg-amber-600 text-white"
                    : "text-stone-500 hover:text-stone-700")
                }
              >
                故事
              </button>
              <button
                onClick={() => setViewMode("edit")}
                className={
                  "rounded px-3 py-1 text-xs transition " +
                  (viewMode === "edit"
                    ? "bg-amber-600 text-white"
                    : "text-stone-500 hover:text-stone-700")
                }
              >
                编辑
              </button>
            </div>

            {viewMode === "edit" && (
              <button
                onClick={confirmEdit}
                disabled={saving || (current.status === "confirmed" && !dirty)}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-700 disabled:opacity-40"
              >
                {saving ? "保存中…" : current.status === "confirmed" && !dirty ? "已确认" : "确认这版"}
              </button>
            )}
          </header>

          {error && <p className="px-4 pt-2 text-xs text-red-400">{error}</p>}

          {/* 卡片视图：key 保证切换故事时完整重置 */}
          {viewMode === "card" && (
            <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50">
              <StoryCard key={current.id} story={current} onUpdated={onCardUpdated} />
            </div>
          )}

          {/* 编辑视图 */}
          {viewMode === "edit" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 resize-none bg-stone-50 p-5 text-[15px] leading-loose focus:outline-none"
            />
          )}
        </div>
      )}
    </div>
  );
}
