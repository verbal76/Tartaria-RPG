# Tartaria Realms — Session Handoff

> Picked up by: the next chat continuing this branch.
> Branch: `claude/new-session-MvF82`
> Latest OTA: `2026-05-16-052` (pushed)
> Latest APK: build 48 (from commit `a9f341e`)
> Uncommitted work in tree: hook resolution refactor (typecheck + tests pass, not yet committed or pushed)

---

## 1. What this is

**Tartaria Realms** — a React Native / Expo SDK 52 procedural narrative RPG. Mobile-first (Android target shipping; iOS deferred). Hermes engine. Owned by `verbal76/tartaria-rpg` on GitHub under the `hot-attic-games` Expo account.

**Setting:** a post-Aetherstone-flood world from the Tartaria Prima rulebook. The player wakes into a buried civilization, choosing a race + faction + name, then plays through procedural scenes generated from authored data + light template stitching.

**On-device cognitive layer:** `onnxruntime-react-native` running `all-MiniLM-L6-v2` (int8 quantized, ~22 MB, downloaded OTA from HuggingFace on first launch). Used for semantic intent classification, emotion inference, and target resolution (the parser falls back to MiniLM for "search the ruins" → matches the spire hook by cosine similarity). NOT used for text generation — all narrative content comes from JSON + procedural picking.

**Audio:** `expo-av` looping background tracks with 4 contexts (combat / shop / menu / explore) and a settings panel for on/off + volume + Apply.

---

## 2. Architecture cheat-sheet

```
app/
  ai/                 — MiniLM cognitive layer (orchestrator + embedding + inference)
  audio/              — AudioManager / AudioController / settings (expo-av)
  components/         — UI primitives + the TutorialOverlay system
  data/               — Authored JSON (locations, weather, hazards, enemies, items,
                        recipes, quests, hunts, mysteries, faction-storylines,
                        races, factions, vendors, NPCs, lore concepts, openings)
  engine/             — Pure logic: parser, combat, crafting, durability, equipment,
                        encounter, hooks, hunts, mysteries, faction quests,
                        faction storylines, world map, weather effects, area
                        search, ambient nouns, status effects, narrative gen,
                        digging, save system
  screens/            — Title / CharacterCreation (3-step) / Exploration /
                        Inventory / Crafting / Vendor / Log / Lore / About
  state/              — gameStore.ts (Zustand) — ~3700 lines, the engine spine
App.tsx               — boots hydrate, cognitive, audio; mounts TutorialOverlay
assets/audio/         — 7 mp3s (combat ×2, shop ×1, menu ×1, explore ×3)
assets/icon.png       — Tartaria crest (padded for adaptive icon safe zone)
.github/workflows/
  build-apk.yml       — local Gradle APK build (fires on package.json /
                        metro.config.js / app.json changes, paths-ignore app/**)
  eas-update.yml      — `eas update` OTA publish + channel→branch mapping +
                        runtime version guardrail (fires on app/** changes)
metro.config.js       — comment bumps trigger APK rebuild (path gate)
buildInfo.ts          — OTA_BUILD_ID bumped on every JS push for diagnostics
eas.json              — appVersionSource: 'local' (critical, see §5)
```

---

## 3. What's been built (phase-by-phase)

The session is enormous. High-level summary; per-commit detail is in `git log`.

### Pipeline + infra
- Dual-workflow CI: APK builds (slow, native) vs OTAs (fast, JS-only). Path-gated triggers.
- **Critical OTA fix:** server-side channel `preview` → branch `preview` mapping was missing, causing all OTAs to silently no-op. Workflow now creates / verifies / binds the mapping every publish. Runtime version guardrail asserts published RT matches `app.json` version. OTAs land reliably now.
- Verbose OTA-check error capture in AboutScreen surfaces error name + code + message + stack head.
- OTA reload sequence: persist player → dispose audio → shutdown cognitive → `reloadAsync`. Without the dispose passes, native modules (expo-av Sound, ONNX session) pinned the JS bridge open and `reloadAsync` would hang on a black screen.
- Updating overlay with spinner + "screen will go dark ~10s, force-close if past a minute" hint.

### Save system
- Multi-slot saves in AsyncStorage. Permadeath marks the slot DEAD; Resurrection Gems (~0.5% drop) revive.
- `backfillPlayer` migrates legacy save shapes — every new field is optional + defaulted, so old saves load.
- **Critical save-corruption fix:** `persist()` now refuses to write when `player` is null. The failed-load recovery path also clears `activeSlotId` from in-memory state so the next persist doesn't overwrite the slot with null. Was the root cause of "save file is missing the character record" errors.
- Slot-load failure surfaces a recovery modal (Retry / Refresh / Delete) instead of silently failing.

### Combat
- D&D-style: initiative → attack → damage, interactive DiceRoller for each step.
- Damage types (10): bludgeoning, slashing, piercing, burn, electrical, aetheric, radiation, poison, stun, degradation.
- Range bands: arm's reach / close / far. Weapons gated by reach. `advance` / `step back` move bands.
- Status effects: bleed, stun, burn_scar, armor_severed, paralyzed, poisoned, dodging, blocking.
- **Multi-enemy:** `currentScene.enemies[]` + `enemyHps[]` + `activeEnemyIdx`. Group encounters (Bog Hound pack, Mud Wasp swarm, Reclaimer Ambusher, Mud Golem cluster, Black Cloak Agent). EnemyPanel cycles between cards. Every living enemy counter-attacks after each player action.
- **Dodge vs Block:** dodge = binary +4 AC, no wear, no upside. Block = weapon `defense` (0-6) value, d20 roll vs enemy attack, halves damage on success + 25% riposte chance, 2 durability wear either way.
- **Bare-hand:** explicit punch/kick/fist verbs force bare-hand (1d6 bludgeoning) and bypass the equipped weapon, even mid-fight. Unlocks bludgeoning weakness exploitation without wearing your blade.
- **Off-hand:** "attack with the off-hand X" routes to the off slot, wears the off weapon.

### Equipment
- 8 slots: main, off, head, chest, legs, feet, amulet, ring.
- Armor pieces aggregate AC + resistances across all 4 body slots.
- Accessory stat bonuses feed `effectiveStats()` into combat math.
- Durability per piece, wear on hit (weapon) / on hit-taken (every worn armor piece) / on dig (scaled by brittleness).
- Vendor repair: `repair <item>` costs (max − current) TC.
- Race-themed starter primary weapon + faction-themed cheap knife (digger).

### Crafting
- Recipe-based; consumes ingredients from inventory.
- Levenshtein + MiniLM fuzzy matching — "aethetic vest" → Aetheric Vest works.
- **CraftingScreen** with READY TO CRAFT (you have everything) + ALMOST (missing 1-2 ingredients) sections. Tap to craft.

### Narrative systems
- **Stateful narrative hooks** (27 lore-canonical kinds: smoke, footprints, obelisk, wagon, arch, glint, handprint, thread, resonance, half_buried_spire, etheric_storm, pulsing_mud, frozen_statue, sentinel_patrol, mud_golem_stir, temporal_eddy, spatial_warp, whisper_crystal, black_cloak, giant_silhouette, bioluminescent_path, wreck_construct, submerged_steeple, black_market_lantern, aether_grid_hum, sealed_vault_door, preserved_corpse). Each has a 2-3 stage chain with concrete payoffs and optional cross-scene continuation via `worldMemory.pendingChains`.
- **Monster hunts** (5, ~7-9 steps): Bog Dragon, Mud Titan, Sludge Behemoth, Iron Titan, Mud Siren Queen. Bosses scale to player.hpMax.
- **Mystery objects** (5, ~3-5 steps): Red Tower Fragment, Cradle Compass, Leviathan Eye, Temporal Watch, Shifting Obsidian Orb.
- **Faction storylines** (4, ~7-10 steps): Order's Red Tower's Mouth, True Tartarian Path of Ascension, Reclaimer Relic Run, Monarch Silence Across the Border. Big rep + TC payouts.
- **Faction quests** (7 one-step) for quick rep grinds.
- **Ambient nouns** extracted from each location's description so "investigate the buried cities" routes to a flavored ambient-find handler.
- **Area search** — "the mud" / "the doorway" / "to my left" always rolls an outcome (45% nothing, 25% small material, 15% TC, 15% hook plant). No more reprompt-loop.
- **Arbiter hook callbacks** — ~40% chance to reference an unresolved hook instead of pulling a random mood line.

### World
- **Procedural map** — deterministic 21×21 grid per character (`mapSeed` from name+race+faction+timestamp). 21 sparse named locations. Walking N/E/S/W steps the grid; compass in inventory unlocks "where am I" surveys with named neighbours per direction.
- **Lore weather effects** — Etheric Storm (1d4 dmg), Aether Lightning (1d3), Ash Storm (stamina), Iron Fog + Silent Blizzard (block repositioning), Glass Hail (1 dmg), Whisper Fog (corruption tick), Silent Blizzard (stamina+dmg).
- **Post-combat peace window** — `worldMemory.scenesSinceCombat` enforces 2 peaceful scenes after every fight.
- **Dig system** — per-item `digScore` (0-6), RNG loot table weighted by score, "best" tool in pack auto-selected, wear scales with brittleness (Pocket Knife breaks fast, Sentinel Cleaver barely chips). **Spot lockout:** must move to a new `locationId+mapX+mapY` before re-digging (even failed digs lock the spot — closes the spam-rolling exploit).

### Vendors / NPCs / quests
- 12 lore-canonical vendors (Tellin Mak, Vesryn of Varakush, Korash, Naha, Thalan, Irma Ironhand, Velar Shadowblade, Jorah, Halem, Tarek, Felra Swiftfoot, Elara Lightfinger). Faction-aligned vendors post quests + hunts + mysteries + storylines on scene entry.
- 8 important_npcs.json (Elior Zalmar, Harlan Moore, Sasha Ironheart, Drake Volkov, Ivy Solis, Lucius Kincaid, Varakush, Grand Assembly Speaker).
- **VendorScreen** (full-screen): card with name/title/blurb + wallet + offers with kind, rarity stripe, stats, and **"you have N"** count. BACK only (LEAVE removed as redundant).
- Vendor arrival narration: when a vendor lands in a scene, the world feed shows one of 5 flavor lines explaining how they got there.

### UI
- **TitleScreen:** crest + REALMS + flavor + slot list with footer-action buttons (New Tartarian + Lore Codex) right under the list (no big gap on empty), settings ⚙ in a bottom bar.
- **3-step CharacterCreation:** RACE → FACTION → NAME. NAME REQUIRED button focuses the input.
- **BrandedModal** everywhere — no system `Alert.alert` anywhere. Item preview block (kind, rarity color, stats, italic description) used by buy/equip/etc.
- **Inventory:** every tap opens the modal with description + equip/unequip buttons (no silent auto-equip).
- **SearchModal** with examples: "the mud · the rubble · the doorway · the area to my left ..."
- **All BACK buttons** standardized to the big amber bordered ← BACK style.
- **Tutorial system** (TutorialOverlay + TutorialTarget): triggered once after first character creation, persisted via `player.hasSeenIntro`. 11 steps. **Current implementation:** TutorialTarget applies a glow style (amber border + shadow) directly to the wrapped component when its area matches the active step. Overlay shows a small info card anchored to top or bottom edge depending on the step. No coordinate overlay, no dim layer, no drift. **User confirmed this works.**

### Audio
- 7 tracks across 4 contexts. Each context has a pool; random pick on activation, avoids repeating the previous track.
- AudioController subscribes to the game store and derives the active context.
- ~400ms fade-in on context change. **Important:** previous track is hard-stopped before new fade-in starts (no crossfade overlap). Transition epoch counter aborts in-flight fades when a new transition starts.
- Settings: ON/OFF toggle + volume slider + Apply button (force-reapply path for stuck states).

---

## 4. Uncommitted work in the tree (RIGHT NOW)

`app/state/gameStore.ts` — refactored `applyHookEffect` and `resolveHookOneStep` so hook resolutions emit **one combined world log entry** instead of one WORLD line + N separate REWARD entries.

Before:
```
WORLD   You pry the deposit out of the silt. A few good shards...
REWARD  Recovered Aetheric Shard.
REWARD  Recovered Aetheric Shard.
REWARD  Recovered Aether Crystal.
```

After:
```
WORLD   You pry the deposit out of the silt. A few good shards...  ✦ Aetheric Shard, Aetheric Shard, Aether Crystal.
```

Damage / enemy spawn / rep change effects still log separately (different tone). The change passes `npx tsc --noEmit` cleanly and all 103 tests pass.

**Not committed. Not OTA bumped. Not pushed.** Next chat should:
1. Bump `app/buildInfo.ts` (current: `2026-05-16-052`) → `2026-05-16-053`.
2. Commit + push to fire an OTA.

---

## 5. What's left to do

### High priority (active complaints)

1. **Arbiter chatter feels disconnected.** Confirmed from playtest log. The Arbiter fires ~25-45% of the time on every action with mood/intent pool lines that have no contextual relationship to what's happening. Lines like "Some questions only the dust will answer" / "Watch the horizon, it lies less than the ground" appear next to player actions they don't address. Recommendation: lower the base fire rate, prefer hook-callback / recent-action / unresolved-quest references when context-relevant lines exist, drop the generic mood pool when context is available.

2. **"is the fungus in my pack?"** — natural-language inventory question gets routed to `ask` intent and falls through to "I do not have a clean answer." The `ask` handler should detect "is X in my pack" / "do I have X" / "do I own X" / "what about my X" patterns and answer via `player.inventory` lookup.

3. **"inspect locket"** — gives a random Arbiter line instead of surfacing the item's preview text inline. The investigate handler should add an inventory-item match step that returns `getItemPreview(name)` content as a flavored world / arbiter line.

4. **Multiple world texts on rest etc.** — partially addressed by the uncommitted hook-resolution refactor, but other multi-line cases (e.g. rapid rest spam, or dig + system hint pairings) still feel disjointed. Consider an `appendLog` debounce: if the same channel appended within 500ms with no player turn between, merge.

5. **"use torch on aetherstone"** — when the engine's own system hint suggests the exact phrase and the player follows it, the skill check can still fail and produce "The relic stutters." Either guarantee suggestion-following actions, or change the failure narration so it reads as "you tried" rather than "you failed."

### Medium priority (loose ends from earlier sessions)

6. **Inventory reprompt "buried cities, dormant defenses, borderlands, buried, cities, littered"** — ambient nouns are over-extracting filler tokens ("buried", "cities", "littered"). Should drop adjectives / verb participles and only keep noun-phrases. Edit `app/engine/ambientNouns.ts`.

7. **"continue walking"** parsed as TRAVEL correctly but didn't continue the previous wander beat — there's no concept of an in-progress journey. Could add a `lastTravelDirection` so "continue" repeats the last step.

8. **Vendor accept/turn-in failures** — when the player tries to `accept X` or `turn in X` without a vendor in scene, the response is just "find a faction agent" without distinguishing which faction. Could pre-check by quest title and tell the player which vendor type to seek.

9. **Empty pulsing_mud reward inline** — verify the hook-resolution refactor (uncommitted) renders correctly on device. The `reward` channel previously distinguished green-tinted lines; now those land as world. May need a tone adjustment.

10. **OTA reload on iOS not tested.** All current testing is Android. iOS path through `reloadAsync` and audio teardown is untested.

### Low priority / future ideas

11. **Achievement / milestone surfacing** — milestones fire (5 kills → +1 HP max etc) but only as a single line. Could group them on a small ribbon.
12. **Day/night visual tint** — the time-of-day label exists; the screen could subtly tint during night/morning/afternoon/evening.
13. **Long-form quest UI** — active hunts / mysteries / storylines only show in StatsPanel as a comma-separated string. A dedicated CONTRACTS screen would help.
14. **Vendor screen item count of currency** — sometimes vendors offer items the player already owns; could let players sell from the vendor screen instead of only buying.
15. **Companion / NPC follower** — system stub'd via important_npcs but no follower mechanics yet.
16. **Two-handed weapons table (rulebook)** — deferred from the race-starter-items session. The rulebook's Two-Handed Weapons table has ~30 entries spanning Common → Legendary (Rust Rifle, Bone Maul, Mud Long Axe, Aether Lance, Gravity Pike, Mud Army War Hammer, etc.). `weapons.json` currently has only 17 weapons total across all styles, mostly Common. Adding the rulebook's two-handed table would fill out the late-game combat catalog. Each entry has a name, Strength req, damage roll, special effect, rarity, faction/origin, and TC price already laid out — straightforward additions, just needs the JSON and a few tests covering rarity/stat scaling.
17. **Phase 4 §2.2 — Aliases for fuzzy target resolution.** Add an `aliases: string[]` field to Location, Enemy, and Vendor types so the parser can match player phrasing like "workroom" or "the arch" against the canonical entity name. Schema change to types.ts + bulk data edits across locations.json / enemies.json / vendors.json + a parser pass that consults the alias arrays. ~50+ entries to update; design once and run a script across data files.
18. **Phase 4 §3.1 — Persistent MapGraph (Zustand).** Replaces the current X/Y math + per-visit room re-roll with a discrete `Map<roomId, RoomState>` graph. When the player goes N then S they re-enter the exact same room id with the same loot-already-taken / enemies-already-defeated state. Requires a save migration (today's saves carry mapX/mapY only) and a rewrite of stepDirection + beginScene to consult and mutate the graph. Architectural change — book a dedicated session.
19. **Phase 4 §3.2 — Hand-authored 15–20 room starting hub.** Companion to #18. A `static_world.json` with the Reclaimers' Outpost → Culvert → Shallow Digs path, hardcoded N/S/E/W pointers, fixed NPC anchor positions (Tarek lives at coordinate X). Lands the MUD-style "the hub I know" feel that the procedural map can't deliver. Should be authored AFTER the MapGraph lands so the hub uses the same node primitives.
20. **Phase 4 §4.3 — Biome-weighted encounter/loot distribution.** Pool-pick today is uniform within a Micro-Micro. The rulebook implies a tag-weighted roll — aetheric biomes lean mechanical enemies and Etheric Lenses, mud biomes lean fungi and Silt Serpents, etc. Small change in encounter.ts once the ladder data is final.

---

## 6. Known-good state

- TypeScript: 0 errors (`npx tsc --noEmit`).
- Tests: 103/103 passing (`npx jest`).
- Latest published OTA verified to land on device (build 048 has been confirmed pulling OTA 050+).
- APK build 048 is the active baseline. Anyone pulling fresh from the branch and tapping "Check for OTA Update" should land on whatever OTA the workflow last published.

---

## 7. Repository conventions

- **Commits** are prefixed `feat:`, `fix:`, `chore:`, `refactor:`. Bodies explain WHY, often with before/after blocks. Always include the session URL footer.
- **OTA bumps:** every JS-only push bumps `app/buildInfo.ts:OTA_BUILD_ID`. Format `YYYY-MM-DD-NNN`.
- **APK triggers:** add a comment line to `metro.config.js` with the date prefix. Bumping that comment fires `build-apk.yml`. Tag it `aa`, `ab`, `ac`... after the date suffix for ordering.
- **Branch:** all work on `claude/new-session-MvF82`. Never push to `main` without explicit user approval.
- **Tests live** in `__tests__/` at repo root. `jest-expo` preset. Tests should be added for every new engine module.

---

## 8. Critical files / hotspots

- `app/state/gameStore.ts` — ~3700 lines. The spine. Almost every change touches this.
- `app/engine/types.ts` — every shared interface. Read first when in doubt.
- `app/engine/parser.ts` — verb synonyms + intent detection. Add new verbs here.
- `app/components/BrandedModal.tsx` — the modal everyone reuses.
- `.github/workflows/eas-update.yml` — has the channel-mapping fix + runtime guardrail. **Don't touch without understanding why those steps exist.**
- `app/audio/AudioManager.ts` — has the epoch counter that prevents fade overlap. The hard-stop-before-fade-in is intentional.

---

## 9. Quick-start commands

```bash
# Typecheck + tests
npx tsc --noEmit
npx jest

# Local dev (won't actually run on this machine but the harness uses)
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

That's the lay of the land. The next chat should pick up at: commit + push the uncommitted hook-resolution refactor first (small, safe win), then tackle the Arbiter chatter problem (item #1 above) — that's the most visible UX pain point right now.
