# LiveWatch backend (FastAPI)

This is a Python/FastAPI rewrite of the original Spring Boot backend in
`live-watch/demo`. It is a behavioural port, not a rewrite of the design:
every REST endpoint, every WebSocket message type, every field name in the
JSON, and every rule (who can play/pause/seek, how requests get approved,
what happens when the host leaves) works exactly like the Java version, so
**the existing React frontend needs no code changes** — only its API/WS
URLs need to point at this server instead.

## 1. Install & run

Requires Python 3.10+.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

The API is now at `http://localhost:8000`, and the WebSocket endpoint is at
`ws://localhost:8000/ws`. Visit `http://localhost:8000/health` to check it's
alive, and `http://localhost:8000/docs` for interactive Swagger docs of the
two REST endpoints.

Set the `PORT` environment variable to run on a different port (see
`.env.example`).

### Docker

```bash
docker build -t livewatch-backend .
docker run -p 8000:8000 livewatch-backend
```

## 2. Project layout

```
backend/
  app/
    main.py      FastAPI app, CORS, error -> JSON handlers
    models.py    Room / Participant / ChangeRequest — the in-memory state
    schemas.py   Pydantic request/response models (camelCase JSON, matches
                 the old Jackson output field-for-field)
    service.py   All business rules (create/join room, play/pause/seek,
                 roles, change-request approval flow, YouTube URL parsing)
    store.py     Plain dict-based room storage (swap for Redis/a DB if you
                 need rooms to survive a restart or to run >1 worker)
    routes.py    REST endpoints: POST /api/rooms, POST /api/rooms/{code}/join,
                 GET /api/rooms/{code}
    ws.py        The /ws WebSocket handler — connect/auth, message dispatch,
                 broadcast helpers, disconnect/host-handoff logic
    errors.py    NoRoomFound / ForbiddenError / BadRequestError -> 404/403/400
  requirements.txt
  Dockerfile
  .env.example
```

Everything runs in memory, single process — same as the Java version
(`RoomRepository` was a `ConcurrentHashMap`, no database). Rooms disappear
when the last person leaves, exactly like before.

## 3. REST API

| Method | Path                    | Body                        | Returns                          |
|--------|-------------------------|------------------------------|-----------------------------------|
| POST   | `/api/rooms`            | `{"username": "Alice"}`      | `JoinResponse` (you become Host)  |
| POST   | `/api/rooms/{code}/join`| `{"username": "Bob"}`        | `JoinResponse` (you join as Participant) |
| GET    | `/api/rooms/{code}`     | —                             | `RoomResponse`                    |

`JoinResponse`:
```json
{
  "participantId": "...",
  "token": "...",
  "role": "Host",
  "room": { "...": "a RoomResponse, see below" }
}
```

`RoomResponse`:
```json
{
  "code": "AB2X9K",
  "hostId": "...",
  "videoId": "dQw4w9WgXcQ",
  "playing": true,
  "currentTime": 12.4,
  "serverTime": 1737400000000,
  "participants": [ { "id": "...", "username": "Alice", "role": "Host" } ]
}
```

Errors come back as `4xx` with `{"message": "..."}` (plus timestamp/status/
error/path, ignored by the frontend) — same shape the frontend already
expects from `api.js`.

## 4. WebSocket protocol

Connect to `ws://<host>/ws?room=<CODE>&token=<TOKEN>`. The token comes from
the REST response above; it's how the server knows who you are (a bare
participant id is never accepted here, same as the Java version).

Client -> server message `type`s: `play`, `pause`, `seek`, `change_video`,
`assign_role`, `transfer_host`, `remove_participant`, `request_change`,
`approve_request`, `decline_request`, `chat`, `request_sync`.

Server -> client message `type`s: `user_joined`, `user_left`, `sync_state`,
`role_assigned`, `host_transferred`, `participant_removed`, `removed`,
`requests_updated`, `request_resolved`, `chat`, `error`.

This is identical to what `frontend/src/useRoomSocket.js` already expects.

## 5. Things that are deliberately unchanged from the Java version

- Room codes: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no
  `I/L/O/0/1`, so codes read out loud unambiguously).
- Roles: `Host` > `Moderator` > `Participant`. Host & Moderator can control
  playback and change the video; only Host can assign roles, remove people,
  and transfer the host crown.
- A Participant can't act directly — they submit a `request_change`, and a
  Host/Moderator approves or declines it. Max 3 pending requests per
  person; requests older than 2 minutes are dropped automatically.
- YouTube URL parsing accepts a bare 11-character video ID, or a
  `youtube.com/watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, or `/live/`
  link, with or without `https://`.
- Max 50 participants per room.
- Chat messages capped at 300 characters.
- If the host disconnects, the longest-present Moderator is promoted, or
  else the longest-present participant. If the room empties out, it's
  deleted.

## 6. Wiring it up to the frontend

See the top-level `HOW_TO_RUN.md` (next to this backend and the frontend
zip) for the two-terminal quick start. Short version: run this server on
port 8000, then set the frontend's `VITE_API_URL` to
`http://localhost:8000` and `VITE_WS_URL` to `ws://localhost:8000/ws`
(already the defaults in the frontend zip's `.env` file).
