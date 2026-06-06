# Build Codenames — Dev Cross-Reference

When triaging a bug report, the playtester's About screen / report
email shows a **codename** instead of the raw `OTA_BUILD_ID`. This
file is the lookup table. Keep it open in another tab when reading
bug reports.

> ⚠️ This file is internal. Don't share it with playtesters or paste
> it into anything public. The whole point of the codename layer is
> that testers can't search-engine their way back to the GitHub repo
> via the OTA-NNN pattern — this mapping reverses that and defeats
> the obfuscation if leaked. The repo also flips back to private
> after major build cycles per the OTA-265 workflow plan; the
> mapping stays inside the private repo or your local notes.

## Current mapping

| OTA build ID            | Codename       | Notes                                                      |
|-------------------------|----------------|------------------------------------------------------------|
| `2026-05-31-255`        | Iron Drift     | Auto-resolve dice rolls                                    |
| `2026-05-31-256`        | Mud Mantle     | Investigate dedup wording fix                              |
| `2026-05-31-257`        | Ash Tine       | Investigate chips stay greyed + auto-close modal           |
| `2026-05-31-258`        | Hollow Anvil   | Vendor STEAL stays bright when broke                       |
| `2026-05-31-259`        | Salt Vault     | Hook CONTINUE popup                                        |
| `2026-05-31-260`        | Bone Helm      | Boxing/karate exception on dodge                           |
| `2026-05-31-261`        | Coal Coil      | Dice auto-resolve hold tuned 1500→800ms                    |
| `2026-05-31-262`        | Glass Fence    | SalvageModal: SALVAGE ALL + height-aware                   |
| `2026-05-31-263`        | Crystal Spire  | HookContinueModal: stage history + ABANDON                 |
| `2026-05-31-264`        | Rust Vault     | Crafting: post-craft popup + menu stays open               |
| `2026-05-31-265`        | Stone Mantle   | iOS build (native, GitHub Actions macOS fallback)          |
| `2026-05-31-266`        | Cinder Drift   | iOS Info.plist defensive shotgun                           |
| `2026-05-31-267`        | Smoke Anvil    | Codename obfuscation layer                                 |
| `2026-06-01-268`        | Tin Tine       | About: replace Expo updateId UUID with codename            |
| `2026-06-01-269`        | Brass Coil     | Tool pouch: tappable empty slots + filter + scanner-equip  |
| `2026-06-01-270`        | Lead Helm      | Tool pouch capacity 3 → 4 (3 scanners + 1 tool)            |
| `2026-06-01-271`        | Copper Fence   | TitleScreen Play Store stale-APK nag banner                |
| `2026-06-01-272`        | Slate Spire    | ML crash gate + deferred init + health summary             |
| `2026-06-01-273`        | Pewter Vault   | llama.rn v8.4 misclassification patch (SD865/Exynos990 AAB)|
| `2026-06-01-274`        | Bronze Mantle  | AAB codename split (Slate Keep = 263) + MIN_APK 247 → 263  |
| `2026-06-01-275`        | Granite Drift  | iOS chip overflow + iPad width cap + keyboard auto-dismiss |
| `2026-06-02-276`        | Marble Anvil   | iOS OTA publish gap fix (HaL2001 now publishes iOS to hal2001) |
| `2026-06-02-277`        | Chalk Tine     | Manual keyboard-dismiss ▼ button on input row (iPhone workaround) |
| `2026-06-02-278`        | Soot Helm      | Boot-stage telemetry in About (iOS Qwen-stuck-at-idle diagnostic) |
| `2026-06-02-279`        | Ember Coil     | iOS InputAccessoryView Hide-Keyboard bar + brighter in-row ▼ |
| `2026-06-02-280`        | Ash Fence      | Hide in-row ▼ on Android (system back already dismisses) |
| `2026-06-02-281`        | Pitch Spire    | Remove in-row ▼ on iOS too (InputAccessoryView is the right place) |
| `2026-06-02-282`        | Tar Vault      | Final ▼ state: in-row on iOS, nothing on Android (drops Accessory) |
| `2026-06-02-283`        | Wax Mantle     | Platform-specific OTA publish markers ([ota-ios-only] / [ota-android-only]) |
| `2026-06-02-284`        | Resin Drift    | TRADE NOW button in HookContinueModal when vendor spawned in scene |
| `2026-06-02-285`        | Lacquer Anvil  | Master TTS volume slider (system + Kokoro engines)         |
| `2026-06-02-286`        | Gilt Tine      | Quantity stepper in SCRAP action modal (batch-scrap stacks) |
| `2026-06-02-290`        | Reed Spire     | Emergency rollback — reverts OTAs 287-289 (Pixel 10 boot freeze) |
| `2026-06-02-292`        | Briar Mantle   | Second emergency rollback — Thorn Vault (291) also froze Pixel 10 |
| `2026-06-02-293`        | Husk Drift     | Isolation test — threads 4 → 1 only (no JSON tripling)     |
| `2026-06-02-294`        | Lichen Anvil   | Partial-model-load defense (Qwen sentinel + OTA gate + don't-close banner) |
| `2026-06-02-295`        | Moss Tine      | Recontextualization — threads 1→2 + tripled templates restored |
| `2026-06-02-296`        | Loam Helm      | JSON tripling reverted again (confirmed Hermes choke on Tensor G4) |
| `2026-06-02-297`        | Quartz Coil    | Final stable wave-cap — JS companion to next AAB ([build-aab])    |
| `2026-06-02-298`        | Cobalt Drift   | JSON lazy-load pass — ~220 KB deferred out of cold-start          |
| `2026-06-02-299`        | Nickel Tine    | Android tutorial keyboard gate (input blocked until SKIP/CONTINUE) |
| `2026-06-02-300`        | Zinc Anvil     | Pre-transition keyboard dismiss (name input → BEGIN → tutorial)    |
| `2026-06-03-301`        | Tungsten Spire | Outpost tutorial redesign (APK-only): in-feed Arbiter, name in-game, hub-named exits, pulsing chips, 10 beats from name to first travel course |
| `2026-06-06-305`        | Basalt Anvil   | **iOS door popup THE fix — native `<Modal>` presents INVISIBLY on iPad; render in-tree.** Slate Anvil (304) reached the iPad and *still* failed: bug report on iPad showed the popup hidden AND the EXIT/room buttons dead — player fully stuck (*"it's waiting for your choice in the pop-up, but it doesn't give you the pop-up"*). Confirms the native RN `<Modal>` presents **invisibly** on this iPad — renders nothing but its transparent backdrop still eats every touch, blocking the buttons underneath. (Player typed every tutorial command, so they'd never opened a chip-picker modal — no prior proof native modals render on this iPad.) Fix: `BrandedModal` gains an **`inline`** prop that renders the popup as an in-tree **absolute overlay** (full-screen, `zIndex:9999`) instead of a native `<Modal>`; the door popup uses it on iOS (`Platform.OS==='ios'`). An in-tree overlay always renders + is tappable. Android keeps the native Modal. (Separately, the iPad report shows `Qwen: Load failed` — the on-device LLM won't load on iPad; narration falls back to canned lines, tutorial unaffected — tracked separately.) |
| `2026-06-06-304`        | Slate Anvil    | **iOS door leave/stay popup STILL never appeared — native `<Modal>` present-during-transition race.** Onyx Anvil (303) reached the iPad and fixed the keyboard, but the popup still didn't fire. Cause: it's a native RN `<Modal>` whose `visible` flipped true *during the beat transition* (store-driven re-render, keyboard still dismissing from the typed "investigate door") — iOS silently refuses to present a `<Modal>` then. (Take/Salvage/Climb modals work because the player taps them on a clean frame.) Fix: a local `doorModalVisible` state drives the modal; on the `explore_or_leave` beat, dismiss the keyboard then flip it true on a **~450ms** timer so iOS presents over a settled, keyboard-free frame (`ExplorationScreen`). |
| `2026-06-05-303`        | Onyx Anvil     | **iOS tutorial keyboard fixes + iOS OTA route fix.** iPad TestFlight (build 29) tutorial: the leave/stay **door popup never appeared** (native `<Modal>` can't present over a focused input; the autoFocus floating `KeyboardInputBar` held the keyboard), the keyboard sat over the **Climb** modal, and a **ghost input bar** stuck mid-screen. Fixed in `ExplorationScreen` (widen the floating-bar stand-down to the climb/take pickers + door beat, `Keyboard.dismiss()` on open) + `KeyboardInputBar` (treat an off-screen keyboard frame as a hide so the offset zeroes). ALSO: the iOS build polls the **`preview`** channel but HaL2001 only published `hal2001`, so OTAs never reached iOS ("Last OTA applied: No"); `eas-update.yml` now also publishes **preview→ios** (platform-scoped — Android preview testers untouched), so this fix ships to the installed iOS build as an OTA. |
| `2026-06-05-302`        | Ember Anvil    | **Production promotion of the `arbiters-line` working build (through arb70 / Gold Goblet) onto the HaL2001 conduit.** All tested arbiters-line code (Tier-C title challenges, loot/verb economy, hands+cloak slots, batch sell/scrap, voice-clip root-cause fix, etc.); HaL2001's own store config + workflows kept intact (package `.hal2001`, name "Tartaria Realms HAL", channel `hal2001`) so the AAB/IPA pipeline signs correct store binaries. Shipped as a native **AAB** + **iOS IPA** (`[build-aab] [build-ios]`) and an **OTA to `hal2001`** for existing installs. |
| `2026-06-03-arb1`       | Flint Coil     | **Isolated `arbiters-line` test build — NOT a production OTA.** Tungsten Spire tutorial + uncapped pack + 25-adjective default names + land-in-exploration tutorial-end fix. Sideload-only on the dead `arbiters-line` channel; never published OTA-side. Non-numeric `-arb1` id keeps it out of the OTA-30x sequence. Fresh-minted pair (reserved pool was exhausted). |
| `…arb2`–`…arb39`        | (see `app/buildCodename.ts`) | The `arbiters-line` series tracks its codename↔build mapping in `buildCodename.ts` (the operative source); the doc table only re-lists the milestone arb builds. |
| `2026-06-04-arb40`      | Brass Cellar   | Interior outpost movement is free (0 stamina / 0 time per room — only overland travel draws stamina); 0-stamina overland move now a hard "no stamina — can't travel" stop (was the misleading "you take one step and stop"). Haptic buzz deferred to a native AAB. Fresh-minted (pool exhausted). |
| `2026-06-04-arb41`      | Iron Larder    | Haptic buzz on refused-movement blocks — shipped as an OTA after all (RN core `Vibration` is already used by InputBox, so no native change). 30ms buzz on the 0-stamina gate + setTravelCourse + continueTravel, pairing with the arb40 clear "no stamina" line. Fresh-minted (pool exhausted). |
| `2026-06-04-arb42`      | Copper Cask    | Playtester-tuned default SFX/voice starting values (fresh installs only): music duck 15%→40%, bundled-voice rate 1.35×→1.20×, voice volume 100%→90%. Music on/70%, TTS on, engine bundled, am_michael, pitch 1.00 already matched. Fresh-minted (pool exhausted). |
| `2026-06-04-arb43`      | Pewter Ledger  | Ask the Arbiter overhaul: (1) fixed crashing player-introspection branches ("who am I" etc. read `.races`/`.factions` on array JSON → threw); (2) Qwen persona fallback so personal/open questions answer in-voice instead of going silent; (3) deterministic world-knowledge (list factions/capitals/races, current course) with premise-correction + forgiving parsing. Fresh-minted (pool exhausted). |
| `2026-06-04-arb44`      | Silver Atlas   | Lore fix: tagged the 3 questline capitals (Samarran, Nimari, Voronov) as `lost_capital` in locations.json so the Arbiter's world-knowledge counts all **9** guardian Lost Capitals (was 6). "Name the nine capitals" now answers straight. Fresh-minted (pool exhausted). |
| `2026-06-04-arb45`      | Bronze Sigil   | Arbiter titles become EARNABLE — they were display-only (nothing wrote `earnedTitles`). New `engine/titles.ts` award engine wires the 14 Tier-A/B titles to real mechanics (kills, relics, storms, fusion, repair, lore, derived race/quest state), announces each in the Arbiter's voice, and makes several perks live (Etheric-weather mitigation, relic trade/repair bonuses). Tier-C (6 titles) deferred. Fresh-minted (pool exhausted). |
| `2026-06-04-arb46`      | Nickel Coffer  | Tier-C title challenges plotted + wired, **shipped OFF**. The 6 deferred titles are each a place + a challenge: Wayfarer→Iskan-Veil, Speaker→Red Tower of Nimari, Warden→Sinking Cathedral, Shadow Diver→Endless Stair, Protector→new Sunken Enclave, Guild Broker→new Parley Ground. All entry hooks + title awards wired but inert behind `locationChallenges.TIER_C_ENABLED` (master) + per-challenge `enabled` flags, pending hand-drawn layouts + review. Guild Broker redefined as a two-faction brokering mission with a faction→coveted-item chart (9 low-tier items). New `engine/locationChallenges.ts` (registry/switch/chart) + `docs/tier-c-challenges.md` (build register). Fresh-minted (pool exhausted). |
| `2026-06-04-arb47`      | Zinc Vault     | **Labyrinth of Shadows** (Wayfarer of the Lost Paths title) layout plotted from user-supplied coords — Tier-C, **still OFF**. 25×25 maze, start (1,23)→finish (25,7), 63-cell solution path + 8 dead-end branches (A–H) + 2 intentional diagonal corner-links → `app/data/maze/labyrinth-of-shadows.json` (+ map image `assets/maps/labyrinth-of-shadows.png`). `locationChallenges` gains an optional `layout` field; the labyrinth entry flips `needsLayout:false` but stays `enabled:false` behind `TIER_C_ENABLED`. New `__tests__/labyrinthLayout.test.ts` guards continuity/branch-junctions/no-overlap + still-inert. Fresh-minted (pool exhausted). |
| `2026-06-05-arb70`      | Gold Goblet    | **Voice clip — ROOT CAUSE found and fixed (a real rate-vs-warm-up regression).** Player's key correction: the title line had spoken cleanly for ~two weeks and only *recently* clipped — so it's a regression, not the voice "coming online." Git-confirmed: the default speech **rate was `1.0` for those two weeks** (2026-05-18 → 06-03) and was **raised to `1.2`** by Plasma Coil → Copper Cask (~06-03). The Kokoro warm-up inference in `ensureLoaded` is **hardcoded to `forward('ok.', 1.0)`**. Kokoro's native `forward(text, speed)` pays a cold cost on the **first call at a given speed** that truncates that utterance's head; while the real rate was also 1.0 the warm-up covered the real line, but once the real line ran at 1.2 the 1.0 warm-up no longer warmed that path — so the title line, the session's **first 1.2 forward**, lost its head ("Choose your character" → "aracter"). This fits *every* prior datum: route log showed `bundled-kokoro` (arb68); playback padding (arb65-67) had zero effect because the loss is in the `forward()` output, upstream of playback; only the *first* line clips (later 1.2 forwards are warm); and arb69's `"Welcome."` primer helped precisely because it became the sacrificial first-1.2 forward. **Fix:** warm up at the **configured rate** (`getVoiceSettings().rate`) with a real-length phrase, so the cold-rate cost is paid by the discarded warm-up and the first user-facing line is clean. Reverted the arb68/69 `"Welcome."` primer — the title line is a clean single `"Choose your character."` again. (Lesson logged: anchored on the playback path for arb65-67; the player's "it worked for two weeks" reframed it as a regression and the rate/warm-up mismatch fell out of the git history.) Fresh-minted (pool exhausted). |
| `2026-06-05-arb69`      | Zinc Chalice   | **Voice clip — the polish that lands it.** arb68's disposable lead-in **confirmed the fix works**: the player now hears *"raveler choose your character"* — the ~0.8s first-utterance clip ate the throwaway *"Arise, t"* and **"choose your character" came through intact**. So the mechanism is settled: a fairly consistent ~0.8s clip on the *first* utterance of the session, and anything disposable in front of the real phrase protects it. arb69 cleans up the leftover awkwardness two ways: (1) **split** the greeting into a SEPARATE short primer utterance (`'Welcome.'`) + the real line (`'Choose your character.'`), fired **600ms apart** (> `COALESCE_MS` 400) so they stay two distinct utterances on both engines — the real line is then always a warm **second** playback, never the cold first one, which is robust even if the clip length wanders; (2) the short `'Welcome.'` primer is (near-)wholly consumed by the ~0.8s clip, so instead of the awkward *"raveler"* fragment the player hears at most a soft *"…come"* before a clean *"Choose your character."* (best case: the full, natural *"Welcome. Choose your character."*). The arb68 TTS-route diagnostic in COPY VOICE INFO stays. Fresh-minted (pool exhausted). |
| `2026-06-05-arb68`      | Nickel Goblet  | **Voice clip — the actual fix (loss is upstream of playback) + route diagnostic.** Evidence settled the three-OTA mystery: the player is on **Android running arb67**, so the playback fixes WERE live on-device — yet the title line was *completely unchanged* (a 1300ms silent lead would have been plainly audible). That proves the head is lost **upstream of `playPcm`** — the audio buffer/word itself arrives truncated — so no amount of playback padding (arb65-67) could ever address it. They were architecturally incapable of fixing it. Real fix: (1) the title line `'Choose your character.'` → `'Arise, traveler, and choose your character.'` — a **disposable lead-in clause** so whichever first-utterance truncation is at play (a cold first Kokoro inference, OR Android's well-known system-TTS first-utterance clip) eats the throwaway words and *"choose your character"* survives intact; kept as ONE sentence (commas, no internal terminator) so the bundled engine reads it as a single breath instead of splitting the key phrase into its own fragile first chunk. (2) Removed the dead 1300ms first-utterance lead from `playPcm` (back to a light 90/70ms guard). (3) Added a **TTS-route diagnostic** to COPY VOICE INFO (`getTtsRouteLog`): the last 6 lines now show `route=bundled-kokoro|system-expo-speech · kokoro=<phase> · "<text head>"`, so the next paste reveals definitively whether the title line went out on the bundled neural voice or the device voice — ending the guessing if the lead-in isn't enough. Fresh-minted (pool exhausted). |
| `2026-06-05-arb67`      | Bronze Goblet  | **Voice clip fix, part 3 — the cold-HAL fix that actually holds (first-utterance contiguous lead pad).** After Copper Goblet (arb66) the player still lost *"choose your cha"*. arb66's mechanism — a *separate* silent primer Sound — doesn't work: fired at prewarm-start it's **seconds too early** (the model download is slow, so the audio HAL re-idles long before the title line plays), and a separate Sound that finishes + unloads leaves a **re-idle gap** before the real Sound is created. So the first real utterance was still cold. Fix: drop the separate primer entirely and instead give **only the first utterance of the session** a large **CONTIGUOUS** silent lead pad (**1300ms**) inside its OWN playback buffer. The device routes audio into that silence while the HAL/audio-focus/AudioTrack spin up, and real speech begins only once it's hot — no inter-Sound gap to re-idle through. Every *later* utterance keeps just the light **90/70ms** guard (so the inter-line latency arb7/arb8 tightened isn't reintroduced). The `firstUtterancePlayed` latch is reset in `disposePiperEngine` so a refreshed engine (which can re-cold the HAL) gets the big pad again. Removed `warmAudioOutput()` + its latches. Fresh-minted (pool exhausted). |
| `2026-06-05-arb66`      | Copper Goblet  | **Voice clip fix, part 2 — the REAL cause (cold audio HAL on the session's first sound).** arb65's silent-pad theory (expo-av AudioTrack warm-up) was too small to explain losing ~1.2s off the FRONT of the title line ("Choose your character" → "aracter" drops everything up to mid-"character"). Tracing the line showed it's literally *"the Arbiter's first words when the voice engine comes online"* (`TitleScreen.ReadyFlash`) — i.e. the **first `Audio.Sound` of the session**. The first sound pays a cold **audio-HAL / audio-focus acquisition** penalty: `shouldPlay:true` starts the playback clock but the device routes no audio for up to ~1s, swallowing the head. `prewarmKokoro` warmed the *model* (inference) but never the *output*. Fix: new `warmAudioOutput()` plays a ~150ms **silent** primer (volume 0, never ducks music) to spin the HAL up — fired early in `prewarmKokoro` **in parallel** with the (much slower) model download, and as an awaited backstop on the first `playPcm`. One-time latch + in-flight guard + a 600ms hard ceiling so it can never hang playback. The per-utterance `padSilence` guard from arb65 is trimmed **220/90 → 90/70ms** so it no longer reintroduces the inter-line latency arb7/arb8 tightened (warming, not padding, is the cold-start fix now). Fresh-minted (pool exhausted). |
| `2026-06-05-arb65`      | Tin Goblet     | **Voice start/end clipping fix** (player: "the arbiter is now starting to slip the beginning or end of sentences… in the menu where he is supposed to say choose your character, he now just says *aracter*"). A COPY VOICE INFO confirmed the bundled neural voice (Kokoro am_michael) was finally `ready`/bundled — so this was NOT the system-voice fallback. Root cause: arb7/arb8's `trimSilenceLeadTrail` strips Kokoro's own leading silence pad, which had been absorbing **expo-av's AudioTrack warm-up latency**; once the model actually downloaded (arb55/56) the warm-up began clipping ~200-300ms of real SPEECH off the front (and the unload timing could shave the tail). Fix: a small CONTROLLED silent lead/tail (**220ms / 90ms**) is re-added to the final playback buffer in `playPcm` via a new pure helper `padSilence` (extracted to `app/voice/audioPad.ts` so it's unit-testable without native deps). Applied to the whole crossfade batch, so inter-sentence joins **inside** a batch stay tight — only the batch's start-up and unload eat silence. New `__tests__/audioPad.test.ts` (7 cases: exact lead+tail growth, lead/tail pure-zero, no input mutation, 0ms identity return, negative-clamp). Fresh-minted (pool exhausted). |
| `2026-06-04-arb64`      | Iron Goblet    | **Stress-test fix pass** — a full-suite + static audit (the spawned agents stalled, so done directly) surfaced 6 real regressions from this session, all verified deterministic with false positives ruled out (flaky `dogGolemCombatStress`/`dogSystemPerfSmoke`/`engagementSmoke`/`directionalFindAndCoolStory` + the ~18 pre-existing baseline suites). Fixes: (1) **split-on-equip** kept pointing the slot at a *new* peeled id → flipped so the EQUIPPED copy keeps the **original** id and the remainder is peeled (restores the equipped-id invariant `inventoryAudit`/`domesticStress` rely on); (2) **`domesticStress`** 700-day craft churn from spare split rows filling an item cap between trims → harness trims to equipped-only every cycle (its stated intent; durable-merge in `grantItem` left intact — intentional per `inventoryStacking`); (3) **contextInjector** omitted hands/cloak → equipped gauntlets/cloak now reach Arbiter narration; (4) **DROP guard** omitted hands/cloak → could drop worn gear into a phantom slot, fixed; (5) **gear-farm** (arb60) — spawned gear re-showed on wild tiles after take+scrap → `beginScene` filters spawned gear by the room's consumed set; (6) **`investigateHookBias`** stale ≤70% bound vs arb61's intended ~75% story norm → updated. Fresh-minted (pool exhausted). |
| `2026-06-04-arb63`      | Bronze Chalice | **Hands + cloak armor slots** (player: "all gear that is picked up must be equippable. do we not have hand slots?"). Gauntlets/gloves ("Hands Armor") and cloaks/capes had **no equip slot** — `validSlotsForItem` returned `[]` ("cannot be equipped"), stranding **~71 catalog armor pieces (35 hands + 36 cloak)**. Added `EquipSlot` `'hands'` + `'cloak'` (+ `PlayerEquipped` names/ids), `SLOT_LABEL`, `ARMOR_SLOTS` (so AC + stat bonuses aggregate — e.g. the gauntlets' AC+1/STR+1), `SLOT_ID_KEY`, `validSlotsForItem` catalog + name fallbacks (pulled `cloak`/`mantle` out of the chest regex so they route to cloak), and the Inventory + Character slot lists. `equipItem` already keys off `SLOT_ID_KEY`, so equip/unequip/EQUIPPED-badge/split-on-equip all work for both. New `handsCloakSlots.test.ts`. Fresh-minted (pool exhausted). |
| `2026-06-04-arb62`      | Silver Goblet  | **Split-on-equip** (player: 3 Aetherbound Masks → equipped one → all three locked as EQUIPPED, spares un-scrappable). A stack of N>1 durable items shared one inventory row + id, and `equipItem` pointed the slot at that shared id, so the whole stack read as equipped. Now `equipItem` peels **one** copy off a stack into its own instance (fresh id + its own durability) and decrements the stack, so the slot owns a single copy and the other N-1 stay free to scrap/use. The EQUIPPED badge is already id-based, so only the peeled copy shows equipped. Existing stuck saves: unequip + re-equip to split. New `equipStackSplit.test.ts`. Fresh-minted (pool exhausted). |
| `2026-06-04-arb61`      | Gold Chalice   | **Loot-loop Pieces B + C — verb economy complete.** **B (salvage → materials only):** `salvagePools` filters every roll to true materials (membership in `materials.json`; Worn Tartarian Coin stays as a byproduct), stripping the gear/food/clue bleed the player flagged (Aetheric Locket/Torch, Throwing Knife, Rusted Blade, Climbing Rope, Trail Rations, Map Fragment, Sealed Letter). **C (investigate → clues/hooks norm):** `areaSearch`'s investigate branch drops routine common-material foraging — its only item is now a **RARE Uncommon gear-or-material find at ~7%** (resolved via `lookupCraftedItem`, so gear lands as real weapons/armor), and clues/hooks rise to ~75%. Food still comes from the separate forage path; search/harvest pools unchanged. New `investigateLoot.test.ts` + `salvagePools.test.ts` materials-only cases. Verb economy: **take = gear, salvage = materials, investigate = clues/hooks + rare find.** Fresh-minted (pool exhausted). |
| `2026-06-04-arb60`      | Zinc Goblet    | **REGRESSION-1 fix, Piece A — `take` spawns gear again.** A player log confirmed the long-dead take loop: scenes surfaced takeable nouns but none resolved to a catalog item, so `take` paid out nothing and loot ran entirely through investigate/salvage/climb. Root cause: no system ever placed catalog **gear** as scene nouns (the take handler grants by `findCatalogItem` name-match). New `engine/takeableGearSpawns.ts` places **1–3 common, portable catalog weapons/armor** per scene (real names → handler resolves + grants), **seeded by room key** so leave-and-return can't farm. Added **additively** to the displayed nouns so investigate's flavor nouns keep their slots. New `__tests__/takeableGearSpawns.test.ts` (every spawn resolves to a catalog item + is portable + deterministic). Pieces **B** (salvage → materials only) + **C** (investigate → clues/hooks + rare gear/material; food can ride take OR investigate) tracked as open. Fresh-minted (pool exhausted). |
| `2026-06-04-arb59`      | Cobalt Goblet  | **Combat takes precedence over scene hooks.** A player log showed a smoke-camp Reclaimer who turned hostile from a caught theft still resolving the story thread *peacefully* (`★★ STORY THREAD COMPLETE — you part ways, +25 TC`) on `approach`, then being killed in the same fight. The hook intercept (`advance`/`cast`/`investigate`/etc. → matched scene hook) had no combat guard; it now requires `currentScene.enemies.length === 0`, so during a fight those verbs fall through to the combat handlers instead of resolving a story/puzzle hook. (The dog-bite-on-`[reward]`-channel green colouring in the same log is intentional, OTA-146 — left as-is.) Fresh-minted (pool exhausted). |
| `2026-06-04-arb58`      | Brass Goblet   | **`[tool pouch]` tag in inventory** (player request: "whatever is in the tool pouch should show a tool pouch word written next to it in inventory"). `ItemRow` gains an `isPouched` prop (`item.id` ∈ `player.equipped.toolPouchIds`); the meta row renders an amber `[tool pouch]` badge beside the existing rarity / `[fits dog]` / ♥ markers. Fresh-minted (pool exhausted). |
| `2026-06-04-arb57`      | Pewter Chalice | **Batch sell + "all" buttons** (player request: "when selling and scrapping items we need a quantity marker and a scrap and sell all button"). Scrap already had a quantity stepper (OTA-286) → added a one-tap **`Scrap All (N)`** button beside it. The vendor **SELL** modal had no quantity at all (sold one unit) → added the same NumberStepper (price/total TC updates live) plus **`Sell ×N`** and **`Sell All (N)`** buttons, looping `sellToVendor` per unit. Gate-loss sells stay single-unit with the red "Sell anyway" confirm. UI-only; store actions unchanged. Fresh-minted (pool exhausted). |
| `2026-06-04-arb56`      | Silver Flagon  | **Stop the voice re-downloading every launch.** The reuse check trusted any cached file **≥ 50 MB**, so (1) every model file *under* 50 MB (the voice + tokenizer/config) failed the check and re-downloaded on **every** launch, and (2) a large partial (~71 MB) passed as "complete" then failed to load. `executorchAdapter` now gates reuse on a **`<file>.complete` marker** written only when a download truly finishes (and matched to the on-disk byte size): partials of any size are never trusted, complete files of any size are always reused. One-time cost: a previously-cached model without a marker re-downloads once to establish it. Builds on arb55's retry/resume. Fresh-minted (pool exhausted). |
| `2026-06-04-arb55`      | Bronze Ewer    | **Fix the bundled-voice download** (the actual `Software caused connection abort`). The ~60–100 MB model `.pte` (via react-native-executorch) was fetched with a single `createDownloadResumable().downloadAsync()` and **no retry**, so one mid-transfer drop failed the whole voice install. `executorchAdapter.resolveSource` now **retries up to 5× with exponential backoff (1/2/4/8 s) and RESUMES the partial** (HTTP Range via the handle's resume data) instead of restarting; truncated partials are kept to resume rather than deleted. A flaky connection now recovers. Pairs with arb54's system-voice safety net for a fully-down network. Fresh-minted (pool exhausted). |
| `2026-06-04-arb54`      | Iron Cistern   | **Silent-narration fix + voice diagnostics.** A playtester's COPY VOICE INFO showed the bundled voice (am_michael) failing at `[download] Software caused connection abort` with 66 GB free — a **network** abort on the ~63 MB Piper tarball; model never installed, engine=bundled → no voice → silence. NOT a code regression (no voice file changed arb47–53). (1) `TTSManager.speak` now falls through to the **system voice** when the bundled model is in an `error` state, so the Arbiter keeps narrating (the fallback the Title screen always claimed but never did). (2) `TTSController` logs bundled-voice phase + errors (failing step + free disk) to the game log so the LOG export shows the cause. `voiceSettings.test.ts` failure is pre-existing. Fresh-minted (pool exhausted). |
| `2026-06-04-arb53`      | Copper Tankard | **Guild Broker BUILT + ON** (title 18 — Tier-C live count now 4/6) **+ canon-relic chart + lore.** The Parley Ground (now discoverable) runs a fetch-two-relics encounter: `PARLEY` picks two non-allied faction leaders and names their demanded relics; arriving at a relic's source tile recovers it; `SEAL THE ALLIANCE` turns both in → `recordTitleProgress({alliancesBrokered:1})` → Guild Broker + `diplomacyBonus`. `FACTION_COVETED_ITEM` upgraded from invented placeholders to **9 canon Tartarian relics** (exploration.json fetch-tokens renamed to match). All **15** canon relics from the user's list added to `canon-loot-treasure.json` so the Arbiter can describe every one — including the 6 the Broker doesn't use. New `engine/broker.ts`, `player.brokerMission`, `__tests__/broker.test.ts`. Only `trap_dives` + `defense` remain OFF (need drawings). Fresh-minted (pool exhausted). |
| `2026-06-04-arb52`      | Brass Phial    | **Ask-the-Arbiter fix** — "How many sites can I visit?" (from a playtester log) fell through to a garbled echo (`"The arbiter about many sites can visit"`) because "sites" wasn't a world-knowledge keyword. `arbiterKnowledge.answerWorldKnowledge` now answers a **sites/locations/places count** (discoverable tiles = 25 today) plus discovery progress pulled from `worldMemory.discoveredLocationIds`; the `ask` handler passes that count. A world-knowledge hit short-circuits before the lore/persona fallback, so the double-line + echo no longer fire. New tests in `arbiterKnowledge.test.ts`. Fresh-minted (pool exhausted). |
| `2026-06-04-arb51`      | Steel Flask    | **Character-screen readability pass 2.** The dim taupe `#7a705c` (stat "Grows from:" descriptions, italic kv caption notes, faction-row names, HP/STA + equip-slot labels) + the titles-summary `#9b8e74` were too dark to read on the dark cards → both to the Explore amber `#c9a86a`, scoped to `CharacterScreen.tsx`'s own styles (9 conversions). Empty-slot dashes (`#3a342c`) and the green/cream/red accents left intact. Fresh-minted (pool exhausted). |
| `2026-06-04-arb50`      | Tin Strongbox  | **Speaker of Forgotten Tongues + Warden of the Old World BUILT + ON** (titles 16 & 17 — the two "no-drawing" Tier-C trials). New `engine/titleChallenges.ts` + a `gameStore` handler implementing the user's one-shot rule: **scouting is free** (examine → learn the required material/relic + the d20+stat-vs-DC, never consumes); **committing is one-shot** (attempt rolls; pass earns the title, fail spends the single chance, tracked on `player.challengeAttempts`); lacking the material refuses the attempt **without** consuming it. Speaker = skill-gated (Glyph-Key recovered free on-site → d20+INT rune trial @ Red Tower of Nimari). Warden = materials-gated (bring 3× Scrap Metal → d20+INT Engineering check @ Sinking Cathedral). `enabled` flipped true for both; only `trap_dives` / `defense` / `parley` remain OFF. New `__tests__/titleChallenges.test.ts`. Fresh-minted (pool exhausted). |
| `2026-06-04-arb49`      | Lead Casket    | **Readability fix** — retire the too-dark `#5a5246` everywhere. It was the color of the locked title **names + requirement descriptions** on the Character page (unreadable on the dark card) plus muted/placeholder text across ~13 files. All **20** occurrences → the Explore-screen amber `#c9a86a` (the brand accent, already used for *earned* title names). `#5a5246` now appears nowhere in the app. Note: this also recolors 8 input `placeholderTextColor`s + one border to amber — flagged for the user. Fresh-minted (pool exhausted). |
| `2026-06-04-arb48`      | Cobalt Reliquary | **Labyrinth of Shadows BUILT + turned ON** — Wayfarer of the Lost Paths is now the **15th earnable** Arbiter title. New `engine/labyrinth.ts` (pure maze navigation over the plotted graph: false walls block, branches count wrong turns, finish-within-budget = clean run) + `gameStore` handler (ENTER LABYRINTH at Iskan-Veil → typed directions walk it → clean run calls `recordTitleProgress({labyrinthCleanRuns:1})` → Wayfarer + `pathfinder`). Master `TIER_C_ENABLED` flipped **true**; only the labyrinth `enabled` (other 5 Tier-C stay OFF — `challengeActive` needs both). The 14 Tier-A/B titles remain live (arb45 award loop). New `__tests__/labyrinthRun.test.ts`. Fresh-minted (pool exhausted). |

## AAB codenames (separate pool, keyed by versionCode)

OTA-274 introduced a parallel codename scheme for native AAB
builds. The OTA codename names the JS bundle; the AAB codename
names the binary in Play Console. They drift naturally and the
About screen surfaces both.

| versionCode | AAB codename | Notes                                        |
|-------------|--------------|----------------------------------------------|
| `246`       | (unnamed)    | Predates the AAB codename layer; was running with OTA-265 (Stone Mantle) at upload time. |
| `263`       | Slate Keep   | Pewter Vault (OTA-273) AAB. llama.rn SD865-class crash fix. |
| `?` (TBD)   | Stone Castle | Quartz Coil (OTA-297) AAB. Final stable wave-cap. versionCode = GitHub run_number at build time; APK_CODENAMES entry follows once the run_number is known. |
| `?` (TBD)   | Granite Hold | Cobalt Drift (OTA-298) AAB. JSON lazy-load pass on top of Stone Castle. Same baseline + ~220 KB of JSON deferred out of cold-start for title-screen relief. |

### AAB reserved pool

Stone / fortress / Tartaria-landmark style. AABs ship less often
than OTAs and should feel bigger than the metallic-noun OTA pool.

1. Marble Spire
2. Onyx Tower
3. Basalt Bulwark
4. Obsidian Gate
5. Skyhold
6. Ironwall
7. Worldgate
8. Sunspire
9. Hearthstone
10. Deepforge

## Reserved pool (assign next 30+ OTAs from this list)

To keep codenames consistent and Tartaria-flavor without burning
fresh creativity per OTA, the next codenames in order will be
drawn from:

1. *(reserved pool exhausted — next codename should be drawn fresh
   from a new metallic-noun pair. Thorn Vault was burned by the
   reverted OTA-291 attempt; Quartz Coil shipped as OTA-297.)*

When bumping `OTA_BUILD_ID` in `app/buildInfo.ts`, also add an entry
to `app/buildCodename.ts`'s `CODENAMES` map drawing from the next
unused codename in this list. Move the codename here from the
reserved pool up into the current-mapping table above.

## Commit title format — codename FIRST

When committing an OTA, the commit's **first-line title MUST start
with the codename**, followed by an em-dash, then the OTA-NNN id,
then the description:

```
<Codename> — OTA-NNN — <description>
```

E.g.:

- `Smoke Anvil — OTA-267 — Build codename obfuscation layer`
- `Tin Tine — OTA-268 — Vendor: gift verb routing fix`
- `[build-ios] [submit-ios] Cinder Drift — OTA-266 — Info.plist...`
  (build/submit markers stay first; codename slots in right after)

**Why:** the user reads commits on a phone where titles truncate
around 30-40 chars. Codename-first means a truncated title is still
useful as a build-identity glance. Convention is also documented
in CLAUDE.md so it's enforced across sessions.

## How the obfuscation actually works

1. About screen + bug report email + OTA-applied dialog all show
   the codename (e.g., "Cinder Drift") instead of `2026-05-31-266`.
2. A curious tester searching "Tartaria Realms Cinder Drift" doesn't
   hit the GitHub repo — the codename pattern isn't anywhere in
   commit messages or HANDOFF.md.
3. When a tester reports a bug, you grep this file for their
   codename → find the OTA-NNN → look up HANDOFF.md or
   `app/buildInfo.ts` to see what changed in that build.
4. The `OTA_BUILD_ID` string is still used internally (save migrations,
   `app/buildInfo.ts` change notes, commit messages) — it just isn't
   shown to the user.

## What's still visible to the tester (unavoidable)

These leak the game's bundle id or name, but not the GitHub repo:

- **App ID** (`com.hotatticgames.tartarprim` or `.hal2001`): Android
  Settings → Apps shows it. Not hideable.
- **Game name** ("Tartaria Realms"): on the home screen icon. Not
  hiding.
- **App version** ("3.0.0"): cosmetic display version.
- **APK build version** ("2.4.1"): the runtimeVersion floor. Both
  versions appear on About + bug reports; neither matches a
  GitHub commit pattern.

Apple/Google bundle ids and version strings are unavoidable. The
OTA-NNN pattern was the one search-engine breadcrumb, and the
codename layer kills it.
