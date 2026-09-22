from fastapi import APIRouter, status

from .schemas import CreateRoomRequest, JoinResponse, JoinRoomRequest, RoomResponse
from .service import RoomService
from .store import room_store

router = APIRouter(prefix="/api/rooms", tags=["rooms"])
room_service = RoomService(room_store)


@router.post("", response_model=JoinResponse, status_code=status.HTTP_201_CREATED)
def create_room(body: CreateRoomRequest) -> JoinResponse:
    return room_service.create_room(body.username)


@router.post("/{code}/join", response_model=JoinResponse)
def join_room(code: str, body: JoinRoomRequest) -> JoinResponse:
    return room_service.join_room(code, body.username)


@router.get("/{code}", response_model=RoomResponse)
def get_room(code: str) -> RoomResponse:
    return room_service.get_room(code)
