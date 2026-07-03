# Tartaria Realms — Session Handoff

**This checkout:** branch `Dev_engine_PC` — engine_Dev's Windows `.exe` standing branch (not for merge into engine_Dev).

> **This doc was rewritten & de-bloated on 2026-07-02.** The previous 5,400-line
> HANDOFF (with the full open/closed issue tracker and the entire OTA changelog)
> is preserved verbatim in **`HANDOFF-ARCHIVE.md`** next to this file — nothing
> was deleted, only summarized here. Read this file first; reach for the archive
> only when you need the full historical "why" of a specific old issue/OTA.

---

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
| **golem-line** | Tartaria Realms Golem | `…tartarprim.golem` | `golem-line` | **HAL's testing branch** — trial HAL improvements here, then promote to HaL2001 (installs side-by-side) |
| **engine_Dev** | RPG Engine (dev) | `…tartarprim.engine` | `engine_Dev` | **Separate project** — lore-agnostic engine (upload-driven content), NOT the Tartaria game |
| **steam_Dev** | Tartaria Realms PC (Steam Dev) | `…tartarprim.steamdev` | `steam-dev` | Windows/Electron; updates via Steam depot, not OTA |
| **mac_dev** | Tartaria Realms (Mac Dev) | `…tartarprim.macdev` | `mac-dev` | macOS `.dmg` (Electron) |
| **linux_dev** | Tartaria Realms (Linux Dev) | `…tartarprim.linuxdev` | `linux-dev` | Linux/Steam Deck AppImage (Electron) |
| **html_dev** | Tartaria Realms (Web) | `…tartarprim.htmldev` | `html-dev` | Pure web export (no Electron) |
| **apple_ios** | Tartaria Realms (Apple iOS Dev) | `…tartarprim.appleios` | `apple-ios` | Native iOS (forked from golem-line) |
| **Dev_engine_PC** | RPG Engine (dev) | `…tartarprim.engine` | `engine_Dev` | engine_Dev's Windows `.exe` standing branch |
| **arbiters-line** | Tartaria Realms ARB | `…tartarprim.arbiters` | `arbiters-line` (dead channel) | Isolated APK scratch line — publishes nothing |

**The three MAIN lines are `HaL2001`, `golem-line`, and `engine_Dev`.** HAL and
golem are the SAME game — golem is HAL's testing branch, so a HAL improvement is
built/tested on golem and then promoted to HaL2001 when the user approves.
`engine_Dev` is a DIFFERENT product that only shares engine code. Everything else
in the table is downstream packaging of these three. (On `main`, the handoff is a
short router that names these three and asks which to work on.)

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
   origin <branch>`; for the detached HaL2001 worktree, `git push -u origin
   HEAD:HaL2001`). Retry network failures with exponential backoff.
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

Worktrees used this session: `/tmp/hal-main-fix` (HaL2001, detached — push
`HEAD:HaL2001`), `/tmp/hal-golem` (golem-line), `/tmp/hal-eng7` (engine_Dev).

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
  a couple OTAs behind again (661 aethercraft, 662 investigate) — re-run the same
  merge to top them up. `Dev_engine_PC` tracks `engine_Dev` (not Tartaria) and was
  left alone; `arbiters-line` is retired. Native/desktop/web builds were NOT
  compiled in the SDK container — verify via each line's build workflow.
- **golem CI hygiene (done)** — the dead inherited `eas-update.yml` (HAL's
  multi-channel publisher) was deleted from `golem-line`; golem now has ONLY its
  isolated `eas-update-golem.yml`. Don't re-add a HAL publisher to any line.
- **CI OOM** — full jest suite + stress probes exceed the container's ~8 GB; run
  targeted suites. A handful of long-standing Tartaria test failures
  (defensiveTurnAdvances / fleeFailCounter wording drift, armorMultiStat data
  drift, directionalFind flake, movementStress) are stale/flaky, not live bugs.

## 9. Recent OTA highlights (this session)

Full changelog is in `HANDOFF-ARCHIVE.md`. Latest per line: **HaL2001
`…-663`**, **golem-line `…-648`**, **engine_Dev `…-955`**.

| HaL2001 | golem | engine_Dev | Change |
|---|---|---|---|
| 663 | 648 | 955 | Completed INVESTIGATE chips leave the picker (was greyed + ✓); pinned/locked chips stay |
| 662 | 647 | 954 | INVESTIGATE chip count honors the elevation gate (no phantom-active hang) |
| 661 | 646 | — | Aethercraft shape/mend open confirm popups (no clipboard copy-paste) |
| 660 | 645 | 953 | Travel badge grid-exact from course-set (vendor-departure fix) |
| 659 | 644 | 952 | Travel counter keeps progress across a mid-journey reload |
| 658 | 643 | 951 | Native-ML teardown hardening (recents/background SIGSEGV) |
| 657 | 642 | 950 | Dedicated collapsible "Dog Armor" inventory section |
| 656 | 641 | 949 | Craft: fold hyphens in recipe match (infinite-loop/death fix) |
| 655 | 640 | 948 | Fusion picker drops same-material duplicates once picked |
| 654 | 639 | — | Default-collapsed categories + Rare/Legendary recipes |
| 653 | 638 | 946 | Armor-recipe balance + collapsible crafting categories |
| 652 | 637 | 945 | Drink-water clarity + fusion material info block |

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
