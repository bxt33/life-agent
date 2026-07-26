from functools import lru_cache

from ..config import PROMPTS_DIR


@lru_cache(maxsize=None)
def load(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def interviewer_system_prompt() -> str:
    # 系统提示词 = 人格 + 追细节策略，静态拼接（KV Cache 友好：确定后不变）
    return load("interviewer") + "\n\n---\n\n" + load("probe_strategies")
