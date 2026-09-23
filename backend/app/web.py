"""Serve the built interface and existing API together for the one-command demo."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .main import create_app
from .settings import AppSettings, PROJECT_ROOT


def create_web_app(dist_path: Path | None = None, settings: AppSettings | None = None) -> FastAPI:
    """Only expose built public files; API routes retain their validation and startup checks."""
    directory = dist_path if dist_path is not None else PROJECT_ROOT / "frontend" / "dist"
    if not (directory / "index.html").is_file():
        raise RuntimeError("The website is not built yet. Run python start.py or double-click Start Tandau.cmd.")
    application = create_app(settings)
    # Mount last: /api and /docs remain real backend routes, never an HTML fallback.
    # Hash-based navigation needs only index.html; unknown files/API paths remain 404.
    application.mount("/", StaticFiles(directory=directory, html=True), name="website")
    return application
