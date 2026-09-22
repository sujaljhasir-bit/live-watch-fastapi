
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .models import Role


def to_camel(snake: str) -> str:
    parts = snake.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)



class CreateRoomRequest(CamelModel):
    username: str = Field(..., min_length=1, max_length=24)


class JoinRoomRequest(CamelModel):
    username: str = Field(..., min_length=1, max_length=24)




class ParticipantDto(CamelModel):
    id: str
    username: str
    role: Role


class RoomResponse(CamelModel):
    code: str
    host_id: Optional[str] = None
    video_id: Optional[str] = None
    playing: bool
    current_time: float
    server_time: int
    participants: List[ParticipantDto]


class JoinResponse(CamelModel):
    participant_id: str
    token: str
    role: Role
    room: RoomResponse


class ChangeRequestDto(CamelModel):
    id: str
    requester_id: str
    requester_name: str
    kind: str
    video_id: Optional[str] = None
    time: Optional[float] = None
    created_at: int


class ErrorResponse(CamelModel):
    timestamp: str
    status: int
    error: str
    message: str
    path: str
