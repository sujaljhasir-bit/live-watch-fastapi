import re
import secrets
from typing import List, Optional
from urllib.parse import parse_qs, urlparse

from .errors import BadRequestError, ForbiddenError, NoRoomFound
from .models import ChangeRequest, Participant, Role, Room, now_ms
from .schemas import ChangeRequestDto, JoinResponse, ParticipantDto, RoomResponse
from .store import RoomStore

CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no I, L, O, 0, 1 — easy to read aloud
CODE_LENGTH = 6
MAX_PARTICIPANTS = 50
MAX_PENDING_PER_PERSON = 3
MAX_CHAT_LENGTH = 300
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


class RoomService:
    def __init__(self, room_repository: RoomStore):
        self.room_repository = room_repository

   

    def _find_room(self, code: Optional[str]) -> Room:
        if code is None:
            raise NoRoomFound("Room code is required")
        cleaned = code.strip().upper()
        room = self.room_repository.find_code(cleaned)
        if room is None:
            raise NoRoomFound(f"Room {cleaned} not found")
        return room

    def _generate_code(self) -> str:
        while True:
            code = "".join(secrets.choice(CODE_CHARS) for _ in range(CODE_LENGTH))
            if not self.room_repository.exists_code(code):
                return code

    def _to_participant_dto(self, participant: Participant) -> ParticipantDto:
        return ParticipantDto(id=participant.id, username=participant.username, role=participant.role)

    def _to_response(self, room: Room) -> RoomResponse:
        server_time = now_ms()
        current_time = room.get_current_time()
        participants = [self._to_participant_dto(p) for p in room.get_participants()]
        return RoomResponse(
            code=room.code,
            host_id=room.host_id,
            video_id=room.video_id,
            playing=room.playing,
            current_time=current_time,
            server_time=server_time,
            participants=participants,
        )

    
    def _get_participant_or_throw(self, room: Room, participant_id: Optional[str]) -> Participant:
        found = room.get_participant(participant_id) if participant_id else None
        if found is None:
            raise ForbiddenError("You are not in this room")
        return found

    def _require_can_control(self, room: Room, participant_id: Optional[str]) -> None:
        who = self._get_participant_or_throw(room, participant_id)
        if not who.role.playback_control():
            raise ForbiddenError(f"Your role ({who.role.value}) cannot control playback")

    def _require_video(self, room: Room) -> None:
        if room.video_id is None:
            raise BadRequestError("Choose a video first")

  

    def play(self, code: str, participant_id: Optional[str], time_s: Optional[float]) -> RoomResponse:
        room = self._find_room(code)
        self._require_can_control(room, participant_id)
        self._require_video(room)
        room.play(time_s if time_s is not None else room.get_current_time())
        return self._to_response(room)

    def pause(self, code: str, participant_id: Optional[str], time_s: Optional[float]) -> RoomResponse:
        room = self._find_room(code)
        self._require_can_control(room, participant_id)
        self._require_video(room)
        room.pause(time_s if time_s is not None else room.get_current_time())
        return self._to_response(room)

    def seek(self, code: str, participant_id: Optional[str], time_s: Optional[float]) -> RoomResponse:
        room = self._find_room(code)
        self._require_can_control(room, participant_id)
        self._require_video(room)
        if time_s is None:
            raise BadRequestError("Seek needs a time in seconds")
        room.seek(time_s)
        return self._to_response(room)



    def create_room(self, username: str) -> JoinResponse:
        room = Room(self._generate_code())
        host = Participant(username.strip(), Role.HOST)
        room.add_participant(host)
        self.room_repository.save(room)
        return JoinResponse(
            participant_id=host.id, token=host.token, role=host.role, room=self._to_response(room)
        )

    def join_room(self, code: str, username: str) -> JoinResponse:
        room = self._find_room(code)
        if len(room.get_participants()) >= MAX_PARTICIPANTS:
            raise BadRequestError("This room is full")
        guest = Participant(username.strip(), Role.PARTICIPANT)
        room.add_participant(guest)
        return JoinResponse(
            participant_id=guest.id, token=guest.token, role=guest.role, room=self._to_response(room)
        )

    def get_room(self, code: str) -> RoomResponse:
        return self._to_response(self._find_room(code))

    def change_video(self, code: str, participant_id: Optional[str], video_url: Optional[str]) -> RoomResponse:
        room = self._find_room(code)
        who = self._get_participant_or_throw(room, participant_id)
        if not who.role.change_control():
            raise ForbiddenError(f"Your role ({who.role.value}) cannot change the video")
        room.change_video(self._extract_video_id(video_url))
        return self._to_response(room)

    def _extract_video_id(self, raw: Optional[str]) -> str:
        if raw is None or not raw.strip():
            raise BadRequestError("Video link is required")
        text = raw.strip()
        if VIDEO_ID_RE.fullmatch(text):
            return text  # user pasted only the ID

        if not text.startswith("http"):
            text = "https://" + text  # "youtube.com/watch?v=..." has no scheme yet

        try:
            parsed = urlparse(text)
        except ValueError:
            raise BadRequestError("That is not a valid link")

        host = parsed.hostname
        if not host:
            raise BadRequestError("That is not a valid YouTube link")
        host = re.sub(r"^(www|m)\.", "", host.lower())
        path = parsed.path or ""
        candidate: Optional[str] = None

        if host == "youtu.be":
            parts = path.split("/")  # "/abc" -> ["", "abc"]
            if len(parts) > 1:
                candidate = parts[1]
        elif host == "youtube.com":
            if path == "/watch":
                candidate = parse_qs(parsed.query).get("v", [None])[0]
            elif path.startswith("/embed/") or path.startswith("/shorts/") or path.startswith("/live/"):
                parts = path.split("/")  # "/embed/abc" -> ["", "embed", "abc"]
                if len(parts) > 2:
                    candidate = parts[2]

        if candidate is None or not VIDEO_ID_RE.fullmatch(candidate):
            raise BadRequestError("Could not find a YouTube video in that link")
        return candidate

    # who is holding this token? raises if the room or token is wrong
    def authenticate(self, code: Optional[str], token: Optional[str]) -> Participant:
        room = self._find_room(code)
        if token:
            for p in room.get_participants():
                if p.token == token:
                    return p
        raise ForbiddenError("Invalid room or token")

    def assign_role(self, code: str, actor_id: Optional[str], target_id: Optional[str], role_name: Optional[str]) -> RoomResponse:
        room = self._find_room(code)
        actor = self._get_participant_or_throw(room, actor_id)
        if not actor.role.manage_control():
            raise ForbiddenError("Only the host can assign roles")

        new_role: Optional[Role] = None
        for r in Role:
            if role_name is not None and r.value.lower() == role_name.lower():
                new_role = r
        if new_role is None or new_role is Role.HOST:
            raise BadRequestError("Role must be Moderator or Participant")

        target = room.get_participant(target_id)
        if target is None:
            raise BadRequestError("That person is not in the room")
        if target.id == actor.id:
            raise BadRequestError("You cannot change your own role")

        target.role = new_role
        return self._to_response(room)

    def remove_participant(self, code: str, actor_id: Optional[str], target_id: Optional[str]) -> RoomResponse:
        room = self._find_room(code)
        actor = self._get_participant_or_throw(room, actor_id)
        if not actor.role.manage_control():
            raise ForbiddenError("Only the host can remove people")
        if target_id is None or room.get_participant(target_id) is None:
            raise BadRequestError("That person is not in the room")
        if target_id == actor.id:
            raise BadRequestError("You cannot remove yourself")
        room.remove_participant(target_id)
        room.remove_requests_by(target_id)
        return self._to_response(room)

    def transfer_host(self, code: str, actor_id: Optional[str], target_id: Optional[str]) -> RoomResponse:
        room = self._find_room(code)
        actor = self._get_participant_or_throw(room, actor_id)
        if not actor.role.manage_control():
            raise ForbiddenError("Only the host can transfer the host role")
        if target_id is None or not room.transfer_host(actor.id, target_id):
            raise BadRequestError("Choose another person in the room")
        return self._to_response(room)

    # returns the updated room to broadcast, or None when there is nothing to
    # broadcast (person already gone, or the room is now empty and was deleted)
    def leave(self, code: str, participant_id: str) -> Optional[RoomResponse]:
        room = self.room_repository.find_code(code)
        if room is None:
            return None
        leaver = room.get_participant(participant_id)
        if leaver is None:
            return None
        was_host = leaver.role is Role.HOST
        room.remove_participant(participant_id)
        room.remove_requests_by(participant_id)
        if not room.get_participants():
            self.room_repository.delete_code(code)
            return None
        if was_host:
            room.promote_next_host()
        return self._to_response(room)

   
    # someone WITHOUT control rights asks for a change; nothing happens yet
    def request_change(
        self, code: str, requester_id: Optional[str], kind: Optional[str], video_url: Optional[str], time_s: Optional[float]
    ) -> ChangeRequestDto:
        room = self._find_room(code)
        who = self._get_participant_or_throw(room, requester_id)
        if who.role.playback_control():
            raise BadRequestError("You can do this directly, no approval is needed")
        if kind is None:
            raise BadRequestError("Request needs a kind")

        video_id: Optional[str] = None
        at: Optional[float] = None
        if kind == ChangeRequest.CHANGE_VIDEO:
            video_id = self._extract_video_id(video_url)
        elif kind in (ChangeRequest.PLAY, ChangeRequest.PAUSE):
            self._require_video(room)
        elif kind == ChangeRequest.SEEK:
            self._require_video(room)
            if time_s is None or time_s < 0:
                raise BadRequestError("Seek needs a time in seconds")
            at = time_s
        else:
            raise BadRequestError("Unknown request type")

        mine = sum(1 for r in room.get_requests() if r.requester_id == requester_id)
        if mine >= MAX_PENDING_PER_PERSON:
            raise BadRequestError(f"You already have {MAX_PENDING_PER_PERSON} requests waiting")

        request = ChangeRequest(who.id, who.username, kind, video_id, at)
        room.add_request(request)
        return self._to_request_dto(request)

    # a Host or Moderator says yes: the change is applied to the room for everyone
    def approve_request(self, code: str, approver_id: Optional[str], request_id: Optional[str]) -> ChangeRequestDto:
        room = self._find_room(code)
        self._require_can_control(room, approver_id)
        request = room.get_request(request_id)
        if request is None:
            raise BadRequestError("That request no longer exists")

        if request.kind == ChangeRequest.CHANGE_VIDEO:
            room.change_video(request.video_id)
        elif request.kind == ChangeRequest.PLAY:
            room.play(room.get_current_time())
        elif request.kind == ChangeRequest.PAUSE:
            room.pause(room.get_current_time())
        elif request.kind == ChangeRequest.SEEK:
            room.seek(request.time)
        else:
            raise BadRequestError("Unknown request type")

        room.remove_request(request_id)
        return self._to_request_dto(request)

    # a Host/Moderator says no, or the requester takes their own request back
    def decline_request(self, code: str, actor_id: Optional[str], request_id: Optional[str]) -> ChangeRequestDto:
        room = self._find_room(code)
        actor = self._get_participant_or_throw(room, actor_id)
        request = room.get_request(request_id)
        if request is None:
            raise BadRequestError("That request no longer exists")
        is_own_request = request.requester_id == actor.id
        if not is_own_request and not actor.role.playback_control():
            raise ForbiddenError("Only the host or a moderator can decline requests")
        room.remove_request(request_id)
        return self._to_request_dto(request)

    def list_requests(self, code: str) -> List[ChangeRequestDto]:
        return [self._to_request_dto(r) for r in self._find_room(code).get_requests()]

    def _to_request_dto(self, r: ChangeRequest) -> ChangeRequestDto:
        return ChangeRequestDto(
            id=r.id,
            requester_id=r.requester_id,
            requester_name=r.requester_name,
            kind=r.kind,
            video_id=r.video_id,
            time=r.time,
            created_at=r.created_at,
        )
