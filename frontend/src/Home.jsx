import { useState } from "react";
import { createRoom, joinRoom } from "./api";

// An invite link looks like  http://localhost:5173/?room=AMX33S  and pre-fills the code.
function codeFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("room") || "";
  return raw.toUpperCase().slice(0, 6);
}

export default function Home({ onEnter }) {
  const [joinName, setJoinName] = useState("");
  const [code, setCode] = useState(codeFromUrl);
  const [joinError, setJoinError] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  async function handleJoin() {
    const name = joinName.trim();
    if (!name) {
      setJoinError("Enter your name first.");
      return;
    }
    setJoinError("");
    setJoinBusy(true);
    try {
      const result = await joinRoom(code, name);
      onEnter({
        code: result.room.code,
        token: result.token,
        participantId: result.participantId,
        username: name,
      });
    } catch (e) {
      setJoinError(e.message);
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleCreate() {
    const name = createName.trim();
    if (!name) {
      setCreateError("Enter your name first.");
      return;
    }
    setCreateError("");
    setCreateBusy(true);
    try {
      const result = await createRoom(name);
      onEnter({
        code: result.room.code,
        token: result.token,
        participantId: result.participantId,
        username: name,
      });
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="card">
        <div className="brand brand-large">
          WATCH <span className="brand-play">▶</span> PARTY
        </div>

        <label>
          Your name
          <input
            value={joinName}
            maxLength={24}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="e.g. Alice"
          />
        </label>

        <label>
          Room code
          <input
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. AMX33S"
          />
        </label>

        <button
          disabled={joinBusy || code.trim().length === 0}
          onClick={handleJoin}
        >
          Join room
        </button>

        {joinError && <p className="error">{joinError}</p>}

        <div className="divider">or</div>

        <label>
          Your name
          <input
            value={createName}
            maxLength={24}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Alice"
          />
        </label>

        <button
          className="secondary"
          disabled={createBusy}
          onClick={handleCreate}
        >
          Create a new room
        </button>

        {createError && <p className="error">{createError}</p>}
      </div>
    </div>
  );
}
