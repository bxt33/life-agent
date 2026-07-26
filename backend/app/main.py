import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import memories, sessions, stories

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if settings.mock_mode:
        logging.getLogger(__name__).warning(
            "LLM_API_KEY 未配置，以 MOCK 模式运行（固定回复，仅供联调）"
        )
    yield


app = FastAPI(title="life-agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(stories.router)
app.include_router(memories.router)


@app.get("/api/health")
def health():
    return {"ok": True, "mock_mode": settings.mock_mode, "model": settings.llm_model}
