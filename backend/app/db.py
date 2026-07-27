from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from .config import DATA_DIR, settings

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

# 对已存在的表补新增列（SQLite create_all 不会 ALTER）。MVP 级轻量迁移。
_MIGRATIONS = [
    ("story", "reactions_json", "TEXT DEFAULT ''"),
    ("interviewsession", "title", "TEXT DEFAULT ''"),
    ("story", "title", "TEXT DEFAULT ''"),
]


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.connect() as conn:
        for table, column, ddl in _MIGRATIONS:
            cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")]
            if cols and column not in cols:
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                conn.commit()


def get_db():
    with Session(engine) as session:
        yield session
