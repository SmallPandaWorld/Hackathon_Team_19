"""Stable identifiers for the built-in quests."""

from uuid import UUID, uuid5

# Never change: built-in quest IDs (and saved progress) depend on it.
NAMESPACE = UUID("9bb7b0d4-9c4b-4e16-93ef-780ce94a8831")


def builtin_quest_id(number: int) -> UUID:
    """Deterministic UUID for the built-in quest with this seed number."""
    return uuid5(NAMESPACE, f"quests:{number}")
