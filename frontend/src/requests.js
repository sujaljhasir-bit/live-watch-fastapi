import { formatTime } from "./format";

// One short sentence for a pending request, used by the requests panel and the toasts.
export function describeRequest(r) {
  switch (r.kind) {
    case "change_video":
      return `change the video (${r.videoId})`;
    case "play":
      return "play the video";
    case "pause":
      return "pause the video";
    case "seek":
      return `jump to ${formatTime(r.time)}`;
    default:
      return "make a change";
  }
}
