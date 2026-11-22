from pydantic import BaseModel


class TranscriptionResponse(BaseModel):
    transcript: str
    language: str = "bn"
    language_probability: float = 1.0
