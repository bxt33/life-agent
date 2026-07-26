import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import llm
from ..agent import interviewer, safety
from ..agent.state import InterviewState
from ..db import engine
from ..models import InterviewSession, Message

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class MessageIn(BaseModel):
    text: str


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("")
def create_session():
    with Session(engine) as db:
        session = InterviewSession()
        db.add(session)
        db.commit()
        db.refresh(session)
        return {"id": session.id, "stage": session.stage}


@router.get("/{session_id}/messages")
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


@router.post("/{session_id}/messages")
async def post_message(session_id: int, body: MessageIn):
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "empty message")

    with Session(engine) as db:
        session = db.get(InterviewSession, session_id)
        if not session:
            raise HTTPException(404, "session not found")
        state = InterviewState.loads(session.state_json)
        db.add(Message(session_id=session_id, role="user", text=text))
        db.commit()

    async def stream():
        # 危机检测在 Harness 层前置执行（不依赖提示词自觉）
        if safety.check_crisis(text):
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

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
