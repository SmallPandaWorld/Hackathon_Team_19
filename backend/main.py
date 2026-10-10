from contextlib import asynccontextmanager
from typing import Annotated
from urllib.parse import unquote

from fastapi import Depends, FastAPI, Header, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import User


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(root_path="/api", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class UserCreate(BaseModel):
    name: str



class LoginInfo(BaseModel):
    id: str | None
    name: str | None


@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/current_user", response_model=LoginInfo)
def current_user(x_user_id: Annotated[str | None, Header()] = None, x_user_name: Annotated[str | None, Header()] = None):
    user_name = unquote(x_user_name) if x_user_name else None
    user_id = unquote(x_user_id) if x_user_id else None
    return {"id": user_id, "name": user_name}


@app.post("/users", status_code=status.HTTP_201_CREATED)
def add_user(user: UserCreate, db: Session = Depends(get_db)):
    """Persist a new user name."""
    db_user = User(name=user.name)
    db.add(db_user)
    db.commit()
    return {"message": f"User '{user.name}' saved successfully."}


@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    """Return all saved users."""
    users = db.scalars(select(User).order_by(User.id)).all()
    names = [user.name for user in users]
    return {"users": names, "count": len(names)}
