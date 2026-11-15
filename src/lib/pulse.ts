// The sync poll's shortcut (pure). Everything /api/sync reports for a player — a new
// notification, a chat message in their DMs or events, a call ringing them — also stamps
// their User.pulseAt (server/pulse.ts). So a poll whose player has no stamp newer than the
// last full answer can skip the database reads and say "same": one row read instead of six,
// for the thousands of polls a minute where nothing happened.
//
// The client keeps its `since` (the last full answer's time) through "same" answers, so a
// write that commits a moment after a skipped poll still lands in the next full one.

/** Clocks of different server instances drift a little: stamps this close to `since` count as new. */
export const PULSE_MARGIN_MS = 5000;

/** May this poll skip the reads? (quiet: the client asked for the shortcut and has a server `since`.) */
export function canSkipSync(o: { quiet: boolean; since: number; pulseAt: Date | null | undefined; alertsMade: number }) {
  // undefined: a server whose Prisma client predates the column (a dev server not restarted) — always read.
  if (!o.quiet || o.pulseAt === undefined || !Number.isFinite(o.since) || o.since <= 0 || o.alertsMade > 0) return false;
  return !o.pulseAt || o.pulseAt.getTime() < o.since - PULSE_MARGIN_MS;
}

