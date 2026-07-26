import { useEffect, useState } from "react";
import { listCards, type TopicCard } from "./api";

export default function Picker({
  onPick,
}: {
  onPick: (cardId: string | null) => void;
}) {
  const [cards, setCards] = useState<TopicCard[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listCards()
      .then(setCards)
      .catch(() =>
        setError("无法连接后端，请确认 backend 已启动（uvicorn app.main:app --port 8000）"),
      );
  }, []);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-10">
      <h2 className="text-xl font-semibold">今天，想从哪里聊起？</h2>
      <p className="mt-2 text-sm text-stone-400">
        选一张卡，或者什么都不选——你不需要准备好一个故事
      </p>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="group rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md"
          >
            <span className="text-2xl">{c.icon}</span>
            <span className="mt-2 block text-sm font-medium text-stone-800">{c.title}</span>
            <span className="mt-1 block text-xs leading-snug text-stone-400">{c.hint}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => onPick(null)}
        className="mt-8 rounded-xl border border-stone-300 px-5 py-2.5 text-sm text-stone-600 transition hover:bg-stone-100"
      >
        随便聊聊，不选卡
      </button>
    </div>
  );
}
