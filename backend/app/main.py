"""FastAPI application entrypoint.

Run the service from the repository root with:

    uvicorn backend.app.main:app --reload
"""

from contextlib import asynccontextmanager
from os import getenv

from fastapi import FastAPI

from .api.routes import router
from .catalog import CatalogValidationError, dataset_sha256, load_catalog


DEFAULT_ALGORITHM_VERSION = "hard-filter-v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the entire catalog before accepting API traffic."""

    try:
        catalog = load_catalog()
    except CatalogValidationError as error:
        raise RuntimeError(f"Catalog startup validation failed: {error}") from error

    app.state.catalog = catalog
    app.state.dataset_version = dataset_sha256()
    app.state.algorithm_version = getenv(
        "ALGORITHM_VERSION",
        DEFAULT_ALGORITHM_VERSION,
    )
    yield


app = FastAPI(
    title="Orbit Digital Contractor Matching",
    version="0.1.0",
    description="Explainable event-contractor recommendations.",
    lifespan=lifespan,
)

app.include_router(router)
