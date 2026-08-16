# Tartaria Realms — Punch List BRAVO

**Charter (owner, 2026-08-16): actionable items.** Alpha (`PUNCHLIST.md`) tracks
completability and nothing else, by its own charter — so the session's live follow-ons,
staged work and open decisions get their own list rather than diluting it.

**Same evidentiary bar as Alpha:** every entry names its receipt (a commit, a measured
probe, a file:line, or a quoted ruling). Nothing goes on this list from a guess. Items
whose resolution is an OWNER DECISION say so and record the default until the call.

| Status | Meaning |
|---|---|
| **STAGED** | Built, tested, committed locally — awaiting the owner's word to push. |
| **READY** | Scoped and safe to build on request; not started. |
| **DECIDE** | Blocked on an owner ruling; the default-until-called is recorded. |
| **WATCH** | Waiting on evidence that only a device or a second sighting can produce. |

---

## B1 — Push golem OTA-1320 (the audit batch) — **STAGED**
Local commit `8d0c031f` on `golem-line`, one ahead of origin. Full gate green (830
suites / 7754 tests; ratchet at baseline 202; handoff claims clean; all 11 walkers
green, 138 tests). Contents: legacy-save gear-dupe backfill, Gem clears the fallen-seed
register, bulk sweep holds out last gate tools, `routedClimbId` cleared, ratchet +
HANDOFF repairs. **Owner said push nothing until further word — this is one `git push`
away.**

## B2 — Port the four OTA-1320 fixes to HAL + steam — **READY**
Both lines carry the same holes: they received ports of the same code (gear record
1302/1303, restore gate 1313/1315, bulk sweep 1310/1309, tower routing 1305/1306).
⚠ Do this as a DELIBERATE pass, not a bulk graft — both of the session's porting
mistakes (recolouring a dead file; recolouring HAL's live one) came from treating a
filename as a mount point. Receipt for the risk: golem measured 4 dupes in 4 steps on a
legacy save; the same measurement will reproduce on both lines.

## B3 — Uncommitted ratchet fixes sitting in HAL/steam working trees — **READY (fold into B2)**
One-line type-only `SaveState` import fix in `ota1313…`/`ota1315…` suites; both lines'
ratchets verified at baseline with it (HAL 200, steam 202). Left deliberately
uncommitted so nothing rides into an unrelated batch unnoticed — B2's commit is where
they belong.

## B4 — The picker trial: merge or revert — **DECIDE (owner)**
Golem + steam run the merged GatherModal; `SalvageModal.tsx` (507 lines) sits on both
with ZERO importers. HAL deliberately keeps two modals (owner ruling, pinned by
ota1318). On MERGE: delete the dead file from golem + steam. On REVERT: restore the
two-modal flow on both, identically. **Default until called: dead file stays.** Receipt
for the cost of waiting: the OTA-1312 recolour landed on this exact dead file and
shipped invisible.

## B5 — The bulk sweep holds items out SILENTLY — **DECIDE (owner wording)**
OTA-1320 excludes a last gate-satisfier from SELL ALL COMMON GEAR, but the confirm never
says so — a player selling down their pack may notice the mask "refusing to sell" with
no explanation, which is how held-out reads as broken. Proposed: one line in the confirm
body ("1 piece held back — your only way to breathe toxic air."). Catalogue-not-invent:
wording is the owner's.

## B6 — Climb SET COURSE skips the leave-outpost confirm — **DECIDE**
`routeGreatClimb` (like `routeMission` before it) relies on `setTravelCourse`'s OTA-993
hub self-heal, so tapping a tower's SET COURSE inside an outpost walks you out with no
Yes/No — while the plain SET COURSE path asks (OTA-035). Two precedents disagree; either
unify on the confirm or bless the mission behaviour. Receipt: ContractsScreen confirm
handler — missionId and climbId branches return before the `player.hubRoomId` check.

## B7 — Does a ROUTED arrival at a tower run the GREAT climb? — **READY (investigate; promote to Alpha if proven)**
During the audit-era walker experiment, arriving at `grand_spire_of_etheria` via
`travelTo` and climbing produced a GENERIC 4-tier spire ("Tier 4/4 cleared") instead of
the 15-tier great climb with its summit boss — the reason the walker travel change was
reverted. ota1304's journey test proves the NOUN is present after travel; it does not
prove the CLIMB resolves to the great one. If a real routed player gets the generic
climb, the Skyreacher loop is unfinishable by the road we just built to it — that is an
Alpha-class finding and must be filed there with the repro.

## B8 — HAL's shared rarity palette — **DECIDE (owner; default KEEP)**
OTA-1314's de-duplication (four identical hex tables → one module) remains on HAL after
the colour revert. Zero pixels changed; unwinding re-scatters the copies. Owner has been
offered the unwind twice and not taken it — default stands until overruled.

## B9 — The JS-wedge freeze — **WATCH**
Forensics shipped (OTA-1276 breadcrumb: `freeze forensics: last boot ended mid-action`).
Both device snapshots tonight were healthy boots; the wedge has not left a breadcrumb
yet. Nothing to chase until a device produces one.

## B10 — N5: off-canon place-name filter — **WATCH (carry-over)**
Held for a second sighting per the standing rule; one sighting on record.

## B11 — A walker that arrives by road — **READY (after B7)**
Every climb suite still TELEPORTS (`currentLocationId: climb.locationId`), which is how
the missing tower route shipped invisible. ota1304 covers route→travel→arrive for ONE
tower; once B7 settles what a routed arrival resolves, decide whether one climb walker
should permanently make the journey.
