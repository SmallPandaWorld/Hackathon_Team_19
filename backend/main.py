from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from pydantic import BaseModel

from database import SessionLocal, ensure_schema
from quests import seed_quests
from routers import admin, friends, pair, players, quests


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    with SessionLocal() as db:
        seed_quests(db)
    yield


def use_function_name(route: APIRoute) -> str:
    # Gives Orval readable hook names, e.g. useListQuests instead of
    # useListQuestsQuestsGet.
    return route.name


app = FastAPI(
    title="Campus Voyager",
    root_path="/api",
    lifespan=lifespan,
    generate_unique_id_function=use_function_name,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


class Health(BaseModel):
    message: str


@app.get("/", tags=["health"], response_model=Health)
async def root():
    return Health(message="Hello World")


for module in (players, quests, pair, friends, admin):
    app.include_router(module.router)
