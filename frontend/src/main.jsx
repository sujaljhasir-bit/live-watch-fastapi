import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// No <StrictMode> on purpose. In development it opens the WebSocket, closes it and
// opens it again. The server treats a closed socket as "left the room", so the
// second connection would be rejected.
createRoot(document.getElementById("root")).render(<App />);
