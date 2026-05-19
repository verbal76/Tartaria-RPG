# Tartaria Realms — Session Handoff

> Branch: `claude/new-session-MvF82`
> Latest OTA: `2026-05-19-117` (pending bump for current commit)
> App version: `2.201` (no APK rebuild since OTA 092; all changes JS-only OTA)
> TypeScript: **0 errors** (`npx tsc --noEmit`)
> Tests: **652 / 652 passing across 56 suites**
> Working tree: clean

---

## 1. What this is

**Tartaria Realms** — a React Native / Expo SDK 52 procedural narrative RPG. Mobile-first Android target. Hermes engine. Owned by `verbal76/tartaria-rpg` on GitHub under the `hot-attic-games` Expo account.

**Setting:** post-Aetherstone-flood world from the Tartaria Prima rulebook. Player wakes into a buried civilization, picks race + faction + name, plays procedural scenes driven by authored data + light template stitching + on-device LLM narration.

**On-device ML stack:**
- **Classifier (intent + target):** `onnxruntime-react-native` running `all-MiniLM-L6-v2` (int8 quantized, ~22 MB, OTA-downloaded).
- **Generator (Arbiter narration AND parse-fallback):** `Qwen 2.5 0.5B Instruct` via `llama.rn` (~398 MB Q4_K_M GGUF, OTA-downloaded). As of OTA 111 it ALSO handles parser fallback when the dictionary parser returns unknown / low-confidence.
- **Neural TTS (optional voice readout):** `react-native-executorch` running Kokoro-82M (~100 MB, OTA-downloaded on engine toggle).

**Voice I/O:** Optional, off by default.
- **TTS:** Two engines — system (`expo-speech`) and bundled (`Kokoro`). 24-word lore lexicon for pronunciation overrides.
- **STT:** `expo-speech-recognition`. Service-selection logic in `STTManager` queries `getSpeechRecognitionServices()` and picks Android System Intelligence (`com.google.android.as`) on Pixels, Google Search box on stock GMS. **Unverified end-to-end on player's device.**

**Audio:** `expo-av` looping background tracks across 4 contexts (combat / shop / menu / explore) with crossfade.

---

## 2. Architecture cheat-sheet

```
app/
  ai/                  — MiniLM + Qwen orchestrators
  audio/               — AudioManager / AudioController / settings
  components/          — UI primitives, Search / Approach modals
  data/                — Authored JSON. Each location + hub room + Micro-Micro
                         room declares an `interactables` array (Phase 2 OTA 113+
                         OTA 115). container_loot.json holds 9 archetypes
                         (Phase 3 OTA 114, expanded OTA 115).
  engine/              — Pure logic: parser, llmParser (Qwen fallback),
                         combat, crafting, durability, equipment, encounter,
                         hooks, hunts, mysteries, faction quests, world map,
                         weather effects, area search, ambient nouns,
                         status effects, narrative gen, digging, save system,
                         enemy traits, item weight, context injector, hub,
                         containerLoot
  screens/             — Title / CharacterCreation / Exploration / Inventory /
                         Crafting / Vendor / Log / Lore / About (3-tab) /
                         ActionReference / Contracts
  state/               — gameStore.ts (Zustand) — ~6900 lines, the spine
  updates/             — checkAndApplyOTA.ts
  voice/               — voiceSettings / TTSManager / TTSController /
                         PiperTTSManager / STTManager / loreLexicon
App.tsx                — boots hydrate, cognitive, Qwen, audio, TTS, auto-OTA;
                         pins Android status-bar padding to clear system bar
.github/workflows/
  build-apk.yml        — Gradle APK build (path-gated)
  eas-update.yml       — OTA publish + channel→branch mapping
metro.config.js        — comment bumps trigger APK rebuild
app/buildInfo.ts       — OTA_BUILD_ID — bump on every JS-only push
```

---

## 3. Major systems landed this session (OTA 092 → 117)

### Parser architecture overhaul — three phases

**Phase 1 — Qwen-backed LLM parse-fallback (OTA 111)**
- New `app/engine/llmParser.ts`. When dictionary parser returns `intent=unknown` OR `confidence<0.5`, input flows to Qwen with a structured prompt. JSON `{intent, target}` extracted, validated, rephrased as canonical "verb noun", re-submitted through the dictionary parser via the `skipPreChecks` flag on `submitPlayerAction`.
- Visible "The Arbiter considers your words…" placeholder lands within 5ms of fallback trigger (OTA 112) so the ~300ms wait isn't a silent gap.
- 18 unit tests cover the module.

**Phase 2 — Author-declared interactables (OTAs 113 + 115)**
- New schema field on Location / HubRoom / MicroMicroLocation: `interactables?: string[]`.
- 21 macro locations, 15 hub rooms, **27 procedural Micro-Micro rooms** all declare 4-8 concrete nouns each.
- `beginScene` sources `ambientNouns` with preference: authored → `extractAmbientNouns()` fallback for unauthored content.
- Save-restore + hub-exit reset paths apply the same preference.
- 13 regression tests lock the schema in.

**Phase 3 — Tag-driven container loot (OTAs 114 + 115)**
- New `app/data/world/container_loot.json` — **9 archetypes**: lockbox, trap, crate, automaton, relic_console, wreckage, observatory_array, spire_conduit, tomb.
- New `app/engine/containerLoot.ts` — `classifyContainer()`, `rollFromPool()`, `narrate()`. Pure + rng-injectable.
- Open intent handler now data-driven. Adding a container type is a JSON edit.
- 25 unit tests.

### Other major fixes landed this session

- **Partial-move death spiral fixed** (OTA 104) — weather-slowed PARTIAL moves no longer grant enemy counter rounds.
- **disarm / disable / dismantle / take-apart verbs** route to open intent (OTA 104). `take` removed from accept synonyms, moved to pickup.
- **Equip-anything fallback** (OTA 104) — `validSlotsForItem` infers slots from item name when the catalog has no entry.
- **Directional bearing queries** (OTA 104) — "what city is north of me" routes to `surveyAll(map)[direction]`.
- **`doesn't` → "duzzent"** pronunciation entry (OTA 102).
- **COPY LOG button on dead-character rows** (OTA 103).
- **Modal autofocus removed** (OTA 109) — Search / Approach chips fire first-tap.
- **`hubRoomId` closure bug fixed** (OTA 109) — cardinal travel from hub.
- **Enemy preference over inventory in target resolution** (OTA 110) — "sneak up on Aetheric Drone" resolves to drone, not Aetheric Torch.
- **Authored interactables lead chip pool, only PRIMARY hook noun chips** (OTA 115) — atmospheric hook nouns like "cold/air/draft/breeze" no longer push real interactables off the visible chip row.
- **Long meta-comment guard** (OTA 107).
- **STT recognizer service selection** (OTA 107) — picks `com.google.android.as` on Pixels.
- **Cross-scene noun leakage fix** (OTA 112) — `ambientNouns` rebuilds on hub-exit.
- **First chip clipping** (OTA 116) — `paddingLeft: 2` on Search + Approach modal chip rows.
- **Status-bar overlap fix** (OTA 117 — this commit) — App-level safe view pins `paddingTop: RNStatusBar.currentHeight` on Android so the top row (BACK button, screen titles) clears the system bar on edge-to-edge Android 12+ ROMs.

### Pronunciation worksheet
- Generated at `docs/pronunciation-worksheet.md`. Scanned 87k tokens, filtered against 60k-word American English dictionary plus fantasy-vocabulary allowlist. Lists 13 invented Tartaria terms, 109 names, 60 hyphenated compounds, plus re-tune column for 24 existing lexicon entries. **Sitting with the player to fill in.**

---

## 4. Outstanding tasks (validated current as of OTA 117)

### Open — needs player action

- **Pronunciation worksheet** — fill rows in `docs/pronunciation-worksheet.md` and send back. I batch them into `loreLexicon.ts` (~30 min). No engineering risk.
- **STT verification end-to-end** — pull latest OTA, tap mic, paste the `stt: chosenService=…` log line. Required to confirm OTA 107's service-selection fix works. **Per player request, no dedicated STT section is being expanded** — this stays a single-line punchlist item. If broken on next test → STT comes out of the build.
- **OTA-cache verification at Sinking Cathedral** — playtest screenshot at this scene showed hook-first chip ordering (`statue, figure, frozen, body, steeple, w…`) which is the pre-OTA-115 behavior. Either (a) device hadn't restarted to load the new bundle, or (b) a real bug specific to wild biomes. Player needs to force-close + relaunch the app and re-test. If still broken after restart → I instrument `buildChipPool` to dump the actual scene shape.

### Open — engineering work I can do without player

- **Sim harness for the LLM fallback** — extension of `yearSimulation.test.ts` that fires a batch of novel phrasings through the dictionary→Qwen→re-dispatch pipeline and reports resolution rate. Started this session but had to back out because of an incorrect action signature (`createNewCharacter` is not the actual export name); needs a re-pass with the right API surface.
- **More container archetypes (optional)** — current 9 cover most cases. Possible additions: `mud_pile` (digging spots), `aether_well` (lore wells), `fungal_grove` (organic harvest). Each is a JSON entry.

### Closed / verified working

- Phase 1 LLM parse-fallback architecture ✅
- Phase 2 authored interactables ✅
- Phase 3 tag-driven container loot ✅
- HANDOFF.md refreshed ✅
- Hub-leave cardinal-travel narration (no longer fires every step) — confirmed clean in playtest log after OTA 112
- Partial-move death spiral (combat survivable) — confirmed clean
- Modal first-chip clipping ("rap" → "trap") — fixed in OTA 116, confirmed in playtest

### Won't do (decided)

- **STT fix iteration past current state** — player said "if it doesn't work it's bloat." If next verification round fails, STT comes out entirely rather than further investment.

---

## 5. Known-good state

- TypeScript: **0 errors**.
- Tests: **652 / 652 pass** across 56 suites.
- Latest OTA: `2026-05-19-117` (pending bump for this commit).
- APK version: `2.201` — no rebuild needed; all changes JS-only.

---

## 6. Repository conventions

- **Commits** prefixed `feat:` / `fix:` / `chore:` / `refactor:` / `debug:` / `test:` / `perf:` / `ui:` / `content:`. Bodies explain WHY with concrete before/after.
- **OTA bumps:** every JS-only push bumps `app/buildInfo.ts:OTA_BUILD_ID`. Format `YYYY-MM-DD-NNN`.
- **APK triggers:** add a comment line to `metro.config.js` with the date prefix. Bumping that comment fires `build-apk.yml`.
- **Branch:** all work on `claude/new-session-MvF82`.
- **Tests live** in `__tests__/` at repo root. `jest-expo` preset.

---

## 7. Critical files / hotspots

- `app/state/gameStore.ts` — ~6900 lines. The spine. Action handlers, combat resolution, scene management, log persistence, room state, Qwen parse-fallback wiring.
- `app/engine/types.ts` — shared interfaces. `Location.interactables`, `MicroMicroLocation.interactables` live here.
- `app/engine/parser.ts` — dictionary parser. ~330 verbs across 36 intents. Fast path.
- `app/engine/llmParser.ts` — Qwen-backed fallback. `parseInputViaLLM(text, ctx, qwen)`.
- `app/engine/containerLoot.ts` — open-intent loot resolver. `classifyContainer()` + `rollFromPool()`.
- `app/engine/ambientNouns.ts` — heuristic extractor. **Fallback only** when authored `interactables` missing.
- `app/engine/hub.ts` — hub data + `isLeaveHubCommand` / `resolveHubTravel`. `HubRoom.interactables` lives here.
- `app/engine/worldLadder.ts` — Micro-Micro schema. `MicroMicroLocation.interactables` lives here.
- `app/engine/equipment.ts` — `validSlotsForItem` with name-based slot inference fallback.
- `app/voice/loreLexicon.ts` — 24 lore-word respellings + `cleanForSpeech`.
- `app/voice/STTManager.ts` — speech recognition with service-selection logic.
- `app/screens/ExplorationScreen.tsx` — `buildChipPool()` lives here.
- `app/data/locations/locations.json` — 21 locations, all declare `interactables`.
- `app/data/world/static_hub.json` — 15 hub rooms, all declare `interactables`.
- `app/data/world/worldLadder.json` — 27 Micro-Micro rooms, all declare `interactables`.
- `app/data/world/container_loot.json` — 9 container archetypes.
- `App.tsx` — Android status-bar padding pinned here.
- `docs/pronunciation-worksheet.md` — current worksheet for lexicon fills.
- `__tests__/llmParser.test.ts` — 18 tests for Qwen-fallback module.
- `__tests__/interactables.test.ts` — 13 tests locking in authored-interactables contract.
- `__tests__/containerLoot.test.ts` — 25 tests for archetype matching + weighted rolls.

---

## 8. Quick-start commands

```bash
# Typecheck + unit tests (fast)
npx tsc --noEmit
npx jest

# Push as OTA-only
#  1) edit code in app/
#  2) bump app/buildInfo.ts OTA_BUILD_ID
#  3) commit + push → eas-update.yml fires

# Push as APK rebuild (native config / new deps / version bump)
#  1) bump comment in metro.config.js
#  2) commit + push → build-apk.yml fires (~17–20 min)
```

---

## 9. Status effect reference (action-card layer)

| Kind | Source action | Effect | Duration |
|---|---|---|---|
| `aiming` | `aim` | +2 next ranged attack, consumed on use | 1 round |
| `sprinting` | `dash` / `sprint` | -2 next attack (post-sprint) | 1 round |
| `in_cover` | `take_cover` (partial) | +4 AC vs ranged | 2 rounds |
| `in_cover_full` | `take_cover` ("full cover") | +8 AC vs ranged, ranged auto-miss | 2 rounds |
| `ready` | `ready` | +1 bonus on triggered reaction | 1 round |
| `helping` | `help` | narrative ally bonus | 1 round |
| `overwhelmed` | applied by engine | -2 on evade | 1 round |
| `surprised` | `ambush_strike` enemy trait + maneuver mismatch | -2 next roll, consumed | 1 round |
| `fighting_back` | `fight_back` | next enemy strike → opposed Fighting roll | 2 rounds |
| `quick_fire` | `quick_fire` | +2 next ranged attack | 1 round |
| `dodging` | `dodge` | +4 AC | 2 rounds |
| `blocking` | `block` | +4 AC (also durability/riposte) | 2 rounds |
| `bleed` / `poisoned` / `stun` / `burn_scar` / `armor_severed` / `paralyzed` | damage-type rolls + enemy traits | per `statusEffects.ts` | varies |

---

## 10. Enemy trait reference

Set on enemy entries in `enemies.json`. Read at combat time via `enemyTraits.ts`.

**Stat mods:** `armored` (+2 AC) · `weak_armor` (-2 AC) · `agile` (+1 AC) · `quick` (+1 attack) · `slow` (-1 attack) · `savage` (+1 attack)

**Damage filters:** `resist:<damageType>` (×0.5) · `vulnerable:<damageType>` (×1.5)

**On-hit status:** `bleeder` (50% bleed 3r) · `venomous` (35% poison 3r) · `concussive` (20% stun 1r)

**Per-round / first-strike:** `regenerate` (+1 HP/round, capped at start) · `fast_regen` (+2/round) · `ambush_strike` (+2 first hit of encounter)

---

That's the lay of the land at OTA 117. Three architectural phases of the parser-treadmill cleanup are done. Open items are short and concrete (worksheet fill-in, STT verification, OTA cache verification, optional sim harness rebuild).
