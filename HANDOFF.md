# Tartaria Realms — Session Handoff

> Branch: `claude/new-session-MvF82`
> Latest OTA: `2026-05-19-113`
> App version: `2.201` (no APK rebuild needed since OTA 092; all changes have been JS-only)
> TypeScript: **0 errors** (`npx tsc --noEmit`)
> Tests: **623 / 623 passing across 55 suites**
> Working tree: clean

---

## 1. What this is

**Tartaria Realms** — a React Native / Expo SDK 52 procedural narrative RPG. Mobile-first Android target. Hermes engine. Owned by `verbal76/tartaria-rpg` on GitHub under the `hot-attic-games` Expo account.

**Setting:** a post-Aetherstone-flood world from the Tartaria Prima rulebook. Player wakes into a buried civilization, picks race + faction + name, plays procedural scenes driven by authored data + light template stitching + on-device LLM narration.

**On-device ML stack:**
- **Classifier (intent + target):** `onnxruntime-react-native` running `all-MiniLM-L6-v2` (int8 quantized, ~22 MB, OTA-downloaded).
- **Generator (Arbiter narration AND parse-fallback):** `Qwen 2.5 0.5B Instruct` via `llama.rn` (~398 MB Q4_K_M GGUF, OTA-downloaded). As of OTA 111 it ALSO handles parser fallback when the dictionary parser returns unknown / low-confidence.
- **Neural TTS (optional voice readout):** `react-native-executorch` running Kokoro-82M (~100 MB, OTA-downloaded on engine toggle).

**Voice I/O:** Optional, off by default.
- **TTS:** Two engines — system (`expo-speech`) and bundled (`Kokoro` via `react-native-executorch`). Settings tab lets the player pick. Bundled has 7 voices, defaults to `AM_MICHAEL`. Lore-respelling lexicon overrides pronunciation of 24 Tartaria words before passing to the engine (added `doesn't` → "duzzent" in OTA 102).
- **STT:** `expo-speech-recognition`. Service-selection logic in `STTManager` queries `getSpeechRecognitionServices()` and picks Android System Intelligence (`com.google.android.as`) on Pixel-class devices, Google Search box (`com.google.android.googlequicksearchbox`) on stock GMS. **Unverified end-to-end on player's device** — see §4.

**Audio:** `expo-av` looping background tracks across 4 contexts (combat / shop / menu / explore) with crossfade.

---

## 2. Architecture cheat-sheet

```
app/
  ai/                  — MiniLM + Qwen orchestrators
  audio/               — AudioManager / AudioController / settings (expo-av)
  components/          — UI primitives + TutorialOverlay + Search / Approach modals
  data/                — Authored JSON: locations, weather, hazards, enemies,
                         items, recipes, quests, races, factions, vendors, NPCs,
                         lore concepts, openings, worldLadder, static_hub.
                         **Each location + hub room declares an `interactables`
                         array** as of OTA 113 — see §3.
  engine/              — Pure logic: parser, llmParser (NEW), combat, crafting,
                         durability, equipment, encounter, hooks, hunts,
                         mysteries, faction quests + stages, faction storylines,
                         world map, weather effects, area search, ambient nouns,
                         status effects, narrative gen, digging, save system,
                         enemy traits, item weight, context injector, hub,
                         edit distance, container loot (NEW in Phase 3)
  screens/             — Title / CharacterCreation / Exploration / Inventory /
                         Crafting / Vendor / Log / Lore / About (3-tab) /
                         ActionReference / Contracts
  state/               — gameStore.ts (Zustand) — ~6800 lines, the spine
  updates/             — checkAndApplyOTA.ts
  voice/               — voiceSettings / TTSManager / TTSController /
                         PiperTTSManager (Kokoro) / STTManager / loreLexicon
App.tsx                — boots hydrate, cognitive, Qwen, audio, TTS, auto-OTA
.github/workflows/
  build-apk.yml        — Gradle APK build (path-gated)
  eas-update.yml       — OTA publish + channel→branch mapping
metro.config.js        — comment bumps trigger APK rebuild (path gate)
app/buildInfo.ts       — OTA_BUILD_ID — bump on every JS-only push
```

---

## 3. Major systems landed THIS session (OTA 093 → 113)

### Parser architecture overhaul (the headline)

**The "stop building stop-gaps" plan** in three phases:

#### Phase 1 — Qwen-backed LLM parse-fallback (OTA 111)
- New file `app/engine/llmParser.ts`. When the dictionary parser returns `intent=unknown` OR `confidence < 0.5`, the input flows to Qwen 2.5 0.5B with a structured prompt: *"Translate to JSON {intent, target}. Available intents: [...]. Scene targets: [...]."*
- Qwen response is defensively parsed (handles markdown fences + prose preamble + invalid intents). Validates against the `Intent` union. Returns `{intent, target, rephrasing}` or null.
- On resolution: re-submits the canonical "verb noun" rephrasing through the dictionary parser via a new `skipPreChecks` flag on `submitPlayerAction`. All intent dispatch code stays untouched — it only ever sees clean parser output.
- On null: falls through to the existing soft refusal.
- Cost: ~200–400 ms on Pixel-class hardware for the fallback path. Fast majority of actions (verb-in-dictionary, noun-in-pool) still resolve in <10 ms.
- Visible UX: "The Arbiter considers your words…" system line lands within 5 ms of fallback trigger (OTA 112) so the player isn't staring at silence.
- Tests: 18 covering not-ready, empty input, clean JSON, markdown fences, prose preamble, canonical-verb routing, "none" intent (meta comments), invalid intent, garbage response, engine throw, empty target, article rules, prompt smoke test.

#### Phase 2 — Author-declared interactables (OTA 113)
- New schema field: `Location.interactables?: string[]` and `HubRoom.interactables?: string[]`.
- **21 macro locations** now declare 4–8 concrete nouns each (`locations.json`).
- **15 hub rooms** now declare 4–7 concrete nouns each (`static_hub.json`).
- `beginScene` sources `ambientNouns` with preference order: authored → `extractAmbientNouns(description)` fallback for procedural / unauthored content.
- Save-restore path AND hub-exit reset path apply the same preference, so older saves get refreshed against authored lists on load.
- Search / Approach modal chips are now deterministic and intentional. No more "states / repair / back" leaking from prose extraction.
- Tests: 9 covering coverage, lowercase, uniqueness, no-banned-tokens (states, repair, time, voice, wind, etc.), 4-noun floor.

#### Phase 3 — Tag-driven container loot (current — see §4)

### Other major fixes landed this session

- **Partial-move death spiral fixed (OTA 104)** — `runMoveCombatRange` no longer grants enemy counter-attacks on weather-slowed PARTIAL moves. Only the full move (range actually changes) provokes counters. Playtest log Observer @ Zharak's Teeth: had 4 Gutter Rats taking 31 HP off a L1 character in three rounds where the player couldn't act.
- **`disarm`/`disable`/`dismantle`/`take apart` verbs route to `open`** (OTA 104). `disarm` removed from `maneuver` (grappling).
- **`take` removed from `accept` synonyms, added to `pickup`** (OTA 104). Long phrasings like "take the trap apart and keep the materials" no longer fire the contract-accept intent.
- **Equip-anything fallback** (OTA 104) — `validSlotsForItem` infers a slot from the item name when the catalog has no entry. Mud-Rend Blade → main/off, *plate/coat/vest → chest, *helm/mask → head, etc.
- **Directional bearing queries** (OTA 104) — `parseDirectionQuestion` recognises "what city is north of me", "what's to the east" with a new `directional` kind. Routes to `surveyAll(map)[direction]`.
- **`doesn't` → "duzzent" + scrub stale ambient pool on load** (OTA 102).
- **COPY LOG button on dead-character rows** (OTA 103). Reads slot's persisted log via new `readSlotLog(slotId)` helper bypassing active-slot indirection.
- **Hub-room descriptions merged into ambient pool** (OTA 108, superseded by Phase 2 authored lists).
- **Modal autofocus removed** (OTA 109) — Search / Approach chips no longer require a second tap to fire (keyboard popup was reflowing the modal).
- **`hubRoomId` closure bug** (OTA 109) — cardinal-travel handler was rewriting the cleared flag back via a stale closure on `player`. Fixed by re-pulling player from `get()` between sets.
- **Enemy preference over inventory in target resolution** (OTA 110) — "sneak up on Aetheric Drone" now resolves to the drone, not the player's Aetheric Torch.
- **Hooks-first chip pool** (OTA 110) — `buildChipPool` in ExplorationScreen surfaces unresolved hook nouns FIRST in the modal, then ambient extracted. Caps at 10, deduped.
- **Long meta-comment guard** (OTA 107) — inputs >100 chars matching "ok ", "we should", "I think", "btw" route to a noted-but-no-action ack instead of firing intents.
- **Open-container loot RNG** (OTA 107) — first open on a recognisable container (lockbox / trap / crate / defenses) grants 1–3 materials via a weighted pool. Now being moved to Phase 3 architecture.
- **STT service selection** (OTA 107) — `STTManager` queries `getSpeechRecognitionServices()`, picks `com.google.android.as` on Pixels / `com.google.android.googlequicksearchbox` on stock GMS instead of relying on the module default which silently fails on Pixels.
- **Cross-scene noun leakage fix** (OTA 112) — when player walks east out of a hub, `ambientNouns` rebuilds from just the macro location, dropping hub-room nouns that were leaking into the wilds scene.

### Pronunciation worksheet
- Generated at `docs/pronunciation-worksheet.md`. Scanned 87 k tokens across `docs/lore-source.txt` + every JSON under `app/data/`, filtered against a 60 k-word American English dictionary plus a fantasy-vocabulary allowlist. Lists 13 invented Tartaria terms (Ae- pre-suggested), 109 names, 60 hyphenated compounds, plus a re-tune column for the existing 24 lexicon entries. **Sitting with the player to fill in.**

---

## 4. Outstanding issues

**Active punchlist:**

- **Phase 3 — tag-driven container loot.** **IN PROGRESS in this session.** Replaces the hardcoded 4-pool table from OTA 107 with derivation from container tags. Same pattern as `scrapEngine` for items. Adding a new container type becomes a data edit, not a code edit.
- **Pronunciation worksheet** — sitting with the player. ~30 min to fold in once filled.
- **STT verification** — player hasn't tested the recognizer service selection (OTA 107) end-to-end yet. Confirmed locally that `start()` runs without throwing on a device list including `com.google.android.as`. Whether events fire after that is the open question. If still broken on next test → STT comes out of the build (player's call: "if it doesn't work it's bloat").

**Known design trade-offs (not bugs):**

- **Qwen mocked in Jest.** All test-time narration AND parse-fallback is templated / mocked. Live behavior should be measured during playtest.
- **LLM parse-fallback adds 200–400 ms** to the unknown / low-confidence path. By design — placeholder Arbiter line fires within 5 ms so the player gets a "considering" beat instead of dead air.

---

## 5. Known-good state

- TypeScript: **0 errors** (`npx tsc --noEmit`).
- Tests: **623 / 623 pass** across 55 suites.
- Latest OTA: `2026-05-19-113`.
- APK version: `2.201` — no APK rebuild needed since OTA 092; the on-device native modules (llama.rn, executorch, expo-speech-recognition, onnxruntime) haven't changed.

---

## 6. Repository conventions

- **Commits** prefixed `feat:` / `fix:` / `chore:` / `refactor:` / `debug:` / `test:` / `perf:` / `ui:` / `content:`. Bodies explain WHY with concrete before/after.
- **OTA bumps:** every JS-only push bumps `app/buildInfo.ts:OTA_BUILD_ID`. Format `YYYY-MM-DD-NNN`.
- **APK triggers:** add a comment line to `metro.config.js` with the date prefix. Bumping that comment fires `build-apk.yml`.
- **Branch:** all work on `claude/new-session-MvF82`.
- **Tests live** in `__tests__/` at repo root. `jest-expo` preset.

---

## 7. Critical files / hotspots

- `app/state/gameStore.ts` — ~6800 lines. The spine. Action handlers, combat resolution, scene management, log persistence, room state, Qwen parse-fallback wiring.
- `app/engine/types.ts` — every shared interface. `Location.interactables` + `HubRoom.interactables` live here.
- `app/engine/parser.ts` — dictionary parser. ~330 verbs across 36 intents. Fast path.
- `app/engine/llmParser.ts` — **NEW**. Qwen-backed fallback. `parseInputViaLLM(text, ctx, qwen)`.
- `app/engine/ambientNouns.ts` — `extractAmbientNouns` heuristic extractor. **Now a fallback only** when a location/hub room doesn't declare `interactables`.
- `app/engine/combatRules.ts` — `buildCombatSteps`, `buildSkillSteps`, `rollMods` aggregator.
- `app/engine/hub.ts` — hub data + `isLeaveHubCommand` / `resolveHubTravel`. `HubRoom.interactables` lives here.
- `app/engine/equipment.ts` — `validSlotsForItem` with name-based slot inference fallback.
- `app/voice/loreLexicon.ts` — 24 lore-word respellings + `cleanForSpeech`.
- `app/voice/STTManager.ts` — speech recognition with service-selection logic.
- `app/data/locations/locations.json` — 21 macro locations, every one declares `interactables`.
- `app/data/world/static_hub.json` — 15 hub rooms, every one declares `interactables`.
- `app/data/lore/concepts.json` — single source for `what is X` lookups AND ActionReferenceScreen.
- `docs/pronunciation-worksheet.md` — current worksheet for lexicon fills.
- `__tests__/llmParser.test.ts` — 18 tests for the Qwen-fallback module.
- `__tests__/interactables.test.ts` — 9 tests locking in the authored-interactables contract.

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

That's the lay of the land at OTA 113. The parser-treadmill is functionally retired: dictionary handles 99% of input fast, LLM catches the rest, authored interactables make noun pools deterministic. Phase 3 (tag-driven container loot) is the last big architectural piece on the punchlist.
