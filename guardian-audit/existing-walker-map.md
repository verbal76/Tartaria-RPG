# Guardian Critical-Path Audit — Existing Walker Archaeology (Pass 1)

Two harnesses exist, both under `test-utils/`, both driving the **real production `useGameStore`**
(imported directly — `import { useGameStore, setHomeworkTick } from '../app/state/gameStore'`; `import type
{ GameStore }`) rather than a mock/stub store. `web-harness/gameStoreStub.js` (a separate, small stub) is
used only for the web dev-harness build path, not by either Walker — noted for completeness in
`source-coverage.md`.

## Harness 1 — `test-utils/playerWalker.ts` (1720 lines, read in full)

**This is the current, actively-developed "player-shaped" Walker**, built specifically to replace older
"data-shaped" walkers. Its own header, quoted, states the owner's directive that produced it (2026-09-02):
*"you walkers don't play it the way a human does so it can't seem to catch the plethora of broken mess"*
→ *"continue with the new type of walker, make it as close to the way a player has to interact as
possible."*

### Entry point / setup

- `buildWalkerWorld()` (line 1630) is the world-init entry point: arms the walker clock
  (`installWalkerClock()`), re-seeds RNG (`__TARTARIA_RESEED_RANDOM__` — see `rng-inventory.md`),
  `await get().hydrate()`, then `await get().startNewGame({ name: 'Thumb', raceId: getRaces()[0].id,
  factionId: getFactions()[0].id })` — **this is the real production character-creation door**, not a
  synthetic player object. Calls `get().skipTutorial?.()`, waits for `currentScene` to populate, then
  disarms the store's own 5-second homework interval via `setHomeworkTick(null)` (a REAL production
  stop-path, cited as "already called this way from jest.teardown.js").
- `walkerBaseSeed()` / `walkerDefaultSeed()` — read `globalThis.__TARTARIA_TEST_SEED__`, default
  `0x74617274` (the ASCII bytes for `"tart"`).
- `walkerWorldDigest()` — a SHA-256 fingerprint of `{scene, worldMemory, player, feed}` with all epoch-ms
  timestamps masked out via regex, used to prove two world reconstructions from the same seed are
  byte-identical. Not itself a gate; a verification tool for replay-safety.

### Character creation

Real production door: `get().startNewGame(...)`. Race and faction are always `getRaces()[0]` /
`getFactions()[0]` — i.e. this Walker has never varied race/faction in what was read; it plays ONE
canonical starting build every run (an ALLOWANCE-adjacent fact worth flagging, though not itself listed in
`w.allowances`).

### Seed / RNG handling

See `rng-inventory.md`. In short: production `Math.random()` is unseeded; the Jest process globally
monkeypatches it to a seeded generator via `jest.setup.js`, and this Walker calls
`globalThis.__TARTARIA_RESEED_RANDOM__?.()` once, first, before `buildWalkerWorld` draws anything — this
is Debt #54's fix (quoted in source: re-seeding had to happen before ANY draw, or the world was "dealt from
wherever module import left the cursor," making replay a function of unrelated source-file byte layout).

### Movement / routing

`hubFirstStepToward`, `hubLocationIds`, `findHubRoom` (imported from `app/engine/hub.ts`) and
`canonicalCellOf`/`canonicalDistanceFromGrid` (from `app/engine/worldMap.ts`) are imported and used for
routing logic — the Walker's own header states it **"routes with SET COURSE and the → DESTINATION button,
tile by tile, and fights whatever stands up on the road."** It reads the game's own feed text rather than
computing a path independently wherever possible (per its stated philosophy).

### Encounter / combat handling

Real production doors: `get().submitPlayerAction(text)` (the same intent-parser entry every real player
action goes through), `get().pendingRolls` / `get().resolveRollStep(...)` (the real dice-roll UI's store
state, drained by tapping "ROLL" and forcing every die to land on 18 — an explicit, logged ALLOWANCE, not a
silent skip). `resetForMission()` (line 806) sets `player.hp = 600`, `hpMax = 600`,
`stamina = staminaMax`, `stats.strength/dexterity = 20`, and `factionStanding` to 100 with every faction —
**all via `store.setState(...)` directly (a real Zustand state write, not a store method call)** — before
every mission walk, specifically so no fight is a death and every faction's board is fully visible. This
is the single most consequential ALLOWANCE for a future Guardian Walker to inherit or deliberately NOT
inherit, since it removes the exact stakes a Guardian fight (a genuine, scaled, potentially-lethal boss
encounter) is built to test.

### Inventory / equipment handling

Not deeply traced in this pass beyond `resetForMission`'s filtering (keeps only quest/mission-tagged
inventory items across mission resets). No dedicated equip-loadout logic was found in the portion read.

### Progression / survival

The Walker's stat/HP/standing allowances (above) substitute for genuine survival pressure; `advanceWalkerClock()`
is called on every `tap()` so elapsed game-time is a function of Walker progress, not wall-clock speed
(Debt #173's fix, quoted: hanging the clock in the one `tap()` funnel both `Walker` and `FactionWalker`/
`WhisperWalker` share).

### Loot / salvage / consumables / coatings

Not exercised by name in the code read; the Walker's scope (per `ALL_MISSIONS`, `ALL_FACTION_QUESTS`,
`ALL_WHISPER_CHAINS`) is hunts, mysteries, storylines, faction quests, and whisper chains — none of which
this pass found to specifically drive crafting, coating, or salvage flows. Recorded as a gap, not
inferred as broken.

### Guardian / boss handling — **ABSENT, PROVEN BY EXHAUSTIVE GREP**

`grep -n "Guardian\|guardian" test-utils/playerWalker.ts` returns **zero matches**. `walkOrder()` (line
1368) enumerates exactly three scenario families in registration order — missions (hunt/mystery/storyline),
then faction quests, then whisper chains — and **never references the main quest, Lost Capitals, Core
recovery, or the Guardian summon door.** `mainQuest.ts` and `coreGuardians.ts` are not imported anywhere in
this file. **This Walker cannot currently drive Guardian-to-Guardian progression at all** — it has no
production door wired to `summonCoreGuardian()`, `canRecoverCore`, or any `mainQuest` phase transition.
This is the single most load-bearing finding of this whole Pass-1 audit for the stated end goal: a new
Guardian Walker is not an extension of an existing capability, it is new capability, from the ground up,
on top of a store this Walker already knows how to drive.

### Persistence

Not exercised in the portion read; `get().persist()` is a real gameStore door (see `persistence-map.md`)
but no call to it was found in `playerWalker.ts`.

### Settlement / stop conditions

`Walker.play()` presumably drives a mission to `'complete'` or `'broken'` outcome (the `WalkReport.outcome`
field), with `breaks: string[]` recording every deviation from expected behavior — **the output is
explicitly "a REPORT, not a pass,"** per the file's own header. A `guard++ > 60` cap on the dice-roll drain
loop and a documented 60-round coup-de-grâce allowance for overlong fights (per header) are the only hard
stop conditions found; not independently verified in the code read (the coup-de-grâce mechanism itself was
not located by line number in this pass — see `unknowns.md`).

### Logging / telemetry

`get().appendLog('debug', ...)` is called on every `tap()`. A private `mirror: string[]` + `syncFeed()`
mechanism (line 209-220) tracks the game's own bounded, front-trimming log window by entry IDENTITY rather
than by index, specifically because an earlier version reported empty feeds once the store's
`MAX_LOG_IN_MEMORY` trim ran mid-mission. `PLAYER_WALKER_FEED=1` env var opts a run into recording the
full feed on the report (`WalkReport.feed`), described as "the device log's shape, for reading a break the
way a device log is read" — i.e. deliberately mirroring `existing-observability.md`'s crash/bug-report
format.

### Known shortcuts / mocked / substituted production behavior — every one explicitly logged, not hidden

Per the Walker's own header and confirmed in the code read:
1. HP 600 / STR 20 / DEX 20 / standing 100 with every faction (`resetForMission`)
2. Stamina restored by fiat rather than by resting
3. Every die roll forced to land on 18 (`drainRolls`)
4. A coup-de-grâce past 60 rounds of combat (stated in header; exact mechanism not located in this pass)

### Replay / seed determinism machinery

`REPLAY_SEED_VAR`, `REPLAY_PREFIX_VAR`, `REPLAY_ISOLATE_VAR` env vars; `walkerSelection()`,
`walkerRunMode()`, `replayBlock()` — a broken walk prints an exact, executable replay command (seed +
scenario + sequence-dependence). `walkOrder()`'s ORDER IS THE PREFIX: `beforeAll` builds one world and
every scenario inherits what came before it, so reproducing "the world that broke" means replaying the
identical ordered prefix, not just the one scenario. This determinism machinery is real and well-tested
(its own regression suite is `__tests__/walkerReplaySeed.test.ts`), but it is scoped to the walk order this
harness already knows (missions → faction quests → whispers) — a Guardian scenario key does not exist in
that order today.

### What production door each Walker action uses — summary table

| Walker action | Production door used | Real or synthetic |
|---|---|---|
| Character creation | `get().startNewGame({...})` | REAL |
| Tutorial skip | `get().skipTutorial?.()` | REAL |
| Player action | `get().submitPlayerAction(text)` | REAL |
| Dice roll | `get().pendingRolls` + `get().resolveRollStep([...])` | REAL, with forced-18 allowance |
| Mission accept | `get().acceptFactionQuest(title)`, market building doors | REAL |
| Contract activation | `get().setContractActive(kind, id, bool)` | REAL |
| Building exit | `get().exitBuilding()` | REAL |
| HP/stat/standing reset | `store.setState({...})` direct write | **SYNTHETIC (bypasses any production door)** |
| Homework/hydrate interval | `setHomeworkTick(null)` | REAL production stop-path |
| Guardian summon | **none — not implemented** | **N/A** |
| Core recovery | **none — not implemented** | **N/A** |

## Harness 2 — `test-utils/contraryWalker.ts` (1159 lines — NOT read in full this pass, sampled)

An older, "data-shaped" walker per `playerWalker.ts`'s own framing (it exists to stress non-happy-path
branches — "contrary" choices — across mission families; `docs/contrary-walker-*.md` document specific
runs). Sample evidence: references `FLEE_LINES`, a Guardian's rebuke line pattern
(`/watches you go|The Guardian/`) purely as a FLEE-detection regex, not as Guardian-fight orchestration.
Not traced further in this pass — flagged in `source-coverage.md` and `unknowns.md` (UNK-006) as a gap the
next pass should close before deciding whether any of its machinery is reusable for a Guardian Walker.

## Supporting harness files

- `test-utils/placePlayer.ts` (44 lines) — not read in full.
- `test-utils/factionProbes.ts` (168 lines) — not read in full.
- `test-utils/storeSource.ts` (66 lines) — not read in full; name suggests it exposes gameStore's raw
  source text to a suite (a `check:*` gate likely reads production source as a string for pinning), not a
  Walker capability.
- `__tests__/playerWalkerSim.test.ts` — the suite that actually runs `playerWalker.ts`'s catalogue; its
  `ORDER.indexOf(key) <= UPTO_INDEX` selector logic is the counterpart `walkerSelection()` reads.
