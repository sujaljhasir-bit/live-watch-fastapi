// The role names as the backend sends them. Comparisons ignore capital letters, so
// "Host", "HOST" and "host" all mean the same thing: a spelling difference in the
// backend enum can never lock the host out of their own room.
export const ROLE = {
  HOST: "Host",
  MODERATOR: "Moderator",
  PARTICIPANT: "Participant",
};

const same = (role, wanted) => String(role ?? "").toLowerCase() === wanted.toLowerCase();

export const isHost = (role) => same(role, ROLE.HOST);
export const isModerator = (role) => same(role, ROLE.MODERATOR);
export const canControl = (role) => isHost(role) || isModerator(role);

// A person's role as the screen should treat it. The host is also recognised by the room's
// hostId, so whoever created the room is the host even if the role field of the participant
// list arrives under another name or spelling.
export const roleOf = (p, hostId) => (p.id === hostId ? ROLE.HOST : (p.role ?? ROLE.PARTICIPANT));

// The display name of a participant. Check the JSON your backend sends: the field is
// "username" or "user" depending on how you named it in Participantdto.
export const nameOf = (p) => p.username ?? p.user ?? p.name ?? "?";
