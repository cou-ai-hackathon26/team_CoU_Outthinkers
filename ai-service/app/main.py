"""MaternaCare AI service entrypoint."""

from fastapi import FastAPI

from app.dependencies import lifespan
from app.routers import chatbot, extraction, health, transcription

app = FastAPI(title="MaternaCare AI Service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(transcription.router)
app.include_router(extraction.router)
app.include_router(chatbot.router)
