"""故事稿生成：proposer-reviewer 模式。

由校验决定完成，而不是生成者的自我感觉：生成 → 对照访谈原文核查编造细节 →
有违规则带着审核意见重写一次。防编造是"被懂"信任的底线。
"""

import json
import logging

from .. import llm
from ..config import settings
from ..models import Message
from . import prompts

logger = logging.getLogger(__name__)

MAX_REVISIONS = 1


def _transcript(history: list[Message]) -> str:
    lines = []
    for msg in history:
        speaker = "受访者" if msg.role == "user" else "采访者"
        lines.append(f"{speaker}：{msg.text}")
    return "\n".join(lines)


async def _propose(transcript: str, feedback: str = "") -> str:
    user_content = f"访谈记录：\n\n{transcript}"
    if feedback:
        user_content += f"\n\n上一稿被事实核查打回，问题如下，请修正后重写：\n{feedback}"
    return await llm.chat(
        [
            {"role": "system", "content": prompts.load("story_arc")},
            {"role": "user", "content": user_content},
        ],
        model=settings.story_model_resolved,
    )


async def _review(transcript: str, draft: str) -> dict:
    raw = await llm.chat(
        [
            {"role": "system", "content": prompts.load("story_review")},
            {
                "role": "user",
                "content": f"访谈记录：\n\n{transcript}\n\n---\n\n故事稿：\n\n{draft}",
            },
        ],
        json_mode=True,
    )
    result = llm.parse_json(raw)
    if "pass" not in result:
        # 审核器输出异常时放行但留痕，不阻塞用户拿到故事稿
        return {"pass": True, "violations": [], "review_error": True}
    return result


async def generate_story(history: list[Message]) -> tuple[str, str]:
    """返回 (故事稿, 审核记录 JSON 字符串)。"""
    transcript = _transcript(history)
    review_log: list[dict] = []

    draft = await _propose(transcript)
    for _ in range(MAX_REVISIONS + 1):
        review = await _review(transcript, draft)
        review_log.append(review)
        if review.get("pass"):
            break
        feedback = "\n".join(
            f"- “{v.get('quote', '')}”：{v.get('reason', '')}"
            for v in review.get("violations", [])
        )
        logger.info("story draft rejected by reviewer, revising: %s", feedback)
        draft = await _propose(transcript, feedback)

    return draft, json.dumps(review_log, ensure_ascii=False)
