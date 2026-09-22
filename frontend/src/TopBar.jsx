import { useState } from "react";

// The link box works for everyone. For the Host and Moderators it changes the video
// straight away; for everyone else it sends a request that needs approval.
export default function TopBar({ code, mayControl, copied, onShare, onChangeVideo, onLeave }) {
  const [url, setUrl] = useState("");

  function submit(e) {
    e.preventDefault();
    if (url.trim()) {
      onChangeVideo(url.trim());
      setUrl("");
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        WATCH <span className="brand-play">▶</span> PARTY
      </div>

      <button className="ghost" onClick={onShare}>
        {copied ? "Link copied" : "Share"}
      </button>

      <form className="url-form" onSubmit={submit}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={
            mayControl ? "Paste a YouTube link and press Enter" : "Suggest a YouTube link (needs approval)"
          }
        />
      </form>

      <div className="topbar-right">
        <span className="room-pill">#{code}</span>
        <button className="ghost" onClick={onLeave}>
          Leave
        </button>
      </div>
    </header>
  );
}
