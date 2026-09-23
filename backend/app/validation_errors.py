"""JSON-safe validation errors, including overflowing JSON numeric values."""

from math import isfinite
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _safe_error_values(value: Any) -> Any:
    """Keep error structure while making invalid numbers safe to report."""
    if isinstance(value, float) and not isfinite(value):
        return str(value)
    if isinstance(value, dict):
        # Pydantic's validator context can contain the original exception.
        # Its object and representation do not belong in a public response.
        return {
            key: _safe_error_values(item)
            for key, item in value.items()
            if not isinstance(item, BaseException)
        }
    if isinstance(value, (list, tuple)):
        return [_safe_error_values(item) for item in value if not isinstance(item, BaseException)]
    return value


async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Preserve FastAPI's 422 detail list without serializing NaN or infinity.

    Python's JSON decoder accepts an exponent such as 1e309 as infinity. Request
    validation rejects it, but the rejected value remains in the error payload;
    sanitizing that payload prevents error reporting itself from producing 500.
    """
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(_safe_error_values(exc.errors()))},
    )
