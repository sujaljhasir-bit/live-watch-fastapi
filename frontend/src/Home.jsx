import { useState } from "react";
import { createRoom, joinRoom } from "./api";

// An invite link looks like  http://localhost:5173/?room=AMX33S  and pre-fills the code.
function codeFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("room") || "";
  return raw.toUpperCase().slice(0, 6);
}

export default function Home({ onEnter }) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState(codeFromUrl);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(action) {
    const name = username.trim();
    if (!name) {
      setError("Enter your name first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await action(name);
      onEnter({
        code: result.room.code,
        token: result.token,
        participantId: result.participantId,
        username: name,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
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
            value={username}
            maxLength={24}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Alice"
          />
        </label>

        <button disabled={busy} onClick={() => enter((name) => createRoom(name))}>
          Create a room
        </button>

        <div className="divider">or join one</div>

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
          className="secondary"
          disabled={busy || code.trim().length === 0}
          onClick={() => enter((name) => joinRoom(code, name))}
        >
          Join room
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
