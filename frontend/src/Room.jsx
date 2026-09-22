import { useEffect, useState } from "react";
import { useRoomSocket } from "./useRoomSocket";
import { ROLE, canControl } from "./roles";
import { describeRequest } from "./requests";
import TopBar from "./TopBar";
import VideoPlayer from "./VideoPlayer";
import Controls from "./Controls";
import PeoplePanel from "./PeoplePanel";
import ChatPanel from "./ChatPanel";
import RequestsPanel from "./RequestsPanel";

export default function Room({ session, onLeave }) {
  const {
    room,
    version,
    status,
    error,
    notice,
    removed,
    messages,
    requests,
    send,
    clearError,
    clearNotice,
  } = useRoomSocket(session.code, session.token);

  const [progress, setProgress] = useState({
    time: 0,
    duration: 0,
  });

  const [copied, setCopied] = useState(false);

  // Ask the server for authoritative playback state every second.
  // This acts as a safety net if a websocket update is missed.
  useEffect(() => {
    if (status !== "open") return;

    const id = setInterval(() => {
      send({ type: "request_sync" });
    }, 1000);

    return () => clearInterval(id);
  }, [status, send]);

  useEffect(() => {
    if (!error) return;

    const id = setTimeout(clearError, 4000);

    return () => clearTimeout(id);
  }, [error, clearError]);

  useEffect(() => {
    if (!notice) return;

    const id = setTimeout(clearNotice, 5000);

    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  if (removed) {
    return (
      <div className="center-screen">
        <div className="card">
          <h1>You were removed</h1>
          <p>The host removed you from this room.</p>
          <button onClick={onLeave}>Back to start</button>
        </div>
      </div>
    );
  }

  if (status === "closed" && !room) {
    return (
      <div className="center-screen">
        <div className="card">
          <h1>Could not join</h1>
          <p>
            The room does not exist any more, or your session is no longer
            valid.
          </p>
          <button onClick={onLeave}>Back to start</button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="center-screen">
        <div className="card">
          <p>Connecting…</p>
        </div>
      </div>
    );
  }

  const me = room.participants.find(
    (p) => p.id === session.participantId
  );

  const myRole =
    session.participantId === room.hostId
      ? ROLE.HOST
      : me?.role;

  const mayControl = canControl(myRole);

  function changeVideo(url) {
    send(
      mayControl
        ? {
            type: "change_video",
            videoUrl: url,
          }
        : {
            type: "request_change",
            kind: "change_video",
            videoUrl: url,
          }
    );
  }

  function playPause() {
    const kind = room.playing ? "pause" : "play";

    send(
      mayControl
        ? {
            type: kind,
          }
        : {
            type: "request_change",
            kind,
          }
    );
  }

  function seek(time) {
    send(
      mayControl
        ? {
            type: "seek",
            time,
          }
        : {
            type: "request_change",
            kind: "seek",
            time,
          }
    );
  }

  async function share() {
    const link = `${window.location.origin}/?room=${room.code}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  }

  return (
    <div className="app">
      <TopBar
        code={room.code}
        mayControl={mayControl}
        copied={copied}
        onShare={share}
        onChangeVideo={changeVideo}
        onLeave={onLeave}
      />

      <main className="layout">
        <section className="main-col">
          <VideoPlayer
            videoId={room.videoId}
            playing={room.playing}
            time={room.currentTime}
            serverTime={room.serverTime}
            version={version}
            onTick={setProgress}
          />

          <Controls
            hasVideo={Boolean(room.videoId)}
            playing={room.playing}
            progress={progress}
            mayControl={mayControl}
            onPlayPause={playPause}
            onSeek={seek}
          />

          <div className="room-title">
            Room #{room.code}
            <span className={`dot dot-${status}`} />
            <small>
              {status === "open" ? "Connected" : "Disconnected"}
            </small>
          </div>
        </section>

        <div className="side">
          <RequestsPanel
            requests={requests}
            meId={session.participantId}
            mayControl={mayControl}
            send={send}
          />

          <ChatPanel
            messages={messages}
            meId={session.participantId}
            send={send}
          />

          <PeoplePanel
            people={room.participants}
            hostId={room.hostId}
            meId={session.participantId}
            meRole={myRole}
            send={send}
          />
        </div>
      </main>

      <div className="toasts">
        {error && (
          <div className="toast">
            {error.message}
          </div>
        )}

        {notice && (
          <div className={`toast ${notice.outcome}`}>
            {notice.by} {notice.outcome} your request to{" "}
            {describeRequest(notice.request)}
          </div>
        )}
      </div>
    </div>
  );
}