import json
import time

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import llm
from ..agent import asr, cards, interviewer, safety
from ..agent.state import InterviewState
from ..config import DATA_DIR
from ..db import engine
from ..models import InterviewSession, Message

router = APIRouter(prefix="/api", tags=["sessions"])

AUDIO_DIR = DATA_DIR / "audio"


class SessionIn(BaseModel):
    card_id: str | None = None


class MessageIn(BaseModel):
    text: str
    audio_path: str = ""  # 语音输入时关联原声文件（P2 视频素材）


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/cards")
def list_cards():
    return [
        {"id": c["id"], "icon": c["icon"], "title": c["title"], "hint": c["hint"]}
        for c in cards.CARDS
    ]


@router.post("/sessions")
def create_session(body: SessionIn | None = None):
    card = cards.get_card(body.card_id) if body and body.card_id else None
    opening = card["opening"] if card else cards.FREE_OPENING
    title = card["title"] if card else "随便聊聊"
    with Session(engine) as db:
        session = InterviewSession(title=title)
        db.add(session)
        db.commit()
        db.refresh(session)
        # 开场白入库：轨迹完整（模型下轮能看到自己的开场），刷新/续聊不丢
        db.add(Message(session_id=session.id, role="assistant", text=opening))
        db.commit()
        return {"id": session.id, "stage": session.stage, "opening": opening}


@router.get("/sessions")
def list_sessions():
    with Session(engine) as db:
        sessions = db.exec(
            select(InterviewSession).order_by(InterviewSession.id.desc())
        ).all()
        out = []
        for s in sessions:
            has_user_msg = db.exec(
                select(Message)
                .where(Message.session_id == s.id, Message.role == "user")
                .limit(1)
            ).first()
            if not has_user_msg:
                continue  # 一句话没说过的空会话不展示
            out.append(
                {
                    "id": s.id,
                    "stage": s.stage,
                    "title": s.title or "访谈",
                    "created_at": s.created_at.isoformat(),
                }
            )
        return out


@router.get("/sessions/{session_id}/messages")
def list_messages(session_id: int):
    with Session(engine) as db:
        session = db.get(InterviewSession, session_id)
        if not session:
            raise HTTPException(404, "session not found")
        messages = db.exec(
            select(Message).where(Message.session_id == session_id).order_by(Message.id)
        ).all()
        return {
            "stage": session.stage,
            "messages": [{"id": m.id, "role": m.role, "text": m.text} for m in messages],
        }


@router.post("/sessions/{session_id}/transcribe")
async def transcribe_audio(session_id: int, file: UploadFile):
    """语音转写：原始音频落盘（视频素材，不能丢），返回文本供发送。"""
    with Session(engine) as db:
        if not db.get(InterviewSession, session_id):
            raise HTTPException(404, "session not found")

    session_dir = AUDIO_DIR / str(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    suffix = (file.filename or "audio.webm").rsplit(".", 1)[-1]
    audio_path = session_dir / f"{int(time.time() * 1000)}.{suffix}"
    audio_path.write_bytes(await file.read())

    try:
        text = await asr.transcribe(str(audio_path))
    except Exception as exc:
        raise HTTPException(502, f"语音转写失败：{exc}") from exc
    if not text:
        raise HTTPException(422, "没有听清，再试一次？")
    return {"text": text, "audio_path": str(audio_path.relative_to(DATA_DIR))}


@router.post("/sessions/{session_id}/messages")
async def post_message(session_id: int, body: MessageIn):
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "empty message")

    with Session(engine) as db:
        session = db.get(InterviewSession, session_id)
        if not session:
            raise HTTPException(404, "session not found")
        state = InterviewState.loads(session.state_json)
        db.add(
            Message(
                session_id=session_id, role="user", text=text, audio_path=body.audio_path
            )
        )
        db.commit()

    async def stream():
        # 危机检测：第一层关键词快速扫描，命中后第二层 LLM 确认降低误报
        if safety.check_crisis(text):
            is_real_crisis = await safety.confirm_crisis_llm(text)
            if is_real_crisis:
                state.safety_flag = True
                yield _sse({"type": "safety"})

        # 状态抽取（LLM 逐条抽取、代码汇总），失败不阻塞对话
        extraction = await interviewer.extract_state_update(text)
        state.on_user_message(extraction)

        with Session(engine) as db:
            history = db.exec(
                select(Message).where(Message.session_id == session_id).order_by(Message.id)
            ).all()

        messages = interviewer.build_messages(state, history)
        reply_parts: list[str] = []
        try:
            async for delta in llm.stream_chat(messages):
                reply_parts.append(delta)
                yield _sse({"type": "delta", "text": delta})
        except Exception as exc:  # 把失败交回上下文，前端提示重试
            yield _sse({"type": "error", "message": f"模型调用失败：{exc}"})
        finally:
            # 客户端中途断连也会走到这里：已生成的部分回复和状态必须落库，
            # 否则轨迹断链、状态机停摆（Harness 的"纠正"层职责）
            reply = "".join(reply_parts)
            with Session(engine) as db:
                if reply:
                    db.add(Message(session_id=session_id, role="assistant", text=reply))
                session = db.get(InterviewSession, session_id)
                session.stage = state.stage
                session.state_json = state.dumps()
                db.add(session)
                db.commit()

        yield _sse({"type": "done", "stage": state.stage, "turns": state.turns})

        # 快捷回应：降低下一轮的表达门槛（放在 done 之后，不拖慢正文显示）
        if reply:
            history_after = history + [
                Message(session_id=session_id, role="assistant", text=reply)
            ]
            suggestions = await interviewer.suggest_replies(history_after)
            if suggestions:
                yield _sse({"type": "suggestions", "items": suggestions})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
