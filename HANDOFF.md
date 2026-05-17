# Tartaria Realms — Session Handoff

> Picked up by: the next chat continuing this branch.
> Branch: `claude/new-session-MvF82`
> Latest OTA: `2026-05-17-029` (pushed)
> Tests: 419 passing across 33 suites
> Working tree: clean (last commit `5877545`)

---

## 1. What this is

**Tartaria Realms** — a React Native / Expo SDK 52 procedural narrative RPG. Mobile-first (Android target shipping; iOS deferred). Hermes engine. Owned by `verbal76/tartaria-rpg` on GitHub under the `hot-attic-games` Expo account.

**Setting:** a post-Aetherstone-flood world from the Tartaria Prima rulebook. The player wakes into a buried civilization, choosing a race + faction + name, then plays through procedural scenes generated from authored data + light template stitching.

**On-device cognitive layer:** `onnxruntime-react-native` running `all-MiniLM-L6-v2` (int8 quantized, ~22 MB, downloaded OTA from HuggingFace on first launch). Used for semantic intent classification, emotion inference, and target resolution.

**Generative layer (Qwen 2.5 0.5B Instruct via llama.rn):** ~398 MB Q4_K_M GGUF, OTA-downloaded. Narrates `travel` / `diplomacy` / `scene_intro` intents — every other intent uses deterministic templates (combat muzzle is hard). `investigate` was REMOVED from the allowlist after Qwen kept hallucinating location names like "Borderlands" / "Aetheric Deep" on `look` commands.

**Audio:** `expo-av` looping background tracks with 4 contexts (combat / shop / menu / explore) and a settings panel for on/off + volume + Apply.

---

## 2. Architecture cheat-sheet

```
app/
  ai/                  — MiniLM cognitive + Qwen generative orchestrators
  audio/               — AudioManager / AudioController / settings (expo-av)
  components/          — UI primitives + the TutorialOverlay system
  data/                — Authored JSON (locations, weather, hazards, enemies,
                         items, recipes, quests, hunts, mysteries,
                         faction-storylines, races, factions, vendors, NPCs,
                         lore concepts, openings, worldLadder)
  engine/              — Pure logic: parser, combat, crafting, durability,
                         equipment, encounter, hooks, hunts, mysteries,
                         faction quests, faction storylines, world map,
                         weather effects, area search, ambient nouns, status
                         effects, narrative gen, digging, save system,
                         enemyTraits, itemWeight, context injector
  screens/             — Title / CharacterCreation (3-step) / Exploration /
                         Inventory / Crafting / Vendor / Log / Lore / About /
                         ActionReference
  state/               — gameStore.ts (Zustand) — ~5400 lines, the engine spine
App.tsx                — boots hydrate, cognitive, Qwen, audio; routes screens
.github/workflows/
  build-apk.yml        — local Gradle APK build (paths-ignore app/**)
  eas-update.yml       — OTA publish + channel→branch mapping (fires on app/**)
metro.config.js        — comment bumps trigger APK rebuild (path gate)
app/buildInfo.ts       — OTA_BUILD_ID bumped on every JS push for diagnostics
```

---

## 3. Major systems landed since the previous handoff

The previous HANDOFF.md ended at OTA `2026-05-16-052`. We're now at `2026-05-17-029` with **30 commits** of additions and fixes. Highlights:

### Action-card layer (Call of Cthulhu cards → engine)
- New intents: `climb`, `swim`, `jump`, `dash`, `disengage`, `help`, `ready`, `mount`, `take_cover`, `aim`, `reload`, `maneuver`, `throw`, `quick_fire`, `multi_fire`, `fight_back`
- Each one has ~10 verb synonyms in the parser (310 total synonyms across 33 intents)
- All routed through a unified **`rollMods()` aggregator** that reads status effects and produces (bonus, penalty, sources, consume) for the next roll
- New status effect kinds: `aiming`, `sprinting`, `in_cover`, `in_cover_full`, `ready`, `helping`, `overwhelmed`, `surprised`, `fighting_back`, `quick_fire`
- `buildCombatSteps` consumes `statusMods` + `pointBlankBonus` so dice prompts show *"STR 5 + aim +2 − sprinting -2 + 2 (point blank)"*

### Combat depth
- **Enemy traits system** — `Enemy.traits: string[]`. 12 trait ids: `armored / weak_armor / agile / quick / slow / savage / bleeder / venomous / concussive / regenerate / fast_regen / ambush_strike` plus `resist:<type>` and `vulnerable:<type>`. All 99 enemies trait-tagged.
- **Enemy dodge** — `agile` enemies have 25% chance to dodge a successful hit; `quick` enemies 15%.
- **Multi-shot bursts** — 2-3 shots in one turn, stacking -2 per shot, auto-resolves all dice in sequence.
- **Quick Fire** — +2 bonus on next ranged attack via `quick_fire` status.
- **Fight Back** — opposed Fighting roll on next enemy strike; player win lands their hit instead.
- **Fighting Maneuver** — build-score comparison (player STR-derived, enemy ability+HP-derived). Penalty dice scale with build mismatch; impossible at 3+ delta.
- **Full vs partial cover** — `in_cover` (+4 AC) vs `in_cover_full` (+8 AC, ranged auto-miss).
- **Auto-advance on range-refused attacks** — engine closes / pulls back for the player instead of refusing the attack.
- **Item weight → throw damage** — name + kind heuristics derive a 1-5 weight; thrown lockets do 1, thrown Steam Cores do 1d8+1.

### World mechanics
- **Weather → stats** — Iron Fog -1 DEX, Etheric Storm +1 INT/-1 WIS, Calm +1 WIS, etc. Folded into `effectiveStats`.
- **Weather → movement** — Iron Fog / Silent Blizzard now SLOW repositioning (2 turns to move one band) instead of blocking entirely. Visible progress: *"Iron Fog slows you down. You push toward the iron spider but the compass spins. (1/2 — type 'advance' again to close)"*
- **Weather → visibility penalty** — Iron Fog -2 on attack rolls, others -1.
- **Time-passed log** — `⏳ Time passed: 45 min` appended after every action that advanced the clock.
- **Intra-scene movement** — "go to the stall" / "walk to the dagger" stays in the room (15 min + 1 stamina) instead of teleporting to a similarly-named macro location. Fuzzy travel match tightened to ≥5 chars + edit distance ≤ 1.
- **Hook continuity** — `HookOutcome.addNouns` registers newly-revealed nouns at each stage so the figure-at-the-firepit etc. stays reachable across the chain. Diplomacy / gift / steal added to `hookEligible`.

### Parser / NLU
- Junk-noun filter (`else`, `anything`, `stuff`, `here`, `there`, etc.) so "is there anything else near me" stops extracting "else" as a target.
- Question-word filter (`where / what / who / why / how / which`) drops from target tails — "examine compass where" extracts "compass".
- Inventory question handler covers `tell me about my X`, `what armor do I have`, `how many rations`, `is X in my pack` — with category lookups (`INVENTORY_CATEGORIES`: armor → list equipped armor, etc.).
- Diplomacy gated on actual NPC presence (no more "your words find purchase" against empty road).
- Dropped `hit` from attack verbs (too polysemous: "I hit look").

### Logging
- `appendLog` race-condition fix: writes now serialize through a `Promise` chain so COPY ALL captures every entry.
- Arbiter dedup (16-entry window) with `skipDedup` opt-out for direct-response lines (bearings, concept answers, range refusals).
- World banner dedup (`[Location] north: ...`) catches double-radar prints.
- Hidden `debug` channel — invisible in the in-game feed, present in COPY ALL. Logs parser decisions, range moves, hook intercepts, dedup suppressions.
- Player attack roll math (`You — d20 14 + STR 5 = 19 vs Reclaimer Ambusher AC 12 — ✓ HIT`) now mirrors the enemy roll line.

### LLM safety
- VOICE_RULES escalated to **`**SECOND PERSON ONLY.**`** with banned phrases (the player / the adventurer / they / etc.) and a post-generation filter that drops sentences using them.
- Strict location anchor: `**The player is at "X". If you name any place, it MUST be "X". NEVER name "Borderlands", "Aetheric Deep"...**`
- `clampSentences()` post-processor — 1 sentence combat, 2 sentences peaceful, so 4-sentence hallucination paragraphs don't escape.
- `investigate` removed from the Qwen allowlist after multiple location-name drift events on `look`.
- System prompt now lists the available player-action vocabulary so the narrator picks verbs the engine can resolve.
- Enemy traits surfaced in the SYSTEM FACTS block: `Mud Tortoise (15/25 HP) [Armored · Slow · Resist Slashing · Resist Piercing]`.

### Player-facing UX
- **Structured `look` description** — assembles macro location + Micro-Micro environment + weather + entities + named room exits + cardinal fallback. Same description fires on `where am I` / `describe my surroundings` etc.
- **Actions reference screen** — full-screen scrollable index of every action in the game, grouped by card (Movement / Combat / Firearms / Evasive / Modifiers / Gathering / Social / Prep / Psych / Skill / Aetheric). Entry: Inventory → ACTIONS button (top-right).
- **Inventory button** prominent in combat (was easy to miss as "pack" at end of row).
- **`flee` quick button** always visible in combat (escape valve when weather locks advance/retreat).
- **Input box clear fix** — `inputRef.current?.clear()` to drop the Android IME composition buffer on submit.
- **Rest at full HP+stamina** refuses cleanly without burning game-time hours.

### Lore
- 28+ new concept entries from the action cards (verbatim text from the photos: dodge_melee, fight_back, dive_for_cover, all firearms actions, all modifiers, all category overviews).
- **Bolt-Caster** added as Tartaria's firearm equivalent — 3 weapon entries (Bone Crossbow re-tagged, Bolt-Caster Uncommon, Aether Bolt-Caster Rare).
- "Magic" replaced with "Aetheric" across concept descriptions per playtester direction.

---

## 4. What's still open

Numbered in **work order** — pick up at item 1 and go down the list. Smaller / less risky items first; the biggest authored-content piece sits at the bottom of the high-priority block by design so you don't get stuck on it.

### High priority (smallest first)

1. **Vendor accept/turn-in faction-specific feedback** — when the player tries to `accept X` or `turn in X` without a vendor present, the response is generic "find a faction agent" without distinguishing which faction. Could pre-check by quest title and tell the player which vendor archetype to seek.

2. **Vendor sell-back** — currently only buying. Closes the trading loop, especially relevant once the two-handed weapons table lands (you'll have stuff to offload to fund the rare gear). Mirror of the existing buy path on `VendorScreen`.

3. **Two-Handed Weapons table from the rulebook** — ~30 entries spanning Common → Legendary (Rust Rifle, Bone Maul, Mud Long Axe, Aether Lance, Gravity Pike, Mud Army War Hammer, etc.) deferred from the race-starter-items session. `weapons.json` has ~22 entries total. Each rulebook row has name / STR requirement / damage roll / special effect / rarity / faction-origin / TC price already laid out — straightforward additions, just needs the JSON and a few tests covering rarity/stat scaling.

### Medium priority (smallest first)

4. **`appendLog` debounce for rapid same-channel writes** — partially mitigated by dedup, but rapid rest spam / dig + system-hint pairings still feel disjointed. Consider a 500ms merge.

5. **Pulsing_mud hook-resolution reward tone** — the green REWARD channel was folded into world during the hook-resolution refactor. May read as flat; visual verification on device wanted.

6. **Contracts screen** — quests / hunts / storylines / mysteries only show in StatsPanel as a comma-separated string. A dedicated screen (parallel to ActionReferenceScreen) would surface active threads.

7. **iOS OTA reload untested.** All current testing is Android. iOS path through `reloadAsync` + audio teardown is untested.

### Low priority / future ideas (smallest first)

8. **Achievement / milestone ribbon** — milestones fire (every 10 checks = +1 stat, every 5 enemies = +1 HP max) but only as one line. A small persistent ribbon would surface them better.

9. **Day/night visual tint** — the time-of-day label exists; the screen could tint during night/morning/afternoon/evening.

10. **Per-maneuver routing** — Fighting Maneuver currently uses STR check for everything. Disarm / trip / shove could route to DEX. Defender's actual stats (not just build) could oppose.

11. **Vertical / intra-location navigation** — "go down there" when the player is on a surface scene and wants to enter the buried structure below. Requires Location → Macro mapping for "downward" semantics. Different problem from intra-Macro sibling traversal.

12. **Vendor sell-back UI polish** — depends on #2. Buyback price scaling (50% of buy price), category sort.

13. **Companion / NPC follower** — `important_npcs.json` exists but no follower mechanics yet.

14. **Bonus die / penalty die proper system** — engine currently treats each die as ±2 flat, which is close enough but not exact to Call of Cthulhu math. A real dice-pool layer with reroll-better-of-two semantics would be more authentic.

15. **Persistent MapGraph (Zustand)** (Phase 4 §3.1) — replaces the current X/Y math + per-visit room re-roll with a discrete `Map<roomId, RoomState>` graph. When the player goes N then S they re-enter the exact same room id with the same loot-already-taken / enemies-already-defeated state. Requires save migration + rewrite of `stepDirection` + `beginScene`. Book a dedicated session.

16. **Hand-authored 15-20 room starting hub** (Phase 4 §3.2) — companion to #15. `static_world.json` with the Reclaimers' Outpost → Culvert → Shallow Digs path, hardcoded N/S/E/W pointers, fixed NPC anchor positions. Lands the MUD-style "the hub I know" feel. Author AFTER MapGraph lands.

---

## 5. Known-good state

- TypeScript: 0 errors (`npx tsc --noEmit`).
- Tests: 419/419 passing across 33 suites (`npx jest`).
- Working tree clean at commit `5877545`.
- Latest published OTA `2026-05-17-029`.

---

## 6. Repository conventions

- **Commits** prefixed `feat:` / `fix:` / `chore:` / `refactor:` / `debug:`. Bodies explain WHY with concrete before/after when helpful. Always include the session URL footer.
- **OTA bumps:** every JS-only push bumps `app/buildInfo.ts:OTA_BUILD_ID`. Format `YYYY-MM-DD-NNN` where NNN is a per-day counter. Bumped before every commit that touches `app/`.
- **APK triggers:** add a comment line to `metro.config.js` with the date prefix. Bumping that comment fires `build-apk.yml`. Tag with date suffix for ordering.
- **Branch:** all work on `claude/new-session-MvF82`. Never push to `main` without explicit user approval. PR #1 tracks this branch.
- **Tests live** in `__tests__/` at repo root. `jest-expo` preset. New engine modules should land with a focused suite.

---

## 7. Critical files / hotspots

- `app/state/gameStore.ts` — ~5400 lines. The spine. Almost every change touches this. Action handlers, combat resolution, scene management, log persistence.
- `app/engine/types.ts` — every shared interface. Read first when in doubt. Includes `Intent`, `StatusEffectKind`, `ScreenName`, `Enemy` (with `traits`), etc.
- `app/engine/parser.ts` — verb synonym pools. ~310 verbs across 33 intents. Add new verbs here.
- `app/engine/combatRules.ts` — `buildCombatSteps`, `buildSkillSteps`, `rollMods` aggregator, `RollMods` interface.
- `app/engine/enemyTraits.ts` — trait registry. `traitACBonus / traitAttackBonus / traitDamageMultiplier / traitOnHitStatus / traitRegen / traitDodgeChance / describeTrait`.
- `app/engine/itemWeight.ts` — name + kind heuristics for throw damage scaling.
- `app/engine/statusEffects.ts` — kind enum, apply/tick/format helpers, `statusAcAdjustment`, `hasFullCover`.
- `app/engine/contextInjector.ts` — builds the Qwen system prompt. **VOICE_RULES** + location anchor + per-relic guardrails live here.
- `app/data/lore/concepts.json` — single source of truth for `what is X` lookups AND the ActionReferenceScreen.
- `app/data/enemies/enemies.json` — 99 enemies, all trait-tagged.
- `app/data/items/weapons.json` — ~22 weapons; this is the file the Two-Handed Weapons table (#1 above) would extend.
- `app/screens/ActionReferenceScreen.tsx` — full-screen action index. Section ids reference concept ids from concepts.json.
- `.github/workflows/eas-update.yml` — has the channel-mapping fix + runtime guardrail. **Don't touch without understanding why those steps exist.**
- `app/audio/AudioManager.ts` — has the epoch counter that prevents fade overlap. The hard-stop-before-fade-in is intentional.

---

## 8. Quick-start commands

```bash
# Typecheck + tests
npx tsc --noEmit
npx jest

# Local dev (won't run on this harness but useful reference)
npx expo start

# Push as OTA-only (JS changes)
# 1) edit code in app/
# 2) bump app/buildInfo.ts OTA_BUILD_ID
# 3) commit + push → eas-update.yml fires

# Push as APK rebuild (native config / new deps)
# 1) bump comment in metro.config.js
# 2) commit + push → build-apk.yml fires (~17-20 min)
```

---

## 9. Status effect reference (action-card layer)

Every action-card verb writes one of these status effects. `rollMods()` reads them on the next roll.

| Kind | Source action | Effect | Duration |
|---|---|---|---|
| `aiming` | `aim` | +2 next ranged attack, consumed on use | 1 round |
| `sprinting` | `dash` / `sprint` | -2 next attack (post-sprint) | 1 round |
| `in_cover` | `take_cover` (partial) | +4 AC vs ranged | 2 rounds |
| `in_cover_full` | `take_cover` ("full cover" / "hide completely") | +8 AC vs ranged, ranged auto-miss | 2 rounds |
| `ready` | `ready` | +1 bonus on triggered reaction | 1 round |
| `helping` | `help` | narrative ally bonus | 1 round |
| `overwhelmed` | applied by engine | -2 on evade | 1 round |
| `surprised` | `ambush_strike` enemy trait | -2 first reaction, consumed | 1 round |
| `fighting_back` | `fight_back` | next enemy strike → opposed Fighting roll | 1 round |
| `quick_fire` | `quick_fire` | +2 next ranged attack | 1 round |
| `dodging` | `dodge` | +4 AC | 1 round |
| `blocking` | `block` | +4 AC (also durability/riposte handled elsewhere) | 1 round |
| `bleed` / `poisoned` / `stun` / `burn_scar` / `armor_severed` / `paralyzed` | damage-type rolls + enemy traits | per `statusEffects.ts` | varies |

---

## 10. Enemy trait reference

Set on enemy entries in `enemies.json`. Read at combat time via `enemyTraits.ts`.

**Stat mods:** `armored` (+2 AC) · `weak_armor` (-2 AC) · `agile` (+1 AC) · `quick` (+1 attack) · `slow` (-1 attack) · `savage` (+1 attack)

**Damage filters:** `resist:<damageType>` (×0.5) · `vulnerable:<damageType>` (×1.5)

**On-hit status:** `bleeder` (50% bleed 3r) · `venomous` (35% poison 3r) · `concussive` (20% stun 1r)

**Per-round / first-strike:** `regenerate` (+1 HP/round, capped at start) · `fast_regen` (+2/round) · `ambush_strike` (+2 first hit of encounter)

---

That's the lay of the land at the close of this chat. Next session should pick up at **item 1** (vendor accept/turn-in faction-specific feedback) — small, contained, closes a long-standing rough edge in the vendor flow. Work down the list in numerical order; smaller / less risky items are deliberately at the top of each priority tier.
