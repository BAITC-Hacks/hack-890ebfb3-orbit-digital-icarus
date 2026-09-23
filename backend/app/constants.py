"""Stable values shared by catalog validation and request validation."""

from datetime import date


CALENDAR_START = date(2026, 9, 23)
CALENDAR_END = date(2026, 12, 31)

# MVP request ceiling: the largest defined max_hours in the supplied snapshot.
# This is distinct from each contractor's (possibly lower or null) attendance limit.
MAX_DURATION_HOURS = 12
