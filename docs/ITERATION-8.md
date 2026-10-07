# Iteration 8 — reconciliation and the I-056 trace

Status record written after OTA-1890 (golem-line `dc37a4dd`). Nothing here changes product behaviour.

## 1. Shipped in Iteration 8 (Golem only; nothing promoted to HAL)

| Item | State |
|---|---|
| I-054 Climbing Strap available to all races | shipped (owner decision: keep) |
| I-055 road-door hunt reach restriction | shipped |
| I-010 heal-batch part | shipped; other duplicated heal paths remain open |
| Studio splash (`Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png`) | shipped, OTA-1890 |
| `extra.sourceSha` stamp | shipped, OTA-1890 |
| build-apk opt-in gate | in force (runs 497–503 skipped) |

## 2. Stale records reconciled

- `completionistSpineSweep` **passes 181/181**. The "180/180 fail" claim in earlier reports is stale.
- `interactionStress` look-subset floor (`>= 8`) was a stale, vacuous threshold, not a product defect. A negative control (rotation on: 7, off: 9) proved it never measured rotation. Replaced.
- `playerWalkerSim` failures were a harness defect (walker did not follow the Arbiter's "take it outside" refusal). Fixed in `test-utils/playerWalker.ts`.
- `dogSystemPerfSmoke` is a timing flake and non-blocking by design.
- `engineStateChaosSim.ts` in the heavy-suite pattern is **not** stale: jest-expo collects every file under `__tests__/`, so non-`.test` files are real tests. Documented in `scripts/heavy-suites.mjs`.
- Generated qualification artifacts could be committed because `.gitignore` had no rule. Added (freeze manifests stay tracked).
- `ambientNounVariety` was vacuous (it passed with rotation disabled; its determinism block never ran because coordinates never matched). Hardened and verified by mutation: rotation off, constant seed and random seed each FAIL; unmutated PASSES. `ambientRotationIsReal.test.ts` pins `shuffleSliceSeeded` directly.
- Metro export (D): verified by the clean-CI publisher export (Android, 1840 modules, 86 assets, includes the splash PNG). iOS export not verified.

## 3. Still open / owner-side

- Releases `golem-apk-495` and `golem-apk-496` (accidental topic-branch builds) still exist; deleting releases returned HTTP 403 from this session type. Left untouched, no workaround.
- `golem-apk-478` retitle is blocked by `release-retitle.cjs` because 495/496 claim public v283. After removal: `node scripts/release-retitle.cjs --tag golem-apk-478 --kind apk --apply`.
- I-056 (below) awaits an owner design decision.
- I-010 remaining duplicated heal paths.

## 4. I-056 — why arrival encounters ignore player tier

### 4.1 What the code does

Player-tier protection exists in exactly one place: `pickEnemyForLocationGuaranteed(location, playerHpMax?)` (`app/engine/encounter.ts`) applies `playerRarityCap(hpMax)` from `app/engine/dangerTier.ts` (ladder: hp<60 Common/danger 1; <100 Uncommon/2; <140 Rare/3; else Legendary/5) **only when `playerHpMax` is passed**.

Scene arrival (`gameStore.ts` ~9855–9895) never calls that function. It assembles:

1. `pickEncounterFromLadder(ladderTriple)` — curated Micro-Micro pool, weighted by rarity. **No cap of any kind**, neither location nor player: the authored pool *is* the cap.
2. else `rollEncounter(location)` → `pickGroupForLocation` (22%; `GROUP_TEMPLATES` filtered by `minDanger <= location.danger` only; fixed enemy and count, ±20% HP) or `pickEnemyForLocation` (`chance(50 + danger*8)` and `rarityCapForDanger(location.danger)`).
3. menace extra via `pickEncounterFromLadder` (again uncapped).
4. `rollExtraPackMembers(location, encounter)` — up to 2 extra bodies, location cap only; pack chance rises with danger.
5. `scaleEncounterForContext(encounter, location.danger, scalePower)` — adjusts HP/attack after selection; never changes *who* was picked, and packs get a 1 + 0.22·(n−1) HP premium capped by `packHpCeiling`.

Other callers: hook spawn (~30870) uses `pickEnemyForLocation` (location cap only). The rest ambush (~17565) calls `pickEnemyForLocationGuaranteed(restScene.location)` **without `playerHpMax`**: OTA-245 reverted OTA-243's player cap by explicit owner design ("let the rng gods give them who they were programmed to pick… let them die if they are dumb"). So the "intended player-tier protection" referenced by I-056 is not applied at its one nominal caller either; it is dormant code.

### 4.2 Why a one-line tier-cap patch is insufficient

Capping `pickEnemyForLocation` covers only step 2's single-foe branch. Steps 1, 2-group, 3 and 4 are separate selectors, three of which have no rarity gate at all, and group/pack bodies are *numerous* low-rarity foes whose danger comes from count, not rarity. This matches the A/B evidence (5-body Raider packs, Mud-Wracked Aetherkin fatalities persisted with the single-picker cap applied).

### 4.3 Alternatives

**A. Do nothing (document as owner-intended).** Current = OTA-245 ruling: location, not player, sets danger. Effect: none. Gameplay: lethal wandering stays a player-choice; the Arbiter's danger warning remains the only guard. Risk: none new. Fits the standing owner ruling.

**B. Cap at arrival with a post-selection filter (smallest).** After step 4, drop or demote any selected body whose rarity rank exceeds `playerRarityCap(hpMax)`, and clamp pack size to a tier limit (e.g. tier 1: ≤2 bodies, tier 2: ≤3). One site (`gameStore` arrival block) plus one pure helper beside `playerRarityCap`. Effect: covers ladder, group, menace and extra-pack paths together. Gameplay: weak characters in deep zones meet lone/weaker foes; deep zones feel empty for under-levelled players; reduces lethality, not zero. Risk: contradicts OTA-245 (needs owner re-ruling); curated ladder rooms lose their signature enemies; tests pinning group/pack frequency and story-guardian encounters need review.

**C. Tier-aware scaling instead of selection.** Leave selection alone; add a player-tier multiplier to `scaleEncounterForContext` (pack HP premium and attack bonus shrink for low-tier players, and pack size is the fixed variable). Effect: tunes lethality without removing content. Gameplay: same enemies appear but fights are survivable; "nothing is dangerous" risk if over-tuned. Risk: combat-balance probes and `packHpCeiling` tests move; does not stop 5-body packs from appearing, only softens them.

**D. Warn, don't cap (extend the existing danger-vs-tier warning to arrival).** Surface the OTA-244/1478 warning on *arrival* in tiers that exceed the player's cap, once per location. Effect: no mechanics change; informs the choice. Gameplay: consistent with "let them die if they are dumb" while removing "surprise". Risk: lowest; text-only, pinned by existing warning tests.

### 4.4 Recommendation

**D now, B only if the owner overturns OTA-245.** D honours the standing owner ruling, is player-visible, and cannot regress combat. If the owner wants real protection, **B** is the smallest design that actually closes every path (a single post-selection filter), whereas patching `pickEnemyForLocation` alone is known to be insufficient. Prove any change with a negative control: the filter must fail a test that injects a Legendary body and a 5-body pack at tier 1.

Not blocking the OTA: no severe regression found; this is existing behaviour.
