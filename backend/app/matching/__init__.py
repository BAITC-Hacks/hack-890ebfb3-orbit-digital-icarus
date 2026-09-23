"""Deterministic matching and evidence-grounded recommendation rendering."""

from .evidence import algorithm_version, load_evidence
from .explanations import build_cards
from .ranking import rank_candidates

__all__ = ["algorithm_version", "load_evidence", "rank_candidates", "build_cards"]
