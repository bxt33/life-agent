"""本地 ASR（faster-whisper 级联管线）。

选本地而非云端的原因与日志脱敏同理：讲述的内容可能高度敏感，音频不出机器。
模型懒加载单例；转写在线程池执行避免阻塞事件循环。
"""

import asyncio
import logging
import os
from functools import lru_cache

from ..config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _model():
    os.environ.setdefault("HF_ENDPOINT", settings.hf_endpoint)
    from faster_whisper import WhisperModel

    logger.info("loading whisper model %s (%s)", settings.asr_model, settings.asr_device)
    return WhisperModel(settings.asr_model, device=settings.asr_device, compute_type="int8")


def _transcribe_sync(audio_path: str) -> str:
    segments, _info = _model().transcribe(
        audio_path,
        language="zh",
        vad_filter=True,
        initial_prompt="以下是一段普通话口语讲述，可能有停顿和口头语。",
    )
    return "".join(seg.text for seg in segments).strip()


async def transcribe(audio_path: str) -> str:
    return await asyncio.to_thread(_transcribe_sync, audio_path)
