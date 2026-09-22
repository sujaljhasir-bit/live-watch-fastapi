import { useCallback, useEffect, useRef, useState } from "react";
import { loadYouTubeApi } from "./youtube";
import { planSync, YT_STATE } from "./syncLogic";

const ERROR_TEXT = {
  2: "That video link is not valid.",
  5: "The player ran into a problem with this video.",
  100: "This video was not found, or it is private.",
  101: "The owner of this video does not allow it to be embedded.",
  150: "The owner of this video does not allow it to be embedded.",
  152: "The owner of this video does not allow it to be embedded.",
  153: "YouTube rejected the embed request. Try a different video.",
};

const STUCK_AFTER_MS = 2500;

const finite = (n) =>
  Number.isFinite(n) ? n : 0;

export default function VideoPlayer({
  videoId,
  playing,
  time,
  serverTime,
  version,
  onTick,
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);

  const readyRef = useRef(false);
  const loadedIdRef = useRef(null);

  const retriesRef = useRef(0);
  const stuckTimerRef = useRef(null);

  const clickedRef = useRef(false);
  const unmuteWhenPlayingRef = useRef(false);

  const desiredRef = useRef({
    videoId,
    playing,
    time,
    serverTime,
  });

  const [assist, setAssist] = useState("none");
  const [muted, setMuted] = useState(false);
  const [problem, setProblem] = useState("");

  const [debug] = useState(() =>
    new URLSearchParams(window.location.search).has("debug")
  );

  const [info, setInfo] = useState({
    state: "-",
    error: "-",
  });

 
  const getAuthoritativeTime = useCallback(() => {
    const desired = desiredRef.current;

    if (!desired.playing) {
      return Math.max(0, finite(desired.time));
    }

    if (!desired.serverTime) {
      return Math.max(0, finite(desired.time));
    }

    const elapsed =
      (Date.now() - desired.serverTime) / 1000;

    return Math.max(
      0,
      finite(desired.time) + elapsed
    );
  }, []);

  const watchForStuckPlayback = useCallback(() => {
    clearTimeout(stuckTimerRef.current);

    stuckTimerRef.current = setTimeout(() => {
      const p = playerRef.current;

      if (
        !p ||
        !readyRef.current ||
        !desiredRef.current.playing
      ) {
        return;
      }

      const state = p.getPlayerState();

      if (
        state !== YT_STATE.PLAYING &&
        state !== YT_STATE.BUFFERING
      ) {
        setAssist(
          clickedRef.current
            ? "clickthrough"
            : "button"
        );
      }
    }, STUCK_AFTER_MS);
  }, []);

  const syncNow = useCallback(() => {
    if (!desiredRef.current.playing) {
      clickedRef.current = false;
      setAssist("none");
    }

    const player = playerRef.current;

    if (!player || !readyRef.current) {
      return;
    }

    const authoritativeTime =
      getAuthoritativeTime();

    const actual = {
      loadedVideoId: loadedIdRef.current,
      state: player.getPlayerState(),
      time: finite(player.getCurrentTime()),
      duration: finite(player.getDuration()),
    };

    const desired = {
      videoId: desiredRef.current.videoId,
      playing: desiredRef.current.playing,
      time: authoritativeTime,
    };

    const commands = planSync(
      desired,
      actual
    );

    for (const cmd of commands) {
      if (cmd.do === "load") {
        loadedIdRef.current =
          cmd.videoId;

        clickedRef.current = false;

        setProblem("");
