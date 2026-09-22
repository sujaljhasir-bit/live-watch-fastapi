import { describeRequest } from "./requests";

// Changes that wait for approval.
//  - Host and Moderators see EVERY request, with Approve / Decline.
//  - Everyone else sees only their own, with a Cancel button.
export default function RequestsPanel({ requests, meId, mayControl, send }) {
  const visible = mayControl ? requests : requests.filter((r) => r.requesterId === meId);
  if (visible.length === 0) return null;

  return (
    <section className="requests">
      <h2>{mayControl ? `Requests (${visible.length})` : "Your requests"}</h2>
      <ul>
        {visible.map((r) => (
          <li key={r.id} className="request">
            <span className="request-text">
              {mayControl ? (
                <>
                  <strong>{r.requesterName}</strong> wants to {describeRequest(r)}
                </>
              ) : (
                <>You asked to {describeRequest(r)}</>
              )}
            </span>

            {mayControl ? (
              <div className="request-actions">
                <button onClick={() => send({ type: "approve_request", requestId: r.id })}>Approve</button>
                <button className="secondary" onClick={() => send({ type: "decline_request", requestId: r.id })}>
                  Decline
                </button>
              </div>
            ) : (
              <div className="request-actions">
                <span className="waiting">Waiting for approval</span>
                <button className="secondary" onClick={() => send({ type: "decline_request", requestId: r.id })}>
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
