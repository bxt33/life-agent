from fastapi import APIRouter, HTTPException
from sqlmodel import Session, select

from ..db import engine
from ..models import UserMemory

router = APIRouter(prefix="/api/memories", tags=["memories"])


@router.get("")
def list_memories():
    with Session(engine) as db:
        memories = db.exec(select(UserMemory).order_by(UserMemory.id.desc())).all()
        return [
            {"id": m.id, "text": m.text, "created_at": m.created_at.isoformat()}
            for m in memories
        ]


@router.delete("/{memory_id}")
def delete_memory(memory_id: int):
    """用户对自己的记忆有完全的删除权——隐私底线，不做软删除。"""
    with Session(engine) as db:
        memory = db.get(UserMemory, memory_id)
        if not memory:
            raise HTTPException(404, "memory not found")
        db.delete(memory)
        db.commit()
        return {"ok": True}
