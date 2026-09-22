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

  /*
   * IMPORTANT:
   *
   * The server gives us:
   *
   *   currentTime = video position at serverTime
   *
   * Therefore:
   *
   *   current server position
   *      =
   *   currentTime + (Date.now() - serverTime)
   *
   * This makes every browser calculate the same playback position.
   */
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

        player.loadVideoById({
          videoId: cmd.videoId,
          startSeconds: cmd.time,
        });

        watchForStuckPlayback();
      }

      else if (cmd.do === "cue") {
        loadedIdRef.current =
          cmd.videoId;

        clickedRef.current = false;

        setProblem("");

        player.cueVideoById({
          videoId: cmd.videoId,
          startSeconds: cmd.time,
        });
      }

      else if (cmd.do === "seek") {
        player.seekTo(
          Math.max(0, cmd.time),
          true
        );
      }

      else if (cmd.do === "play") {
        /*
         * Always seek to the authoritative position
         * BEFORE playing.
         */
        player.seekTo(
          Math.max(
            0,
            getAuthoritativeTime()
          ),
          true
        );

        /*
         * Don't repeatedly fight browser autoplay
         * before the user has clicked.
         */
        if (clickedRef.current) {
          player.playVideo();
          watchForStuckPlayback();
        } else {
          setAssist("button");
        }
      }

      else if (cmd.do === "pause") {
        player.pauseVideo();
      }
    }
  }, [
    getAuthoritativeTime,
    watchForStuckPlayback,
  ]);

  /*
   * Create YouTube player once.
   */
  useEffect(() => {
    let cancelled = false;
    let player = null;

    loadYouTubeApi().then((YT) => {
      if (
        cancelled ||
        !containerRef.current
      ) {
        return;
      }

      const holder =
        document.createElement("div");

      containerRef.current.appendChild(
        holder
      );

      player = new YT.Player(holder, {
        width: "100%",
        height: "100%",

        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },

        events: {
          onReady: () => {
            readyRef.current = true;

            syncNow();
          },

          onAutoplayBlocked: () => {
            setAssist(
              clickedRef.current
                ? "clickthrough"
                : "button"
            );
          },

          onStateChange: (event) => {
            setInfo((old) => ({
              ...old,
              state: event.data,
            }));

            if (
              event.data ===
              YT_STATE.PLAYING
            ) {
              setProblem("");
              setAssist("none");
              retriesRef.current = 0;

              if (
                unmuteWhenPlayingRef.current &&
                playerRef.current
              ) {
                unmuteWhenPlayingRef.current =
                  false;

                playerRef.current.unMute();

                setMuted(false);
              }
            }
          },

          onError: (event) => {
            setInfo((old) => ({
              ...old,
              error: event.data,
            }));

            setProblem(
              ERROR_TEXT[event.data] ||
                `This video cannot be played (error ${event.data}).`
            );

            if (
              event.data === 5 &&
              retriesRef.current < 2
            ) {
              retriesRef.current += 1;

              loadedIdRef.current = null;

              setTimeout(
                syncNow,
                1000
              );
            }
          },
        },
      });

      playerRef.current = player;
    });

    return () => {
      cancelled = true;

      clearTimeout(
        stuckTimerRef.current
      );

      readyRef.current = false;
      loadedIdRef.current = null;
      playerRef.current = null;

      if (
        player &&
        player.destroy
      ) {
        player.destroy();
      }
    };
  }, [syncNow]);

  /*
   * Update desired room state whenever
   * the WebSocket gives us a new room.
   */
  useEffect(() => {
    desiredRef.current = {
      videoId,
      playing,
      time,
      serverTime,
    };

    syncNow();
  }, [
    videoId,
    playing,
    time,
    serverTime,
    version,
    syncNow,
  ]);

  /*
   * CONTINUOUS SYNC
   *
   * Every 300ms compare local YouTube time
   * with the authoritative server position.
   *
   * If drift > 0.35 sec, correct it.
   */
  useEffect(() => {
    const id = setInterval(() => {
      const player =
        playerRef.current;

      if (
        !player ||
        !readyRef.current ||
        !loadedIdRef.current
      ) {
        return;
      }

      const state =
        player.getPlayerState();

      const actual =
        finite(
          player.getCurrentTime()
        );

      const target =
        getAuthoritativeTime();

      /*
       * While playing:
       * keep everybody locked together.
       */
      if (
        desiredRef.current.playing &&
        (
          state === YT_STATE.PLAYING ||
          state === YT_STATE.BUFFERING
        )
      ) {
        const drift =
          Math.abs(
            actual - target
          );

        if (drift > 0.35) {
          player.seekTo(
            target,
            true
          );
        }
      }

      /*
       * While paused:
       * keep exact position.
       */
      if (
        !desiredRef.current.playing &&
        state !== YT_STATE.PLAYING &&
        state !== YT_STATE.BUFFERING
      ) {
        const drift =
          Math.abs(
            actual - target
          );

        if (drift > 0.2) {
          player.seekTo(
            target,
            true
          );
        }
      }
    }, 300);

    return () => {
      clearInterval(id);
    };
  }, [getAuthoritativeTime]);

  /*
   * Update UI progress.
   */
  useEffect(() => {
    const id = setInterval(() => {
      const player =
        playerRef.current;

      if (
        !player ||
        !readyRef.current ||
        !loadedIdRef.current
      ) {
        return;
      }

      onTick({
        time: finite(
          player.getCurrentTime()
        ),
        duration: finite(
          player.getDuration()
        ),
      });

      const silent =
        typeof player.isMuted ===
          "function" &&
        player.isMuted();

      setMuted(
        silent &&
          player.getPlayerState() ===
            YT_STATE.PLAYING
      );
    }, 250);

    return () => {
      clearInterval(id);
    };
  }, [onTick]);

  /*
   * This MUST happen from an actual user click.
   */
  function startPlayback() {
    const player =
      playerRef.current;

    if (!player) return;

    clickedRef.current = true;

    setAssist("none");

    const target =
      getAuthoritativeTime();

    /*
     * Muted playback is much more
     * likely to be accepted.
     */
    player.mute();

    setMuted(true);

    /*
     * IMPORTANT:
     * Start exactly where the server says
     * everyone should be RIGHT NOW.
     */
    player.seekTo(
      target,
      true
    );

    player.playVideo();

    unmuteWhenPlayingRef.current =
      true;

    watchForStuckPlayback();
  }

  function turnSoundOn() {
    if (playerRef.current) {
      playerRef.current.unMute();
    }

    setMuted(false);
  }

  const showHelp =
    Boolean(videoId) &&
    !problem &&
    playing;

  return (
    <div className="stage">
      <div
        ref={containerRef}
        className="stage-player"
      />

      {assist !== "clickthrough" && (
        <div className="stage-shield" />
      )}

      {!videoId && (
        <div className="stage-message">
          <span>No Video</span>
        </div>
      )}

      {videoId && problem && (
        <div className="stage-message stage-problem">
          {problem}
        </div>
      )}

      {showHelp &&
        assist === "button" && (
          <button
            className="stage-start"
            onClick={startPlayback}
          >
            Click to join the playback
          </button>
        )}

      {showHelp &&
        assist === "clickthrough" && (
          <div className="stage-hint">
            Your browser needs one click on
            the video itself. Click the video
            to start it.
          </div>
        )}

      {muted && (
        <button
          className="stage-sound"
          onClick={turnSoundOn}
        >
          🔇 Sound is off, click to turn it on
        </button>
      )}

      {debug && (
        <div className="stage-debug">
          state {info.state} · error{" "}
          {info.error} · help {assist} ·
          muted {muted ? "yes" : "no"}
        </div>
      )}
    </div>
  );
}