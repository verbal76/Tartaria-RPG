# Tartaria Realms — Punch List BRAVO

**⚠ MOVED TO HAL, 2026-08-17** (owner: *"both probably live on golem since that was the
mainline at the time"*). HAL is the primary line under the standing order, so the live
list rides the live branch now; the golem copy is frozen with a pointer. ⚠ The OTA
numbers cited inside the entries below are GOLEM's — that is the honest provenance of
when each thing actually happened, and they are not renumbered (same rule as ported test
suites). Status audit on the move date: B5 DECIDE (owner wording) · B6 DECIDE ·
B8 effectively settled (the palette became load-bearing when HAL took the amber picker,
OTA-1319g/HAL) · B9 WATCH (every snapshot through 4.29.207 boots healthy — no breadcrumb
yet) · B10 WATCH (one sighting) · B11 READY · everything else DONE/RESOLVED as recorded.

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

## B4b — The vendor Crucible chip lit up and refused — **DONE**
Owner's 4.29.186 log: four taps on the roadside vendor's Fusing Crucible in seventy
seconds, four identical *"not for first-timers"* refusals. `useVendorCrucible` gates on
`macroVisitSeq >= 1` correctly, but only INSIDE the handler — the chip rendered lit and
took the tap. Now gated at render. Same shape as OTA-1024 (*"a lit button that doesn't
fire"*), whose comment sits twelve lines below the fix. New suite ota1324 (4).

## B5 — The bulk sweep holds items out SILENTLY — **DONE (HAL OTA-1344, 2026-08-17)**
✅ Owner greenlit the batch ("let's start ticking them off"); shipped to the proposed
shape. `bulkSellHeldBackNote` (bulkSell.ts) builds the line from the SAME gate filter
that does the holding — "1 piece held back — the Aether-Breath Mask is your only way to
breathe in toxic zones." — and the SELL ALL confirm appends it. Suite ota1344 (4).
### Original entry

OTA-1320 excludes a last gate-satisfier from SELL ALL COMMON GEAR, but the confirm never
says so — a player selling down their pack may notice the mask "refusing to sell" with
no explanation, which is how held-out reads as broken. Proposed: one line in the confirm
body ("1 piece held back — your only way to breathe toxic air."). Catalogue-not-invent:
wording is the owner's.

## B6 — Climb SET COURSE skips the leave-outpost confirm — **DONE (HAL OTA-1345, 2026-08-17)**
✅ Ruled with the tick-off greenlight: THE GATE ASKS EVERY TIME. Mission and climb SET
COURSE now route through the same leave-the-outpost Yes/No the plain course always had
(OTA-035), and the confirm CARRIES the contract (missionId/climbId) so accepting routes
the mission/climb — single-active rules and all — not a bare course. Cancelling stays
inside and routes nothing. Suite ota1345 (3).
### Original entry

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

## B9 — The JS-wedge freeze — **WATCH (second occurrence receipted 2026-08-17; phase forensics shipped, HAL OTA-1351)**
Forensics shipped (OTA-1276 breadcrumb: `freeze forensics: last boot ended mid-action`).
**SECOND FREEZE, 2026-08-17 ~23:47, Pixel 10 Pro XL (Tensor G5), OTA-1350, player Verbal
(full board), Architect outpost.** The OTA-1276 breadcrumb did its job — receipts:
- Died with NO orderly exit; last action `go west` from outpost_central at 23:47:25.954
  (into the Break Room, the session's one unvisited room). The disk log's tail ended
  mid-write 3.6s EARLIER (23:47:22.357) — the batched tail is confirmed unreliable,
  exactly as the boot report warns.
- **Hypotheses REFUTED by receipt:** (1) native completion crash — `Qwen completion
  guard: clean` on the next boot, so the model call finished and marked done; the
  classifier-collision theory died with it. (2) pure store-logic wedge — the exact
  route (Verbal full board, full-loot every room, then `go west` into the Break Room)
  replays CLEAN in JS, second time a B9 route has.
- **Open ambiguity the old crumb cannot close:** "died processing `go west`" vs "died
  later in background work" — the crumb records only the action's arrival.
**HAL OTA-1351 closes that ambiguity for the NEXT occurrence:** the crumb now records
the last CHECKPOINT reached (`received → parsed:<intent> → engine-done → rendered`,
plus `homework:<job>`/`homework-done` for background model work) and the boot report
prints it. A survivor at `engine-done` without `rendered` indicts the render side;
stuck at `parsed:` indicts the engine; `homework:` indicts the background writer.
Nothing further to chase until a device produces a phase-stamped breadcrumb.
**THIRD FREEZE, 2026-08-18 10:56:15.639, same device, OTA-1351 (phase stamps live).**
The disk log caught the death almost exactly: last player action 10:55:42 (`go west`,
Court, then nothing) — the death came 33s later, mid-write of the appStateLine, within
1ms of a background→active transition, 10s after the native context was RELEASED on
backgrounding (`ctx: RELEASED — live=0`), with the reinit watchdog holding
("foreground has not settled"). No action, no homework in flight — the OTA-1351 stamps
cover neither of the paths this death walked. **HAL OTA-1352 stamps the lifecycle
path:** `appstate:<prev>→<next>` first thing in the pressure handler (the third freeze
died on that handler's own log line), `ctx-open`/`ctx-open-done` and
`ctx-release`/`ctx-release-done` bracketing the ~425MB native model calls, and
`qwen-reinit [attempt#N]` at the watchdog's reload. A crumb surviving INSIDE a bracket
incriminates that exact native call. Pattern across all three freezes: app-lifecycle
churn around the model context (the OTA-1195 report's own suspect, instrumented and
still unfixed by design — instrument first, then fix).
**FOURTH FREEZE, 2026-08-18 ~11:37:37, same device, OTA-1352 (lifecycle stamps live),
deliberate speedrun test.** Died mid `take / salvage` tap; the next boot's context
counters reset (opened=1), proving a fresh process. ⚠ The owner's app-switch torture
test in the NEW session — a dozen 2–6s background/active cycles — ALL SURVIVED, so
lifecycle churn alone is exonerated as the sole trigger. The receipt that stands out is
the session's own qwen stats line: **14 generations wasted / 191s of native compute in
~4.5 minutes** (9 of 10 scene intros discarded `cancelled:player-acted-again`), with
per-token cost degrading 1.8→31.1ms right up to death. Unified shape across freezes
2–4: sustained generate-and-discard churn degrades the native model layer until the
process dies at whatever comes next (a travel, an app-switch, a salvage sweep).
**HAL OTA-1353 removes the churn:** the sprint gate (3+ actions in 4s → no live
narration and no bank fill STARTS; `reason=sprinting` in the log proves it working)
plus classifier parity (inference AND session create through the native-ML lock; its
foreground resume debounced like the Qwen re-warm). ⚠ The freeze-#4 dying-breath
crumb (`Last checkpoint reached:`) was cut off the owner's paste — still owed; it names
the exact dying call and stays wanted even with the mitigation shipped.

## B10 — N5: off-canon place-name filter — **WATCH (carry-over)**
Held for a second sighting per the standing rule; one sighting on record.

## B11 — A walker that arrives by road — **DONE (HAL OTA-1346, 2026-08-17)**
✅ `ota1346RoadClimbWalker`: starts inside the outpost, routes Thametan's Tower through
the new B6 confirm, walks every tile with the real travel loop (fights cleared by fiat —
the road is the subject), arrives, takes an honest look, and proves the GREAT 12-tier
climb is standing there — not the generic 3-tier ascent that opened B7. First run paid
for itself already: it caught a war party spawning between look and climb, which is the
exact class of thing a teleporting suite can never see.
### Original entry

Every climb suite still TELEPORTS (`currentLocationId: climb.locationId`), which is how
the missing tower route shipped invisible. B7 has now settled what a routed arrival
resolves to — the great climb, once the prop is on screen — so the open question is only
whether one climb walker should permanently make the journey. ⚠ B7's probe found the two
suppression conditions precisely BECAUSE it travelled instead of teleporting; that is the
argument for doing this.

## B12 — a bare INVESTIGATE summoned a Core Guardian — **DONE (owner ruled)**
⚠⚠ **Promoted from WATCH.** Filed after the B7 probe saw it once at Asgardar; the
owner's 4.29.186 device log then reproduced it at a SECOND capital with a DIFFERENT
verb and **no target at all**:

    [04:03:44] [player] investigate the ground
    [04:03:44] parser: intent=investigate … target=ground resolved=-
    [04:03:44] [combat] Veilkeeper Inarra closes … ★ CORE GUARDIAN

`canRecoverCore` is true in the `revelation`/`cores` phases at any Lost Capital, and
the faction gate's intent list includes `investigate` — which `look` and
`investigate the ground` both resolve to. So orienting yourself in a capital
summons the boss. It is arguably working as designed (the gate verb is deliberately
broad), but "I typed look and a boss appeared" is not a choice the player made.
⚠⚠ **OWNER RULED, and ruled harder than the options offered:** *"guardians should
only come from the summon button, because there are other quests in some of the
capital cities that need to examine the area and the examine summon will eat the
other events."* Narrowing the gate to a resolved noun would have fixed the bare
`look` and left the real collision intact — the block RETURNED before the action's
own handler ran, so any other Capital thread the player was reaching for was eaten.
The verb path is deleted; `summonCoreGuardian` (already wired to ★ SUMMON on both
screens) is the only door. Shipped in ota1325.

## B13 — the `lantern` alias defeated the Aetheric Torch's scarcity — **DONE (owner ruled)**
⚠⚠ Measured from the owner's 4.29.186 log: **five Aetheric Torches taken in about an
hour**, one from nearly every outpost room entered — and **none of them appears in
that room's `spawn: gear=[…]` line.** They come from `itemAliases.ts`, which maps
`'lantern' → 'Aetheric Torch'` (plus `torch`, `broken lantern`, `rusted lantern`,
`dust lantern`, and six more). `lantern` is ordinary authored furniture in the
outpost rooms, so the picker resolves it through `findCatalogItem(…, {aliases:true})`
and hands over a torch.

⚠ **That directly contradicts a deliberate decision.** OTA-752/772 stripped the
Aetheric Torch out of the generic salvage pools with the reasoning written in
`salvagePools.ts`: *"the Aetheric Torch is a managed resource now (its use is a
scarce Rare/Legendary gamble); it no longer falls out of generic rubble."* Vendors
price it at 35 TC. The alias layer quietly restores the free supply the pools removed.

⚠⚠ **OWNER RULED:** *"reduce the free lantern spawn rate, they should be a rare
find, mostly crafted."* Option (a) — the light family is gone from the alias map, so
a room lantern is scenery that SALVAGES.
⚠ **And the fix uncovered a second, older hole:** the `light` pool's weight-4 torch
had been unreachable since arb61's materials filter, which excludes gear — measured
at 3000 lantern salvages, ZERO torches. So before this the alias was the ONLY world
source, and removing it alone would have left none at all. A narrow `rareFind`
escape restores it at ~3% end-to-end, with Aether Crystal (a recipe ingredient)
~7× more common. Shipped in ota1325.

## B14 — Asgardar's gate eats a `look` — **folded into B12**
At `asgardar` the player stands in `outpost_gate`, and `look` resolves to intent
`investigate`, which satisfies `canRecoverCore` in the `revelation`/`cores` phases and
**spawns the Core Guardian instead of describing the room**. Receipt: measured twice in
the B7 probe — a bare `look` produced only the Sentinel-Priest Vaelka combat lines, no
look text at all. That is arguably correct (the gate verb is deliberately broad), but a
player typing `look` to orient themselves and getting a boss is worth an owner ruling.
The ota1323 suite documents it and parks the quest phase to work around it.

## B15 — movementStress is WEDGED: 3,100 actions, 4 travel steps, Day 1 — **CLOSED (root-caused + fixed 2026-08-17, HAL OTA-1347/OTA-1348)**
⚠⚠ Found while re-validating the owed movementStress verdict on 4.29.209+. The sim ends
at `max_actions` having burned 3,100 actions in 2.3 in-game hours with FOUR cardinal
travel attempts counted, one approach, zero refusal lines, zero crashes.
**ROOT CAUSE (instrumented live — the probe run wedged at action 73 the same way):** a
three-part deadlock in the SIM's own decision tree, armed by the 2026-08-06 combat
batch (`1c8b5fbb`, which made escape a contested roll that can FAIL and added the
OTA-1140 rest-in-combat refusal — both wedge ingredients in one commit, which is why
the last healthy run is stamped 2026-08-07):
1. an encounter lands while stamina is low (travel costs 2/step); a failed escape roll
   drains stamina to ≤ 3 with enemies still standing;
2. the sim checked **stamina before enemies**, so it submitted `rest` INTO the fight —
   refused by OTA-1140 at zero time and zero stamina cost;
3. from the second identical refusal on, the arbiter repeat-dedup (OTA-610) swallowed
   the line entirely — no response at all — and the first line matched none of the
   sim's refusal regexes. 3,096 of 3,100 actions burned on that one spot, invisibly.
**FIXES (both shipped standalone):** HAL **OTA-1347** (game) — the rest-in-combat
refusal passes `skipDedup`: a refusal is a direct answer to a player action, not
ambient chatter, and must speak on EVERY tap (a real player mashing REST mid-fight got
one answer then dead silence — the B5 "dead button" read again). Suite
ota1347RestRefusalSpeaks (3) locks it and locks the ambient dedup as untouched. HAL
**OTA-1348** (sim) — movementStress checks enemies BEFORE stamina (flee first, rest
only on peaceful ground), counts the rest-refusal line as a bail, and grows an
anti-wedge tripwire: 200 consecutive silent no-op submits now FAIL FAST naming the
stuck action instead of reporting "zero refusals" after 3,000 invisible ones.

## VERDICTS DELIVERED (2026-08-17) — the two owed from HANDOFF §8
- **encounterStress:276 ("stepDirection spawns a skirmish")** — verdict: FLAKE. A random
  spawn asserted as certain. Passing on 4.29.209 across repeated runs (receipts in the
  session log); it was already failing IDENTICALLY on the pre-change baseline when it
  failed at all. No regression; the assertion is probabilistic by construction.
- **playerInputChaosSim head-noun 0.03** — RETARGETED (HAL OTA-1346) to the OTA-1172
  contract with the split the original analysis recommended: honest inputs must resolve
  ≥95% AND invented-adjective inputs must be REFUSED ≥95% (a confident wrong answer
  spends an item). Both halves pass at 4.29.209+ — the parser was healthy the whole
  time; the test was asserting the contract OTA-1172 deliberately replaced.
