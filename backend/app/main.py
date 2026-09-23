"""FastAPI application and explicit, testable startup configuration."""

from contextlib import asynccontextmanager
from os import getenv
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .catalog import dataset_sha256, load_catalog
from .community.api import create_community_app
from .matching import algorithm_version, load_evidence
from .insights import create_insights_app
from .settings import AppSettings, PROJECT_ROOT
from .validation_errors import request_validation_exception_handler


def create_app(settings: AppSettings | None = None) -> FastAPI:
    """Build the API and validate its catalog and evidence before readiness."""

    resolved_settings = settings or AppSettings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Load the entire catalog before accepting API traffic."""

        try:
            catalog = load_catalog(resolved_settings.data_path)
            dataset_version = dataset_sha256(resolved_settings.data_path)
            evidence = load_evidence(catalog, dataset_sha256=dataset_version)
            version = algorithm_version()
        except (ValueError, OSError) as error:
            raise RuntimeError(
                f"Catalog/evidence startup validation failed: {error}"
            ) from error

        app.state.catalog = catalog
        app.state.dataset_version = dataset_version
        app.state.evidence = evidence
        app.state.algorithm_version = version
        yield

    application = FastAPI(
        title="Tandau Contractor Matching",
        version="0.1.0",
        description="Explainable event-contractor recommendations.",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        max_age=600,
    )
    application.include_router(router)
    application.mount("/api/insights", create_insights_app(application))
    # Optional accounts/listings/chat have their own schema and SQLite state; the
    # authoritative supplied-catalog API remains anonymous and byte-for-byte data stable.
    community_path = Path(getenv("COMMUNITY_DB_PATH", str(PROJECT_ROOT / ".orbit" / "community.sqlite3")))
    if not community_path.is_absolute():
        community_path = PROJECT_ROOT / community_path
    application.mount("/api/community", create_community_app(community_path, resolved_settings.cors_origins))
    return application


app = create_app()
