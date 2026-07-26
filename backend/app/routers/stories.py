from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..agent import story as story_agent
from ..db import engine
from ..models import InterviewSession, Message, Story

router = APIRouter(prefix="/api", tags=["stories"])


class StoryPatch(BaseModel):
    final_md: str | None = None
    status: str | None = None  # draft / confirmed / published


def _story_out(story: Story) -> dict:
    return {
        "id": story.id,
        "session_id": story.session_id,
        "draft_md": story.draft_md,
        "final_md": story.final_md,
        "status": story.status,
        "created_at": story.created_at.isoformat(),
    }


@router.post("/sessions/{session_id}/story")
async def generate_story(session_id: int):
    with Session(engine) as db:
        if not db.get(InterviewSession, session_id):
            raise HTTPException(404, "session not found")
        history = db.exec(
            select(Message).where(Message.session_id == session_id).order_by(Message.id)
        ).all()
    if sum(1 for m in history if m.role == "user") < 3:
        raise HTTPException(422, "访谈内容还太少，多聊几轮再生成故事稿")

    try:
        draft, review_notes = await story_agent.generate_story(history)
    except Exception as exc:
        raise HTTPException(502, f"故事稿生成失败（模型服务异常）：{exc}") from exc

    with Session(engine) as db:
        story = Story(session_id=session_id, draft_md=draft, review_notes=review_notes)
        db.add(story)
        db.commit()
        db.refresh(story)
        return _story_out(story)


@router.get("/stories")
def list_stories():
    with Session(engine) as db:
        stories = db.exec(select(Story).order_by(Story.id.desc())).all()
        return [_story_out(s) for s in stories]


@router.patch("/stories/{story_id}")
def update_story(story_id: int, body: StoryPatch):
    with Session(engine) as db:
        story = db.get(Story, story_id)
        if not story:
            raise HTTPException(404, "story not found")
        if body.final_md is not None:
            story.final_md = body.final_md
        if body.status is not None:
            if body.status not in ("draft", "confirmed", "published"):
                raise HTTPException(422, "invalid status")
            story.status = body.status
        db.add(story)
        db.commit()
        db.refresh(story)
        return _story_out(story)
