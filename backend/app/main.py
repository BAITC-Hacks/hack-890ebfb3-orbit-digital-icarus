"""FastAPI application entrypoint.

Run the service from the repository root with:

    uvicorn backend.app.main:app --reload
"""

from contextlib import asynccontextmanager
from os import getenv
from pathlib import Path

from fastapi import FastAPI

from .api.routes import router
from .catalog import DEFAULT_DATA_PATH, dataset_sha256, load_catalog
from .matching import algorithm_version, load_evidence


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the entire catalog before accepting API traffic."""

    try:
        data_path = Path(getenv("DATA_PATH", str(DEFAULT_DATA_PATH)))
        if not data_path.is_absolute():
            data_path = DEFAULT_DATA_PATH.parent.parent / data_path
        catalog = load_catalog(data_path)
        dataset_version = dataset_sha256(data_path)
        evidence = load_evidence(catalog, dataset_sha256=dataset_version)
    except (ValueError, OSError) as error:
        raise RuntimeError(f"Catalog/evidence startup validation failed: {error}") from error

    app.state.catalog = catalog
    app.state.dataset_version = dataset_version
    app.state.evidence = evidence
    app.state.algorithm_version = algorithm_version()
    yield


app = FastAPI(
    title="Orbit Digital Contractor Matching",
    version="0.1.0",
    description="Explainable event-contractor recommendations.",
    lifespan=lifespan,
)

app.include_router(router)
