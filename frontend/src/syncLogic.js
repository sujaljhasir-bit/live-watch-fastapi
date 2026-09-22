export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

const MAX_DRIFT_WHILE_PLAYING = 0.35;
const MAX_DRIFT_WHILE_PAUSED = 0.20;

export function planSync(desired, actual) {
  if (!desired.videoId) return [];

  // Wrong video or no video loaded yet
  if (actual.loadedVideoId !== desired.videoId) {
    return [
      {
        do: desired.playing ? "load" : "cue",
        videoId: desired.videoId,
        time: desired.time,
      },
    ];
  }

  // If video has ended, do nothing unless server moved back into the video
  if (actual.state === YT_STATE.ENDED) {
    const jumpedBackInside =
      actual.duration > 0 &&
      desired.time < actual.duration - 1;

    if (!jumpedBackInside) return [];
  }

  const drift = Math.abs(actual.time - desired.time);
  const commands = [];

  if (desired.playing) {
    // Correct accumulated drift
    if (drift > MAX_DRIFT_WHILE_PLAYING) {
      commands.push({
        do: "seek",
        time: desired.time,
      });
    }

    // Start playback if it is not currently playing
    if (
      actual.state !== YT_STATE.PLAYING &&
      actual.state !== YT_STATE.BUFFERING
    ) {
      commands.push({
        do: "play",
      });
    }
  } else {
    if (
      actual.state === YT_STATE.PLAYING ||
      actual.state === YT_STATE.BUFFERING
    ) {
      commands.push({
        do: "pause",
      });
    }

    if (drift > MAX_DRIFT_WHILE_PAUSED) {
      commands.push({
        do: "seek",
        time: desired.time,
      });
    }
  }

  return commands;
}