"""FastAPI application entrypoint.

Run the service from the repository root with:

    uvicorn backend.app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .catalog import CatalogValidationError, dataset_sha256, load_catalog
from .matching import algorithm_version, load_evidence
from .settings import DEFAULT_ALGORITHM_VERSION, AppSettings


def create_app(settings: AppSettings | None = None) -> FastAPI:
    """Create the API with explicit, testable startup configuration."""

    resolved_settings = settings or AppSettings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Load the entire catalog before accepting API traffic."""

        try:
            catalog = load_catalog(resolved_settings.data_path)
            dataset_version = dataset_sha256(resolved_settings.data_path)
            evidence = load_evidence(catalog, dataset_sha256=dataset_version)
        except (CatalogValidationError, OSError, ValueError) as error:
            raise RuntimeError(
                f"Catalog startup validation failed (catalog/evidence): {error}"
            ) from error

        app.state.catalog = catalog
        app.state.dataset_version = dataset_version
        app.state.evidence = evidence
        app.state.algorithm_version = (
            algorithm_version()
            if resolved_settings.algorithm_version == DEFAULT_ALGORITHM_VERSION
            else resolved_settings.algorithm_version
        )
        yield

    application = FastAPI(
        title="Orbit Digital Contractor Matching",
        version="0.1.0",
        description="Explainable event-contractor recommendations.",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        max_age=600,
    )
    application.include_router(router)
    return application


app = create_app()
