import { API_URL } from "./config";

// One helper for every REST call: sends JSON, returns JSON, and turns any failure
// into an Error whose message is safe to show on screen.
async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `Request failed (${response.status})`);
  }
  return data;
}

export function createRoom(username) {
  return request("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function joinRoom(code, username) {
  const cleaned = encodeURIComponent(code.trim().toUpperCase());
  return request(`/api/rooms/${cleaned}/join`, {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}
