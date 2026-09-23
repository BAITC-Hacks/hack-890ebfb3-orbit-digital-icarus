"""Read-only date comparison using the exact same catalog/filter/ranking pipeline."""

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict

from .filtering import filter_candidates
from .matching import build_cards, rank_candidates
from .models import MatchRequest
from .normalization import normalize_match_request
from .validation_errors import request_validation_exception_handler


class DateComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    previous: MatchRequest
    current: MatchRequest


def create_insights_app(parent: FastAPI) -> FastAPI:
    app = FastAPI(title="Tandau matching insights", version="1.0.0")
    # Mounted apps do not inherit the parent's handlers; preserve JSON-safe errors.
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)

    @app.post("/dates")
    def compare_dates(body: DateComparison):
        catalog, evidence = parent.state.catalog, parent.state.evidence
        try:
            previous = normalize_match_request(body.previous, catalog)
            current = normalize_match_request(body.current, catalog)
        except ValueError as error:
            raise HTTPException(422, detail={"code": "unsupported_catalog_value"}) from error
        if previous.model_dump(exclude={"event_date"}) != current.model_dump(exclude={"event_date"}):
            raise HTTPException(422, detail={"code": "change_date_only"})

        def shortlist(request):
            eligible = filter_candidates(request, catalog).eligible
            return build_cards(request, rank_candidates(request, eligible, evidence), evidence)

        before, after = shortlist(previous), shortlist(current)
        before_ids, after_ids = {card["id"] for card in before}, {card["id"] for card in after}
        profiles = {profile.id: profile for profile in catalog}
        # A previously shown profile may still qualify but lose a ranking place;
        # never describe all disappearances as bookings without checking the calendar.
        removed = [{"id": card["id"], "name": card["anon_name"],
                    "reason": "booked" if current.event_date in profiles[card["id"]].busy_dates else "out_ranked"}
                   for card in before if card["id"] not in after_ids]
        return {"previous_date": previous.event_date, "current_date": current.event_date,
                "dataset_version": parent.state.dataset_version, "algorithm_version": parent.state.algorithm_version,
                "previous_ids": [card["id"] for card in before], "current_ids": [card["id"] for card in after],
                "removed": removed, "added": [card["id"] for card in after if card["id"] not in before_ids]}

    return app
