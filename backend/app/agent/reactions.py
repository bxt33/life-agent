"""读者评审团：三个 persona 并行读故事、给出真实反应（多 agent 对等评审）。

不共享上下文——每位读者独立判断，避免互相污染；结果并列呈现而非合并投票，
把"共鸣"从抽象概念变成用户能立刻看到的反馈。
"""

import asyncio
import logging

from .. import llm
from . import prompts

logger = logging.getLogger(__name__)

READERS = [
    {
        "id": "worker",
        "name": "阿澈",
        "desc": "27 岁，在大城市上班的普通打工人，通勤地铁上刷手机，家在外地，一年回去两次。",
    },
    {
        "id": "parent",
        "name": "秀兰",
        "desc": "52 岁，孩子在外地工作的母亲，喜欢在手机上看别人讲家里的事，看完常常想起自己年轻的时候。",
    },
    {
        "id": "student",
        "name": "小鹿",
        "desc": "20 岁，大学生，爱看故事也爱写点东西，情感敏锐，但反感煽情和说教。",
    },
]


async def _one_reaction(reader: dict, story_md: str) -> dict:
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": prompts.load("reader_panel")},
                {
                    "role": "user",
                    "content": f"你的身份：{reader['desc']}\n\n故事：\n\n{story_md}",
                },
            ],
            json_mode=True,
        )
        data = llm.parse_json(raw)
        return {
            "reader": reader["name"],
            "desc": reader["desc"],
            "resonated": bool(data.get("resonated")),
            "line": str(data.get("line", ""))[:80],
        }
    except Exception:
        logger.exception("reader %s failed", reader["id"])
        return {"reader": reader["name"], "desc": reader["desc"], "resonated": False, "line": ""}


async def panel_reactions(story_md: str) -> list[dict]:
    results = await asyncio.gather(*(_one_reaction(r, story_md) for r in READERS))
    return [r for r in results if r["line"]]
