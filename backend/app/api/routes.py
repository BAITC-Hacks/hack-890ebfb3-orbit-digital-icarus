"""HTTP route definitions.

The route layer validates requests and serializes typed responses. It does not
contain filtering, ranking, or explanation rules.
"""

from fastapi import APIRouter, HTTPException, Request, status

from ..constants import CALENDAR_END, CALENDAR_START
from ..filtering import filter_candidates
from ..models import (
    CountSummary,
    HealthResponse,
    MatchRequest,
    MatchResponse,
    MetadataResponse,
)
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


def _empty_response(
    request_body: MatchRequest,
    *,
    status_value: str,
    message: str,
    city_category_total: int,
    exclusions,
    request: Request,
) -> MatchResponse:
    return MatchResponse(
        status=status_value,
        request=request_body,
        dataset_version=request.app.state.dataset_version,
        algorithm_version=request.app.state.algorithm_version,
        message=message,
        counts=CountSummary(
            city_category_total=city_category_total,
            eligible_total=0,
            returned_total=0,
        ),
        exclusions=exclusions,
        cards=[],
    )


def _no_eligible_message(request_body: MatchRequest, exclusions) -> str:
    labels = (
        ("booked", "заняты на дату"),
        ("over_budget", "выше бюджета"),
        ("unsupported_format", "не берут этот формат"),
        ("unsupported_language", "не работают на выбранном языке"),
        ("duration_exceeded", "не подходят по длительности"),
    )
    reasons = [
        f"{label} — {getattr(exclusions, field)}"
        for field, label in labels
        if getattr(exclusions, field)
    ]
    return (
        f"В категории «{request_body.category}» в городе {request_body.city} "
        f"есть {sum(getattr(exclusions, field) for field, _ in labels)} проф., "
        f"но никто не проходит условия: {'; '.join(reasons)}."
    )


@router.post(
    "/match",
    response_model=MatchResponse,
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Ranking and card construction are not integrated yet."
        }
    },
)
def match(request_body: MatchRequest, request: Request) -> MatchResponse:
    """Validate, normalize, and hard-filter a matching request.

    B2 returns complete business-empty states. Matching candidates require the
    ranking and grounded-card implementation owned by Enjoy, so this path
    remains an explicit 503 until that handoff is integrated.
    """

    try:
        normalized_request = normalize_match_request(request_body, _catalog(request))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "unsupported_catalog_value",
                "message": str(error),
            },
        ) from error

    filtered = filter_candidates(normalized_request, _catalog(request))
    if filtered.city_category_total == 0:
        return _empty_response(
            normalized_request,
            status_value="category_absent",
            message=(
                f"В предоставленном каталоге нет подрядчиков категории "
                f"«{normalized_request.category}» в городе "
                f"{normalized_request.city}."
            ),
            city_category_total=0,
            exclusions=filtered.exclusions,
            request=request,
        )
    if not filtered.eligible:
        return _empty_response(
            normalized_request,
            status_value="no_eligible_contractors",
            message=_no_eligible_message(normalized_request, filtered.exclusions),
            city_category_total=filtered.city_category_total,
            exclusions=filtered.exclusions,
            request=request,
        )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "ranking_not_integrated",
            "message": (
                f"Found {len(filtered.eligible)} eligible candidates, but ranking "
                "and grounded card construction are not integrated yet."
            ),
            "counts": {
                "city_category_total": filtered.city_category_total,
                "eligible_total": len(filtered.eligible),
            },
            "exclusions": filtered.exclusions.model_dump(),
        },
    )
