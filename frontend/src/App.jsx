import { useState } from "react";
import Home from "./Home";
import Room from "./Room";

export default function App() {
 
  const [session, setSession] = useState(null);

  if (!session) {
    return <Home onEnter={setSession} />;
  }
  return <Room session={session} onLeave={() => setSession(null)} />;
}
