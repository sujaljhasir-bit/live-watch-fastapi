import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "./config";

const MAX_MESSAGES = 100; // keep only the latest chat messages in memory

// Owns the WebSocket for one room. Every server message that carries a "room"
// replaces our copy of the room, so the screen always shows what the server says.
export function useRoomSocket(code, token) {
  const [room, setRoom] = useState(null);
  const [version, setVersion] = useState(0); // goes up on every room update, even identical ones
  const [status, setStatus] = useState("connecting"); // connecting | open | closed
  const [error, setError] = useState(null); // { message, at }
  const [notice, setNotice] = useState(null); // { outcome, by, request, at }: answer to MY request
  const [removed, setRemoved] = useState(false);
  const [messages, setMessages] = useState([]); // chat: { id, by, userId, text, at }
  const [requests, setRequests] = useState([]); // changes waiting for a host or moderator
  const socketRef = useRef(null);
  const nextId = useRef(0);

  useEffect(() => {
    const url = `${WS_URL}?room=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => setStatus("open");
    socket.onclose = () => setStatus("closed");

    socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "error") {
        setError({ message: msg.message, at: Date.now() });
        return;
      }
      if (msg.type === "removed") {
        setRemoved(true);
        return;
      }
      if (msg.type === "chat") {
        const entry = { id: nextId.current++, by: msg.by, userId: msg.userId, text: msg.text, at: msg.at };
        setMessages((old) => [...old.slice(-(MAX_MESSAGES - 1)), entry]);
        return;
      }
      if (msg.type === "requests_updated") {
        setRequests(msg.requests || []);
        return;
      }
      if (msg.type === "request_resolved") {
        setNotice({ outcome: msg.outcome, by: msg.by, request: msg.request, at: Date.now() });
        return;
      }
      if (msg.room) {
        setRoom(msg.room);
        setVersion((v) => v + 1);
      }
    };

    return () => socket.close();
  }, [code, token]);

  const send = useCallback((message) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  return { room, version, status, error, notice, removed, messages, requests, send, clearError, clearNotice };
}
