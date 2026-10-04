# Guardian Critical-Path Audit — Bounded Priority Map (Addendum Pass)

This file answers the addendum's PRIMARY QUESTION directly: **what production systems can affect, or be
affected by, the player/world gameplay state relevant to a fresh-character nine-Core-Guardian journey.**
It is a compact, priority-ordered synthesis layer over the 19 files already written for Pass 1 — nothing
below duplicates their evidence; everything cross-references by `CAND-####` id or file:line. No existing
evidence was discarded. Two small factual upgrades made during this pass are called out explicitly where
they occur (mainQuest.ts full-body read, closing most of UNK-004).

## A — The nine Core Guardians (authoritative definition/order/prerequisites)

Full detail: `core-guardian-map.md`/`.json`. Compact restatement:

- **Definition authority:** `app/engine/coreGuardians.ts` (CAND-0105) — 9 hand-authored `CoreGuardianDef`
  constants, one per `LOST_CAPITAL_LOCATIONS` entry (`app/engine/mainQuest.ts`, CAND-0193, line 44).
- **Order:** PROVEN NOT FIXED. Both files' own headers state order is free by design.
- **Encounter start:** `spawnGuardianForCapital` (coreGuardians.ts) — no capital-order or story-phase
  argument; scales purely on `player.mainQuest?.coresRecovered.length` (tier 1-9).
- **Resolution / what it unlocks:** defeating a Guardian → player submits the faction's specific
  core-recovery verb (`FACTION_CORE_GATES[factionId].intents`, mainQuest.ts:965) → `advanceMainQuest()`'s
  `core_recovered` trigger (mainQuest.ts:1073-1085) appends the capital to `coresRecovered`, no other
  prerequisite check. At 9 cores: phase → `descent` → (`reached_nexus`) → `choice` → `ended`.
- **Guardian-to-Guardian feasibility — UPGRADED this pass from STRONGLY IMPLIED to PROVEN for the
  mainQuest-authority layer, ONE small gap remains:**
  - Read this pass: `mainQuest.ts:834-1096` in full (`remainingCapitals`, the 3-Core/4-Core twist
    functions, `advanceMainQuest`) — the full body, closing the ~80% of the file left unread in Pass 1.
  - **`advanceMainQuest`'s `core_recovered` case (mainQuest.ts:1073-1085) has NO mission/hunt/quest
    prerequisite check of any kind** — only phase-state guards (`ended`/`choice`/`nexus` block it,
    already-recovered blocks re-recovery). This directly answers §7 of the addendum: it is not
    "possible in principle," it is the literal, only gate in the state machine.
  - `FACTION_CORE_GATES`'s own header (mainQuest.ts:932-943, quoted): *"Phase 2 keeps the gate to a
    simple intent-match check."* The per-faction `intents` array is a **parser-verb match** (the player
    types the right verb once, physically at the capital) — **not** a hunt/mystery/faction-quest
    completion requirement. This closes the part of UNK-004 that asked whether `FACTION_CORE_GATES`
    secretly requires optional content: it does not, by the gate's own documented design.
  - `canRecoverCore` (already confirmed dead as a gate, UNK-005) reinforces this — the owner ruling
    quoted in `core-guardian-map.md` exists specifically so side-capital-city content is NOT a prerequisite.
  - **Remaining gap (small, bounded — not further invested per §10):** whether *physically reaching* a
    Lost Capital's map tile is itself gated by any world-map/travel lock. One targeted grep this pass
    (`grep -rn "LOST_CAPITAL_LOCATIONS" app/engine/worldMap.ts app/engine/travelTime.ts app/state/*.ts`)
    found only REACTIVE checks (code that runs once the player has already arrived), no travel-blocking
    logic. This is evidence toward "no lock," not proof of one, since `worldMap.ts`'s full routing logic
    was not read start-to-end. **UNK-004 downgraded to this one narrow remaining question — see
    `unknowns.md` (updated).**
  - **Verdict: Guardian-to-Guardian, skipping all optional content, is PROVEN ACHIEVABLE at the
    mission/quest-gate layer, and UNPROVEN-BUT-UNCONTRADICTED at the physical-travel layer.**

## B — Existing Walker: production capability → Walker support → gap

Full detail: `existing-walker-map.md`. Addendum-format table (only lines relevant to the Guardian journey):

| Capability | Walker support | Gap |
|---|---|---|
| Fresh character creation | `get().startNewGame({...})` — REAL door | Always race/faction index `[0]`; never varied |
| Routing / movement | `hubFirstStepToward`, `worldMap.ts` helpers — REAL | Untested against Lost Capital destinations specifically (not in `walkOrder()`) |
| Travel / world-clock time | `advanceWalkerClock()` on every `tap()` — REAL clock, but stat/HP allowances substitute for survival pressure | No stamina/hunger pressure during travel (by design allowance) |
| Ambient encounters / combat | `submitPlayerAction`, `pendingRolls`/`resolveRollStep` (forced to 18) — REAL doors, SYNTHETIC dice | Guardian-tier combat never exercised; forced-18 removes the exact stakes a Guardian fight tests |
| Survival (HP/stamina) | `resetForMission()` sets HP/hpMax=600, stamina=staminaMax by direct `setState` | **SYNTHETIC bypass of production door** — not reusable as-is for a Guardian run that must test real survival |
| Inventory / equipment | Not deeply traced | Not read this pass either (UNK-003 supporting files) |
| Consumables / coatings / salvage | Not exercised by name | **GAP — not covered by any scenario family in `walkOrder()`** |
| Loot | Not exercised by name | Same gap |
| Progression / stat allocation | Not traced | **GAP — no evidence this Walker ever allocates stat points found** |
| Guardian admission / combat / resolution | **NONE** | **ABSENT — proven by exhaustive grep, zero references to Guardian/mainQuest domain** |
| Persistence / snapshots | `get().persist()` exists on the store; not called by the Walker | **GAP — no save/reload exercised by the Walker** |
| RNG observability | `walkerWorldDigest()` (SHA-256, epoch-masked) proves replay-determinism for the scenario families it knows | Not proven for Guardian combat (never exercised) |

**Net: 8 of 12 rows are full gaps for the Guardian journey specifically** (consumables/coatings/salvage,
loot, progression/stat-allocation, Guardian admission/combat/resolution, persistence/snapshots, and
inventory/equipment which is unverified rather than confirmed). This is the headline number for a future
Walker-extension estimate.

## C — Player/world state spine (Guardian-journey-relevant subset)

Full detail: `character-state-inventory.md` (112 fields, all groups). The fields that actually matter for
this specific journey: `hp`/`hpMax`/`stamina`/`staminaMax`/`stats`/`ac` (combat viability),
`mainQuest.phase`/`mainQuest.coresRecovered` (the Guardian progress record itself),
`currentLocationId`/`gridX`/`gridY`/`hoursElapsed` (where/when), `inventory`/`equipped`/`tc` (gear a
Guardian fight is scaled against, via `guardianPlayerPower()`), `factionStanding` (which faction's
`FACTION_CORE_GATES` intent applies), `dog`/`golem` (companion term in Guardian scaling, per
`coreGuardians.ts`'s power formula). Everything else in the 112-field inventory (lore, lore-adjacent
discovery fields, most mission-tracking fields for OPTIONAL content) is SUPPORTING or PERIPHERAL to this
specific journey — see §H.

## D — Systems that read/write that state (relevance-tagged candidate index)

Full detail/every candidate: `system-candidates.md`/`.json` (341 entries, unchanged — see note on
candidate-count discipline below). Relevance tags below are additive metadata, not a rewrite:

| Tag | Count | Composition | Priority letter |
|---|---:|---|---|
| **CORE** | 275 | 240 gameplay-rule/content modules + 26 gameplay-state-orchestration modules + 9 zustand slices | B, C, D |
| **SUPPORTING** | 27 | diagnostics/telemetry layer — relevant only for observability (G), not gameplay state itself | G |
| **PERIPHERAL** | 39 | 20 on-device AI/cognition (Qwen assistant/narrator, not enemy AI) + 15 TTS/STT voice + 3 OTA/update + 1 build config | none — application infrastructure, out of the critical-path spine |

Highest-relevance CORE candidates for this specific journey, by CAND id (spine anchors, not an exhaustive
list — see `relationship-ledger.md` for their evidenced connections): `coreGuardians.ts` (CAND-0105),
`mainQuest.ts` (CAND-0193), `combatResolution.ts` (CAND-0291), `encounter.ts` (CAND-0126),
`powerRating.ts` (CAND-0221), `worldMap.ts` (CAND-0286), `character.ts` (CAND-0082),
`factions.ts`/`factionRelations.ts` (CAND-0141/CAND-0139), `saveSystem.ts`/`saveExport.ts`/`saveTrim.ts`
(CAND-0242/0241/0243), `dogCompanion.ts`/`golems.ts` (CAND-0119/0158), `travelTime.ts` (CAND-0265),
`questStage.ts` (CAND-0227). Optional-content anchors (relevant only to explain non-appearance, priority
H): `hunts.ts` (CAND-0167), `mysteries.ts` (CAND-0205), `factionStorylines.ts` (CAND-0140),
`factionQuests.ts` (CAND-0137), `whispers.ts` (CAND-0282), `contractBroker.ts` (CAND-0102),
`collectables.ts` (CAND-0089).

**Candidate-count discipline note (addendum §4):** the original 341-entry sweep was already at
file/module granularity, not function/item/content-instance granularity — it does not contain one entry
per hunt, per enemy type, per item, or per Guardian (all 9 Guardians are inside the single `CAND-0105`
candidate; all 18 hunts are inside the single `CAND-0167` candidate). No retroactive count reduction was
needed to comply with §4; the relevance tagging above is the addendum-requested prioritization layer.

## E — RNG and gameplay clocks actually on this critical path

Full inventories: `rng-inventory.md`/`.json`, `clock-inventory.md`/`.json` (unchanged, all doors still
recorded — RNG and clocks were not touched, per the standing hard rule). Filtered to the Guardian
journey: the RNG doors that matter are `app/engine/rng.ts`'s core wrapper (CAND-0236) as consumed by
`combatResolution.ts` (every fight, including Guardian fights, per REL-000010) and `encounter.ts`/
`powerRating.ts` (the shared power-proxy formula `guardianPlayerPower()` reuses, per REL-000004) — i.e.
Guardian combat draws on the SAME RNG door as ordinary combat, not a separate one. The clock that matters
is **CLK-WORLD-01** (`player.hoursElapsed`, read directly by `coreSettleState` in `coreGuardians.ts`) —
the in-fiction clock a Guardian's post-defeat settle window (`CORE_SETTLE_HOURS=8`) is measured against.
Wall-clock/device-time clocks (CLK-REAL-01 and the AI-subsystem timers) are not on this path.

## F — Persistence affecting Guardian-journey state

Full detail: `persistence-map.md`. The entire persisted Guardian-progress record is
`player.mainQuest: { phase, coresRecovered: string[] }` — small, clean, and the array membership check IS
the "Guardian defeated" boolean (no separate flag exists). Everything else relevant to a before/after
snapshot of a Guardian run (HP, inventory, gear drops, `hoursElapsed`, faction standing) rides in the
ordinary slot-save blob; no RNG-seed persistence exists in production (confirmed absent, unchanged
finding).

## G — Observability doors relevant to a Guardian run

Full detail: `existing-observability.md`. Nothing combat-specific exists (unchanged finding). The two
instruments most reusable for a future Guardian-run trace without new instrumentation: `gameLog.ts`'s
channel-tagged log array (every action/roll/outcome already flows through it) and `playerWalker.ts`'s
`walkerWorldDigest()` SHA-256 replay-fingerprint pattern (test-time only today, but the pattern is
directly reusable for a Guardian Walker's own before/after snapshots).

## H — Optional-content systems (why they will NOT appear in a critical-path run)

Full detail: `excluded-content-map.md` (unchanged). Confirmed this pass, directly from `advanceMainQuest`
and `FACTION_CORE_GATES`'s own "simple intent-match" design comment (§A above): hunts, mysteries,
faction storylines, faction quests, the contract board, whispers, towers/trap-dive, and the labyrinth are
**not referenced anywhere in the Guardian-recovery or phase-advancement code path** — their absence from
`advanceMainQuest`'s trigger union (`first_capital_visit` | `core_recovered` | `reached_nexus` |
`chose_ending`, mainQuest.ts:1060-1064) is itself now direct evidence, not inference, that they are
gameplay-optional relative to this specific journey. None are declared useless.

## Bounded unknowns carried forward (unchanged register, one entry updated)

See `unknowns.md`. UNK-004 is updated in place (not renumbered) to reflect the narrowing above — the
mission/quest-gate question is closed; only the physical-travel-lock sub-question remains open, and it is
explicitly bounded rather than pursued further this pass (a full `worldMap.ts` routing read would be the
next investigation, named there). All other unknowns (UNK-001, 002, 003, 006-016) are unchanged.
