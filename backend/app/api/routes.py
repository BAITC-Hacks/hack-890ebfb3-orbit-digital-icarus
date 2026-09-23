"""HTTP route definitions.

The route layer validates requests and serializes typed responses. It does not
contain filtering, ranking, or explanation rules.
"""

from fastapi import APIRouter, HTTPException, Request, status

from ..constants import CALENDAR_END, CALENDAR_START
from ..filtering import filter_candidates
from ..matching import build_cards, rank_candidates
from ..models import (
    CatalogProfile,
    CatalogResponse,
    CountSummary,
    HealthResponse,
    MatchRequest,
    MatchResponse,
    MetadataResponse,
)
from ..normalization import normalize_match_request
from ..recovery import suggest_alternatives


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


@router.get("/catalog", response_model=CatalogResponse)
def catalog(request: Request) -> CatalogResponse:
    """Browse source profiles by stable ID; no accounts or availability are implied."""

    return CatalogResponse(
        dataset_version=request.app.state.dataset_version,
        calendar_start=CALENDAR_START,
        calendar_end=CALENDAR_END,
        profiles=[
            CatalogProfile.model_validate(profile, from_attributes=True)
            for profile in sorted(_catalog(request), key=lambda profile: profile.id)
        ],
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
        alternatives=suggest_alternatives(request_body, _catalog(request)),
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


@router.post("/match", response_model=MatchResponse)
def match(request_body: MatchRequest, request: Request) -> MatchResponse:
    """Validate, filter, rank and render from the same versioned catalog."""

    try:
        normalized_request = normalize_match_request(request_body, _catalog(request))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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

    evidence = request.app.state.evidence
    ranked = rank_candidates(normalized_request, filtered.eligible, evidence)
    cards = build_cards(normalized_request, ranked, evidence)
    return MatchResponse(
        status="matches_found",
        request=normalized_request,
        dataset_version=request.app.state.dataset_version,
        algorithm_version=request.app.state.algorithm_version,
        message=(
            f"Подходит {len(filtered.eligible)} из {filtered.city_category_total} "
            f"профилей категории; показано {len(cards)}."
        ),
        counts=CountSummary(
            city_category_total=filtered.city_category_total,
            eligible_total=len(filtered.eligible),
            returned_total=len(cards),
        ),
        exclusions=filtered.exclusions,
        cards=cards,
    )
