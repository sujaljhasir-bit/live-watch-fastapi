"""
The real-time half of the app: one WebSocket per connected browser tab,
grouped by room code. Ported from WatchPartyHandler.java — message names,
event names and behaviour are all kept identical to the original.
"""
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from .errors import BadRequestError, ForbiddenError, NoRoomFound
from .models import Participant, now_ms
from .routes import room_service
from .schemas import ChangeRequestDto, RoomResponse

router = APIRouter()

MAX_CHAT_LENGTH = 300

# room code -> (participant id -> that person's open connection)
rooms: Dict[str, Dict[str, WebSocket]] = {}


def _dump(model) -> Any:
    """pydantic model -> plain (already camelCase) dict, ready for json.dumps"""
    return model.model_dump(by_alias=True)


async def _send_json(ws: WebSocket, body: Dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(body))
    except Exception:
        pass  # the socket is already gone; nothing to do


async def _send(ws: WebSocket, type_: str, by: Optional[str], room: Optional[RoomResponse]) -> None:
    await _send_json(ws, {"type": type_, "by": by, "room": _dump(room) if room is not None else None})


async def _send_error(ws: WebSocket, event: str, message: str) -> None:
    await _send_json(ws, {"type": "error", "event": event, "message": message})


async def _broadcast(room_code: str, type_: str, by: Optional[str], room: Optional[RoomResponse]) -> None:
    members = rooms.get(room_code)
    if not members:
        return
    for ws in list(members.values()):
        await _send(ws, type_, by, room)


async def _broadcast_requests(room_code: str) -> None:
    members = rooms.get(room_code)
    if not members:
        return
    requests = [_dump(r) for r in room_service.list_requests(room_code)]
    body = {"type": "requests_updated", "requests": requests}
    for ws in list(members.values()):
        await _send_json(ws, body)


async def _notify_requester(room_code: str, request: ChangeRequestDto, outcome: str, by: str) -> None:
    members = rooms.get(room_code)
    target = members.get(request.requester_id) if members else None
    if target is None:
        return  # they left in the meantime
    await _send_json(
        target,
        {"type": "request_resolved", "outcome": outcome, "by": by, "request": _dump(request)},
    )


async def _remove_participant(room_code: str, my_id: str, my_name: str, target_id: Optional[str]) -> None:
    updated = room_service.remove_participant(room_code, my_id, target_id)

    members = rooms.get(room_code)
    kicked = members.pop(target_id, None) if members and target_id else None
    if kicked is not None:
        await _send(kicked, "removed", my_name, updated)
        try:
            await kicked.close(code=status.WS_1000_NORMAL_CLOSURE, reason="Removed by host")
        except Exception:
            pass

    await _broadcast(room_code, "participant_removed", my_name, updated)
    await _broadcast_requests(room_code)  # their waiting requests were dropped


async def _request_change(room_code: str, my_id: str, msg: Dict[str, Any]) -> None:
    room_service.request_change(room_code, my_id, msg.get("kind"), msg.get("videoUrl"), msg.get("time"))
    await _broadcast_requests(room_code)


async def _approve_request(room_code: str, my_id: str, my_name: str, request_id: Optional[str]) -> None:
    request = room_service.approve_request(room_code, my_id, request_id)
    await _broadcast(room_code, "sync_state", my_name, room_service.get_room(room_code))
    await _broadcast_requests(room_code)
    await _notify_requester(room_code, request, "approved", my_name)


async def _decline_request(room_code: str, my_id: str, my_name: str, request_id: Optional[str]) -> None:
    request = room_service.decline_request(room_code, my_id, request_id)
    await _broadcast_requests(room_code)
    if request.requester_id != my_id:  # cancelling your own request needs no answer
        await _notify_requester(room_code, request, "declined", my_name)


async def _chat(ws: WebSocket, room_code: str, my_id: str, my_name: str, text: Optional[str]) -> None:
    if not text or not text.strip():
        await _send_error(ws, "chat", "Message is empty")
        return
    cleaned = text.strip()
    if len(cleaned) > MAX_CHAT_LENGTH:
        await _send_error(ws, "chat", f"Message is too long ({MAX_CHAT_LENGTH} characters max)")
        return
    members = rooms.get(room_code)
    if not members:
        return
    body = {"type": "chat", "by": my_name, "userId": my_id, "text": cleaned, "at": now_ms()}
    for member_ws in list(members.values()):
        await _send_json(member_ws, body)


@router.websocket("/ws")
async def watch_party_socket(websocket: WebSocket, room: Optional[str] = None, token: Optional[str] = None) -> None:
    # ------------------------------------------------------------ connect
    await websocket.accept()

    me: Optional[Participant] = None
    try:
        me = room_service.authenticate(room, token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid room or token")
        return

    assert room is not None
    room_code = room.strip().upper()
    my_id = me.id
    my_name = me.username

    members = rooms.setdefault(room_code, {})
    old = members.get(my_id)
    members[my_id] = websocket
    if old is not None:
        try:
            await old.close()  # same person opened a second tab: keep only the newest connection
        except Exception:
            pass

    await _broadcast(room_code, "user_joined", my_name, room_service.get_room(room_code))
    await _broadcast_requests(room_code)  # so a newcomer sees what is already waiting

    # ------------------------------------------------------------ messages
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                await _send_error(websocket, "unknown", "Message is not valid JSON")
                continue
            if not isinstance(msg, dict) or msg.get("type") is None:
                await _send_error(websocket, "unknown", "Message needs a type")
                continue

            msg_type = msg["type"]
            try:
                if msg_type == "play":
                    await _broadcast(room_code, "sync_state", my_name, room_service.play(room_code, my_id, msg.get("time")))
                elif msg_type == "pause":
                    await _broadcast(room_code, "sync_state", my_name, room_service.pause(room_code, my_id, msg.get("time")))
                elif msg_type == "seek":
                    await _broadcast(room_code, "sync_state", my_name, room_service.seek(room_code, my_id, msg.get("time")))
                elif msg_type == "change_video":
                    await _broadcast(
                        room_code, "sync_state", my_name,
                        room_service.change_video(room_code, my_id, msg.get("videoUrl")),
                    )
                    await _broadcast_requests(room_code)  # a new video makes waiting requests out of date
                elif msg_type == "assign_role":
                    await _broadcast(
                        room_code, "role_assigned", my_name,
                        room_service.assign_role(room_code, my_id, msg.get("targetId"), msg.get("role")),
                    )
                elif msg_type == "transfer_host":
                    await _broadcast(
                        room_code, "host_transferred", my_name,
                        room_service.transfer_host(room_code, my_id, msg.get("targetId")),
                    )
                elif msg_type == "remove_participant":
                    await _remove_participant(room_code, my_id, my_name, msg.get("targetId"))
                elif msg_type == "request_change":
                    await _request_change(room_code, my_id, msg)
                elif msg_type == "approve_request":
                    await _approve_request(room_code, my_id, my_name, msg.get("requestId"))
                elif msg_type == "decline_request":
                    await _decline_request(room_code, my_id, my_name, msg.get("requestId"))
                elif msg_type == "chat":
                    await _chat(websocket, room_code, my_id, my_name, msg.get("text"))
                elif msg_type == "request_sync":
                    await _send(websocket, "sync_state", None, room_service.get_room(room_code))
                else:
                    await _send_error(websocket, msg_type, "Unknown message type")
            except (ForbiddenError, BadRequestError, NoRoomFound) as e:
                await _send_error(websocket, msg_type, str(e))  # only the sender sees this
            except Exception as e:  # noqa: BLE001
                print(f"Unexpected error handling {msg_type!r}: {e}")
                await _send_error(websocket, msg_type, "Something went wrong")

    except WebSocketDisconnect:
        pass
    finally:
        # ------------------------------------------------------------ disconnect
        current_members = rooms.get(room_code)
        # ignore closes of connections that were already replaced or kicked
        if current_members is not None and current_members.get(my_id) is websocket:
            current_members.pop(my_id, None)
            if not current_members:
                rooms.pop(room_code, None)

            updated = room_service.leave(room_code, my_id)
            if updated is not None:
                await _broadcast(room_code, "user_left", my_name, updated)
                await _broadcast_requests(room_code)  # their waiting requests were dropped
