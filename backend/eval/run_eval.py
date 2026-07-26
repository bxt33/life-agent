"""persona 自动评估环：3 个模拟受访者 × 访谈 agent × LLM 裁判。

用法（需先启动后端）：
    cd backend
    conda run -n ai_agent python -m eval.run_eval [--turns 6] [--base http://localhost:8000]

流程：persona LLM 扮演受访者与真实后端对话 N 轮 → 生成故事稿 →
裁判按检查项打分 → 结果存 eval/results/ 并打印摘要。
提示词调优前后各跑一次，对比分数——没有评估，就没有进步。
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import llm  # noqa: E402
from eval.personas import PERSONAS  # noqa: E402

RESULTS_DIR = Path(__file__).resolve().parent / "results"

JUDGE_PROMPT = """你是访谈质量裁判。下面是一段 AI 采访者与受访者的对话记录和最终故事稿。
按以下维度打分（0-10）并给出一句话依据，输出 JSON：

{
  "one_question_per_turn": 0,   // 采访者是否每轮只问一个问题
  "acknowledge_first": 0,        // 是否先复述/接住再追问
  "no_preaching": 0,             // 是否做到不评判、不说教、不安慰式打断
  "detail_mining": 0,            // 是否挖出了具体细节（原话/具象/第一反应）
  "story_grounded": 0,           // 故事稿细节是否全部来自访谈（发现编造扣到 0-3）
  "story_moving": 0,             // 故事稿是否有打动人的潜力
  "notes": "一句话总评"
}
只输出 JSON。"""


async def persona_reply(persona: dict, transcript: list[dict]) -> str:
    """persona LLM 根据对话历史生成下一句受访者发言。"""
    messages = [{"role": "system", "content": persona["system"]}]
    for turn in transcript:
        # persona 视角：采访者的话是 user，自己的话是 assistant
        role = "user" if turn["role"] == "assistant" else "assistant"
        messages.append({"role": role, "content": turn["text"]})
    return (await llm.chat(messages)).strip()


async def run_interview(client: httpx.AsyncClient, persona: dict, turns: int) -> dict:
    created = (await client.post("/api/sessions", json={})).json()
    session_id = created["id"]
    transcript: list[dict] = [{"role": "assistant", "text": created["opening"]}]

    for _ in range(turns):
        user_text = await persona_reply(persona, transcript)
        transcript.append({"role": "user", "text": user_text})
        reply_parts: list[str] = []
        async with client.stream(
            "POST", f"/api/sessions/{session_id}/messages", json={"text": user_text}
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                ev = json.loads(line[6:])
                if ev["type"] == "delta":
                    reply_parts.append(ev["text"])
        transcript.append({"role": "assistant", "text": "".join(reply_parts)})

    story_resp = await client.post(f"/api/sessions/{session_id}/story")
    story = story_resp.json().get("draft_md", "") if story_resp.status_code == 200 else ""
    return {"session_id": session_id, "transcript": transcript, "story": story}


async def judge(transcript: list[dict], story: str) -> dict:
    text = "\n".join(
        f"{'采访者' if t['role'] == 'assistant' else '受访者'}：{t['text']}" for t in transcript
    )
    raw = await llm.chat(
        [
            {"role": "system", "content": JUDGE_PROMPT},
            {"role": "user", "content": f"对话记录：\n{text}\n\n故事稿：\n{story or '（未生成）'}"},
        ],
        json_mode=True,
    )
    return llm.parse_json(raw)


async def main(turns: int, base: str) -> None:
    RESULTS_DIR.mkdir(exist_ok=True)
    results = []
    async with httpx.AsyncClient(base_url=base, timeout=180) as client:
        for persona in PERSONAS:
            print(f"—— 访谈中：{persona['name']} …", flush=True)
            run = await run_interview(client, persona, turns)
            scores = await judge(run["transcript"], run["story"])
            results.append({"persona": persona["name"], **run, "scores": scores})
            print(f"   得分：{json.dumps(scores, ensure_ascii=False)}", flush=True)

    out = RESULTS_DIR / f"eval_{int(time.time())}.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\n===== 汇总 =====")
    keys = [
        "one_question_per_turn",
        "acknowledge_first",
        "no_preaching",
        "detail_mining",
        "story_grounded",
        "story_moving",
    ]
    for r in results:
        s = r["scores"]
        line = " ".join(f"{k.split('_')[0]}:{s.get(k, '-')}" for k in keys)
        print(f"{r['persona']}: {line}")
    avg = {
        k: round(sum(r["scores"].get(k, 0) for r in results) / len(results), 1) for k in keys
    }
    print(f"平均: {json.dumps(avg, ensure_ascii=False)}")
    print(f"\n结果已存：{out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--turns", type=int, default=6)
    parser.add_argument("--base", default="http://localhost:8000")
    args = parser.parse_args()
    asyncio.run(main(args.turns, args.base))
