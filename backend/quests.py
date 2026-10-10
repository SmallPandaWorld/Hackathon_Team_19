"""Built-in quests, created on first start.

Seeding only inserts quests whose ID is missing, so edits made by
maintainers in the app are never overwritten. To change a built-in quest
on an existing deployment, use the quest editor.

IDs are stable and below 1000 (quests created in the app start at 1000):
never reuse or renumber an ID, because saved completions point to it.

DRAFT CONTENT: titles, wording, times and points still need team approval.
Map pins are WGS84 coordinates, looked up on OpenStreetMap.
"""

import json
from datetime import datetime

from sqlalchemy.orm import Session

from models import MEETUP, MULTI_STEP, PAIR, QUIZ, SOLO, Quest, QuestStep, QuizQuestion

QUESTS = [
    {
        "id": 1,
        "kind": SOLO,
        "title": "View from the Polyterrasse",
        "description": (
            "Walk out onto the Polyterrasse in front of the ETH main building "
            "and enjoy the view over Zurich's old town. Bonus: ask someone "
            "nearby which building they study in."
        ),
        "location": "Polyterrasse, ETH main building (HG)",
        "points": 10,
        "latitude": 47.37610,  # Polyterrasse viewpoint
        "longitude": 8.54652,
    },
    {
        "id": 2,
        "kind": SOLO,
        "title": "Meet someone new",
        "description": (
            "Introduce yourself to a VISCON participant you have not talked to "
            "before. Find out what they study and what they are building this "
            "weekend."
        ),
        "location": None,
        "points": 20,
    },
    {
        "id": 3,
        "kind": SOLO,
        "title": "Coffee break with a stranger",
        "description": (
            "Grab a coffee or snack and share a table with someone you don't "
            "know yet. Swap one tip about life at ETH."
        ),
        "location": "Any cafeteria on campus",
        "points": 15,
        "latitude": 47.37630,  # Mensa Polyterrasse
        "longitude": 8.54654,
    },
    {
        "id": 4,
        "kind": PAIR,
        "title": "Rock-paper-scissors duel",
        "description": (
            "Challenge someone you don't know to a best-of-three game of "
            "rock-paper-scissors. Afterwards, one of you starts the quest and "
            "the other enters the code shown. You both get the points, win or lose."
        ),
        "location": "Anywhere on campus",
        "points": 25,
    },
    {
        "id": 5,
        "kind": QUIZ,
        "title": "ETH trivia",
        "description": (
            "Answer all questions correctly to complete the quiz. You can retry "
            "as often as you like. Asking the people around you is allowed!"
        ),
        "location": None,
        "points": 15,
        "questions": [
            {"prompt": "In which year was ETH Zurich founded?",
             "choices": ["1755", "1855", "1905", "1955"], "correct_index": 1},
            {"prompt": "Which famous physicist graduated from ETH Zurich in 1900?",
             "choices": ["Isaac Newton", "Marie Curie", "Albert Einstein", "Niels Bohr"],
             "correct_index": 2},
            {"prompt": "Mental arithmetic: what is 17 × 23?",
             "choices": ["361", "381", "391", "401"], "correct_index": 2},
        ],
    },
    {
        "id": 6,
        "kind": MULTI_STEP,
        "title": "Main building tour",
        "description": (
            "Explore the ETH main building step by step. Mark each step as done "
            "when you get there; the points come with the last step."
        ),
        "location": "ETH main building (HG)",
        "points": 30,
        "latitude": 47.37640,  # ETH main building (HG)
        "longitude": 8.54800,
        "steps": [
            {"title": "Start at the Polyterrasse",
             "description": "Take in the view and find the entrance to the main building."},
            {"title": "Enter the main hall",
             "description": "Walk into the large central hall of the HG and look up."},
            {"title": "Find a lecture hall",
             "description": "Find any lecture hall in the HG and read what is taught there today."},
        ],
    },
    {
        "id": 7,
        "kind": MEETUP,
        "title": "VISCON group photo",
        "description": (
            "Meet everyone on the Polyterrasse for a group photo. Check in in "
            "the app while you are there (check-in opens 15 minutes before the start)."
        ),
        "location": "Polyterrasse, by the railing",
        "points": 20,
        "latitude": 47.37617,  # Polyterrasse
        "longitude": 8.54671,
        # 18:00–18:30 Zurich time (CEST = UTC+2), stored as UTC.
        "starts_at": datetime(2026, 10, 10, 16, 0),
        "ends_at": datetime(2026, 10, 10, 16, 30),
    },
]


def seed_quests(db: Session) -> None:
    """Insert missing built-in quests without touching existing ones."""
    for data in QUESTS:
        if db.get(Quest, data["id"]) is not None:
            continue
        fields = {k: v for k, v in data.items() if k not in ("steps", "questions")}
        db.add(Quest(**fields))
        db.flush()
        for position, step in enumerate(data.get("steps", []), start=1):
            db.add(QuestStep(quest_id=data["id"], position=position, **step))
        for position, question in enumerate(data.get("questions", []), start=1):
            db.add(QuizQuestion(
                quest_id=data["id"],
                position=position,
                prompt=question["prompt"],
                choices=json.dumps(question["choices"]),
                correct_index=question["correct_index"],
            ))
    db.commit()
