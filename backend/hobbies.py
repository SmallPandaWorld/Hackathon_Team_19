"""Fixed hobby catalog. A fixed list keeps suggestions explainable
("you both like climbing") and avoids free-text moderation."""

HOBBIES = {
    "board_games": "Board games",
    "chess": "Chess",
    "climbing": "Climbing",
    "coding": "Side projects & coding",
    "cooking": "Cooking",
    "cycling": "Cycling",
    "dancing": "Dancing",
    "football": "Football",
    "gaming": "Video games",
    "hiking": "Hiking",
    "languages": "Learning languages",
    "music": "Making music",
    "photography": "Photography",
    "reading": "Reading",
    "running": "Running",
    "skiing": "Skiing & snowboarding",
    "swimming": "Swimming",
    "volleyball": "Volleyball",
}


def parse_hobbies(stored: str) -> "list[str]":
    return [key for key in stored.split(",") if key in HOBBIES]


def serialize_hobbies(keys: "list[str]") -> str:
    # Keep catalog order and drop duplicates.
    chosen = set(keys)
    return ",".join(key for key in HOBBIES if key in chosen)
