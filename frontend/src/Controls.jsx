import { useState } from "react";
import { formatTime } from "./format";

// Play/pause button and the seek slider. Everyone can use them: the Host and Moderators
// change the video at once, everyone else sends a request (Room.jsx decides which).
export default function Controls({ hasVideo, playing, progress, mayControl, onPlayPause, onSeek }) {
  const [scrub, setScrub] = useState(null); // a number while the slider is being dragged
  const duration = Number.isFinite(progress.duration) && progress.duration > 0 ? progress.duration : 0;
  const position = Number.isFinite(progress.time) ? progress.time : 0;
  const shown = scrub ?? Math.min(position, duration || position);

  function commit() {
    if (scrub !== null) {
      onSeek(scrub);
      setScrub(null);
    }
  }

  return (
    <div className="controls">
      <button
        className="play-button"
        disabled={!hasVideo}
        onClick={onPlayPause}
        aria-label={playing ? "Pause" : "Play"}
        title={mayControl ? undefined : "Sends a request to the host or a moderator"}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <span className="time">{formatTime(shown)}</span>
      <input
        className="seek"
        type="range"
        min={0}
        max={duration}
        step={1}
        value={shown}
        disabled={!hasVideo || duration === 0}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        aria-label="Seek"
      />
      <span className="time">{formatTime(duration)}</span>

      {!mayControl && (
        <span className="hint">Your changes are sent to the host or a moderator for approval</span>
      )}
    </div>
  );
}
