# Guardian Critical-Path Audit — Core Guardian Map (Pass 1)

Authoritative source read in full: `app/engine/coreGuardians.ts` (1397 lines, read start-to-end) and
`app/engine/mainQuest.ts` (read: header spine, `LOST_CAPITAL_LOCATIONS`, `FACTION_CORE_GATES`,
`canRecoverCore`). Machine-readable companion: `core-guardian-map.json`.

## 1. The nine Guardians exist, and there are exactly nine — PROVEN

`GUARDIANS_BY_CAPITAL: Record<string, CoreGuardianDef>` (`coreGuardians.ts:743`) has exactly nine
entries, one per capital in `LOST_CAPITAL_LOCATIONS` (`mainQuest.ts:44`, also exactly nine, `as const`):

| # | capitalId | capitalName | Guardian name | base HP (tier 1, pre-scaling) | base type | signature trait |
|---|---|---|---|---:|---|---|
| 1 | `asgardar` | Asgardar | Sentinel-Priest Vaelka | 30 | `aether_construct` | `aether_pulse` |
| 2 | `samarran` | Samarran | Heir Atalan-Drowned | 35 | `mud_revenant` | `silt_grip` |
| 3 | `nimari` | Nimari | Iron Litany Brother Konrad | 40 | `aether_construct` | `litany_chant` |
| 4 | `drakova` | Drakova | Mother Drakovna | 45 | `aether_construct` | `rosary_curse` |
| 5 | `voronov` | Voronov | Voronov-Beneath High Cantor | 50 | `aether_construct` | `chord_break` |
| 6 | `karok_sa` | Karok-Sa | Sealwarden Tobiel | 36 | `aether_construct` | `sealcraft` |
| 7 | `yuldra_tul` | Yuldra-Tul | Hierophant Mara-of-Yuldra | 42 | `aether_construct` | `giant_vigil` |
| 8 | `ostragar` | Ostragar | Riverbinder Ostros | 44 | `mud_revenant` | `river_bind` |
| 9 | `iskan_veil` | Iskan-Veil | Veilkeeper Inarra | 46 | `aether_construct` | `veil_step` |

These per-capital base HP values are cosmetic/flavor-only for tiers 1–8 in live combat: the module
explicitly overrides them with a **capital-independent canonical curve** (see §3). Each Guardian also
carries a hand-authored `approachLine`, `rebukeLine` (on player flee), and `defeatLine`, and a matched
weapon+armor signature drop in `GUARDIAN_GEAR_BY_CAPITAL` (18 unique items total, all with `uniqueStats`
so they resolve as real equippable gear per OTA-828's fix, quoted in source).

## 2. Guardian ORDER — PROVEN NOT FIXED (design intent states it explicitly)

`mainQuest.ts:14-16`, quoted verbatim from the module's own header:

> `cores (active recovery) → Player visits each Lost Capital and recovers its Core. Order is free.`

`coreGuardians.ts:14-17`, quoted:

> `Difficulty scales by your kill-count, NOT by the Capital. The first Guardian you fight is "Tier 1"
> no matter which Capital you hit first. So the player's choice of order is preserved but the curve is
> fixed: T1 → T2 → … → T9.`

**Classification: PROVEN (not inferred).** There is no canonical Guardian order in this codebase, and
inventing one for a future Walker would contradict the game's own explicit design intent. `tierForKills`
(`coreGuardians.ts:55`) derives the fight's difficulty tier from `coresRecovered.length + 1`, capped at
9 — i.e., from *how many Guardians the player has already beaten*, never from *which capital they are
standing in*. The only two order-adjacent facts on record:

- `isFinalGuardian(coresRecovered)` (`coreGuardians.ts:66`) returns true once
  `coresRecovered.length >= LOST_CAPITAL_LOCATIONS.length - 1` (i.e., the ninth and last Core the player
  takes, by WHICHEVER capital they save for last, gets the fixed `FINAL_GUARDIAN_HP = 660` "last boss of
  the game" treatment instead of the tier-9 curve). The narrative text even self-corrects for this: a
  historical bug (OTA-1468) is documented where the Voronov Cantor's approach/defeat lines hard-coded "the
  Order has watched five [capitals fall]" / "the last seat," which was **wrong** for any player who
  reached Voronov at a different point in their own order — the lines are now templated (`{fallen}`,
  `{seat}`) precisely because order is player-chosen. This is strong corroborating evidence that
  order-independence is a load-bearing design invariant, not an oversight.
- `CORE_SETTLE_HOURS = 8` (§3 below) is a PACING rule between *any two* Guardian fights, not an ordering
  rule between *specific* capitals.

## 3. Prerequisites to fight a Guardian — the exact dependency chain, read from source

A Guardian does **not** appear automatically on arrival. The chain, in order:

1. **Physical presence** — `spawnGuardianForCapital(player, capitalId)` requires
   `LOST_CAPITAL_LOCATIONS.includes(capitalId)` and returns `null` otherwise
   (`coreGuardians.ts:280`). No mission-state check beyond location membership is present in this
   function itself.
2. **The settle window** — `coreSettleState(hoursElapsed, lastCoreAtHours)` (`coreGuardians.ts:1273`)
   refuses a fresh Guardian manifestation for `CORE_SETTLE_HOURS = 8` in-game hours after the player's
   *previous* Core recovery, anywhere. This is a WORLD-CLOCK gate (see `clock-inventory.md` CLK-WORLD-01),
   not a wall-clock gate, and it is satisfied by a single in-game `rest` action (the parser's rest action
   advances the world clock by a fixed 8 hours — cited directly in the source's own derivation comment).
   **This is the one universal timing prerequisite between any two Guardian fights**, and it exists purely
   as anti-speedrun pacing (documented origin: two capitals, Drakova and Voronov, originally sat only
   2 tiles apart on the atlas before a later OTA spread all nine capitals to ≥14 tiles apart). It is
   explicitly NOT meant to be a wall (source, verbatim): *"IT IS NOT A WALL AND IT MUST NOT BECOME ONE.
   Nothing is blocked, nothing is lost, no route is closed: the seat opens on its own after a night."*
   Absent for a player's first-ever Core (defaults to `ready: true`), so it never blocks Guardian #1.
3. **No hostiles present** — `summonHostiles(enemies, hps, knockedOut)` (`coreGuardians.ts:1358`) refuses
   the summon if any *other* living, non-knocked-out enemy currently occupies the scene. This is a
   same-scene combat-state check, not a mission-progression gate — clearing the scene (fight or flee)
   satisfies it.
4. **The SUMMON control itself, deliberately decoupled from other capital-city content.** A direct owner
   ruling is quoted in `mainQuest.ts` around `canRecoverCore`: *"guardians should only come from the
   summon button, because there are other quests in some of the capital cities that need to examine the
   area and the examine summon will eat the other events."* — i.e., the Guardian fight was deliberately
   separated from the generic `investigate`/`examine` verb specifically so that side content living in the
   same capital city does NOT get consumed or blocked by triggering the Guardian. This is the single most
   important piece of evidence for §7 of the parent audit ("can the player skip side content?") — see
   §5 below.
5. **The faction-specific gate verb, for actually TAKING the Core (separate from the fight).**
   `FACTION_CORE_GATES` (`mainQuest.ts:965`) maps each of the 9 playable factions to a small set of
   `Intent`s (e.g. Reclaimers: `investigate`; Mud Monarchs: `attack`/`diplomacy`; True Tartarians:
   `ask`/`rest`) that must be submitted at the capital to receive the Core, narrated via a faction-specific
   hint line logged on arrival. This gate governs the CORE grant's flavor-text/intent-match, is a simple
   intent-membership check (no item/skill-check prerequisite is present in the code read — the module's
   own comment says "Phase 2 keeps the gate to a simple intent-match check. Phase 3+ can layer skill-check
   DCs / item requirements / multi-step sequences on top" — i.e. explicitly NOT yet layered).

## 4. Is straight Guardian-to-Guardian travel, skipping side content, ACTUALLY POSSIBLE? — evidence, not a guess

Based only on what is read above:

- **Reaching any capital requires only world travel** (`app/engine/travelTime.ts`, `app/engine/worldMap.ts`
  — see `system-candidates.md`), which is unconditional on any quest/mission/side-content state. No code
  read in `coreGuardians.ts` or `mainQuest.ts` gates arrival on completing anything else.
- **Triggering the fight requires only the SUMMON control + the settle window + no hostiles present**,
  none of which touch side-quest, hunt, bounty, or mystery state.
- **Taking the Core requires only the faction gate verb**, a same-tick typed action, not a quest chain.
- **The Guardian summon is explicitly, by owner ruling, separated from the `examine`/`investigate` verb
  that WOULD otherwise trigger other capital-city events** — meaning a player using the dedicated SUMMON
  button specifically avoids tripping the side content the audit wants to skip.

**Classification, UPDATED (addendum pass) — mission/quest-gate layer: PROVEN. Physical-travel layer:
UNPROVEN, UNCONTRADICTED.** `mainQuest.ts` has now been read in full (previously ~20%, now 100%,
including `advanceMainQuest` and `remainingCapitals`). Two direct findings close most of the prior
uncertainty:

1. `advanceMainQuest`'s `core_recovered` case (mainQuest.ts:1073-1085) — the ONLY code that advances
   Guardian progress — has **no mission/hunt/quest prerequisite check whatsoever**, only phase-state
   guards.
2. `FACTION_CORE_GATES`'s own header (mainQuest.ts:932-943) states its per-faction `intents` are a
   **"simple intent-match check"** — a typed-verb match at the capital, not a quest-chain completion.

What remains genuinely open (not further pursued this pass, per the addendum's context-guardrail
instruction — see `unknowns.md` UNK-004, updated) is narrower than before: whether *physically reaching*
a Lost Capital tile is gated by `worldMap.ts` routing logic, which was not read start-to-end. A targeted
grep found no travel-blocking code referencing `LOST_CAPITAL_LOCATIONS`, only reactive (post-arrival)
checks — evidence toward "no lock," not proof. Full restatement: `critical-path-map.md` §A.

## 5. What a Guardian fight scales on — for the record, not for repair

`guardianPlayerPower(player)` (`coreGuardians.ts:171`) — best of STR/DEX/INT + a slice of `hpMax` + a gear
term (`playerPowerGear`, imported from `app/engine/powerRating.ts`) — is the single power proxy the tier
curve, the over-level multiplier (`guardianOverLevel`, capped ×1.9), and the monotone HP/AC/damage
staging functions (`monotoneTierHp/ApDelta/DmgBonus`) all read. `FINAL_GUARDIAN_HP = 660` is a fixed floor
for the ninth (final) Guardian regardless of which capital it is. None of this is Guardian-order-dependent;
it is entirely kill-count- and player-power-dependent, corroborating §2.

## 6. `canRecoverCore` body read in full — resolves what §3.5 left open

The function itself (`mainQuest.ts:1029`) is now DEAD as a gate on the Guardian *summon* (its own header
comment states this outright: *"THIS NO LONGER GATES THE SUMMON, AND MUST NOT BE RE-WIRED TO"* — the
summon path is `summonCoreGuardian()` alone). It is kept only because (a) the per-faction route text is
still real flavor, surfaced via `coreGateHint`, and (b) an existing test suite pins the table. Its actual
logic, for the record: `mq.phase` must be `'revelation'` or `'cores'` (NOT `'hook'`) — and per the module's
own header spine, phase flips `hook → revelation` on the player's FIRST arrival at any Lost Capital, so
this is self-satisfying on arrival, not an independent gate; `player.currentLocationId` must be an
un-recovered Lost Capital; and the faction's intent must match `FACTION_CORE_GATES`, with an explicit
permissive fallback (`return true`) for an unmapped/legacy faction. None of this reaches side-quest,
hunt, bounty, or mystery state. This closes the open question this section originally flagged as UNK-005 —
removed.

## 7. Not yet investigated (recorded honestly)

- The exact mission/quest content local to each of the 9 capitals (what "other events" the owner's ruling
  in §3.4 is protecting) was NOT catalogued file-by-file in this pass. `excluded-content-map.md` records
  what general categories of side content exist system-wide, but does not yet map them capital-by-capital.
  This is no longer load-bearing for §4's verdict (that verdict is now sourced directly from
  `advanceMainQuest`'s trigger logic, which proves no such content is required), but remains uncatalogued
  for its own sake.
- `app/engine/worldMap.ts`'s full routing/movement-gate logic was not read start-to-end — the one
  remaining open piece of §4, narrowed by the addendum pass. See `unknowns.md` UNK-004 (updated).
