"""HTTP route definitions.

The route layer validates requests and serializes typed responses. It does not
contain filtering, ranking, or explanation rules.
"""

from fastapi import APIRouter, HTTPException, Request, status

from ..constants import CALENDAR_END, CALENDAR_START
from ..models import HealthResponse, MatchRequest, MatchResponse, MetadataResponse
from ..normalization import normalize_match_request


router = APIRouter(prefix="/api")


def _catalog(request: Request):
    return request.app.state.catalog


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    """Report readiness only after catalog validation has succeeded."""

    return HealthResponse(
        status="ready",
        profile_count=len(_catalog(request)),
        dataset_version=request.app.state.dataset_version,
        algorithm_version=request.app.state.algorithm_version,
    )


@router.get("/metadata", response_model=MetadataResponse)
def metadata(request: Request) -> MetadataResponse:
    """Return canonical values for form controls."""

    catalog = _catalog(request)
    return MetadataResponse(
        cities=sorted({contractor.city for contractor in catalog}),
        categories=sorted(
            {
                category
                for contractor in catalog
                for category in contractor.categories
            }
        ),
        event_formats=sorted(
            {
                event_format
                for contractor in catalog
                for event_format in contractor.event_formats
            }
        ),
        languages=sorted(
            {
                language
                for contractor in catalog
                for language in contractor.languages
            }
        ),
        calendar_start=CALENDAR_START,
        calendar_end=CALENDAR_END,
    )


@router.post(
    "/match",
    response_model=MatchResponse,
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Matching implementation is not ready yet."
        }
    },
)
def match_stub(request_body: MatchRequest, request: Request) -> MatchResponse:
    """Validate the final request shape until B2 filtering is implemented."""

    try:
        normalize_match_request(request_body, _catalog(request))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "unsupported_catalog_value",
                "message": str(error),
            },
        ) from error

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "matching_not_ready",
            "message": "Matching is not implemented yet. Complete B2 filtering first.",
        },
    )
