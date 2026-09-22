from typing import Dict, Optional

from .models import Room


class RoomStore:
    """Plain in-memory storage. Swap this out for Redis/a database later
    if you need rooms to survive a restart or to run more than one worker."""

    def __init__(self) -> None:
        self._rooms: Dict[str, Room] = {}

    def save(self, room: Room) -> Room:
        self._rooms[room.code] = room
        return room

    def find_code(self, code: str) -> Optional[Room]:
        return self._rooms.get(code)

    def exists_code(self, code: str) -> bool:
        return code in self._rooms

    def delete_code(self, code: str) -> None:
        self._rooms.pop(code, None)


# a single shared store for the whole process
room_store = RoomStore()
