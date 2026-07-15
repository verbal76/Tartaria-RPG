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

- **PUNCH LIST (2026-07-14) — 12 items, worked in order, nothing else until it's
  clear.** From the multi-agent exploit sweep + the 2026-07-13 device-log
  analysis. Status: **#5 DONE (797/777/1083), #7 DONE (798/778), #9 DONE
  (799/779/1084).** The three the user pulled to the front are shipped. Remaining
  9 reorganized into a new working list below (grouped, no longer strict-order).
  1. Economy re-tiering (self-crafted sale price grounded on ingredients;
     fused-scrap Golem-Core/aether mint; Common-armor sell arbitrage; gift
     value-gate). *Needs number sign-off.*
  2. Contract location-gating + remote-pay cut for hunts/mysteries/storylines
     (stage-def schema add; broker stalls should also accept turn-ins).
  3. Name-keyed item dupes (drop/pickup merge, coating a stack, throwable-by-name).
  4. Outdoor water-bounce flag persistence + misc small bugs (enemy DOT ticks
     only on `attack`; no hard stat cap; `jump at <any text>` trains DEX;
     `defeatedEnemies` array grows unbounded → save bloat).
  5. ~~Qwen dormancy watchdog only revived the narrow dormant case; one failed
     reinit stranded status='failed' for the whole session.~~ **FIXED 797/777/1083.**
  6. Dodge strictly dominant at high DEX (100% win in the log). RETEST on 796+
     (the dodge stamina cost may already brake it) before tuning.
  7. ~~Core Guardians show no weakness/resistance in combat (player asked
     twice).~~ **FIXED 798/778 (HAL+golem only — no Guardians on engine_Dev).**
  8. Rework the fused-weapon naming pool ("Aetheric Thread" is a bad weapon name).
  9. ~~Climbing rope: warn at durability 4, fail only at 0 (stop stranding 15
     pts).~~ **FIXED 799/779/1084** (usable to last point; graceful break at 0,
     no fall; fraying warning while low; climbReadiness button mirrors ≤ 0).
  10. Post-boss ambush grace window on outpost exit.
  11. Fusion material-type UX (surface item material buckets; kill refusal spam).
  12. MiniLM cognitive-label noise (8-label dumps, wrong classifications).

- **REMAINING WORK LIST (2026-07-14) — reorganized; A1+A2 now DONE (800/780/1085).**
  The user's three front-loaded picks (#5 Qwen, #7 Guardians, #9 rope) plus the
  A-group correctness/dupe closes are done; what's left is the B (economy/balance,
  needs your number calls) and C (UX/polish) groups. Old punch-list numbers in
  [brackets].
  - **A. Correctness / bugs — ~~DONE 800/780/1085~~.**
    - ~~A1 [#4] Outdoor water-bounce + misc small bugs.~~ **FIXED:** DOT tick
      hoisted into runEnemyGroupCounters (ticks every combat round, not just
      attack); hard stat ceiling MAX_TRAINED_STAT=30 (player + dog + golem;
      engine has no golem); `jump at` needs a resolved scene noun; defeatedEnemies
      de-duplicated distinct-name set (self-heals legacy saves); wild-water re-arm
      moved to worldMemory.waterUsedAt, keyed per source on game-hours
      (WATER_REARM_HOURS=6).
    - ~~A2 [#3] Name-keyed item dupes.~~ **FIXED:** dropped-item pickup routes
      through grantItem + decrements the exact instance by id (no worn/coated/
      rolled laundering); applyCoating (+armor) peels one unit off a stack instead
      of coating all N for one vial; equipped throwable consumed by the equipped
      instance id (mainId/offId), closing infinite coated-throw + bandolier
      double-spend.
  - **B. Economy / balance (design calls from the user):**
    - ~~B1 [#1] Economy re-tiering.~~ **FIXED 802/782/1087** (per the user's calls):
      (a) self-crafted items never sell above their recipe INGREDIENT value
      (break-even; Legendary +25% bump) — sellPrice.selfCraftedSellCap; (b) fused
      items stay SCRAPPABLE (the intended crafting-materials market), but the fuel
      mats they yield (Golem Core, Aetheric Shard/Dust, Aether Crystal, Aetheric
      Cloth, Mudstone) now price near-worthless AT VENDORS (flat 3 TC,
      BOTTLENECK_CRAFTING_MATS) — crafting-only value, no fuse→scrap→sell pump;
      (c) nothing sells above the cheapest realistic buy for its rarity
      (RARITY_BUY_FLOOR: 5/14/40/112), closing cross-stall arbitrage;
      (d) ~~giftToVendor value-gated~~ **— SUPERSEDED: GIFTING REMOVED ENTIRELY
      in 803/783/1088** (user call). Faction standing is earned through mission
      completions + sigil/pendant turn-ins; gifting-for-rep undercut that + was
      undiscoverable, so the whole mechanic (intent, verb, action, handler) is
      gone. Tunable knobs still live for (a)–(c): RARITY_BUY_FLOOR,
      BOTTLENECK_CRAFTING_SELL, the Legendary craft bump. The buy-from-vendor rep
      side door was **greatly reduced (not removed) in 804/784/1089** per the user:
      standing now accrues by TC spent (+1 per 500 TC, banked in buyRepProgress) as
      an afterthought contributor. Knob: BUY_REP_TC_PER_STANDING.
    - **CHA-scaled vendor discounts — SHIPPED 805/785/1090** (grew out of the B1/
      gifting talk; "does Charisma even affect pricing?" — it didn't). Charisma now
      drives pricing: 2%/pt above 10, capped 20% (chaPriceDiscount), applied to BOTH
      buys (cheaper) and sell-backs (richer, on top of the B1 caps as an earned
      merchant perk). GATED per faction behind a RAPPORT quest — a vendor fetch
      contract `fq_<faction>_rapport` (9 authored on HAL/golem in faction-quests.json,
      fetch a Golem Core; NOT ported to engine — it keys off completedFactionQuestIds
      so it lights up wherever a rapport quest exists). Until earned, pricing is
      unchanged. New module app/engine/factionRapport.ts (chaPriceDiscount /
      hasFactionRapport / vendorPriceMod / rapportQuestId); buy/sellToVendor +
      VendorScreen honor the mod (partner-rate banner); turn-in flourish announces
      the unlock. Knobs: CHA_PRICE_DISCOUNT_PER_POINT (0.02), CHA_PRICE_DISCOUNT_CAP
      (0.20). Diplomacy IS already wired (INTENT_TO_STAT.diplomacy='charisma';
      resolves hunt/mystery/storyline diplomacy checks; "convince"/"persuade" in the
      CHA word list). Content follow-up: the 9 FACTION_COVETED_ITEM relics aren't
      placed in the world (7/9 are broker-only) — rapport quests fetch a Golem Core
      as a stand-in; swap to the lore relics once they're placed.
    - **CHA payoff reachability (user Q: "what can I persuade them to do? all I meet
      are un-typeable vendors and animal enemies").** Real gap: diplomacy only fired
      inside scripted quest social stages (hunt toll-givers, faction-storyline
      social gates, main-quest "address the keepers"), so CHA felt invisible in
      everyday play. Built out as a SOCIAL REWORK (talk-down + wanderers were the
      first pass; the parley below supersedes their flat rolls):
      - **Talk down wild enemies — SHIPPED 806/786/1091, then RESHAPED by 808.**
        Original single-roll in-combat disengage. Now the animal side of the parley.
      - **Wandering NPCs — SHIPPED 807/787/1092, then RESHAPED by 808.** Original
        single-roll wanderer talk. Now the person side of the parley. (Spawn +
        farm-proof window + banner are unchanged; only the talk RESOLUTION changed.)
      - **Parley + Menace (social rework) — Phase 1 SHIPPED 808/788/1093.** Two-button
        choice (Calm/Persuade vs Intimidate) with hard lock-and-key (wrong key
        auto-fails; WIS reveals the temperament), asymmetric downsides (safe fail =
        forfeit the hook; intimidate fail = harm + forfeit), reward split (persuade →
        lead, intimidate → goods), and the full Menace loop (visible on the portrait,
        self-blunting DC, encounter scaling, decay, −6 extortion standing cost). See
        §9. Modules parley.ts + menace.ts; ParleyModal; store pendingParley/
        resolveParley + runParleyOutcome.
        - **Phase 2 — SHIPPED 809/789/1094 (social rework COMPLETE).** Wanderers
          carry a seeded payload (goods + a location lead). INTIMIDATE grants their
          actual CARRIED GOODS (coins + salvage items) into the pack; PERSUADE plants
          a real player.pendingLead that pays out (the cache) the next time you reach
          fresh peaceful ground — "talk for secrets" is now a go-find-it. New "cagey"
          beat (wandererCagey) names their price before you choose. See §9. Helpers
          makeWandererGoods / makeWandererLead / wandererCagey; Wanderer.goods+lead;
          PlayerCharacter.pendingLead; miscLootItem; beginScene payout. Lore-neutral.
          Possible future polish (not scoped): wire leads into the real whisper/hook
          chains + reveal actual map locations (Phase-2 uses a self-contained cache);
          intimidation-scaled enemy difficulty is menace-driven (809 keeps that).
    - **B2 [#2] Contract turn-in gating — HUNTS DONE 810/790/1095** (user call:
      "hunts are a face to face turn in"). Closed the real hole: the Contracts-UI
      COMPLETE for a hunt used to pay FULL from ANY tile (whole bounty from a safe
      hub) — now requires a paying agent IN SCENE + the RIGHT posting faction's agent,
      and the remote "send word" courier close is removed for hunts (full pay only,
      no cut). See §9. **STILL OPEN (not requested):** mysteries + storylines keep
      their remote courier cut and still ADVANCE their stages on any matching
      check/kill/travel anywhere — if the user wants those tightened too, add optional
      locationId/biomeTag/enemyName to stage defs + extend the face-to-face turn-in to
      those kinds. Only hunts were called out this pass.
    - **B3 [#6] Dodge strictly dominant at high DEX** — PARKED pending the user's
      live retest on a current build (they said "I'll test and we can revisit"). The
      796 dodge changes (turn cost + 3-win train cap) may already brake it; don't tune
      until the retest confirms it's still an issue.
  - **C. UX / polish — ~~DONE 801/781/1086~~.**
    - ~~C1 [#11] Fusion material-type UX.~~ **FIXED:** firing the Crucible with
      reserved-but-insufficient pieces opens the PICKER (which already surfaces
      each piece's material bucket + a live diversity readout, OTA-679) instead of
      dead-ending on a repeated refusal. (Identical-repeat refusals were already
      deduped on the arbiter channel.)
    - ~~C2 [#8] Fused-weapon naming pool.~~ **FIXED:** a forged WEAPON with a soft
      / non-weapon Qwen name ("Aetheric Thread", "Resonant Veil") is rejected so
      the deterministic weapon pool (Cleaver / Edge / Reaver / …) names it;
      migrateFusedName heals such names on load. Armor keeps soft names.
    - ~~C3 [#10] Post-boss ambush grace window.~~ **FIXED:** a boss kill stamps
      player.bossDefeatGraceUntilHours = now + POST_BOSS_GRACE_HOURS (3);
      beginScene suppresses arrival encounters while it holds, so stepping out of a
      just-cleared outpost doesn't drop a fresh ambush mid-loot.
    - ~~C4 [#12] MiniLM cognitive-label noise.~~ **FIXED:** reworded the 6
      EMOTION_ANCHORS to short, distinct, LORE-NEUTRAL sentences (no shared
      "ruins/Aetheric" boilerplate) so cosine similarity discriminates instead of
      smearing across labels; the neutral wording made the anchors identical on
      engine_Dev too. INTENT_ANCHORS left as-is (scope was EMOTION_ANCHORS only).

- **PUNCH LIST STATUS — B1 done, CHA-discount feature shipped; only B2 + B3
  remain, each needing a design/number call before it can be worked.** A (bugs +
  dupes), C (polish), and B1 (economy re-tiering + gifting removal + buy-rep grind)
  are shipped; the CHA-scaled vendor-discount/rapport feature shipped 805/785/1090;
  #5/#7/#9 shipped earlier. B2 (contract location-gating + remote-pay cut) is NEXT
  and needs the strictness call; B3 (dodge at high DEX) needs a 796+ retest first.


- **Exploit-sweep backlog (2026-07-13) — 12 fixed in 796/776/1082, these REMAIN.**
  A multi-agent audit surfaced ~33 findings; the confirmed criticals/highs with
  contained fixes shipped this OTA. Still open, grouped by why they were deferred:
  - **Economy re-tiering (needs a design call on numbers):** (a) self-crafted
    rarity items sell far above ingredient value — Mudstone/Corruption Tonic from
    free forage sell 36 TC (`sellPrice.ts`, `scrapEngine.ts` fused-scrap bypass of
    the `selfCrafted` trim); (b) fused-item SCRAP re-mints Golem Cores + sellable
    aether stock from free junk (`scrapEngine.ts:104`); (c) Common armor sell
    floor 11 TC > authored stall price 8 TC → cross-stall arbitrage
    (`sellPrice.ts:37`); (d) `giftToVendor` trains CHA + gives +5 rep per junk
    item, no value floor/cooldown (`gameStore` ~16528). Fix direction: ground
    self-crafted sale price on ingredient value; value-gate gifts.
  - **Contract location-gating (needs stage-def schema add):** hunt/mystery/
    storyline stages advance on ANY matching skill-check/kill/travel anywhere, and
    the Contracts-UI COMPLETE pays 100% from any tile (only faction_quest has the
    remote-pay cut). Whole storylines farmable from a safe hub. Also: broker stalls
    accept every faction's contracts but refuse to take them back (one-way). Fix:
    add optional `locationId`/`biomeTag`/`enemyName` to stage defs + mirror the
    faction_quest remote-pay cut to the other three kinds.
  - **Item-dupe via name-keyed merges (medium, needs careful stacking audit):**
    dropped-item pickup merges by name (durability laundering + coating dupe,
    `gameStore` ~13301); `applyCoating` stamps a whole qty-N stack for one vial;
    throwable consumption resolves by name not equipped id (infinite coated throw
    + bandolier double-spend). Fix: route through `grantItem`/id-resolution.
  - **Water bounce residual (medium):** the one-per-visit water flags still live on
    `currentScene`, so bouncing two adjacent OUTDOOR water tiles resets them (the
    substring fix already killed the free-hub version). Fix: persist in
    `worldMemory.visitedRooms` with a game-hours re-arm.
  - **Small bugs:** enemy DOTs only tick on the player's `attack` action (frozen
    during dodge/move/companion turns, `gameStore` ~7560 — hoist out of `case
    'attack'`); no hard stat cap anywhere in the training stack (`statTraining.ts`
    +dog/golem twins — add a design ceiling); `jump at <any text>` trains DEX on
    unresolved targets; `defeatedEnemies` array grows unbounded → eventual
    save-loss (`worldMemory.ts` — collapse to a count map or trim). Full
    per-finding detail (file:line, repro, proposed fix) in the 2026-07-13 session
    log / scratchpad `sweep-findings.txt`.


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
  first counter in scene only) → 8 first swing, 6 after. **DODGE + DISTRACT
  reworked per the user's design call in 795/775/1081:** dodge is now an
  AC-BYPASS GAMBLE — the enemy's swing resolves as an opposed contest (d20+DEX
  vs its attack total; nat rules honored; enemy fumble = free win). Win → take
  nothing + `perfect_opening` status: next attack rolls DOUBLE damage dice
  (consumed by that swing hit or miss; stacks with crit to 4× dice). Lose → the
  blow lands REGARDLESS of AC for 2× damage. Old landed-hit parry + instant
  riposte + boxing exception + 2-durability cost retired; DEX/stealth training
  kept. Dog distract: DC now 8 + target ability points (was flat 12); a failed
  feint redirects that enemy's counter onto the DOG. Retest both on-device.
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
history in `HANDOFF-ARCHIVE.md`). Latest per line: **HaL2001 `2026-07-14-812`**,
**golem-line `…-792`**, **engine_Dev `…-1097`**. Current parity offsets: golem =
HAL − 20 (stable); engine_Dev = HAL + 285 (the Guardian OTA 798/778 was
HAL+golem-only, so engine is one behind on count; the readability batch 812/792/1097
shipped to all three and preserves the −20 / +285 spread).

| HaL2001 | golem | engine_Dev | Change |
|---|---|---|---|
| 812 | 792 | 1097 | READABILITY — the two follow-ups to 811's placeholder cleanup (user: "run both fixes"). (1) FEED WALL-OF-TEXT: the same-channel debounce (appendLog, ~line 4448) GROUPS rapid world/system entries into one card so the feed doesn't stutter separate stamps — but it welded them together with a TWO-SPACE joiner, so a single travel step (stall arrival line + wares blurb + "You walk east…/compass" + the arrival encounter, all inside the 500ms window) rendered as one run-on block (the screenshot). Changed the merge joiner to a PARAGRAPH BREAK (`\n\n`), so grouped beats read as distinct paragraphs while still living in one card (no stutter). RN `<Text>` renders `\n\n` as a blank line — no AdventureFeed change needed. (2) RECIPE BUY BUTTONS: recipe-learning was typed-only ("buy <name>", the thing 811 had to teach in prose). The vendor BUY screen now renders a "WORKINGS TO LEARN" section (VendorScreen) listing `vendorRecipeOffers(RECIPES, knownRecipes, vendorSeed(vendor.name))` filtered to not-yet-known, each a tappable row that opens the standard buy-confirm → confirm calls buyFromVendor(result) → the existing recipe-learn branch (gameStore ~16461). Open by default (it's the discoverable bit). This is the "surface it as UI so the prose can drop the syntax" follow-up noted in 811. All three lines. NOTE: the underlying travel-narration is still MULTIPLE appendLog beats merged — the paragraph-break makes that read well; if you'd rather each beat be its OWN feed card (harder visual separation), that's a bigger AdventureFeed change, not done here. |
| 811 | 791 | 1096 | PROSE POLISH — command-syntax placeholders removed from player-facing narration (playtest screenshot: "a big block of text with placeholder nouns in it"). The vendor-arrival wares blurb (vendorWaresBlurb) welded TYPED-COMMAND syntax into the story prose — `"buy <name>"`, `"repair <item>"`, `"train <stat>"`, `"heal dog"/"revive dog"` — so the angle-bracket tokens read as unfilled template variables mid-paragraph (and stacked onto the travel line + the encounter beat into one wall). Rewritten in plain language that still teaches the verb without the syntax: "Rare workings for sale: … — buy one by name to learn it. This one also mends worn gear, trains a stat for coin, and patches up a hurt dog or golem — just ask." (engine keeps "sidekick" for lore-neutrality). Same fix on the three narrator "send word `<name>`" contract-courier refusal lines → "send word by name". Swept the rest: every other `<...>` token in the codebase is in a CODE COMMENT, not player-facing (the mission-board "Type ACCEPT `<name>`" line was left — it's explicit instruction with a filled example right after). NOTE for future: the underlying "wall of text" is structural — vendor blurb + intra-scene travel narration + the arrival encounter concatenate into one paragraph; a real fix would break those into separate feed beats (not done this pass). Recipe-buying is still typed-only (no VendorScreen button) — surfacing it as UI would let the prose drop the buy hint entirely. All three lines |
| 810 | 790 | 1095 | HUNTS ARE A FACE-TO-FACE TURN-IN (user's B2 call — "hunts are a face to face turn in"). A bounty's proof is the trophy, and proof is shown IN PERSON to a paying agent. (1) turnInHunt no longer accepts the OTA-456 remote "send word" courier close for hunts — a typed "send word <hunt>" is refused. (2) The REAL B2 hole: the Contracts-UI COMPLETE (completeContractFromUI 'hunt') paid FULL reward from ANY tile with no vendor/agent check — a whole bounty closable from a safe hub. It now requires a paying vendor IN SCENE and the RIGHT posting faction's agent (a neutral hunt takes any vendor), exactly like the typed turn-in. (3) Always full pay now (the courier's 15% cut is gone with the remote path). The kill handler already stamped ready + directed "return to a posting agent", so the loop reads coherently. Mysteries / storylines / faction deeds KEEP their remote cut untouched (only hunts were called out). ContractsScreen hunt "how to finish" copy updated to say hand in face to face, no courier. Engine refusal lines use getNarratorName() (lore-neutral). All three lines. (The other open B item — dodge-dominant-at-high-DEX — is PARKED pending the user's live retest on a current build.) |
| 809 | 789 | 1094 | PARLEY Phase 2 — procedural payloads + dialogue beats + REAL rewards (closes the social rework). Wanderers now carry a SEEDED payload: GOODS (coins + salvage items; greedy sorts carry more) and a LOCATION LEAD, both deterministic in the spawn seed (makeWandererGoods / makeWandererLead). The parley rewards are now concrete: INTIMIDATE success grants the person's ACTUAL CARRIED GOODS into the pack (coins + items via grantItem/miscLootItem, was a flat TC stand-in); PERSUADE success plants a real player.pendingLead that PAYS OUT — the cache — the next time the player reaches fresh peaceful ground (beginScene payout gated on !opening/!enemies/!hub/!market), so "talk for secrets" is a genuine go-find-it rather than instant loot. New "cagey" DIALOGUE BEAT: opening a person-parley they name their price ("what's it worth to you?" for greedy, "depends who's asking" for reasonable — wandererCagey, keyed to temperament) before you pick, so the exchange reads as a conversation. Two greedy archetypes (drifter, scavenger, added in 808) round out the pool. New Wanderer.goods + Wanderer.lead; PlayerCharacter.pendingLead; miscLootItem grant helper. All lore-neutral. Knobs: goods tc greedy 12–27 / else 7–15, lead reward 14–35 TC. All three lines. SOCIAL REWORK COMPLETE (parley Phases 1+2 shipped 808–809 / 788–789 / 1093–1094) |
| 808 | 788 | 1093 | PARLEY + MENACE — Phase 1 of the SOCIAL REWORK (user-designed; supersedes the flat 806/807 talk-down + wanderer rolls). Speaking to a foe you're fighting (an animal) or a wild NPC (a person) opens a TWO-BUTTON choice with real asymmetric stakes: animals Calm/Intimidate, people Persuade/Intimidate. A GENERIC opener ("talk to / approach / greet") surfaces the ParleyModal so stakes are explicit; a SPECIFIC verb (intimidate/soothe/persuade/threaten/…) commits straight through. HARD LOCK-AND-KEY: every target has a temperament (skittish→calm, aggressive→intimidate, reasonable→persuade, greedy→intimidate; animals derive one from name/traits when unauthored) and the WRONG key AUTO-FAILS regardless of Charisma — a high-WIS character (≥12) is TOLD the temperament (temperamentReadout), everyone else reads the narrated tell (temperamentTell) or gambles. STAKES set by the BUTTON: the safe read (calm/persuade) fail = the hook is SPENT — no new harm but the lead/clean-exit is gone; INTIMIDATE fail = ACTIVE HARM (animal lands a vicious hit 3+1d6 & the fight goes on / person turns hostile → spawns as a Human enemy) AND the hook is spent. REWARD split ("talk for secrets, threaten for stuff"): persuade → a lead (Phase-1 stand-in = the wanderer reward roll; Phase 2 wires real traceable leads), intimidate → their goods (Phase-1 stand-in = 9–20 TC; Phase 2 grants carried kit). Full MENACE loop: intimidation ATTEMPTS raise player.menace (people +8 / animals +4), which SELF-BLUNTS your own intimidate DC (+1/20 menace), lifts encounter chance + can add a foe (beginScene), decays 0.4/game-hour, and shows on the character portrait (decayed value + tier Unremarkable/Noticed/Feared/Dreaded). Successful EXTORTION of a faction-affiliated person costs −6 standing (half to allies). New engine modules parley.ts + menace.ts (lore-neutral); Enemy.temperament + Wanderer.temperament/faction + PlayerCharacter.menace/menaceUpdatedHour; new ParleyModal (self-mounts off pendingParley); store pendingParley + closeParley + resolveParley + module runParleyOutcome; parser gains parley verbs (soothe/pacify/tame/threaten/menace/coerce/coax — 'calm'/'settle' deliberately excluded, they collide with self-directed "calm/settle down"). Knobs: WIS_REVEAL_THRESHOLD(12), BASE_PARLEY_DC(11), MENACE_PER_INTIMIDATE_PERSON/ANIMAL(8/4), MENACE_DECAY_PER_HOUR(0.4), PARLEY_EXTORT_REP(6). All three lines. Phase 2 (procedural NPC pool + hint→follow-up dialogue + real leads/goods) is next |
| 807 | 787 | 1092 | WANDERING NPCs — the second half of the "where does Charisma matter?" answer (talk-down was the first). The open road now occasionally puts a PERSON in front of you — a traveler / refugee / tinker / scout / pilgrim — someone you can actually TALK to (not a vendor stall, not an animal). `talk to <name>` is a d20 + CHA (+ Broker) check vs a friendly DC 12 (WANDERER_TALK_DC) for a small payoff: a word of the road (tip flavor), a few coins (6–15 TC), or — rarely — a +1 standing nudge with the player's OWN faction ("your people hear you dealt fair"). ONE read per wanderer (win or whiff, they move on), so CHA decides whether the meeting pays. FARM-PROOF via a self-contained window: each peaceful OUTDOOR tile gets exactly ONE spawn roll EVER, banked in worldMemory.wandererRolledTiles (bounded to the last 120 tiles), so leaving-and-returning can't re-roll a person off one square — you cross new ground to meet new people (~12% of eligible fresh tiles). Suppressed on hubs / markets / capitals / combat tiles / when a vendor already rolled / the opening. New engine module wanderers.ts (makeWanderer deterministic from a tile-hash seed / rollWandererReward tiers / wandererFailLine + 5 lore-neutral archetypes); CurrentScene.wanderer field; beginScene spawn + arrival narration ("This is <name>, <role>… try 'talk to <name>'"); talk intercept in submitPlayerAction right after the talk-down intercept (mutually exclusive — talk-down needs enemies>0, wanderer needs enemies===0); a green "☺ <name>" banner in ExplorationScreen taps to submit the talk. Standing reward routes through applyRepChange + logRepChanges; a factionless player gets the tip instead. All three lines (engine flavor already lore-neutral) |
| 806 | 786 | 1091 | TALK DOWN A FIGHT (answers the user's "where can I actually USE persuade? all I meet are un-typeable vendors and animal enemies"). IN COMBAT, a diplomacy verb (persuade / intimidate / convince / negotiate) is now a real d20 + CHA (+ Broker) contest that ENDS the encounter without a kill — DISTINCT from fleeing: the foe stands down and you KEEP the tile (fleeing is you running and leaving it). Success clears the enemies with NO loot / XP (you avoided the fight, didn't win it) + a small CHA train; failure costs the turn AND draws the enemy counter (runEnemyGroupCounters), so spamming a tough group is actively dangerous — no risk-free grind. DC scales with foe count + toughest rarity (talkDownDC: 10 for a lone Common, +2/tier, +2/extra foe); bosses / story-class threats (the `boss` flag — Guardians included) refuse outright. New engine module talkDown.ts (talkDownDC / isTalkDownBlocked / isIntimidationVerb / isBeastPack + success/fail flavor — beasts flee, people back off, intimidation vs. reasoned persuasion read from the verb); intercept in submitPlayerAction right after the dog-combat dispatch, ahead of the shared stealth/diplomacy/escape switch arm (so an in-combat "persuade" is a talk-down, not the old "words hang unanswered" no-op). Also refreshed SKILL_ACTIVITIES.charisma — dropped the stale "Gifting to a vendor" (gifting removed 803/783/1088) and added the talk-down + diplomacy-check surfaces. engine talkDown flavor is lore-neutral. All three lines |
| 805 | 785 | 1090 | CHA-SCALED VENDOR DISCOUNTS, gated per faction by a rapport quest (grew out of the B1/gifting talk — "does Charisma even affect pricing?" It didn't). Charisma now drives pricing: chaPriceDiscount = 2%/pt above 10, capped 20%, applied to BOTH buys (cheaper) and sell-backs (richer, on top of the B1 caps as an earned merchant perk — SELL_FRACTION 0.4 keeps buy-then-sell a loss, no arbitrage). GATED behind a per-faction RAPPORT quest `fq_<faction>_rapport` (vendorPriceMod returns 0 until completedFactionQuestIds holds it); until earned, pricing is unchanged. New module app/engine/factionRapport.ts (chaPriceDiscount / hasFactionRapport / vendorPriceMod / rapportQuestId); sellPriceFor takes a rapportBonus applied AFTER the caps; buyFromVendor + sellToVendor + VendorScreen honor the mod (trusted-partner banner shows the live %); turnInFactionQuest flourish announces the unlock. HAL/golem author 9 rapport fetch quests in faction-quests.json (fetch a Golem Core — 7/9 lore relics are broker-only, content follow-up to place them); engine ships the MECHANIC only (no Tartaria quest data — it keys off completedFactionQuestIds so it lights up wherever a rapport quest exists). Diplomacy was already wired (INTENT_TO_STAT.diplomacy='charisma'; "convince"/"persuade" in the CHA word list). Knobs: CHA_PRICE_DISCOUNT_PER_POINT (0.02), CHA_PRICE_DISCOUNT_CAP (0.20). All three lines |
| 804 | 784 | 1089 | BUY-FOR-REP reduced to a slow afterthought (user call — "buying should be a slow grind … contributes but almost as an afterthought"). Was a flat +1 standing per purchase (a 2 TC junk buy farmed rep). Now standing accrues by TC of HONEST CUSTOM: spent coin banks in player.buyRepProgress and grants +1 standing per BUY_REP_TC_PER_STANDING (500) TC, remainder carried across purchases. Cheap-junk spam can't grind it; joining a faction by buying alone needs ~10,000 TC spent, so mission completions + sigil turn-ins dominate. Pool is faction-agnostic (banks into whoever you're buying from when it crosses — benign cross-faction bleed for an afterthought lever). NOTE: Charisma is the DIPLOMACY skill-check stat (INTENT_TO_STAT) but does NOT affect vendor pricing/haggling — a possible future design hook if the user wants CHA to earn discounts. All three lines |
| 803 | 783 | 1088 | GIFTING REMOVED (user call). Faction standing is EARNED — mission completions (rewardRep) + sigil/pendant turn-ins (+1); gifting vendors loot for rep was a side door that undercut that design and was undiscoverable (no button, typed-only). Removed the `gift` Intent (types.ts), the parser verb-table entry + verb-frame (parser.ts / verbFrames.ts), the LLM-parser intent row (llmParser.ts), the giftToVendor store action + its `case 'gift'` handler (gameStore.ts), and 'gift' from ARBITER_ENGAGED_INTENTS + the hook-eligible set + the vendor "how to engage" hint + the LLM verb hint + the inventory item-modal body text. Test cleanup across parser/charisma/statspam/year-sim; deleted the 802 gift value-gate suite. 802/782/1087's B1d gift value-gate is SUPERSEDED. The buy-from-vendor +1 rep side door is LEFT as-is (flag for the user if it should go too). All three lines |
| 802 | 782 | 1087 | Economy re-tiering B1 (per the user's calls). (a) Self-crafted items never sell above their recipe INGREDIENT value — crafting-to-sell is break-even, Legendary +25% bump (sellPrice.selfCraftedSellCap). (b) Fused items stay SCRAPPABLE (the intended crafting-materials market), but the fuel mats they yield — Golem Core, Aetheric Shard/Dust, Aether Crystal, Aetheric Cloth, Mudstone — price near-worthless AT VENDORS (flat 3 TC, BOTTLENECK_CRAFTING_MATS): crafting-only value, no fuse→scrap→sell pump. (c) Nothing sells above the cheapest realistic buy for its rarity (RARITY_BUY_FLOOR 5/14/40/112), closing cross-stall arbitrage (Common-armor sell-11 vs buy-8). (d) giftToVendor value-gated: a near-worthless item (< 5 TC) is declined (no rep/CHA, not consumed), and rep scales with worth (~30 TC ≈ old +5, cap +8) instead of flat +5/junk. Tunable knobs noted in §8. All three lines |
| 801 | 781 | 1086 | Group-C polish (punch-list C1–C4). C1 fusion UX: firing the Crucible with reserved-but-insufficient pieces opens the PICKER (which surfaces each piece's material bucket + a live "N materials → need 3+ DIFFERENT" readout, already OTA-679) instead of dead-ending on a repeated arbiter refusal. C2 fused-weapon naming: a forged WEAPON with a soft / non-weapon Qwen name ("Aetheric Thread", "Resonant Veil") is rejected so the deterministic weapon pool (Cleaver / Edge / Reaver / …) names it; migrateFusedName heals old saves (armor keeps soft names). C3 post-boss grace: a boss kill stamps player.bossDefeatGraceUntilHours = now + POST_BOSS_GRACE_HOURS (3); beginScene suppresses arrival encounters while it holds, so stepping out of a just-cleared outpost doesn't drop a fresh ambush mid-loot. C4 MiniLM anchors: the 6 EMOTION_ANCHORS reworded to short, distinct, LORE-NEUTRAL sentences (no shared "ruins/Aetheric" boilerplate) so cosine similarity discriminates — neutral wording makes the engine_Dev copy identical. All three lines |
| 800 | 780 | 1085 | Small-bug + item-dupe closes (punch-list A1+A2). A1: (1) enemy DOTs tick EVERY combat round, not just `attack` (hoisted into runEnemyGroupCounters; attack path passes skipDotTick) — a poisoned enemy kept eating poison while the player dodged/moved/commanded a companion; (2) hard training ceiling MAX_TRAINED_STAT=30 (player + dog + golem; engine has no golem) — stats trained forever at 0.1/use; (3) `jump at <bogus text>` needs a RESOLVED scene noun to train DEX; (4) defeatedEnemies de-duplicated distinct-name set (self-heals legacy dup-farmed saves) → no unbounded save bloat; (5) wild-water re-arm moved to worldMemory.waterUsedAt, keyed per SOURCE on game-hours (WATER_REARM_HOURS=6) — off the per-scene flags that bounced between adjacent outdoor tiles. A2 dupes: (6) dropped-item PICKUP routes through grantItem + decrements the exact instance by id (no worn/coated/rolled laundering); (7) applyCoating (+armor) on a STACK peels ONE unit instead of coating all N for one vial; (8) equipped throwable consumed by the equipped INSTANCE id (mainId/offId) — closes infinite coated-throw + bandolier double-spend. Engine water lines use getNarratorName() |
| 799 | 779 | 1084 | Climbing rope usable to its LAST point: only a spent rope (≤ 0) refuses/gives out; the last pull breaks GRACEFULLY at the top (no fall — "the last of the line coils dead at your feet"); a fraying warning fires while the rope is low. Old guard snapped/refused at ≤ ROPE_WEAR_PER_TIER (15), stranding a whole climb + dropping the player with no warning. climbReadiness (CLIMB button colour/haptic) mirrors the new ≤ 0 rule. Engine's lines use getNarratorName() (lore-neutral) |
| 798 | 778 | — | Core Guardians carry authored thematic vulnerable/resist traits — weakness/resistance now shows in combat + the EnemyPanel (was always 'normal': their type isn't in the type-map and their traits weren't resist:/vulnerable:). HAL+golem only; engine_Dev has no Guardians |
| 797 | 777 | 1083 | Qwen dormancy watchdog revives from a FAILED reinit (not just the narrow dormant case) — fixes whole-session qwen-not-ready when one revival attempt failed and stranded status='failed'; retries every 60s + unwedges a hung reload |
| 796 | 776 | 1082 | Exploit-sweep batch (12 shared fixes): dodge costs a turn + 3-train cap; failed-dodge no longer 4× under crit; distract DC floor 12 + nat rules; shared ranged-enemy classifier (kite fix); boss regen once/round; buffs consume on attack-resolve not prompt-build; scrap ghost-slot fix (hands/cloak/ring2/3); 2H-displace hpMax loop closed; whole-word water match; fill costs time; hunt boss must be killed; investigate self-dispatch loop killed |
| 795 | 775 | 1081 | Dodge = AC-bypass gamble (win: next strike ×2 dice; lose: hit lands past armor for 2×); dog distract DC scales with target + failed feint redirects the counter onto the dog |
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
