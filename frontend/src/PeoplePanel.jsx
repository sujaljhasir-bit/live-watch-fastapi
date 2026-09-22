import { ROLE, isHost, isModerator, nameOf, roleOf } from "./roles";

// The list of people with their roles. The host also gets buttons to manage them.
export default function PeoplePanel({ people, hostId, meId, meRole, send }) {
  const iAmHost = isHost(meRole);

  function makeHost(p) {
    if (window.confirm(`Make ${nameOf(p)} the host? You will become a moderator.`)) {
      send({ type: "transfer_host", targetId: p.id });
    }
  }

  function remove(p) {
    if (window.confirm(`Remove ${nameOf(p)} from the room?`)) {
      send({ type: "remove_participant", targetId: p.id });
    }
  }

  return (
    <aside className="people">
      <div className="people-count">👥 {people.length}</div>
      <ul>
        {people.map((p) => {
          const isMe = p.id === meId;
          const role = roleOf(p, hostId);
          return (
            <li key={p.id} className="person">
              <div className="person-main">
                <span className="person-name">
                  {nameOf(p)}
                  {isMe ? " (you)" : ""}
                </span>
                <span className={`badge badge-${role.toLowerCase()}`}>{role}</span>
              </div>

              {iAmHost && !isMe && (
                <div className="person-actions">
                  {isModerator(role) ? (
                    <button onClick={() => send({ type: "assign_role", targetId: p.id, role: ROLE.PARTICIPANT })}>
                      Make participant
                    </button>
                  ) : (
                    <button onClick={() => send({ type: "assign_role", targetId: p.id, role: ROLE.MODERATOR })}>
                      Make moderator
                    </button>
                  )}
                  <button onClick={() => makeHost(p)}>Make host</button>
                  <button className="danger" onClick={() => remove(p)}>
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
