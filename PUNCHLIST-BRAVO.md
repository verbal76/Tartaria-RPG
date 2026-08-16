# Tartaria Realms — Punch List BRAVO

**Charter (owner, 2026-08-16): actionable items.** Alpha (`PUNCHLIST.md`) tracks
completability and nothing else, by its own charter — so the session's live follow-ons,
staged work and open decisions get their own list rather than diluting it.

**Same evidentiary bar as Alpha:** every entry names its receipt (a commit, a measured
probe, a file:line, or a quoted ruling). Nothing goes on this list from a guess. Items
whose resolution is an OWNER DECISION say so and record the default until the call.

| Status | Meaning |
|---|---|
| **DONE** | Shipped and pushed. |
| **RESOLVED** | Question answered by measurement or by an owner ruling; no work left. |
| **STAGED** | Built, tested, committed locally — awaiting the owner's word to push. |
| **READY** | Scoped and safe to build on request; not started. |
| **DECIDE** | Blocked on an owner ruling; the default-until-called is recorded. |
| **WATCH** | Waiting on evidence that only a device or a second sighting can produce. |

---

## B1 — Push golem OTA-1320 (the audit batch) — **DONE**
Pushed. `golem-line` carries it, plus OTA-1321 (combat primer) and OTA-1322 (empty
picker closes on the frame it empties).

## B2 — Port the four OTA-1320 fixes to HAL + steam — **DONE**
HAL took them inside **OTA-1319** (the full golem-parity port); steam inside
**OTA-1321** (its own numbering). ⚠ The two lines needed OPPOSITE methods, decided by
measuring rather than by habit: HAL's shared files were close enough to replace
wholesale (161 of 190 differing files differed only in comment OTA numbers), while
steam had only 9 divergent files and its OWN platform code among them (`GamepadNav`,
`kokoroWeb`, Steam-build `TTSManager`/`SplashOverlay`) — so every steam change was
surgical. Receipt: both lines green at their own baselines; steam now matches golem's
suite/test counts exactly.

## B3 — Uncommitted ratchet fixes in HAL/steam working trees — **DONE**
Folded into B2's commits as planned.

## B4 — The picker trial: merge or revert — **RESOLVED: MERGE**
Owner's ruling *"golem is the model moving forward"* settled it — HAL took the merged
`GatherModal` in OTA-1319, so all three lines now run one picker. `SalvageModal.tsx`
(507 lines) had **zero real importers on all three** (the only mention left was a test
asserting it is NOT imported) and has been **deleted from all three**. Receipt for why
waiting was the wrong default: the OTA-1312 recolour landed on this exact dead file and
shipped invisible. ⚠ One `git revert` away if the owner wants the two-modal flow back.

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
⚠ Now live on ALL THREE lines: the missing `climbId` branch was found and wired on HAL
and steam during B2, so whatever is decided applies three times.

## B7 — Does a ROUTED arrival at a tower run the GREAT climb? — **RESOLVED — NOT Alpha-class**
**Measured, all five landmarks, on a real `travelTo` arrival:**

| climb | arrived | prop on screen | tiers |
|---|---|---|---|
| `grand_spire` | yes | yes | 15 |
| `asgardar_spire` | yes | **no** — arrival puts you at `outpost_gate` | — |
| `obsidian_monolith` | yes | **no** — arrival rolled a hostile | — |
| `thametan_tower` | yes | yes | 12 |
| `zharak_fang` | yes | yes | 11 |

⚠ **The feared outcome did NOT reproduce.** The prop is suppressed by two conditions in
beginScene (`!hubRoomId`, `!hasEnemies`), and **both recover**: leaving the gate or
clearing the fight brings the climb back, and `climbHeightFor` then returns the real
11–15 tiers every time. So the Skyreacher loop is **not** unfinishable and this is not
promoted to Alpha.

⚠⚠ **What IS real, and is fixed in OTA-1322:** the player was told nothing. Set a course
to the Great Obsidian Monolith, arrive into a fight, look around, and the list holds
`pillar` and no monolith — climbing that pillar is a generic 3-tier ascent ending in
"Tier 3/3 cleared", which is exactly the symptom that opened this item and reads as the
chart having lied. A landmark you were ROUTED to is the one noun whose absence must
explain itself. The look now says which of the two reasons applies. New suite ota1323
(6), including the negative case: a landmark whose chart is unused stays silent, because
explaining an unpromised absence would leak the whole Skyreacher set.

## B8 — HAL's shared rarity palette — **DECIDE (owner; default KEEP)**
OTA-1314's de-duplication (four identical hex tables → one module) remains on HAL. Zero
pixels changed; unwinding re-scatters the copies. Owner has been offered the unwind twice
and not taken it — default stands until overruled. ⚠ Now moot in practice: HAL took the
amber picker in OTA-1319, so the module is load-bearing on all three lines.

## B9 — The JS-wedge freeze — **WATCH**
Forensics shipped (OTA-1276 breadcrumb: `freeze forensics: last boot ended mid-action`).
Every device snapshot so far has been a healthy boot; the wedge has not left a breadcrumb
yet. Nothing to chase until a device produces one.

## B10 — N5: off-canon place-name filter — **WATCH (carry-over)**
Held for a second sighting per the standing rule; one sighting on record.

## B11 — A walker that arrives by road — **READY (B7 no longer blocks it)**
Every climb suite still TELEPORTS (`currentLocationId: climb.locationId`), which is how
the missing tower route shipped invisible. B7 has now settled what a routed arrival
resolves to — the great climb, once the prop is on screen — so the open question is only
whether one climb walker should permanently make the journey. ⚠ B7's probe found the two
suppression conditions precisely BECAUSE it travelled instead of teleporting; that is the
argument for doing this.

## B12 — Asgardar's gate eats a `look` — **WATCH (new, found during B7)**
At `asgardar` the player stands in `outpost_gate`, and `look` resolves to intent
`investigate`, which satisfies `canRecoverCore` in the `revelation`/`cores` phases and
**spawns the Core Guardian instead of describing the room**. Receipt: measured twice in
the B7 probe — a bare `look` produced only the Sentinel-Priest Vaelka combat lines, no
look text at all. That is arguably correct (the gate verb is deliberately broad), but a
player typing `look` to orient themselves and getting a boss is worth an owner ruling.
The ota1323 suite documents it and parks the quest phase to work around it.
