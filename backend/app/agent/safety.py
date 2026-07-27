"""危机检测：输入侧分层防御。

第一层：代码关键词规则（零成本、零延迟，Harness 层执行，不依赖提示词自觉）。
第二层：命中可疑信号时用 LLM 分类确认，降低误报（叙述别人经历、历史回顾、比喻）。
"""

import logging

from .. import llm
from . import prompts

logger = logging.getLogger(__name__)

CRISIS_KEYWORDS = [
    "自杀",
    "自残",
    "轻生",
    "不想活",
    "想死",
    "去死",
    "结束生命",
    "结束自己",
    "活不下去",
    "活着没意思",
    "活着没有意义",
    "伤害自己",
    "割腕",
    "跳楼",
    "安眠药",
]


def check_crisis(text: str) -> bool:
    """第一层：关键词快速扫描，零延迟。"""
    return any(kw in text for kw in CRISIS_KEYWORDS)


async def confirm_crisis_llm(text: str) -> bool:
    """第二层：LLM 分类确认，降低误报。

    仅在第一层命中后调用。返回 True 表示确认为真实危机信号。
    LLM 调用失败时保守处理：返回 True（宁可误报，不可漏报）。
    """
    try:
        system_prompt = prompts.load("crisis_confirm")
        raw = await llm.chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"用户说的话：{text}"},
            ],
            json_mode=True,
        )
        result = llm.parse_json(raw)
        is_crisis = result.get("is_crisis", True)
        reason = result.get("reason", "")
        logger.info("crisis llm confirm: is_crisis=%s reason=%s", is_crisis, reason)
        return bool(is_crisis)
    except Exception as exc:
        logger.warning("crisis llm confirm failed, defaulting to True: %s", exc)
        return True  # 失败时保守处理
