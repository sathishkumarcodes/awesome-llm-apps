"""Application settings, loaded from environment variables / .env."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"
    ollama_timeout_seconds: float = 300.0
    # Qwen3 and other reasoning models can emit long "thinking" output; off by default for speed.
    ollama_think: bool = False
    ollama_num_ctx: int = 8192
    # Concurrent requests sent to a local model (1 = sequential; laptops rarely benefit from more).
    ollama_parallel: int = 1
    llm_max_retries: int = 2

    # Hosted providers (optional). Selecting one in the UI sends resume/job text to that
    # provider. The Anthropic SDK also picks up an `ant auth login` profile when this is empty.
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    cloud_timeout_seconds: float = 120.0
    # Reasoning effort for hosted models: lower is faster.
    cloud_effort: str = "low"

    # Embeddings (Layer 2 semantic matching)
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Storage
    data_dir: Path = BACKEND_DIR / "var"
    database_url: str = ""
    max_upload_mb: int = 10

    # CORS for the Vite dev server
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def export_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def resolved_database_url(self) -> str:
        return self.database_url or f"sqlite:///{self.data_dir / 'jobmatchai.db'}"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.export_dir.mkdir(parents=True, exist_ok=True)
    return settings
