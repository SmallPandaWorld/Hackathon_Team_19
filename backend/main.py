from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

import models  # noqa: F401  (registers all tables)
from database import Base, engine, upgrade_legacy_schema
from routers import admin, leaderboard, pair, players, quests, social


@asynccontextmanager
async def lifespan(_: FastAPI):
    upgrade_legacy_schema()
    Base.metadata.create_all(bind=engine)
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


@app.get("/", tags=["health"])
async def root():
    return {"message": "Hello World"}


for module in (players, quests, pair, social, leaderboard, admin):
    app.include_router(module.router)
