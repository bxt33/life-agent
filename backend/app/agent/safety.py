"""危机检测：输入侧分层防御。

第一层：代码关键词规则（零成本、零延迟，Harness 层执行，不依赖提示词自觉）。
第二层（后续）：命中可疑信号时用 LLM 分类确认，降低误报。
"""

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
    return any(kw in text for kw in CRISIS_KEYWORDS)
