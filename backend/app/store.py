from typing import Dict, Optional

from .models import Room


class RoomStore:
 

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



room_store = RoomStore()
