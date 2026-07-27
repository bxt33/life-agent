"""LLM 网关：OpenAI 兼容接口，base_url/api_key/model 三个环境变量切换供应商。

未配置 LLM_API_KEY 时进入 MOCK 模式：返回固定文本，让前后端闭环可以在无密钥时联调。
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator

from openai import AsyncOpenAI
from openai import APIStatusError

from .config import settings

logger = logging.getLogger(__name__)

# 503/502 等瞬时错误最多重试次数，退避间隔 1s / 2s / 4s
_MAX_RETRIES = 3
_RETRYABLE_CODES = {429, 500, 502, 503, 504}

_client: AsyncOpenAI | None = None


def client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
    return _client


MOCK_REPLY = "（MOCK 模式：未配置 LLM_API_KEY，这是联调用的固定回复。）刚才你说的那件事，能再多讲一点吗？"


async def stream_chat(messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
    """流式对话，逐段产出文本增量。503/502 时退避重试。"""
    if settings.mock_mode:
        for ch in MOCK_REPLY:
            await asyncio.sleep(0.01)
            yield ch
        return

    last_err: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            stream = await client().chat.completions.create(
                model=model or settings.llm_model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
            return
        except APIStatusError as e:
            if e.status_code in _RETRYABLE_CODES and attempt < _MAX_RETRIES - 1:
                wait = 2**attempt
                logger.warning("stream_chat got %s, retrying in %ss (attempt %d)", e.status_code, wait, attempt + 1)
                await asyncio.sleep(wait)
                last_err = e
            else:
                raise
    if last_err:
        raise last_err


async def chat(messages: list[dict], model: str | None = None, json_mode: bool = False) -> str:
    """非流式对话，用于抽取、审核、故事稿生成等内部调用。503/502 时退避重试。"""
    if settings.mock_mode:
        if json_mode:
            return "{}"
        return MOCK_REPLY

    kwargs: dict = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    last_err: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            resp = await client().chat.completions.create(
                model=model or settings.llm_model,
                messages=messages,
                **kwargs,
            )
            return resp.choices[0].message.content or ""
        except APIStatusError as e:
            if e.status_code in _RETRYABLE_CODES and attempt < _MAX_RETRIES - 1:
                wait = 2**attempt
                logger.warning("chat got %s, retrying in %ss (attempt %d)", e.status_code, wait, attempt + 1)
                await asyncio.sleep(wait)
                last_err = e
            else:
                raise
    raise last_err  # type: ignore[misc]


def parse_json(text: str) -> dict:
    """宽容地解析模型返回的 JSON（剥掉可能的 markdown 围栏）。"""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}
