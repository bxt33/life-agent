from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InterviewSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    status: str = "active"  # active / done
    stage: str = "warmup"  # warmup / explore / deepen / emotion / wrapup / done
    state_json: str = "{}"  # 业务状态：状态栏字段的持久化，见 agent/state.py
    summary: str = ""
    title: str = ""  # 会话标题（卡牌名 或 随便聊聊），侧边栏展示用
    created_at: datetime = Field(default_factory=utcnow)


class Message(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="interviewsession.id")
    role: str  # user / assistant
    text: str
    audio_path: str = ""  # 原始音频落盘路径，P2 视频剪辑的素材
    created_at: datetime = Field(default_factory=utcnow)


class Story(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="interviewsession.id")
    draft_md: str = ""
    final_md: str = ""
    status: str = "draft"  # draft / confirmed / published
    review_notes: str = ""  # grounding 校验记录，便于观察 reviewer 拦下了什么
    reactions_json: str = ""  # 读者评审团的反应（多 agent 共鸣反馈）
    created_at: datetime = Field(default_factory=utcnow)


class UserMemory(SQLModel, table=True):
    """跨会话的用户长期记忆（Enhanced Notes 级别）。用户可查看、可删除。"""

    id: int | None = Field(default=None, primary_key=True)
    text: str
    source_session_id: int = Field(foreign_key="interviewsession.id")
    created_at: datetime = Field(default_factory=utcnow)
