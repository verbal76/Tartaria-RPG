// ⚠ OTA-1738 — the pity interval, named where teaching can read it. The
// replay copy claimed "every 50 non-boss kills" for OTA-436's whole life
// (which raised it to 100); a rule quoted from a constant cannot drift.
// OTA-436 — [audit #20] raise the pity interval from 50 → 100 non-boss kills.
// Combined with the boss-guaranteed drop and the (now halved) organic rate,
// a 50-kill pity gem made gems pile up faster than a careful player could
// ever spend them, draining death of its stakes. 100 keeps the safety net
// for grinders without flooding the stash.
export const PITY_KILL_INTERVAL = 100;
