from pydantic import BaseModel, Field


class ExtractionRequest(BaseModel):
    transcript: str


class ExtractedIntake(BaseModel):
    reported_symptoms: list[str] = Field(default_factory=list)
    observations: list[str] = Field(default_factory=list)
    dates: list[str] = Field(default_factory=list)
    access_barriers: list[str] = Field(default_factory=list)
    uncertain_fields: list[str] = Field(default_factory=list)
    extractionStatus: str = "READY"
    extractionProvider: str = "gemini"
