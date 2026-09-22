import { useState } from "react";
import Home from "./Home";
import Room from "./Room";

export default function App() {
  // null = still on the start screen; otherwise { code, token, participantId, username }
  const [session, setSession] = useState(null);

  if (!session) {
    return <Home onEnter={setSession} />;
  }
  return <Room session={session} onLeave={() => setSession(null)} />;
}
