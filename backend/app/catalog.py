"""Validated in-memory catalog loading."""

import csv
import hashlib
from datetime import date
from pathlib import Path

from pydantic import ValidationError

from .constants import CALENDAR_END, CALENDAR_START
from .models import Contractor


DEFAULT_DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "contractors.csv"
REQUIRED_COLUMNS = {
    "id",
    "anon_name",
    "categories",
    "city",
    "city_imputed",
    "synthetic",
    "price_from_kzt",
    "price_imputed",
    "event_formats",
    "languages",
    "max_hours",
    "busy_dates",
    "description",
}


class CatalogValidationError(ValueError):
    """Raised when the catalog cannot be used safely."""


def dataset_sha256(data_path: Path = DEFAULT_DATA_PATH) -> str:
    """Return a stable content version for a catalog file."""

    try:
        return hashlib.sha256(data_path.read_bytes()).hexdigest()
    except OSError as error:
        raise CatalogValidationError(
            f"Could not read catalog at {data_path}: {error}"
        ) from error


def _require_text(value: str | None, *, column: str, row_number: int) -> str:
    if value is None:
        raise CatalogValidationError(f"Row {row_number}: missing {column}")
    text = value.strip()
    if not text:
        raise CatalogValidationError(f"Row {row_number}: blank {column}")
    return text


def _parse_pipe_list(
    value: str | None,
    *,
    column: str,
    row_number: int,
    allow_empty: bool = False,
) -> list[str]:
    if value is None:
        raise CatalogValidationError(f"Row {row_number}: missing {column}")
    parsed = [item.strip() for item in value.split("|") if item.strip()]
    if not parsed and not allow_empty:
        raise CatalogValidationError(f"Row {row_number}: blank {column}")
    return parsed


def _parse_boolean(value: str | None, *, column: str, row_number: int) -> bool:
    text = _require_text(value, column=column, row_number=row_number).casefold()
    if text == "true":
        return True
    if text == "false":
        return False
    raise CatalogValidationError(
        f"Row {row_number}: {column} must be True or False, got {value!r}"
    )


def _parse_positive_int(
    value: str | None,
    *,
    column: str,
    row_number: int,
) -> int:
    text = _require_text(value, column=column, row_number=row_number)
    try:
        parsed = int(text)
    except ValueError as error:
        raise CatalogValidationError(
            f"Row {row_number}: {column} must be an integer, got {value!r}"
        ) from error
    if parsed <= 0:
        raise CatalogValidationError(
            f"Row {row_number}: {column} must be positive, got {value!r}"
        )
    return parsed


def _parse_max_hours(value: str | None, *, row_number: int) -> float | None:
    if value is None or not value.strip():
        return None
    try:
        parsed = float(value.strip())
    except ValueError as error:
        raise CatalogValidationError(
            f"Row {row_number}: max_hours must be numeric, got {value!r}"
        ) from error
    if parsed <= 0:
        raise CatalogValidationError(
            f"Row {row_number}: max_hours must be positive, got {value!r}"
        )
    return parsed


def _parse_busy_dates(value: str | None, *, row_number: int) -> set[date]:
    parsed_dates: set[date] = set()
    for raw_date in _parse_pipe_list(
        value,
        column="busy_dates",
        row_number=row_number,
        allow_empty=True,
    ):
        try:
            busy_date = date.fromisoformat(raw_date)
        except ValueError as error:
            raise CatalogValidationError(
                f"Row {row_number}: busy_dates contains invalid ISO date {raw_date!r}"
            ) from error
        if not CALENDAR_START <= busy_date <= CALENDAR_END:
            raise CatalogValidationError(
                f"Row {row_number}: busy date {busy_date} is outside the "
                f"supported calendar {CALENDAR_START} to {CALENDAR_END}"
            )
        parsed_dates.add(busy_date)
    return parsed_dates


def _parse_contractor(row: dict[str, str | None], row_number: int) -> Contractor:
    try:
        return Contractor(
            id=_require_text(row.get("id"), column="id", row_number=row_number),
            anon_name=_require_text(
                row.get("anon_name"),
                column="anon_name",
                row_number=row_number,
            ),
            categories=_parse_pipe_list(
                row.get("categories"),
                column="categories",
                row_number=row_number,
            ),
            city=_require_text(row.get("city"), column="city", row_number=row_number),
            city_imputed=_parse_boolean(
                row.get("city_imputed"),
                column="city_imputed",
                row_number=row_number,
            ),
            synthetic=_parse_boolean(
                row.get("synthetic"),
                column="synthetic",
                row_number=row_number,
            ),
            price_from_kzt=_parse_positive_int(
                row.get("price_from_kzt"),
                column="price_from_kzt",
                row_number=row_number,
            ),
            price_imputed=_parse_boolean(
                row.get("price_imputed"),
                column="price_imputed",
                row_number=row_number,
            ),
            event_formats=_parse_pipe_list(
                row.get("event_formats"),
                column="event_formats",
                row_number=row_number,
            ),
            languages=_parse_pipe_list(
                row.get("languages"),
                column="languages",
                row_number=row_number,
            ),
            max_hours=_parse_max_hours(row.get("max_hours"), row_number=row_number),
            busy_dates=_parse_busy_dates(
                row.get("busy_dates"),
                row_number=row_number,
            ),
            description=_require_text(
                row.get("description"),
                column="description",
                row_number=row_number,
            ),
            source_kind="provided",
        )
    except ValidationError as error:
        raise CatalogValidationError(f"Row {row_number}: {error}") from error


def load_catalog(data_path: Path = DEFAULT_DATA_PATH) -> list[Contractor]:
    """Load and validate the supplied contractor catalog.

    All records are parsed before the resulting catalog is returned, so callers
    never receive a silently partial catalog.
    """

    if not data_path.is_file():
        raise CatalogValidationError(f"Catalog file does not exist: {data_path}")

    try:
        with data_path.open(encoding="utf-8-sig", newline="") as catalog_file:
            reader = csv.DictReader(catalog_file)
            if reader.fieldnames is None:
                raise CatalogValidationError("Catalog CSV is missing a header row")
            missing_columns = REQUIRED_COLUMNS - set(reader.fieldnames)
            if missing_columns:
                missing = ", ".join(sorted(missing_columns))
                raise CatalogValidationError(
                    f"Catalog CSV is missing required columns: {missing}"
                )

            contractors: list[Contractor] = []
            seen_ids: set[str] = set()
            for row_number, row in enumerate(reader, start=2):
                if None in row:
                    raise CatalogValidationError(
                        f"Row {row_number}: has more values than CSV headers"
                    )
                contractor = _parse_contractor(row, row_number)
                if contractor.id in seen_ids:
                    raise CatalogValidationError(
                        f"Row {row_number}: duplicate contractor id {contractor.id!r}"
                    )
                seen_ids.add(contractor.id)
                contractors.append(contractor)
    except OSError as error:
        raise CatalogValidationError(
            f"Could not read catalog at {data_path}: {error}"
        ) from error

    if not contractors:
        raise CatalogValidationError("Catalog CSV contains no contractor profiles")
    return contractors
