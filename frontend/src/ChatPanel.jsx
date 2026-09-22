import { useEffect, useRef, useState } from "react";

const MAX_LENGTH = 300; // the server enforces the same limit

// Room chat. Messages live only in this browser tab: people who join later do not see
// what was said before they arrived.
export default function ChatPanel({ messages, meId, send }) {
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  // keep the newest message in view
  useEffect(() => {
    if (bottomRef.current && bottomRef.current.scrollIntoView) {
      bottomRef.current.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  function submit(e) {
    e.preventDefault();
    const cleaned = text.trim();
    if (!cleaned) return;
    send({ type: "chat", text: cleaned });
    setText("");
  }

  return (
    <section className="chat">
      <div className="chat-messages">
        {messages.length === 0 && <p className="chat-empty">No messages yet. Say hi!</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message${m.userId === meId ? " mine" : ""}`}>
            <span className="chat-author">{m.by}</span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message"
        />
        <button type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
