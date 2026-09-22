# LiveWatch — YouTube Watch Party

Watch YouTube videos in sync with other people in real time. One person creates a
room, shares the room code, and everyone's player stays in lockstep — play,
pause, seek, and video changes all broadcast instantly over a WebSocket. Roles
(Host / Moderator / Participant) control who's allowed to drive playback.

**Live app:** https://live-watch-fastapi-1.onrender.com/

> This is hosted on Render's free tier, so the first request after a period of
> inactivity can take 30–50s to wake up. Just refresh if it looks stuck.

## Features

- **Real-time sync** — play/pause/seek/change-video broadcast to the whole room over a single WebSocket connection, with client-side drift correction so everyone's player stays within a fraction of a second of the server's clock.
- **Rooms** — create a room and get a 6-character, easy-to-read code (no `I/L/O/0/1`) to share; join with the code.
- **YouTube integration** — paste any YouTube URL format (`youtu.be/...`, `watch?v=...`, `/shorts/...`, `/embed/...`, `/live/...`, or a bare video ID).
- **Roles & permissions**, enforced on the server, not just hidden in the UI:
  | Role | Can do |
  |---|---|
  | **Host** (room creator) | Play/pause/seek/change video, assign roles, remove participants, transfer host |
  | **Moderator** | Play/pause/seek/change video |
  | **Participant** | Watch only — actions are sent as a *request* that a Host/Moderator can approve or decline |
- **Change-request workflow** — a Participant's play/pause/seek/change-video action doesn't happen immediately; it's queued as a request, and any Host/Moderator can approve or decline it. The requester gets notified either way.
- **Live participant list** with roles, host controls to promote/demote and remove people, and host transfer.
- **Chat** with a length limit.
- **Automatic host handoff** — if the Host disconnects, the longest-present Moderator (or otherwise the longest-present participant) is promoted automatically so the room doesn't get stuck.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Backend | Python 3.12 + FastAPI |
| Realtime | Native WebSockets (`fastapi.WebSocket`, no Socket.IO) |
| Storage | In-memory (rooms live for the life of the backend process) |
| Video | YouTube IFrame Player API |
| Deployment | Render |

## Project Structure

```
live-watch-fastapi/
├── backend/
│   ├── app/
│   │   ├── main.py      # FastAPI app, CORS, error -> JSON handlers, /health
│   │   ├── models.py    # Room / Participant / ChangeRequest — in-memory domain model
│   │   ├── service.py   # All business rules: create/join room, play/pause/seek,
│   │   │                #   role checks, change-request approval, YouTube URL parsing
│   │   ├── ws.py         # /ws WebSocket handler — connect/auth, message dispatch,
│   │   │                #   broadcast helpers, disconnect/host-handoff logic
│   │   ├── routes.py    # REST: POST /api/rooms, POST /api/rooms/{code}/join, GET /api/rooms/{code}
│   │   ├── schemas.py   # Pydantic request/response models (camelCase JSON)
│   │   └── store.py     # Dict-based room storage
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    └── src/
        ├── Home.jsx           # Create / join room screen
        ├── Room.jsx           # Main room screen, wires everything together
        ├── VideoPlayer.jsx    # YouTube IFrame Player wrapper
        ├── syncLogic.js       # Compares server state vs. player state, decides play/pause/seek
        ├── useRoomSocket.js   # Owns the WebSocket connection + room state
        ├── Controls.jsx       # Play/pause/seek bar (disabled/hinted for restricted roles)
        ├── PeoplePanel.jsx    # Participant list, role assignment, remove/transfer host
        ├── RequestsPanel.jsx  # Pending change requests, approve/decline
        ├── ChatPanel.jsx      # Chat
        └── roles.js           # Role helpers shared across components
```

## Setup & Run Locally

Requires Python 3.10+ and Node.js 18+.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

- API: `http://localhost:8000`
- WebSocket: `ws://localhost:8000/ws`
- Health check: `http://localhost:8000/health`
- Swagger docs: `http://localhost:8000/docs`

Or with Docker:

```bash
cd backend
docker build -t livewatch-backend .
docker run -p 8000:8000 livewatch-backend
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

In dev mode the frontend talks to `http://localhost:8000` and `ws://localhost:8000/ws` automatically — no config needed to run it locally.

## Architecture Overview — How WebSockets Fit In

1. A user creates or joins a room via a plain REST call (`POST /api/rooms` or `POST /api/rooms/{code}/join`), which returns a `participantId` + `token` and the current room state.
2. The frontend opens a WebSocket to `/ws?room=<code>&token=<token>`. The server authenticates the token against that room before accepting the connection into the room's in-memory connection map.
3. Every playback action (`play`, `pause`, `seek`, `change_video`) is sent as a small JSON message over that socket. The server checks the sender's role, rejects the action with an error visible only to the sender if their role doesn't permit it, otherwise mutates the room's server-side timeline and broadcasts a `sync_state` message with the new state to everyone in the room.
4. Each client compares the broadcast state against what its own YouTube player is actually doing (`syncLogic.js`) and issues the minimum corrective action (seek/play/pause) needed to close the gap — this is what keeps every viewer's player within ~0.2–0.35s of each other instead of naively reloading the player on every message.
5. Role and participant-list changes (`assign_role`, `remove_participant`, `transfer_host`) go through the same socket and are broadcast the same way, so every client's participant list and control-enablement state updates immediately for everyone in the room.
6. A Participant's playback action doesn't apply directly — it's stored as a pending change request and broadcast to Hosts/Moderators, who approve or decline it; the requester is notified of the outcome.
7. On disconnect, the server removes the participant from the room and, if they were the Host, promotes the next eligible person automatically.

## Trade-offs / Known Limitations

- **In-memory storage** — rooms and their state live only in the backend process's memory. A backend restart or redeploy clears all rooms. Fine for this scope; the first thing to swap out for production durability or scaling across multiple server instances would be Redis.
- **Single-process WebSocket server** — works well at this scale; scaling to many concurrent rooms/instances would need a shared pub/sub layer (e.g. Redis) so broadcasts reach clients connected to a different server instance.
- **CORS is open (`*`)** for simplicity; would lock this down to the real frontend origin for anything beyond a demo.

## Code Understanding Notes

- **FastAPI** is used for both the two REST endpoints (`routes.py`) and the native WebSocket endpoint (`ws.py`) — no Socket.IO, just Starlette/FastAPI's built-in WebSocket support.
- **Role enforcement** lives entirely in `service.py` (`Role.playback_control()`, `Role.change_control()`, `Role.manage_control()`), and every mutating method checks the caller's role before doing anything — the frontend's disabled buttons are a UX nicety, not the actual security boundary.
- **OOP structure** — `Room`, `Participant`, and `ChangeRequest` in `models.py` encapsulate all room state and mutation logic; `RoomService` in `service.py` is the single place business rules live; `ws.py` is a thin transport layer that just calls into `RoomService` and broadcasts results.
