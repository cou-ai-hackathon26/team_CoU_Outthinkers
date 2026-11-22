from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    urgency: str = "NORMAL"
    red_flags: list[str] = Field(default_factory=list)
    suggested_action: str = ""
    intent: str = "GENERAL_INFORMATION"
    needs_clarification: bool = False
    clarifying_questions: list[str] = Field(default_factory=list)
