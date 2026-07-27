import { useEffect, useState } from "react";
import { listStories, storyReactions, updateStory, type StoryOut } from "./api";
import StoryCard from "./StoryCard";

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  confirmed: "已确认",
  published: "已发布",
};

export default function Stories({ refreshKey }: { refreshKey: number }) {
  const [stories, setStories] = useState<StoryOut[]>([]);
  const [current, setCurrent] = useState<StoryOut | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "legacy">("card");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [reacting, setReacting] = useState(false);
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
    setError("");
  }

  function onCardUpdated(updated: StoryOut) {
    setStories((all) => all.map((s) => (s.id === updated.id ? updated : s)));
    setCurrent(updated);
  }

  async function confirm() {
    if (!current || saving) return;
    setSaving(true);
    try {
      const updated = await updateStory(current.id, { final_md: text, status: "confirmed" });
      setStories((all) => all.map((s) => (s.id === updated.id ? updated : s)));
      setCurrent(updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function askReaders() {
    if (!current || reacting) return;
    setReacting(true);
    setError("");
    try {
      const updated = await storyReactions(current.id);
      setStories((all) => all.map((s) => (s.id === updated.id ? updated : s)));
      setCurrent(updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setReacting(false);
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
      {/* 侧边栏：故事列表 */}
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-stone-200 bg-white">
        {stories.map((s) => (
          <button
            key={s.id}
            onClick={() => select(s)}
            className={
              "block w-full border-b border-stone-100 px-3 py-2.5 text-left text-sm hover:bg-stone-50 " +
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
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 顶部工具栏 */}
          <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-2.5">
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
                卡片
              </button>
              <button
                onClick={() => setViewMode("legacy")}
                className={
                  "rounded px-3 py-1 text-xs transition " +
                  (viewMode === "legacy"
                    ? "bg-amber-600 text-white"
                    : "text-stone-500 hover:text-stone-700")
                }
              >
                编辑
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={askReaders}
                disabled={reacting}
                title="三位陌生读者读完你的故事，告诉你他们的真实反应"
                className="rounded-lg border border-amber-600 px-3 py-1.5 text-sm text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
              >
                {reacting ? "读者们在读…" : "听听读者反应"}
              </button>
              {viewMode === "legacy" && (
                <button
                  onClick={confirm}
                  disabled={saving || (current.status === "confirmed" && !dirty)}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-700 disabled:opacity-40"
                >
                  {saving ? "保存中…" : current.status === "confirmed" && !dirty ? "已确认" : "确认这版"}
                </button>
              )}
            </div>
          </header>

          {error && <p className="px-4 pt-2 text-xs text-red-400">{error}</p>}

          {/* 卡片视图 */}
          {viewMode === "card" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <StoryCard story={current} onUpdated={onCardUpdated} />
              {current.reactions.length > 0 && (
                <div className="mx-auto mb-6 w-full max-w-xl rounded-2xl bg-white px-8 py-5 shadow-md">
                  <p className="mb-3 text-xs font-medium text-stone-400">三位陌生读者读完之后：</p>
                  <div className="space-y-2.5">
                    {current.reactions.map((r) => (
                      <div key={r.reader} className="flex items-start gap-2.5">
                        <span
                          className={
                            "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs " +
                            (r.resonated
                              ? "bg-amber-100 text-amber-700"
                              : "bg-stone-100 text-stone-400")
                          }
                        >
                          {r.resonated ? "我也是" : "还没进去"}
                        </span>
                        <p className="text-sm leading-relaxed text-stone-600">
                          <span className="font-medium text-stone-700">{r.reader}</span>
                          ：{r.line}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 编辑视图（原始 textarea） */}
          {viewMode === "legacy" && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="flex-1 resize-none bg-stone-50 p-5 text-[15px] leading-loose focus:outline-none"
              />
              {current.reactions.length > 0 && (
                <div className="border-t border-stone-200 bg-white px-5 py-4">
                  <p className="mb-3 text-xs font-medium text-stone-400">三位陌生读者读完之后：</p>
                  <div className="space-y-2.5">
                    {current.reactions.map((r) => (
                      <div key={r.reader} className="flex items-start gap-2.5">
                        <span
                          className={
                            "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs " +
                            (r.resonated
                              ? "bg-amber-100 text-amber-700"
                              : "bg-stone-100 text-stone-400")
                          }
                        >
                          {r.resonated ? "我也是" : "还没进去"}
                        </span>
                        <p className="text-sm leading-relaxed text-stone-600">
                          <span className="font-medium text-stone-700">{r.reader}</span>
                          ：{r.line}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
