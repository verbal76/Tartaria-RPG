# Tartaria Realms — Session Handoff

**This checkout:** branch `HaL2001` — **LIVE Tartaria line / PRODUCTION** — in the wild with internal testers. Channel `hal2001`+`preview`+`ios-preview`. Vetted changes only; a push OTAs their devices.

> **This doc was rewritten & de-bloated on 2026-07-02.** The previous 5,400-line
> HANDOFF (with the full open/closed issue tracker and the entire OTA changelog)
> is preserved verbatim in **`HANDOFF-ARCHIVE.md`** next to this file — nothing
> was deleted, only summarized here. Read this file first; reach for the archive
> only when you need the full historical "why" of a specific old issue/OTA.

---

## 0. Cold start — read this FIRST in a fresh container

A fresh remote session has ONE checkout (usually `/home/user/Tartaria-RPG`, on a
harness-made `claude/*` branch). The working setup is THREE worktrees:

```bash
cd /home/user/Tartaria-RPG
git fetch origin HaL2001 golem-line engine_Dev
git worktree add /tmp/hal-main-fix HaL2001
git worktree add /tmp/hal-golem golem-line
git worktree add /tmp/hal-eng7 engine_Dev
```

- **The harness-designated `claude/*` branch is NOT where work ships.** The user
  directs work to the three named line branches above. Pushing to them requires
  the user's authorization, granted per-session (§2) — once granted, push each
  OTA as it lands.
- **Changes apply to ALL relevant lines in ONE pass.** Standing practice: minor
  changes/upgrades land on HaL2001 AND golem-line together — plus engine_Dev when
  (and only when) the change is engine-level, not Tartaria content/flavor —
  per-line OTA bumps, one commit + push per line. golem-as-trial is reserved for
  changes the user explicitly wants staged (see the clarified roles in §2).
- **Working style:** the user playtests on-device (Android, OTA-delivered) and
  pastes in-game logs. For a bug report, DIAGNOSE first — root cause + proposed
  fix, briefly — and implement only after approval (unless the message says
  "fix it"). Use AskUserQuestion for genuine UX forks with 2-4 options.
- **Judging "clean":** filter typecheck output to `app/**`, and additionally
  ignore the pre-existing `expo-document-picker` errors in engine_Dev app
  source (3 of them) plus the long-standing test-file type errors on all lines
  (§3). engine_Dev diverges in places (content-pack layer, e.g. import lists,
  `getNarratorName` in the voice warmup) — port fixes code-specifically, never
  assume byte-identical files.

## 1. What this is

**Tartaria Realms** — an Android-first, on-device (Hermes/Expo/React Native)
procedural narrative RPG. The engine is lore-agnostic; content (world, items,
recipes, factions, tone) is authored data. On-device ML stack: **MiniLM** (intent
classifier, onnxruntime-react-native), **Qwen 2.5 0.5B** (Arbiter narration,
llama.rn), **Kokoro-82M** (neural TTS, react-native-executorch). State lives in a
single Zustand store, `app/state/gameStore.ts` (~28k lines) — the spine.

## 2. Operating model — MULTIPLE independent product lines (READ FIRST)

The old "ONE branch, ONE codename" model is **retired**. The project now ships as
several **independent lines**, each on its own git branch, its own app identity,
and (for the mobile lines) its own OTA channel. A change that belongs on more than
one line is applied **per-line, code-specifically** (see §4).

- **OTA ids are descriptive slugs**, not periodic-table codenames. Format:
  **`YYYY-MM-DD-NNN-short-desc`** in `app/buildInfo.ts` `OTA_BUILD_ID`, where `NNN`
  is that line's own running counter. (The `<Element> <Process>` codename scheme
  and the "batch ≥5 before pushing" rule from older handoffs are **abandoned**.)
- **Push cadence: each OTA is pushed as it lands.** A push to a mobile line's
  branch fires that line's `eas-update.yml` and publishes the OTA to that line's
  channel — so pushing IS shipping for the mobile lines.
- **Never push to a line the user didn't authorize.** Blanket "push these as you
  go" authorization is granted per-session and does **not** carry over.

### Line identity table

| Line (branch) | app name | package / bundle id | OTA channel | Role |
|---|---|---|---|---|
| **HaL2001** | Tartaria Realms HAL | `…tartarprim.hal2001` | `hal2001` + `preview` + `ios-preview` | **LIVE Tartaria game** — the build at real testers (production) |
| **golem-line** | Tartaria Realms Golem | `…tartarprim.golem` | `golem-line` | **HAL's warm standby** — kept current with HAL; the fork point for future engine-breaking work (installs side-by-side) |
| **engine_Dev** | RPG Engine (dev) | `…tartarprim.engine` | `engine_Dev` | **Separate project** — lore-agnostic interaction engine (JSON/pack-driven content, lore-neutral prefills), NOT the Tartaria game |
| **steam_Dev** | Tartaria Realms PC (Steam Dev) | `…tartarprim.steamdev` | `steam-dev` | Windows/Electron; updates via Steam depot, not OTA |
| **mac_dev** | Tartaria Realms (Mac Dev) | `…tartarprim.macdev` | `mac-dev` | macOS `.dmg` (Electron) |
| **linux_dev** | Tartaria Realms (Linux Dev) | `…tartarprim.linuxdev` | `linux-dev` | Linux/Steam Deck AppImage (Electron) |
| **html_dev** | Tartaria Realms (Web) | `…tartarprim.htmldev` | `html-dev` | Pure web export (no Electron) |
| **apple_ios** | Tartaria Realms (Apple iOS Dev) | `…tartarprim.appleios` | `apple-ios` | Native iOS (forked from golem-line) |
| **Dev_engine_PC** | RPG Engine (dev) | `…tartarprim.engine` | `engine_Dev` | engine_Dev's Windows `.exe` standing branch |
| **arbiters-line** | Tartaria Realms ARB | `…tartarprim.arbiters` | `arbiters-line` (dead channel) | Isolated APK scratch line — publishes nothing |

**The three MAIN lines are `HaL2001`, `golem-line`, and `engine_Dev`** — roles
as clarified by the user on 2026-07-13:

- **`HaL2001` is PRODUCTION.** The Tartaria build in the wild with internal
  testers. Vetted changes only; a push OTAs their devices.
- **`golem-line` is HAL's warm standby — it must STAY CURRENT with HAL.** Not a
  scratch pad. Its purpose: when a major, potentially engine-breaking change
  begins, development forks onto golem so production Tartaria is never at risk
  while the new thing is built. Until then, minor changes/upgrades land on BOTH
  lines in the same pass so the parity gap never widens into a migration problem.
- **`engine_Dev` is a SEPARATE, PARALLEL product** — the game stripped of ALL
  lore: a bare interaction engine. Content is entirely JSON/content-pack driven
  (the current build in it is "The Philadelphia Experiment" — every interaction
  and all of its info live in the pack JSON; alter the JSON and it becomes any
  game you want). The only hardcoded engine-side pieces are the interaction
  engine itself and generic PREFILLS that cover any JSON section a content
  author forgets to supply — and those prefills must be lore-NEUTRAL: never
  Tartaria-flavored, never containing Tartaria terms. Tartaria content/data
  edits do NOT belong in engine_Dev's base; only engine-level fixes port there.

Everything else in the table is downstream packaging of these three. (On `main`,
the handoff is a short router that names these three and asks which to work on.)

Utility / parked branches: **`main`** (base + start-here router; the standing dev→prod PR target),
**`iOS-initial`** / **`release/**`** / **`revert`** / **`submit-workflow-to-main`**
(one-off/utility), **`claude/*`** (ephemeral feature branches — usually merged or
abandoned). Don't develop on these unless explicitly told to.

### OTA & build ISOLATION — every line is a sealed silo (verified 2026-07-02)

**No line can cross-pollinate another's OTAs or builds.** A push publishes ONLY to
that line's own channel — Tartaria pushes only to Tartaria, golem only to golem,
engine only to engine. Nothing broadcasts across lines. Concretely:

- **HaL2001 → `hal2001` only** (Android; plus the `hal2001`/`preview` **iOS** route
  for the TestFlight build). Never touches golem or engine.
- **golem-line → `golem-line` only.** golem has a DEDICATED firewall workflow,
  **`eas-update-golem.yml`**, that runs only for `refs/heads/golem-line` and
  literally only ever knows the string `"golem-line"` — it is structurally unable
  to publish to `hal2001`/`preview`.
- **engine_Dev → `engine_Dev` only** (Android). Different app
  (`…tartarprim.engine`); its preview build polls only the `engine_Dev` channel.

How it's enforced: each branch carries **its own copy** of `.github/workflows/*`,
and GitHub runs the workflow file **from the pushed branch**. The shared
`eas-update.yml` gates publishing on a `case "$BRANCH"` keyed to the PUSHED branch;
the **default arm is _skip_** (`"not mapped to an OTA channel — no cross-branch
broadcast"`), so any unmapped branch (e.g. a `claude/*` feature branch) publishes
nothing. golem is additionally carved into its own file as belt-and-suspenders.

Native / desktop / web builds are isolated the same way: each spin-off has its OWN
build workflow **and** its OWN app id, so no two lines produce the same
installable — `steam_Dev`→`build-steam-exe` (`…steamdev`), `mac_dev`→`build-mac`
(`…macdev`), `linux_dev`→`build-linux` (`…linuxdev`), `html_dev`→`build-web`
(`…htmldev`), `Dev_engine_PC`→`build-engine-exe` (`…engine`). Several are absent
from any push trigger (build on demand only). **`arbiters-line`** targets a dead
channel and ships nothing.

> **Do not "fix" a line's workflow by copying HAL's multi-channel publish into it.**
> The per-branch `case` gate + golem's separate file ARE the firewall. If you ever
> see a line's `eas-update.yml` publish to `hal2001`/`preview` unconditionally,
> that's the isolation bug — restore the branch-gated `case`.

### `app.json` guard

`app.json` holds each line's live channel/package/name and **must never be
edited** during normal work — it's at the repo root, not under `app/`, so ordinary
edits won't touch it. If a tool stages it: `git checkout HEAD -- app.json`.

## 3. The change loop (every code change)

1. Edit code under `app/` in that line's worktree.
2. `npx tsc --noEmit` — the **app/** source must be clean. (The repo has many
   pre-existing **test-file** type errors — `stealth` stat drift, `createAsync`
   self-ref, etc. — that are NOT yours; filter to `app/…` when judging clean.)
3. Run the touched jest suites. Heavy stress probes (`combatBalanceProbe`,
   `dogGolemCombatStress`, `*Stress`) **OOM the ~8 GB CI container** — that's
   environmental, not a regression; exclude them.
4. Bump `app/buildInfo.ts` `OTA_BUILD_ID` to the next `YYYY-MM-DD-NNN-desc` for
   that line, with a short comment block explaining the change.
5. Update this `HANDOFF.md` (open-issues / recent-OTAs) in the same commit when
   the change is notable.
6. Commit with the trailers in §6, then push that line's branch (`git push -u
   origin <branch>`). All three worktrees are now checked out ON their branches
   (no detached HEAD). Retry network failures with exponential backoff.
7. After pushing, ensure an **open draft PR** exists for the branch (create one if
   not). PRs already exist for the standing lines (#2 HaL2001, #7 golem-line,
   #13 engine_Dev, etc.).

**Docs-only safety:** `**.md`, `docs/**`, `.github/**`, `app.json`, lockfiles etc.
are in every `eas-update.yml`'s `paths-ignore`, so a HANDOFF/docs-only push does
**NOT** publish an OTA — safe to push freely, even on the live line.

## 4. Cross-line parity rule

Most engine code is shared byte-for-byte across lines, but the lines live on
separate branches/worktrees. When a fix applies to more than one line, apply it
**code-specifically in each line's worktree** and ship it per line — do not assume
a push to one reaches the others. Watch for per-line divergence:
- `engine_Dev`/`Dev_engine_PC` are content-pack-driven (recipes/tables load from
  uploads) and carry extras like `contentPack` label overrides and a widened
  fusion-reservable rule; some Tartaria/golem data edits (e.g. armor recipes in
  `recipes.json`) belong in the uploaded pack there, not the base.
- Spin-off lines (steam/mac/linux/html) swap native modules for web stubs via
  `metro.config.js` on the `web` target.
Typecheck + run the relevant suite in **each** worktree before pushing it.

Worktrees used this session: `/tmp/hal-main-fix` (HaL2001), `/tmp/hal-golem`
(golem-line), `/tmp/hal-eng7` (engine_Dev) — each checked out on its branch.

## 5. Native / artifact builds (rare — confirm first)

OTA covers everything in the JS bundle (engine, screens, JSON, bundled assets). A
native rebuild is needed ONLY for: a new native module / Expo plugin, an
`app.json`/runtime-version change, edits under `ios/`/`android/`, an Expo SDK bump,
or Hermes/permission changes. **Confirm with the user first.** Commit-title markers
lead the title: `[build-aab]` / `[build-ios]` / `[submit-ios]` (mobile native),
and the desktop/web lines build via their own workflows on push. **Do not put
`[build-aab]` / `[golem-apk]` / native markers in a commit unless a native build
is actually intended.**

## 6. Commit & PR conventions

- End every commit body with the two trailers:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/…
  ```
- **Never** put the model identifier/id string in commit messages, PR titles/bodies,
  code comments, or any pushed artifact — chat only.
- PRs are created as **drafts**. Mirror a PR template if one exists.
- GitHub MCP is scoped to `verbal76/tartaria-rpg`.

## 7. Architecture cheat-sheet

```
app/
  ai/          MiniLM + Qwen orchestrators; nativeMlLock.ts (serializes ALL native
               ML — Qwen completion + Kokoro synth + their native frees — via
               runExclusiveNativeMl; prevents Tensor-G5 SIGSEGVs)
  audio/       AudioManager / controller / settings
  components/  UI primitives; InventoryCategorize.ts, RecipesView.tsx,
               FusionPickerModal.tsx, StatsPanel.tsx, InputBox.tsx
  data/        Authored JSON (items/weapons/armor/gear/dogGear/recipes/…)
  engine/      Pure logic — parser, crafting, itemFusion, equipment, worldMap
               (canonical grid + travel distance), durability, combat, …
  screens/     Exploration / Inventory / Crafting / Vendor / Character / Map / …
  state/       gameStore.ts — Zustand, the spine (~28k lines)
  updates/     checkAndApplyOTA.ts
  voice/       TTSManager / PiperTTSManager (Kokoro) / TTSController
buildInfo.ts   OTA_BUILD_ID marker (per line)
```

Key invariants worth knowing:
- **Every inventory item has a unique `id`.** Scrap/equip resolve by `id` first,
  then name, so multiples of the same item with different durability act on the
  exact instance selected.
- **World map is grid-exact.** Locations have fixed canonical cells
  (`worldMap.canonicalPositions()`); the player carries an absolute
  `gridX/gridY`; travel distance = `canonicalDistanceFromGrid`. The visual atlas
  is a thematic overlay (`atlasCoords.ts`, IDW interpolation) and must never drive
  real distance/movement.
- **Fusion output rarity = number of DISTINCT material tags** (3 → Rare, 4+ →
  Legendary), NOT input rarity. Variety matters, not rarity.

## 8. Open issues / watch list (current)

- **engine_Dev Tartaria-leakage audit (2026-07-13) — all five items FIXED in
  engine OTA-1078.** Rule (§2): engine_Dev's hardcoded prefills must be
  lore-neutral. Architecture verified sound: content resolves author pack →
  boot-installed generic pack ("the Reaches", `genericGame.ts`, installed by
  `App.tsx` → `installGenericDefaults`) → built-in Tartaria JSON, so the generic
  layer masks the vast majority of ~130 `tartar` hits in engine code at runtime.
  Shipped fixes for the five reachable leaks: (1) "Worn Tartarian Coin" → **"Worn
  Temporal Credits"** everywhere (the INVESTIGATE shelf/altar yields were live in
  custom games). (2) Codex **Timeline tab removed** (only section importing
  built-in events directly, no upload path). (3) `dressBuiltInLeaks` **un-gated +
  case-agnostic** — swaps run on the RESOLVED names (author → generic → built-in;
  no-op in pure built-in test mode), and the energy family resolves neutrally on
  any generic boot. (4) Hunt **biome labels resolve from the live locations
  JSON** (hardcoded Tartaria label map deleted). (5) Hardcoded
  `tartarian_outskirts` fallback → `defaultLocationId()` (first row of the live
  locations table); contract biome anchors validated against the live catalog.
  Deliberately left (benign, internal-only): storage keys (`tartaria.*`), MiniLM
  embedding anchors (`CognitiveOrchestrator.ts` — never shown; a future
  quality pass could genericize them for classifier neutrality), pronunciation
  lexicon, parser noun dictionary.
- **2026-07-13 playtest-log observations — resolved statuses.**
  (a) Ambient second-person/off-scene Qwen lines — **FIXED in 793/773/1079**
  (ambient sentence filter drops "You…" openers; reactive narration untouched).
  (b) Hidden Market "position desync" — **NOT A BUG** (it was the deliberate
  one-time OTA-784 fresh-market repair; compass + 29-day estimate verified
  exact). Per the user, the repair existed only to reset saves after a failed
  OTA and the save is repaired — so the whole mechanism was **REMOVED in
  794/774/1080** (market saves load in place; auto-enter unconditional; the
  `_freshMarketEntry784`/`_skipMarketAutoEnterOnce` flags dropped, stale keys
  on old saves ignored).
  (c) Enemy ATK variance — **explained, deterministic, not dodge.** Silt Thief
  = base 5 (`Dexterity 5`) + 1 (`quick` trait) + one-shot +2 (`ambush_strike`,
  first counter in scene only) → 8 first swing, 6 after. **DODGE wiring
  (documented for a pending design call — owner's intent differs):** wired =
  dodge sets a 1-round `dodging` status, provokes the volley, no AC/enemy-ATK
  effect; if the enemy HIT lands, an opposed parry roll (d20+DEX vs the enemy's
  attack total, nat-20/nat-1 honored) on SUCCESS negates the damage AND fires an
  immediate free riposte at 2× weapon dice (no to-hit; bare-handed = negate
  only; vs unarmed attacker = still eat 50%); on FAILURE takes normal damage,
  deals nothing ("✗ Read through"), no out-of-position penalty. 2 weapon
  durability either way (gameStore ~25406-25522). Owner's stated intent:
  success → 2× on your NEXT hit; failure → you deal normal damage AND take
  DOUBLE. Neither the double-damage penalty nor the carry-to-next-hit reward is
  wired. Awaiting the user's call before changing.
  (d) MiniLM `[cognitive]` labels — **cosmetic.** The intent half (SWIM /
  RETREAT · DISENGAGE) is consumed by nothing but the debug log line; the
  emotion half only biases which canned Arbiter flavor line prints (plus a tiny
  speak-probability nudge), is one action stale, and never touches mechanics or
  the Qwen prompt. Improving it = rewording `EMOTION_ANCHORS` only; no
  gameplay effect.
  (e) The install's 2 voice crashes — ignore per user (known Pixel 10 Pro XL
  device issue).
- **Arbiter TTS tail clip — FIXED in 790/770/1076; retest on device.** The last
  fraction of every spoken line was clipped (report 2026-07-13, Pixel 10 Pro XL,
  bundled Kokoro): `trimSilenceLeadTrail` shaved the trailing decay to within
  8 ms, only a 70 ms tail pad followed, and the `didJustFinish` → immediate
  `unloadAsync` release discarded the ~100–250 ms Android still holds in the
  hardware AudioTrack. Fix in `PiperTTSManager.playPcm`: release deferred 300 ms
  (`UNLOAD_DRAIN_MS` — queue pacing unchanged, the promise still resolves on
  `didJustFinish`), tail pad 70 → 200 ms, trailing trim guard 8 → 40 ms. If a
  tail still clips after this, suspect the buffer arriving truncated from
  synthesis (the arb68 "upstream of playback" case).
- **Android recents/square-button SIGSEGV** — hardened across all lines (native ML
  frees + Qwen `generate()` ctx-capture now serialized through the lock; OTA
  658/643/951). Native crashes carry no JS stack, so this closes the known race
  windows rather than a stack-confirmed root cause. **Retest on-device with TTS
  on**; report residual if it recurs.
- **Travel distance** — fixed for both the reload path (659/644/952) and the
  vendor-departure/undefined-counter path (660/645/953). If a distance ever
  climbs again, capture the log line at that moment (especially whether a vendor
  was on the road at course-set).
- **INVESTIGATE chip "2 active" residual** — the primary "active chip, nothing to
  investigate" hang was fixed (elevation gate in the count; 662/647/954). The
  secondary "tap again → 2 active items" report is unconfirmed and likely a
  downstream artifact of the same count/modal mismatch. If it recurs, capture the
  EXACT chip noun that won't clear and whether the player was climbed up.
- **Spin-off sync status** — steam_Dev / mac_dev / linux_dev / html_dev / apple_ios
  were merged up to the current Tartaria game code (`git merge -X theirs HaL2001`,
  identity + platform shims preserved) at the **OTA-660 baseline**; they're now
  **~130 OTAs behind** (HaL2001 is at 789) — re-run the same merge to top them
  up when the user asks. `Dev_engine_PC` tracks `engine_Dev` (not Tartaria) and was
  left alone; `arbiters-line` is retired. Native/desktop/web builds were NOT
  compiled in the SDK container — verify via each line's build workflow.
- **golem CI hygiene (done)** — the dead inherited `eas-update.yml` (HAL's
  multi-channel publisher) was deleted from `golem-line`; golem now has ONLY its
  isolated `eas-update-golem.yml`. Don't re-add a HAL publisher to any line.
- **CI OOM** — full jest suite + stress probes exceed the container's ~8 GB; run
  targeted suites. A handful of long-standing Tartaria test failures
  (defensiveTurnAdvances / fleeFailCounter wording drift, armorMultiStat data
  drift, directionalFind flake, movementStress) are stale/flaky, not live bugs.

## 9. Recent OTA highlights (latest sessions)

Full changelog per line: `git log -- app/buildInfo.ts` on that branch (pre-July
history in `HANDOFF-ARCHIVE.md`). Latest per line: **HaL2001 `2026-07-13-794`**,
**golem-line `…-774`**, **engine_Dev `…-1080`**. Current parity offsets:
golem = HAL − 20, engine_Dev = HAL + 286 (stable since at least the 750s).

| HaL2001 | golem | engine_Dev | Change |
|---|---|---|---|
| 794 | 774 | 1080 | OTA-784's one-time fresh-market save repair removed (served its failed-OTA reset; save repaired) — market saves load in place, auto-enter unconditional again |
| 793 | 773 | 1079 | Ambient narration drops second-person "You…" sentences (off-scene Qwen musings read as world text) |
| 792 | 772 | 1078 | Companions follow nat-1/nat-20; wild water: one cupped drink (+1 corruption) + one bottle refill per location visit, the bottle's filter cleanses. Engine also ships all five lore-leak audit fixes (Temporal Credits, Timeline removed, un-gated case-agnostic scrub, JSON biome labels, defaultLocationId) |
| 791 | 771 | 1077 | Combat blocks the trade screen visibly — vendor entry refused mid-fight, VendorScreen ejects if a fight starts mid-trade |
| 790 | 770 | 1076 | Arbiter TTS tail-clip fix — deferred expo-av release (300 ms), 200 ms tail pad, 40 ms trailing trim guard |
| 789 | 769 | 1075 | Broker stalls accept ANY faction's contracts — accept handlers search every faction pool for `hidden_market_*` vendors |
| 788 | 768 | 1074 | TRADE button removed (stall tab IS the shop); tapping the active stall tab re-opens its wares |
| 787 | 767 | 1073 | ENTER lands in a market square (navHidden concourse room); pick a stall to enter, EXIT returns outside |
| 786 | 766 | 1072 | Stepping into a market stall auto-opens its vendor (wares) screen |
| 785 | 765 | 1071 | Stale in-market scene dropped on save load (`_skipMarketAutoEnterOnce` — market-chip fix) |
| 784 | 764 | 1070 | Fresh-market save repair + real-time daily vendor rotation |
| 783 | 763 | 1069 | Faction sigils turn in at the Hidden Market (one-stop broker) |
| 782 | 762 | 1068 | Hidden Market stalls broker EVERY faction's contracts (VendorContractsModal aggregation) |
| 781 | 761 | 1067 | Clean Hidden Market nav row (stall tabs + EXIT, like building rooms) |
| 780 | 760 | 1066 | Floating stall chips killed; TRADE/FUSE moved to the quick row |
| 779 | 759 | 1065 | Torch button: icon dropped, green only with torch + valid lead |
| 775–778 | 755–758 | 1061–1064 | Aetheric Torch as an aimed tool; Scanner Pouch; Hidden Market rendered as a building; market reload-inside fix |

Older arcs since the 663 snapshot (see git log): combat-HUD/reading-mode layout
(748–752), forge/fusion junk-loot + rarity-follows-material (753–759), enemy
weakness spread + forged-name quality (760–761), coatings drinkable as
counter-medicine (764–765), investigate-chip + indoor/outdoor scene fixes
(766–770), torch rework (771–779), Hidden Market arc (780–789).

## 10. Reference (quick) — full detail in `HANDOFF-ARCHIVE.md`

- **Quick-start:** `npx tsc --noEmit` (judge app/ only) · `npx jest <suite>` ·
  bump `app/buildInfo.ts` · commit w/ trailers · `git push -u origin <branch>`.
- **Combat:** nat-1 always misses, nat-20 always crits; combat loot lands in
  `player.inventory` (not `droppedItems`); `gameLog` capped at 500 with
  same-channel merge.
- **Stamina-gated statuses** (`tired`/`exhausted`) auto-clear above 25% stamina
  and are stamped with sentinel `remainingRounds: 99` — never show that counter.
- **Hotspots:** `gameStore.ts` (travel/craft/fusion/equip dispatch), `worldMap.ts`
  (grid + distance), `itemFusion.ts` (rarity/material tags), `crafting.ts`
  (`findRecipeByResult`, `lookupCraftedItem`), `PiperTTSManager.ts` +
  `LlamaRuntime.ts` + `nativeMlLock.ts` (the crash-sensitive native ML layer).
