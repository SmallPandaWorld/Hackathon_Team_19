from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine, migrate_legacy_quest_ids, migrate_legacy_users
from routers.quests import router as quests_router
from routers.users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    migrate_legacy_users()
    migrate_legacy_quest_ids()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(root_path="/api", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(quests_router)


@app.get("/")
async def root():
    return {"message": "Hello World"}
