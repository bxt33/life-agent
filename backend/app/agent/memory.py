"""用户长期记忆：跨会话记得讲述者（Enhanced Notes 级别）。

只在故事稿生成成功后抽取（此时轨迹最完整）；抽取时把已有记忆给到模型做显式对账
（Mem0 的"提取-对比"思想的极简版），避免重复条目。用户可查看、可删除——隐私底线。
"""

import logging

from sqlmodel import Session, select

from .. import llm
from ..db import engine
from ..models import Message, UserMemory
from . import prompts

logger = logging.getLogger(__name__)

MAX_INJECT = 8


def load_memories() -> list[UserMemory]:
    with Session(engine) as db:
        return list(db.exec(select(UserMemory).order_by(UserMemory.id.desc())).all())


def render_for_interviewer() -> str:
    """注入访谈状态消息的记忆块；无记忆时返回空串。"""
    memories = load_memories()[:MAX_INJECT]
    if not memories:
        return ""
    lines = "\n".join(f"- {m.text}" for m in memories)
    return (
        "\n<known_about_speaker>\n"
        "你此前访谈中对这位讲述者已有的了解（自然地体现你记得，切勿逐条背诵；"
        "涉及伤痛话题时更温和）：\n" + lines + "\n</known_about_speaker>"
    )


async def extract_and_store(session_id: int, history: list[Message]) -> list[str]:
    """从访谈轨迹抽取稳定事实入库。失败静默——记忆是增益，不阻塞主流程。"""
    transcript = "\n".join(
        f"{'讲述者' if m.role == 'user' else '采访者'}：{m.text}" for m in history
    )
    existing = "\n".join(f"- {m.text}" for m in load_memories()) or "（暂无）"
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": prompts.load("memory_extract")},
                {
                    "role": "user",
                    "content": f"已有记忆：\n{existing}\n\n本次访谈记录：\n\n{transcript}",
                },
            ],
            json_mode=True,
        )
        items = [
            str(t).strip()
            for t in llm.parse_json(raw).get("memories", [])
            if str(t).strip()
        ][:3]
    except Exception:
        logger.exception("memory extraction failed")
        return []

    if items:
        with Session(engine) as db:
            for text in items:
                db.add(UserMemory(text=text, source_session_id=session_id))
            db.commit()
    return items
