"""Explicit runtime configuration for the local backend."""

from dataclasses import dataclass
from os import getenv
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_PATH = PROJECT_ROOT / "data" / "contractors.csv"
DEFAULT_ALGORITHM_VERSION = "hard-filter-v1"
DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
)


def _resolve_data_path(value: str | None) -> Path:
    if value is None or not value.strip():
        return DEFAULT_DATA_PATH
    candidate = Path(value.strip())
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


def _parse_cors_origins(value: str | None) -> tuple[str, ...]:
    if value is None or not value.strip():
        return DEFAULT_CORS_ORIGINS

    origins = tuple(origin.strip().rstrip("/") for origin in value.split(",") if origin.strip())
    if not origins:
        raise ValueError("CORS_ORIGINS must contain at least one origin")
    if "*" in origins:
        raise ValueError("CORS_ORIGINS must name explicit origins; '*' is not allowed")
    return origins


@dataclass(frozen=True)
class AppSettings:
    """Configuration resolved once at application creation time."""

    data_path: Path
    algorithm_version: str
    cors_origins: tuple[str, ...]

    @classmethod
    def from_environment(cls) -> "AppSettings":
        algorithm_version = getenv("ALGORITHM_VERSION", DEFAULT_ALGORITHM_VERSION).strip()
        if not algorithm_version:
            raise ValueError("ALGORITHM_VERSION must not be blank")
        return cls(
            data_path=_resolve_data_path(getenv("DATA_PATH")),
            algorithm_version=algorithm_version,
            cors_origins=_parse_cors_origins(getenv("CORS_ORIGINS")),
        )
