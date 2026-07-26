import { useEffect, useState } from "react";
import { deleteMemory, listMemories, type MemoryOut } from "./api";

export default function Memories() {
  const [memories, setMemories] = useState<MemoryOut[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listMemories()
      .then(setMemories)
      .catch((err) => setError(String(err)));
  }, []);

  async function remove(id: number) {
    try {
      await deleteMemory(id);
      setMemories((all) => all.filter((m) => m.id !== id));
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="mx-auto h-full w-full max-w-xl overflow-y-auto px-6 py-8">
      <h2 className="text-lg font-semibold">TA 记得你的</h2>
      <p className="mt-1 text-sm text-stone-400">
        采访者会在之后的访谈里自然地记得这些。这里的每一条都属于你——不想被记得的，随时删掉。
      </p>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {memories.length === 0 ? (
        <p className="mt-10 text-center text-sm text-stone-300">
          还没有记忆。完成一次访谈并生成故事稿后，值得记住的事会出现在这里。
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {memories.map((m) => (
            <li
              key={m.id}
              className="group flex items-start justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
            >
              <div>
                <p className="text-[15px] leading-relaxed text-stone-700">{m.text}</p>
                <p className="mt-1 text-xs text-stone-300">{m.created_at.slice(0, 10)}</p>
              </div>
              <button
                onClick={() => void remove(m.id)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-300 transition hover:bg-red-50 hover:text-red-500"
                title="删除这条记忆"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
