"""FastAPI application entrypoint.

Endpoints and startup catalog loading are added in the B1/B2 milestones.
Run the eventual service from the repository root with:

    uvicorn backend.app.main:app --reload
"""

from fastapi import FastAPI


app = FastAPI(
    title="Orbit Digital Contractor Matching",
    version="0.1.0",
    description="Explainable event-contractor recommendations.",
)
