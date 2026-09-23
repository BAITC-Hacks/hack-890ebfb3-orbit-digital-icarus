"""FastAPI application and explicit, testable startup configuration."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .catalog import dataset_sha256, load_catalog
from .matching import algorithm_version, load_evidence
from .settings import AppSettings
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
        title="Orbit Digital Contractor Matching",
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
    return application


app = create_app()
