
from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Dict, List, Optional


def now_ms() -> int:
    return int(time.time() * 1000)


class Role(str, Enum):
    HOST = "Host"
    MODERATOR = "Moderator"
    PARTICIPANT = "Participant"

    def playback_control(self) -> bool:
        return self in (Role.HOST, Role.MODERATOR)

    def change_control(self) -> bool:
        return self in (Role.HOST, Role.MODERATOR)

    def manage_control(self) -> bool:
        return self is Role.HOST


class Participant:
    __slots__ = ("token", "id", "username", "role")

    def __init__(self, username: str, role: Role):
        self.token = str(uuid.uuid4())
        self.id = str(uuid.uuid4())
        self.username = username
        self.role = role


class ChangeRequest:
    CHANGE_VIDEO = "change_video"
    PLAY = "play"
    PAUSE = "pause"
    SEEK = "seek"

    __slots__ = ("id", "requester_id", "requester_name", "kind", "video_id", "time", "created_at")

    def __init__(
        self,
        requester_id: str,
        requester_name: str,
        kind: str,
        video_id: Optional[str] = None,
        seek_time: Optional[float] = None,
    ):
        self.id = str(uuid.uuid4())
        self.requester_id = requester_id
        self.requester_name = requester_name
        self.kind = kind
        self.video_id = video_id
        self.time = seek_time
        self.created_at = now_ms()


class Room:
    # a pending request older than this is dropped the next time anyone looks
    REQUEST_LIFETIME_MS = 2 * 60 * 1000

    def __init__(self, code: str):
        self.code = code
        self.host_id: Optional[str] = None

        self.video_id: Optional[str] = None
        self.playing: bool = False

        self.last_update_time: float = 0.0
        self.last_update_at: int = now_ms()

        # insertion order == join order, same as Java's LinkedHashMap
        self.participants: Dict[str, Participant] = {}
        self.requests: Dict[str, ChangeRequest] = {}

    # ---------------------------------------------------------- participants
    def add_participant(self, participant: Participant) -> None:
        self.participants[participant.id] = participant
        if participant.role is Role.HOST:
            self.host_id = participant.id

    def get_participant(self, participant_id: Optional[str]) -> Optional[Participant]:
        if participant_id is None:
            return None
        return self.participants.get(participant_id)

    def remove_participant(self, participant_id: str) -> bool:
        return self.participants.pop(participant_id, None) is not None

    def get_participants(self) -> List[Participant]:
        return list(self.participants.values())

    # ---------------------------------------------------------- playback
    def get_current_time(self) -> float:
        if not self.playing:
            return self.last_update_time
        elapsed_millis = now_ms() - self.last_update_at
        return self.last_update_time + elapsed_millis / 1000.0

    def play(self, at_time: float) -> None:
        self.last_update_time = at_time
        self.last_update_at = now_ms()
        self.playing = True

    def pause(self, at_time: float) -> None:
        self.last_update_time = at_time
        self.last_update_at = now_ms()
        self.playing = False

    def seek(self, at_time: float) -> None:
        self.last_update_time = at_time
        self.last_update_at = now_ms()

    def change_video(self, video_id: Optional[str]) -> None:
        self.video_id = video_id
        self.requests.clear()
        self.playing = False
        self.last_update_time = 0.0
        self.last_update_at = now_ms()

    # the host gives the crown to someone else; the old host stays on as Moderator
    def transfer_host(self, from_id: str, to_id: str) -> bool:
        frm = self.participants.get(from_id)
        to = self.participants.get(to_id)
        if frm is None or to is None or from_id == to_id:
            return False
        frm.role = Role.MODERATOR
        to.role = Role.HOST
        self.host_id = to_id
        return True

    # called when the host leaves: the longest-present Moderator, else the longest-present person
    def promote_next_host(self) -> Optional[Participant]:
        nxt: Optional[Participant] = None
        for p in self.participants.values():
            if p.role is Role.MODERATOR:
                nxt = p
                break
        if nxt is None and self.participants:
            nxt = next(iter(self.participants.values()))
        if nxt is None:
            self.host_id = None
            return None
        nxt.role = Role.HOST
        self.host_id = nxt.id
        return nxt

    # ---------------------------------------------------------- change requests
    def get_requests(self) -> List[ChangeRequest]:
        now = now_ms()
        expired = [rid for rid, r in self.requests.items() if now - r.created_at > Room.REQUEST_LIFETIME_MS]
        for rid in expired:
            del self.requests[rid]
        return list(self.requests.values())

    def add_request(self, request: ChangeRequest) -> None:
        self.requests[request.id] = request

    def get_request(self, request_id: Optional[str]) -> Optional[ChangeRequest]:
        self.get_requests()  # drops expired ones first
        if request_id is None:
            return None
        return self.requests.get(request_id)

    def remove_request(self, request_id: str) -> None:
        self.requests.pop(request_id, None)

    def remove_requests_by(self, participant_id: str) -> None:
        to_delete = [rid for rid, r in self.requests.items() if r.requester_id == participant_id]
        for rid in to_delete:
            del self.requests[rid]
