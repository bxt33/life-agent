"""访谈 Agent 编排：构建上下文（KV Cache 友好） + 状态抽取。

上下文结构：[静态系统提示词] → [轨迹] → [<agent_status> 状态栏(末尾)]
状态抽取：只看最新一条用户消息（LLM 逐条抽取、代码汇总），失败不阻塞对话。
"""

import logging

from .. import llm
from ..config import settings
from ..models import Message
from . import prompts
from .state import InterviewState

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """你是访谈助手的信息抽取器。分析下面这条受访者的最新发言，输出 JSON：

{
  "leads": ["新出现的故事线索，如'辞职那天'、'母亲的电话'，没有则空数组"],
  "detail_hits": ["本条发言命中的细节类型，取值仅限：原话、具象、第一反应；没有则空数组"],
  "emotion_signals": ["情绪信号，如'提到后悔'、'语气犹豫'，没有则空数组"]
}

判定标准：
- 原话：转述了某人说过的具体的话（引语）
- 具象：给出了具体的场景/物件/动作/时间地点
- 第一反应：描述了当时即刻的念头或本能反应
只输出 JSON。"""


def build_messages(state: InterviewState, history: list[Message]) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": prompts.interviewer_system_prompt()}]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.text})
    # 状态栏：每轮替换、尾部追加（借用 user 槽位的系统元信息）
    status = state.render_status()
    if state.safety_flag:
        status += "\n\n" + prompts.load("safety")
    messages.append({"role": "user", "content": status})
    return messages


async def extract_state_update(user_text: str) -> dict:
    """对最新用户消息做轻量抽取；失败返回空更新，不阻塞对话主流程。"""
    if settings.mock_mode:
        return {}
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": EXTRACT_PROMPT},
                {"role": "user", "content": user_text},
            ],
            json_mode=True,
        )
        return llm.parse_json(raw)
    except Exception:
        logger.exception("state extraction failed")
        return {}
