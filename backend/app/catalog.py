"""Validated in-memory catalog loading.

Implementation owner: bbl.
The loader must read data/contractors.csv, preserve source flags, validate the
snapshot, and fail startup clearly on invalid mandatory data.
"""

from pathlib import Path

from .models import Contractor


DEFAULT_DATA_PATH = Path("data/contractors.csv")


def load_catalog(data_path: Path = DEFAULT_DATA_PATH) -> list[Contractor]:
    """Load and validate the supplied contractor catalog.

    This function is intentionally left as the next B1 implementation step.
    """

    raise NotImplementedError("Catalog loader is not implemented yet")
