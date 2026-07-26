from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
PROMPTS_DIR = REPO_ROOT / "prompts"
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = ""
    llm_model: str = "deepseek-chat"
    story_model: str = ""
    database_url: str = "sqlite:///data/app.db"

    @property
    def mock_mode(self) -> bool:
        return not self.llm_api_key

    @property
    def story_model_resolved(self) -> str:
        return self.story_model or self.llm_model


settings = Settings()
