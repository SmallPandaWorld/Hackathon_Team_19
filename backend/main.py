from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import UUID

app = FastAPI(root_path="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Einfacher In-Memory-Speicher
users_db: list[str] = []


class UserCreate(BaseModel):
    name: str

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.post("/users", status_code=status.HTTP_201_CREATED)
def add_user(user: UserCreate):
    """Speichert einen neuen Benutzernamen."""
    users_db.append(user.name)
    return {"message": f"User '{user.name}' erfolgreich gespeichert."}


@app.get("/users")
def get_users():
    """Gibt alle gespeicherten Benutzer zurück."""
    return {"users": users_db, "count": len(users_db)}