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
  6. ~~Dodge strictly dominant at high DEX (100% win in the log) — could beat even
     an enemy nat-20 → literal invulnerability.~~ **FIXED 815/795/1100** — a NATURAL
     20 lands through a dodge (hard 5% hit floor, matching the AC path); 2× out-of-
     position, crit-doubling still suppressed (OTA-796). Never invulnerable; a high
     miss rate is fine (player's design call).
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
    - **B3 [#6] Dodge strictly dominant at high DEX** — RETEST DATA IN (2026-07-15
      device log, Heir Atalan-Drowned Core Guardian fight): it's really an AC/defense
      dominance more than a dodge-loop exploit now. The player at **AC 31, DEX 20** made
      the boss (d20+5 to hit) need a **26+ — i.e. only a natural 20** lands, so across
      the whole fight the boss connected exactly ONCE (a crit for 14); every other swing
      of its two-per-round missed. Dodge on top gives a free "PERFECT OPENING (next
      strike ×2 dice)" every time. BUT the fight was NOT trivial: the Guardian RESISTS
      piercing (the player's Giant Bone Longbow + Phoenix Rebirth both piercing → ×0.5,
      3–6 dmg/hit), so offense was slow and the golem (Fat Ass) actually landed the
      kill — the OTA-798 weakness/resist system + the Arbiter's "try burn" hint were
      doing their job. So the open question for the USER's design call is narrower than
      "dodge is broken": **high AC makes late-game characters near-unhittable except on
      crits.** Options if they want to tune — (a) let bosses' bonus scale so they hit a
      31-AC target more than 5%; (b) cap/curve AC contribution; (c) leave it (defense IS
      the reward for stacking AC, and offense is already gated by resistances). Do NOT
      change anything until the user picks a direction — this is a balance/feel call.
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
history in `HANDOFF-ARCHIVE.md`). Latest per line: **HaL2001 `2026-07-16-842`**,
**golem-line `…-822`**, **engine_Dev `…-1123`** (840–842 = the complete Tier-2 QoL
batch, all three lines. 842 = combat-log damage-modifier breakdown (one clean bracket
vs run-on parens). 841 =
"did you mean…" chip row (store field + ExplorationScreen chips), ships to all three.
840 = Tier-2 QoL #1, never-fail-silently sweep — pure gameStore feedback lines, ships to all three. 839 = a lore-accuracy pass (data)
+ a **HAL-ONLY** intel backfill; the backfill migration is deliberately NOT on golem/
engine per the owner ask — golem/engine got only the lore-data fixes. 836–838 are the
three Tier-1 QoL OTAs — "make the depth visible." 836 = tap-to-explain AC; 837 = discovery codex/
bestiary + surfacing the concepts lore bank; 838 = observed enemy weakness tags.
All ship to all three lines: sheet/codex/panel UI + display helpers, no combat-math
change. NOTE for engine: engine's LoreCodexBody pulls from content packs (getRaces/
resolveTable) rather than the JSON imports, so 837 reconciled there (bestiary only,
concepts lore tab omitted). 836 was pure sheet UI. 835 ships to ALL THREE — the engine
SHARES the built-in race abilities/mechanics with HAL, same race ids + RACE_ABILITIES,
so the trait-wiring batch applies there too; only the merge in equipment/gameStore
diverged. 834 stays HAL+golem-only — its RACE_PRIMARY key-fix + stall-faction remap
target character.ts/vendors.ts data that engine drives from content packs. 833 was HAL+golem-only — the golem
Core-gate is Tartaria recipe content and the craft-refusal popup, while lore-neutral
UI, has no engine analog worth porting solo; engine stays at 1115. 830 AND 831 were HAL+golem-only —
830 is Guardian gear (engine has no coreGuardians); 831's cold-coating code doesn't
apply because engine's `WeaponCoating.kind` is already an OPEN `string` with a
content-pack `coatings` override, so engine handles any coating kind — incl. cold —
generically, no code change. Engine stays at 1114; the spread has widened by 2). Current parity offsets: golem =
HAL − 20 (stable); engine_Dev = HAL + 285 (the Guardian OTA 798/778 was
HAL+golem-only, so engine is one behind on count; the coating/fused-names batch 814/794/1099
shipped to all three and preserves the −20 / +285 spread). The 815/795/1100 tuning
batch keeps the spread too — parts B+C (dodge floor, sigil rapport) ship to all
three; part A (Guardian scaling) is HAL+golem-only (engine has no Guardians), so
engine's 1100 carries only B+C.

| HaL2001 | golem | engine_Dev | Change |
|---|---|---|---|
| 842 | 822 | 1123 | TIER-2 QoL #3 — COMBAT-LOG DAMAGE-MODIFIER BREAKDOWN (completes the Tier-2 batch). The incoming-hit line appended each mitigation as its OWN parenthetical, so a hit that armor + a title + a race resist/vuln + a shield + a ward all touched read as a wall of `(…)(…)(…)(…)(…)`. New exported **`damageModClause()`** (gameStore, next to recordEnemyIntel) collects them into ONE terse comma-separated bracket in apply-order (armor → title → race → shield → ward): `…damage [armor −40%, title ½, +50% dmg, shield ½, ward soaks 3].` A race VULNERABILITY lists as `+N%` (the bracket shows every modifier, not only reductions); no modifiers → no bracket. The incoming-damage assembly (applyEnemyCounter's set() closure) now calls it instead of concatenating `titleTag + raceResistTag + shieldTag + wardTag`. Pure log-format change (no damage math touched). Ships to all three lines. Test: ota842CombatLogMods (empty/single/multi/vuln/etherbound/precedence/paren-strip). |
| 841 | 821 | 1122 | TIER-2 QoL #2 — INTENT-PARSE "DID YOU MEAN…" CHIP ROW (the natural-language cliff). The parser already degraded well — a low-confidence/unresolved input tries the Qwen fallback, then a soft Arbiter refusal + a `Try: look around · search · rest` TEXT hint (built from `parsed.suggestions`, runnable command strings). But that hint was dead text the player had to RETYPE. Now the same list is stashed on the store — new **`parseSuggestions: string[]`** (set on BOTH soft-refusal paths in `submitPlayerAction` — the Qwen-failed async branch and the Qwen-unready sync branch — alongside the existing Try: line; cleared at the START of the next `submitPlayerAction` so tapping a chip or typing anything dismisses stale chips) — and **ExplorationScreen** renders it as a TAPPABLE "Did you mean…" chip row just above the InputBox (each chip `onPress`→`submit(cmd)`; hidden in combat). One tap re-submits the command instead of a retype. Pure additive: the Try: log line stays as the persistent record; chips are the ephemeral affordance. Ships to all three lines (store field + one screen). Test: ota841DidYouMean (unresolved parse populates it, next action clears it). |
| 840 | 820 | 1121 | TIER-2 QoL #1 — NEVER-FAIL-SILENTLY SWEEP (owner's Tier-2 batch; the 833 craft-refusal popup was one instance of a class). An audit agent swept `submitPlayerAction` + every intent handler; the codebase was already unusually well-instrumented (most guards speak, with explicit "never a silent no-op" notes from OTA-833/037/125/155/163), so the real residual silent no-ops were a SHORT list — all fixed: **(a) unequip an empty slot** (`remove helmet` with nothing there → `unequipSlot` narrates nothing → dead silence; now the dispatch checks the slot first and says "nothing in that slot to take off", or "nothing to put away" for an empty-handed weapon strip — handled at the dispatch, not inside `unequipSlot`, so the main+off clear doesn't double-message); **(b) typed equip** (`equip iron sword` printed nothing since `equipItem` stays silent for UI taps → now the TYPED path confirms with a slot-aware verb "You ready/don …"); **(c) buy an unstocked item** (the lone silent exit in `buyFromVendor` → "…doesn't carry any X"); **(d) buy/sell with no vendor present** (queued/stale action → "There's no one here to trade with", guard split so it only fires when a player exists); **(e) summon Core Guardian** (no_guardian_def/no_scene reasons had no line → a failed main-quest summon could no-op silently; now always answers); **(f) SALVAGE ALL mixed batch** (unmatched nouns left only a debug breadcrumb while successful loot showed → now they surface too). Skipped the "input while a dice roll is pending" case (intended UX — the modal blocks input). Ships to all three (pure gameStore feedback strings). Test: ota840NeverFailSilently (unequip-empty, typed-equip confirm, buy/sell no-vendor). |
| 839 | 819 | 1120 | LORE-ACCURACY PASS + HAL-ONLY INTEL BACKFILL (owner: "make sure the codex lore is 100% accurate to the game — the game and lore docs drifted; when in doubt the game wins" + "backfill my HAL player with what I've already discovered"). **(1) Lore accuracy (data; all lines):** two parallel audit agents reconciled the player-facing codex against the CODE. `races.json` — 4 traits fixed: Sentinel "Immunity to Time" dropped its promise of immunity to the REMOVED hunger/forage system (real effect: half stamina cost + weather-corruption immunity + gem luck, per OTA-835); Mud Golem "Aetherstone Resilience" now states the aetheric VULNERABILITY (+50%) + ×0.75 non-aetheric cut (was the false "half from non-Aetheric"); "Elemental Control" reads as the two once/day abilities (strike + 1d6 ward); Mud Dweller dropped the non-existent "Mud-power" damage type. `concepts.json` — 5 combat/stat entries fixed + 1 added: `dodge_action`/`dodge_melee` now describe the AC-bypass GAMBLE (retired the advantage / opposed-check text, OTA-795); `skill_check`/`hide_action`/`stealing` use STEALTH not DEX (stealth is the 6th stat, OTA-348) and `stealing`'s DC is vendor-set + escalating (not a fixed 12); added the missing **`cold`** damage-type entry (cold is live). `factions.json` + `glossary.json` audited clean. (Sprint was checked and is LIVE — the owner's hunch it was removed was wrong; no change.) **(2) Intel backfill — HAL ONLY (deliberate divergence, per owner):** `backfillEnemyIntelFromDefeats` (gameStore) seeds a returning character's OTA-838 `enemyIntel` from the foes in `worldMemory.defeatedEnemies`, using the same type+trait reconcile the panel's `defensesFor` uses, so a veteran save doesn't open the new bestiary/panel to blank weaknesses. Wired into the resume-path worldMemory migration; runs once (only when the save has no `enemyIntel`). **Golem/engine got the lore-data fixes but NOT the backfill** — they can adopt it later if wanted. Tests: ota839LoreAccuracy (data guards: stale phrases stay gone, corrected facts stay present), ota839IntelBackfill (HAL — derive/dedup/skip-unknown). |
| 838 | 818 | 1119 | TIER-1 QoL #3 — OBSERVED ENEMY WEAKNESS TAGS ("make the depth visible", final of the three). The EnemyPanel already WIS-gated a non-boss enemy's weak/resist reveal (Wisdom ≥ 12 = read on sight; below that, its OWN copy said "strike to learn") — but that "learn by hitting" was a transient combat-log line, **never persisted or shown on the portrait**. This closes that gap: landing a weak/resist hit records the observed damage type in new **`worldMemory.enemyIntel`** (name-keyed `{weak,resist}`; **`recordEnemyIntel`** dedupes and a contradicting later hit MOVES the type — per-spawn randomization can flip a weakness, so the freshest observation is the truth). Wired at the primary **melee** (`combinedMod` site), **ranged-bolt**, and **thrown-coating** attack paths. The portrait's `? — strike to learn` line and the tap-detail popup now reveal the types you've **learned** even below the Wisdom threshold (EnemyPanel gains an `enemyIntel` prop, threaded from ExplorationScreen), and the OTA-837 **bestiary** shows "WEAK TO / RESISTS" on each fought enemy. `recordEnemyIntel` is exported for the unit test. Ships to all three lines (persisted field + combat record calls + panel/bestiary UI). Test: **ota838EnemyIntel** (record/dedup/move: weak↔resist flip keeps freshest, normal is a no-op, distinct types accumulate). |
| 837 | 817 | 1118 | TIER-1 QoL #2 — DISCOVERY CODEX / BESTIARY (owner: "make the depth visible"; also flagged the existing lore tab is "many revisions behind" + "a massive lore document in the files"). Extended the existing **LoreCodexBody** (races/factions/places/timeline; reachable from the gear icon + title screen) with two tabs rather than a new screen. **(1) BESTIARY** — fills in AS YOU PLAY: every enemy in `app/data/enemies/enemies.json` (~109) is a dashed "??? — undiscovered" silhouette until you defeat its type (revealed via `worldMemory.defeatedEnemies`, case-insensitive name match — the list the kill path already maintains), then shows type/rarity/HP/damage/traits/drops, with an "X of N catalogued" counter so the player sees the shape of what's left. **(2) LORE** — finally surfaces `app/data/lore/concepts.json` (172 entries: title/answer), the "massive lore document" that was in the files feeding the Arbiter's narration context but never shown to the player; reference material, always readable (not gated). New `Section` union adds `'bestiary' | 'lore'`; tab row shows "beasts"/"lore". No component-render harness exists in-repo, so the test (**ota837CodexData**) locks the data contracts + the discovery-gate predicate. Ships to all three lines (codex UI + JSON data). **Engine caveat:** engine's codex may read enemies/concepts via content-pack getters instead of the JSON imports — reconcile on that line. Next: OTA-838 folds observed damage-type weaknesses into each revealed bestiary entry. |
| 836 | 816 | 1117 | TIER-1 QoL #1 — TAP-TO-EXPLAIN NUMBERS (owner design push: "make the depth visible; the risk isn't niche, it's legibility"). The Character sheet's CORE STATS already showed per-source chips (base + race + equipped + food + weather + corruption), but the derived DEFENSE numbers did NOT — and "Armor Class" rendered only `effectiveAC()` (race base + scene-context delta), **silently dropping the equipped-armor / accessory AC, the ruins-defense title bonus, and any active stance/cover** — so a plate-armored character read the SAME AC as a naked one (both a legibility gap AND a display-accuracy bug). New **`effectiveACBreakdown(player, scene)`** (gameStore, sited next to the module-private `aggregateArmor` so display + combat can't drift) returns the SAME total the enemy-attack resolver stands on — `racialAC + armor + title + status` (the dodge gamble is a per-swing AC *bypass*, not standing AC, so it's excluded) — decomposed into labelled `{label,delta}` sources. CharacterScreen's DEFENSE card now shows `acBd.total` + "(base N)" + source chips (armor / stance·cover / title / race-context), reusing the existing core-stat chip styles. Ships to ALL THREE (pure sheet UI + a display helper; no lore, no combat-math change). Test: ota836ACBreakdown (naked = base only; equipped armor now counted; cover stance folds in; total floored at 1). |
| 835 | 815 | 1116 | RACE TRAIT "MAKE THE FLAVOR TRUE" BATCH (owner sign-off on the OTA-834 design items). Five trait re-implementations + the first real race VULNERABILITY. **(1) RACE WEAKNESS now exists** — `raceDamageMultiplier` (raceMechanics.ts) may exceed 1 (was resistance-only ≤1). The Mud Golem's authored aetheric weakness bites: **+50% from aetheric, ×0.75 from everything else**. `raceResistLabel` reads both directions (`>1` → "+N% dmg", `<1` → "absorbs N%"), and the incoming-damage site (gameStore ~26000) applies `mult !== 1` (was `<1`). **(2) CURIOUS MIND (Unknowing Masses)** — was a per-roll +2 investigate stand-in; re-implemented as its real text: a **persistent +2 INT / +2 WIS that AWAKENS on first exposure** to a relic/ruin. New `player.curiousMindAwakened` flag flips at the skill-check chokepoint (gameStore ~10228, when `relicTarget || inRuins`); `effectiveStats` + `effectiveStatsBreakdown` (equipment.ts) fold the +2/+2 in once awake. The old `combatRules.raceSkillBonus` investigate special-case was REMOVED (would double-count). **(3) ELEMENTAL CONTROL (Mud Golem)** gained its defensive half (the trait's "1d6 block / 1d6 attack"): new **`elemental_ward`** ability (raceAbilities.ts) raises a `stone_ward` status that **soaks the next 1d6 incoming damage** before HP (new StatusEffect kind + `absorb` field; consumed at the damage site after all resists/shield; per-encounter via COMBAT_ONLY_STATUSES). Strike half unchanged (renamed "Elemental Control — Strike"). **(4) BEGINNER'S LUCK (Unknowing Masses)** — was a flat +3 WIS buff; now banks a **real one-shot reroll token** (`player.luckyRerollReady`) that `resolveRollStep` spends the next time a difficulty roll FAILS, rerolling the same dice and keeping the better total (applies to skill / combat-attack / relic rolls). **(5) LEGACY OF POWER (Tartarian Giant)** — was repair-only; now rolls the trait's **three channels** (1d3: repair most-worn / +2 STR 3 rounds / unexpected surge = heal · double-buff · corruption cleanse · corruption backlash). Also in-batch: **Sentinel** "Immunity to Time" made real (tireless — half stamina cost; ageless — weather corruption can't accrue), **Stormcaller** ethericShield de-redundified (now ALSO halves electrical, "Storm-hardened"). Tests: ota835RaceFlavorWiring (vulnerability mult + labels; Curious Mind gating; ward registry/combat-gate/1d6 soak; luck token). Updated raceAbilities + raceConditionalBonus tests for the new shapes. **Ships to ALL THREE lines** (engine shares the built-in race abilities/mechanics; the equipment.ts + gameStore.ts damage-site merges kept engine's faction/title stat terms and content-pack proc/resist paths intact alongside the ward soak + curious fold; engine's raceAbilities.test.ts asserts on ability ids, not raceId, since its merged OwnedAbility shape carries none). |
| 834 | 814 | — | RACE / FACTION / TITLE WIRING AUDIT (player ask: "make sure every racial trait/ability, faction trait/ability, and title perk actually does something"). Ran 3 parallel auditors; the systems are mostly healthy (faction sigil→rapport→CHA discount wired end-to-end at the vendor math; all 18 title-perk fields have real consumers; all 7 race abilities granted+handled). Two CONFIRMED wiring bugs FIXED here: **(1) `RACE_PRIMARY` key mismatch** (character.ts) — keyed by plural/faction ids (`tartarian_giants`/`architectural_sentinels`/…) but looked up by the singular `race.id`, so 6 of 7 races silently got the `Rusted Blade` fallback instead of their starter arm (Giant lost Mud-fist Wraps, Sentinel lost Tartarian Spear; only aetherborn matched). Re-keyed to the real singular ids, all 7 covered. **(2) Stall-roster race-ids-as-factions** (vendors.ts STALL_ROSTER) — 4 Hidden-Market reps carried RACE ids (`unknowing_masses`/`aetherborn`/`mud_golems`/`architectural_sentinels`) absent from factions.json, so rapport/CHA-discount silently no-op'd on those rotation days. Remapped to the faction that owns each theme: unknowing_masses→conspiracy_architects, aetherborn→eternal_dynasty, mud_golems→mud_monarchs, architectural_sentinels→stone_builders (true_tartarians IS canonical, left as-is). Tests: ota834RaceStarterAndStallFactions (each race's starter arm; every stall faction canonical-or-null). **DESIGN ITEMS surfaced to the owner, NOT changed (they're balance calls or target removed systems, not wiring bugs):** Sentinel "Immunity to Time" (ageless/no-hunger/no-fatigue) is inert because hunger was globally REMOVED (gameStore ~1978) and there's no time-fatigue/aging for anyone — nothing to be immune to; `raceDamageMultiplier` is resistance-only (≤1) so a race can't be authored VULNERABLE (Mud Golem's "aetheric weakness" is merely absence of resist); Mud-Golem elemental_control's 1d6-BLOCK half unimplemented (attack-only); several race abilities are effect-SUBSTITUTIONS vs their flavor (Beginner's Luck = +3 WIS buff not a reroll; Curious Mind = flat +2 investigate, no exposure gate/WIS; Legacy of Power = repair-only); `stormcaller`'s ethericShield is 100% redundant with ethericDamageResist; `shadow_diver` + `protector_of_the_forgotten` titles are unearnable (their counters never increment, Tier-C challenges ship enabled:false — intentional/unshipped); faction `joinRequirements`/`tags` data fields are unconsumed (flat join threshold by design). HAL+golem only (Tartaria race/faction content). |
| 833 | 813 | — | GOLEM-WEAPON CORE GATE TIERED + CRAFT-REFUSAL POPUP (two player asks). **(1) Gate tiers (ruling "A"):** every golem weapon (Sledge/Greatsword/Pike + Crude/Elder tiers) was gated at a flat `coresRequired: 4`, so a learned "Golem Sledge" — and even the "Crude" entry tier — was locked as hard as the Elder tier (device: player learned Golem Sledge at 2 Cores, couldn't forge anything). Now recipes.json tiers it: **Crude → 1 Core, normal → 2, Elder → 4**. Golem weapons stay GOLEM-ONLY (the `golem_weapon` tag makes them construct-only — the player can't wield them; only `armSidekick` arms a golem with one). No secondary milestone gate — the craft handler's only check is `recipe.coresRequired`. **(2) Craft-refusal popup:** a gated / unaffordable / pack-full craft did NOTHING visible — RecipesView diffed inventory before/after and only popped the CraftResultModal on a NON-empty delta, so a refused craft was a silent no-op (device: "I didn't know my touch registered until I left the menu and saw two tries had gone through"). New `CraftRefusalModal` (amber "◆ NOT YET", KEEP CRAFTING / CLOSE MENU — mirrors the continue-crafting popup): RecipesView.handleCraft now, on an empty delta that ISN'T a substitution-confirm (that has its own modal), captures the newest arbiter/world refusal line the engine logged and raises the modal via a new `onCraftRefused` prop; CraftingScreen renders it. The body IS the engine's in-character refusal ("…war-forging from before the flood — bring more home."). HAL+golem (Tartaria recipe content + UI; engine's recipe set + gate differ). Tests: ota833GolemGateTiersAndRefusal (per-family tier data = 1/2/4; a 0-Core Crude craft is refused + logs the refusal the modal shows; a 1-Core Crude craft clears the Core gate). |
| 832 | 812 | 1115 | FUSED ARMOR NOUN NOW MATCHES ITS SLOT (player: "one of the feet slot armor is a girdle?"). `synthesizeFusionDeterministic` (itemFusion.ts) picked the armor NOUN from a flat pool (`Girdle/Harness/Plating/Cuirass/…`) while the SLOT was chosen by a separate rotation, so a waist word ("Girdle") or a torso word ("Harness") could land on the FEET slot. Fix: compute the forged slot FIRST (same hash-seeded rotation + recent-slot avoidance), then draw the noun from a slot-keyed pool — head → Helm/Crown/Hood/Visor/Coif/Cowl/Casque/Circlet; chest → Plate/Cuirass/Mantle/Carapace/Bastion/Aegis/Harness/Bulwark; legs → Girdle/Greaves/Faulds/Kilt/Legguards/Tassets/Brace; feet → Boots/Sabatons/Treads/Stompers/Warboots/Footguards/Striders. Forward-only (existing fused items keep their baked names). Lore-neutral (armor nouns are generic English) → all three lines (engine had the same flat-pool bug). Tests: ota832FusedArmorSlotNoun (over 60 forges spanning every slot, the name's last word is always in its slot's pool; a feet piece is never a Girdle/Harness). |
| 831 | 811 | — | COLD COATINGS (HAL+golem only — engine's WeaponCoating.kind is an open `string` with a content-pack `coatings` override, so it handles cold coatings generically with no code change) (player: "since we introduced cold, do we have coatings for it? a couple variants, drinkable to heal you from the cold, coat weapon, coat armor, one-time throw"). OTA-827 added the cold TYPE + cold weapons but no coatings; cold is now a full coating family like poison/burn/electrical. **Kind union** `cold` added everywhere: `WeaponCoating.kind` + `StatusEffectKind` (new `chilled`) (types.ts), the itemEffect coating payload, gameStore's `enemyStatuses` kind (`cold_coat`) + the 3 local coatingProc annotations, `coatingStatusKind`/`coatingBlurb`/`LOOT_COATING_LABELS` (weaponCoating.ts, cold is craft-only like electrical/burn — not in the loot roll), and EnemyPanel's status-meta (`FROST` chip). **All four roles:** (1) OFFENSIVE — a cold coating on a weapon lands a `cold_coat` DOT and is ELEMENTAL (added to the 3 `isElemental` branches: melee attack, typed-throw, golem) so it earns a Construct/Automation's cold weakness (anti-machine, per OTA-827). (2) DEFENSIVE — coat armor → cold resist (`coatingDamageType('cold')`='cold' → addedResists → applyArmorResistance; no new code). (3) CURATIVE — `isCoatingDrinkable('cold')` true; drinking heals a little HP + clears a `chilled` slow (coatingRemedy.ts). To give the drink a real counter (the drinkable-only-if-there's-an-ailment rule), a cold-typed enemy hit can now leave the player `chilled` (statusEffects TYPE_TO_EFFECT cold→chilled), a timed **−2 DEX** slow applied in `effectiveStats` (equipment.ts). (4) THROW — the coating vials are `weapon_coating`-tagged → bandolier-eligible one-time frost burst (existing burst path, kind-agnostic). **Content (HAL+golem):** two craftable variants in gear.json — **Frost Paste** (Uncommon, 1d4 cold) and **Rime Draught** (Rare, 1d6 cold, +1 WIS) — plus recipes.json entries (Aether Dust/Crystal + Mudstone; Aetheric Shard/Crystal + Hardened Mudstone). Code is lore-neutral → all three lines; the Tartaria coating ITEMS are HAL+golem (engine's pack adds its own cold coatings). NOTE poison was ALREADY a full coating family (Poison/Plague/Viper Venom vials, drinkable, resist, throw) — no change needed there. Tests: ota831ColdCoatings (all four roles + the chill DEX slow) + coating/recipe/craft suites green (53 + 129). |
| 830 | 810 | — | GUARDIAN GEAR — SAVE MIGRATION (OTA-828 follow-up; HAL+golem only — engine has no coreGuardians; device report: "Atalan's Trident still doesn't work"). OTA-828 stamped `uniqueStats` in the `weapon()`/`armor()` BUILDERS, so only NEWLY granted drops became usable — a drop earned BEFORE 828 sits in the save with NO uniqueStats and still resolves barehanded / 0-AC. The inventory dump proved it: **Vaelka's Halberd** showed `1d12 bludgeoning` + equip actions (working) while **Atalan's Trident** showed no damage line and only `scrap, drop` (broken). The halberd only worked BY ACCIDENT — its name fuzzy-matched a catalog "Halberd" via `findWeaponByName` (hence the WRONG generic `1d12 bludgeoning` instead of the authored `1d10+2 slashing`); a "Trident"/"Rosary"/"Tuning Fork" name has no catalog row to match. Fix: new `guardianGearUniqueStats(item)` (coreGuardians.ts) indexes every canonical set weapon+armor by NAME (a `freshDrop` only suffixes the id, never the name) and returns the uniqueStats a stored drop SHOULD carry; the save-load restamp loop (gameStore) grafts it onto any `core_guardian_set` item lacking uniqueStats, BEFORE the fused-tag backfill (which still skips Guardian gear). One-time on load, then persisted. Also corrects the accidental catalog-fuzzed weapons (Halberd/Club/Maul) to their AUTHORED stats. HAL+golem only (engine has no coreGuardians). Tests: ota830GuardianGearMigration (a pre-828 Trident with no uniqueStats re-derives 1d10+2 piercing/STR + resolves via getEquippedWeapon; armor AC re-derives; no-ops on already-statted / non-Guardian items). |
| 829 | 809 | 1114 | FUSABLE FILTER LISTED QUEST CORES (player report: "sort by fusible showed my two quest Cores; they can't be marked safe for fusion and shouldn't come up at all"). The Capital "Cores" (the main-quest MacGuffins — `triggerMainQuest` mints them `kind:'relic'`, `rarity:'Legendary'`, tags `['quest','aetheric_core','main_quest']`) are catalog-absent, so in `isForgeReservableItem` (itemFusion.ts — the single source of truth the FUSABLE filter + reserve toggle + bench all use) they hit the `isInferredItem(name)` shortcut and returned `true` (reservable junk) BEFORE the `FORGE_LOOT_BLOCK_TAGS` (throwable/keepsake/quest/sigil/currency/relic) guard could reject them — that guard only ran on the separate `isForgeableLootReagent` ('loot' tag) path. Fix: apply the block-tags guard (and an explicit `kind:'relic'` reject) in `isForgeReservableItem` BEFORE the inferred shortcut, so quest/relic/sigil/currency items are never reservable regardless of catalog presence. Lore-neutral → all three lines. Tests: ota829QuestCoreNotFusible (a Capital Core + a quest-tagged trinket + any relic-kind are all un-reservable; ordinary inferred junk still reservable) + forgeReservable/fuseDiversity/ota825 green. |
| 828 | 808 | 1113 | TWO DEVICE-LOG FIXES (player report). **(1) Core Guardian reward gear was COSMETIC-ONLY** — player: "how come Atalan's Trident can't be used as a weapon?" The `weapon()` helper (coreGuardians.ts) took a `damage` param ('1d10+2') and **dropped it on the floor** — no damageDice/damageType/stat stored — and Guardian gear has no catalog row + no `uniqueStats`, so `getEquippedWeapon` (→ `findWeaponByName` miss) resolved it as BAREHANDED and `aggregateArmor` credited the armor **0 AC** (the `ac:N` tag is never read there). So EVERY Core Guardian drop (9 weapons + 9 armor, the whole endgame reward set) did nothing. Fix: both `weapon()`/`armor()` now attach `uniqueStats` — weapon derives damageType + scaling stat from its flavor tags (piercing/slashing/blunt→bludgeoning, `cold_damage`→cold, `corruption_damage`/`sonic`→aetheric; `finesse`→DEX, exotic casters→INT) and stores the dice; armor stores acBonus + slot + a mapped resistance. Guarded the save-load fused backfill (OTA-688) + fused-name migration to EXEMPT `core_guardian_set` items so a Guardian drop isn't mistagged `fused` or renamed. (Bonus: the Giant-tomb Hierophant's Staff now actually deals the new `cold` type from OTA-827.) **(2) Climb fall now RESETS progress** — player: "you shouldn't be able to resume climb at the same level you fell from — start all the way over." A fall cleared `elevatedOn` but left the persistent `climbed:<noun>:tN` room markers, so the next attempt resumed at the tier you fell off. `climbFall` now strips this climb's tier markers (fuzzy-matched via `sameClimbNoun`) from room memory, so a fall drops you to the ground AND wipes the climb — next attempt starts at tier 1, with a "climbed again from the base" note. Both lore-neutral → all three lines. Tests: ota828GuardianGearAndClimbFall (Trident/staff/armor resolve with real stats, no fused mistag) + ota828ClimbFallReset (a fall strips the progress marker + re-grounds). |
| 827 | 807 | 1112 | GROUP-K FOLLOW-UP — the owner's rulings on the four content/damage-type gaps OTA-826 flagged. **(1) `cold` is now a REAL damage type** (added to the `DamageType` union + `DAMAGE_TYPE_KEYWORDS` + the enemy attack-verb map; a `cold` proc entry + `frost→cold` alias already existed). Two new frost weapons make it reachable — **Frostbind** (INT runecaster, 1d6 cold) and **Frost Maul** (STR melee, 1d8 cold) — so the two Core Guardians' authored `vulnerable:cold` (Chord Break) / `resist:cold` (Giant Vigil) traits, dead since forever, finally fire. Cold is the **anti-machine** element: Automation/Mechanism/Mech-Construct/Construct all weak to it (metal seizes, coolant freezes). **(2) `force` weapons interact** — the 2 aetheric-flavored runecasters (Gale Binder, Force Wave) dealt `force`, which wasn't in the type map, so they were permanently neutral; a new shared `canonicalDamageType` (damageTypes.ts) aliases `force→aetheric`, `frost→cold`, `ice→cold`, `shock→electrical` and is now applied INSIDE `applyDamageTypeModifier` (crafting.ts) + `traitDamageMultiplier` (enemyTraits.ts), not just the proc layer — so force weapons reconcile as aetheric everywhere. **(3) `poison` is now a REAL weakness** — it's the **anti-organic** element: Animal/Human/Aetheric Mutation weak to poison (venom bites flesh), still RESISTED by Automation/Mechanism/Etheric Undead (nothing to poison). Pre-fix no enemy was ever `vulnerable:poison`, so poison weapons could only land neutral/halved. **(4) Construct is NOT a dead map row** (OTA-826's auditor missed the runtime spawn) — it's the type of the **provokable Roused Construct**, roused by striking a statue/colossus/sentinel/automaton on a tile (gameStore ~8014). Per the owner's ask ("big autumn-iron robots, almost Guardian-tier, a higher boss"), it's rebuilt into a scaling mid-tier BOSS: HP/AP scale with BOTH tile danger AND player power (bestCombat + hpMax/10, inline so it's line-neutral — engine has no coreGuardians), **capped below Guardian tier** (HP≤90, AP≤11) so it never eclipses a Core Guardian but stays a threat at endgame instead of being farmed; type Construct → resist slashing/piercing, weak bludgeoning/electrical/**cold**; drops real salvage (Scrap Metal + Aether Crystal, plus the scarce **Golem Core** on a heavy one), `ambush_strike` first hit, richer telegraph. All lore-neutral CODE → all three lines; the frost WEAPONS are Tartaria content (HAL+golem; engine's pack adds its own cold gear). Tests: ota827ColdForcePoisonConstruct (cold reachable + fires Guardian trait, cold anti-machine, force→aetheric, poison anti-organic, double-weak 2.25× compound). Group-K content gaps: CLOSED. |
| 826 | 806 | 1111 | GROUP-K COMBAT AUDIT — player↔enemy damage-type wiring, both directions, across weapons/coatings/thrown-coatings (player's ask: "audit all interactions… make sure every weakness/vulnerability is wired to a stat and takes effect, every coating affects something, offensive/defensive/curative all apply"). Three parallel auditors swept the full damage pipeline. **HEALTHY (no change):** coatings are tri-modal — offensive DOT (`applyWeaponCoatingProc`), defensive armor-resist (`applyCoatingToArmor`→`aggregateArmor`→`applyArmorResistance`), curative drink (`coatingRemedy`) — and ALL apply; player incoming damage carries a type and is reduced by armor + race resist (`applyEnemyCounter` → `applyArmorResistance` @25838, `raceDamageMultiplier`); the equipped/bandolier/golem/dog attack paths + elemental coatings already route weakness via `applyDamageTypeModifier`+`traitDamageMultiplier`+`combineDamageTypeMatch`; Core Guardians wired via authored traits. **FIXED — 4 typed paths that BYPASSED the weakness system:** (1) **burst-fire** (`case 'multi_fire'`, gameStore ~13244) fired a bare `rollDie` ignoring the weapon's `damageType` — an electrical bolt-caster did nothing extra to an electrical-weak Automation; now each shot routes through the type-map+trait reconcile and tags weak/resisted. (2) **`elemental_control`** race ability (~22289) logged "aetheric" but dealt TYPELESS damage (full vs the many aetheric-resistant foes, no bonus vs `vulnerable:aetheric`); now applies the aetheric modifier. (3) **Fight-Back counter-strike** (`applyEnemyCounter` ~25611) — the winning trade dealt untyped `rollDie(6)+1`/`rollDie(4)`; now uses the equipped weapon's type (bare-hand = bludgeoning). (4) **Thrown-coating PARITY** (`case 'throw'` ~12084) — a poison/acid/corruption knife thrown BY NAME folded in the on-hit coating bonus but DROPPED the lingering DOT + acid armor-shred + corruption stacks, so it was near-inert while the SAME knife racked in the bandolier landed a full 3-turn DOT; now seeds the shared `applyWeaponCoatingProc` when the enemy survives. All lore-neutral → all three lines. Tests: ota826GroupKCombatWiring (thrown coating now seeds a lingering DOT; burst-fire now tags a typed hit) + combat/combatDamageReconcile/bandolier suites still green. **CONTENT gaps flagged for a design call (NOT fixed — need the owner's ruling):** two Core Guardians authored `vulnerable:cold`/`resist:cold` but no `cold` damage type exists in the game (unreachable weakness); `force` (2 weapons) absent from the `DamageType` union + type map (permanently neutral); `poison` is never a weakness on any enemy (only ever resisted); the `Construct` type-map row matches no live enemy (dead entry). |
| 825 | 805 | 1110 | TWO CONFIRMED HIGH-SEVERITY EXPLOITS closed (reverify-exploit-tail workflow, both double-verified). **(1) Counter-free throw:** the typed `throw <item> at <enemy>` path (gameStore `case 'throw'`) applied damage + spent a turn but NEVER called `runEnemyGroupCounters`, so a thrown attack drew NO retaliation — AND skipped enemy regen (regen only ticks inside `applyEnemyCounter`). Even a bare "throw a stone" chipped 1 dmg/turn with zero risk → a safe, slow kill of ANY enemy incl. bosses. Now, after the throw resolves (hit OR miss), the surviving enemy group swings back + regen/DOTs tick via `runEnemyGroupCounters` (guarded on survivors — a throw that KILLED the last enemy has none left to act), mirroring the melee/golem-command paths. **(2) fuse→scrap Golem Core faucet:** `applyFusion` stamps every fused item `selfCrafted: true`, and `scrapEngine.scrapOutputFor`'s OTA-756 fused branch RETURNED before the OTA-611 selfCrafted strip/halve guard — so a fused weapon scrapped for its FULL premium yield incl. a free Golem Core (the Iron-Golem bottleneck). Fusion is FREE at an outpost/market Crucible, so fuse→scrap was a renewable mint of the scarce Core + Aetheric stock from cheap inferred inputs — reopening the EXACT hole OTA-611 closed. Fixed: a `selfCrafted` fused piece now obeys the self-craft rule (strip premium/bottleneck mats — Golem Core, Aetheric Shard/Dust, Aetheric Cloth, Aether Crystal/Dust — and halve the rest; floor to a Small Rock so the click isn't wasted) → recycling never out-earns the inputs. LEGACY fused items (forged pre-611, no `selfCrafted` flag) are a FINITE, non-renewable set → they keep the old OTA-756 full yield. Both fixes are lore-neutral → all three lines. Tests: ota825ThrowCounters (a surviving Hammer counters after a thrown stone; enemy HP moved, player HP dropped) + ota825FusedScrapNoFaucet (a self-crafted fused weapon/armor mints NO Golem Core / premium aether stock but still yields something; a legacy unflagged fused item keeps the Core). Reverify-tail exploits from the workflow: CLOSED. |
| 824 | 804 | 1109 | B2 — FACE-TO-FACE CONTRACT HAND-INS + LONG-HAUL BONUS + "follow the resonance" (player's B2 call: "kill all remote hand ins, make all routable, but make sure the journey is worth the loot/rep/stat — I don't want a 32-time trip worth 20 TC"). **(1) Killed remote turn-ins** for EVERY contract type: the OTA-456 "send word / courier" path is removed from `turnInFactionQuest`/`turnInMystery`/`turnInStoryline` (hunts were already OTA-810). Each now requires a face-to-face agent in scene (right faction); a typed "send word …" is refused in the `turn_in` dispatch with a route-to-the-◆-pin steer. **(2) Closed the UI hole:** `completeContractFromUI` for mystery/storyline/faction_quest now DELEGATES to the (in-person) typed handlers — one source of truth — killing the "COMPLETE pays 100% from any tile" exploit AND the OTA-617 half-pay-from-afar fallback (now: in person or not at all). `autoSubmitReadyFactionQuests` already routed through the typed handler, so on-arrival auto-submit inherits the gate + bonus. **(3) Long-haul bonus:** new `contractJourneyBonusTc(anchorId, baseTc)` (contractMarkers.ts) = `min(remoteness·6, 1.5·baseTc)` where remoteness is the Manhattan grid-cell distance of the turn-in tile from the starter hub (`tartarian_outskirts`) on the canon atlas — 0 for a hand-in next door, a real premium for a deep-capital hand-in, capped so it never dwarfs the base. Applied at every turn-in path (all four typed handlers + the hunt UI branch). **(4) Routable:** every open contract already carries an atlas `◆` pin + SET COURSE anchor via `openContractMarkers` — nothing new needed; the refusal copy now points there. **(5) "follow the resonance"** (player: "I used follow because resonance is a sound"): `applyTorchToHook` stamps sound-synonyms (resonance/sound/ringing/hum/note) onto the charged hook's nouns so investigate/examine/work resolve it (not just the literal "crystal"), and the `travel` handler redirects a "follow"-verb onto a torch-CHARGED hook to advance it (via `resolveHookOneStep`) instead of walking off the tile. All lore-neutral → all three lines. Tests: ota824 (journey bonus math — 0 at hub, scales, 1.5× cap, never negative; resonance synonyms resolve via matchHookNoun) + updated contractUIRewards/contractTurnInFromAnchor/ota810 for the in-person gate + bonus. B2 (task #2) CLOSED. NOTE the reverify-exploit-tail workflow flagged a separate CONFIRMED high-severity loop — fuse→scrap mints a free Golem Core (OTA-756's early-return in scrapEngine reopened the exact hole OTA-611's self-crafted strip-guard closed) — to be fixed next as its own OTA. |
| 823 | 803 | 1108 | NARRATOR "theYou" GLUE + TORCH-LEAD CLARITY (device log). **(1) Glued narration:** Qwen 0.5B occasionally emits a token boundary with NO space, running two words together at a lowercase→Uppercase seam — the log caught the Arbiter narrating "**theYou** stood in the shadowy chamber…" (a stray leading article welded to the opener; `qwen ✓`, so it's the model output, not a template). Ruled out the cleanup helpers (`stripForeignWords` drops whole foreign words but wouldn't KEEP "theYou"; `trimToLastSentence`/`clampSentences` only slice on sentence boundaries; `buildSystemPrompt` has no assistant prefill). New pure `repairGluedNarration(text)` (foreignText.ts): inserts a space at every `[a-z][A-Z]` seam INSIDE a token (English narration prose never has intra-word camelCase — place/faction/item names are space/hyphen separated, so this only ever repairs a glue), then drops an article stranded before a subject pronoun (`\b(the|a|an)\s+(You|I|We|They|He|She|It)\b` → the pronoun) since "the You"/"a I" is never valid English — so "theYou"→"the You"→"You" while "aStone"→"a Stone" (article + NOUN kept). Wired alongside `stripForeignWords` at all four narration sites in gameStore (main arbiter `narrateViaArbiter` ~29916, ambient ~30098, the `qwen.generate` LoreGenerator wrapper ~9056, and the Ask-the-Arbiter answer ~735). **(2) Torch lead clarity:** the Aetheric Torch charges a hook (`torchCharged`) and its reward pays out when the player advances that hook by INVESTIGATING its noun (e.g. "crystal") — but the reveal said "Work **it**, and it will give up something rare", so the player typed the FLAVOR word from the sentence ("follow/examine the **resonance**") and got the not-a-noun refusal. The reveal now names the hook's actual noun: "Work the **${noun}** — investigate it and it will give up something rare", pointing the player at the interactable that claims the WIS-scaled Rare/Legendary torch reward (rollTorchReward). Both lore-neutral → all three lines. Tests: ota823 (repairGluedNarration — fixes "theYou", un-glues a mid-sentence seam, drops article-before-pronoun, KEEPS article-before-noun, leaves clean prose + empty untouched) + stripForeignWords still green. |
| 822 | 802 | 1107 | VENDOR RECIPE MENU — NO REROLL + NO "BUY & EQUIP" (device log, Road Hawker: "buying recipes just triggered a restock and reroll of recipes, I bought them until I ran out of money; also it had the option to buy, or buy and equip them"). **(1) Endless reroll:** `vendorRecipeOffers` (recipeDiscovery.ts) drew its `count`-recipe window from the player's UNKNOWN discoverable pool — so learning one SHRANK the pool, shifted `start = seed % pool.length`, AND filled the vacated slot with the next unknown recipe: every purchase silently restocked a new offer, letting the player buy recipes until broke. Now the vendor's menu is a FIXED seeded slice of the FULL discoverable pool (new `allDiscoverableRecipes(RECIPES)`, sorted, independent of `knownRecipes`); a learned recipe simply drops out of the buyable return (its menu slot does NOT slide, because the anchor pool never changes), and once the whole seeded menu is learned the section is empty — bounded supply, no reroll. The old "stable per-vendor slice" comment was aspirational; it was actually a function of the shrinking pool length. **(2) "Buy & Equip" on a recipe:** the recipe rows reused the item-buy flow (`openBuy(result)` → `mode:'buy'`), so the confirm dialog computed `equipSlotsForName(result)` (the RESULT item resolves to armor/weapon slots) and offered "Buy & Equip" + a ×N quantity stepper — but buying a working only LEARNS the recipe, so equip fired on an item you don't hold ("I don't see an Aetheric Vest on you"). Recipe rows now call a distinct `openLearnRecipe(result, price)` that sets `mode:'buy', isRecipe:true`; `pendingBuyEquipSlots` and `pendingBuyStock` short-circuit to `[]`/`1` when `isRecipe` (no Buy & Equip, no ×N/Buy All), the confirm button reads "Learn" and the title "Learn the <X> working". `buyFromVendor`'s existing recipe-learn branch still charges the TC + teaches it (unchanged). engine keeps its `getCrucibleName()` etc. Tests: ota822 (learning one offer drops ONLY it, no new recipe slides in, remaining keep identity; whole-menu-learned → empty; menu fixed by seed over the full pool, unaffected by learning unrelated recipes) + ota812 still green. All three lines. |
| 821 | 801 | 1106 | NO DUPLICATE CRUCIBLE CHIP ON A VENDOR TILE (player, immediately after 820: "we don't need a separate fuse chip on a tile with a vendor if the vendor has a crucible too — this one was on a road-hawker tile, and the road hawker has a built-in fuse chip"). OTA-758 had lit the exploration Crucible chip in a VENDOR mode ("★★ Fusing Crucible · 25 TC" → `useVendorCrucible()`) on roadside/wild-vendor tiles with no location crucible. But the VENDOR SCREEN itself already offers that identical portable Crucible (VendorScreen arb103, `★★ USE CRUCIBLE · 25 TC`), so a roadside-vendor tile showed BOTH the exploration tile chip AND the vendor's own fuse button — two entry points for one 25 TC Crucible. FIX (ExplorationScreen): the exploration Crucible chip now shows ONLY for a LOCATION's own Crucible — `atLocationCrucible = fusionPending || (hubRoomId && macroVisitSeq≥1) || activeBuildingId==='market'`; the `if (!atLocationCrucible && !atVendorCrucible)` guard became `if (!atLocationCrucible) return null;` and the whole `atVendorCrucible` branch (+ the now-unused `tutorialDemoVendor` read, the vendor `fireCrucible`/`readyName`/`readyHint` variants) was removed. A vendor-carried Crucible now lives SOLELY in the vendor screen. This partitions cleanly with the vendor screen's OWN gate (VendorScreen arb153 suppresses its 25 TC offer with the SAME atLocationCrucible expression), so exactly one Crucible entry shows per tile: location-crucible tiles → the exploration chip (vendor offer suppressed); roadside-vendor tiles → the vendor-screen button (exploration chip suppressed). Nothing stranded (useVendorCrucible still fires from the vendor screen). UI-visibility only — no engine/store change, no new test (there was never a test for the chip's vendor mode; verified by typecheck + the mirrored VendorScreen gate). All three lines. |
| 820 | 800 | 1105 | FUSE-CHIP DISMISS SURVIVES A VENDOR ROUND-TRIP (player, carried from a prior session: "if I have a vendor and a fuse chip on screen, dismiss the fuse with the X, then enter the vendor, then go back to exploration — the fuse chip is there again"). ROOT CAUSE: App.tsx (`{screen==='exploration' && <ExplorationScreen/>}` vs `{screen==='vendor' && <VendorScreen/>}`) renders the two screens by a flag, so entering the vendor UNMOUNTS ExplorationScreen — and the Crucible chip's dismiss was LOCAL `useState(crucibleDismissed)` (arb152), which is destroyed on unmount and re-initializes to `false` on return, re-showing the chip. FIX: moved the dismiss into the STORE — new `crucibleChipDismissedKey: string | null` + `setCrucibleChipDismissedKey`, keyed to the same view-key ExplorationScreen already computes (`location.id|activeBuildingId|activeBuildingRoomId|hubRoomId`). The chip is hidden while `crucibleChipDismissedKey === crucibleViewKey`; the X sets the key, and the store survives the exploration-screen unmount so the dismiss holds across the vendor trip. Moving to a DIFFERENT location changes the view-key → mismatch → chip re-shows (preserves the arb152/arb154 "re-entering re-shows it" intent, so the old per-key reset `useEffect` was removed as moot). Pure state relocation — no change to what the chip promises or the fuse gate. All three lines. Tests: ota820 (dismiss key persists across setScreen vendor→exploration; a different-location view-key is not dismissed; clearing un-dismisses). |
| 819 | 799 | 1104 | THEMATIC ("Pokémon-route") WEAKNESS + MEDIUM HARDNESS + DIEGETIC READ (player refined 818: "kind of want to go the Pokémon route so it's believable but I don't want it stale — not 'only weak to this' — and I don't want to break immersion"; chose medium hardness + flavor-on-WIS-read). 818's flat-random weakness cured staleness but read as nonsense (a Mud Creature weak to cold) and broke immersion. Now each creature TYPE carries a small pool of thematically-plausible weaknesses (`THEMATIC_DEFENSE_POOLS` in encounter.ts: mud → burn/radiation/electrical; aetheric-being → bludgeoning/cold/slashing; machine → electrical/bludgeoning/aetheric; flesh → pierce/poison/cut/burn; undead → burn/radiation/aetheric) + a resist pool, and `randomizeEnemyDefense` rolls ONE weakness from it per spawn — believable EVERY time, but WHICH varies fight to fight (no memorizable single answer). **Hardness = MEDIUM:** the rolled weakness is a ×1.5 BONUS and everything else stays NORMAL and still works (never hard-locked — the immersion-breaker the player flagged); each spawn also takes one soft ×0.5 resist from its type's resist pool, and ~35% of spawns get a real ×0.25 WALL on a type their kind is ALREADY armored against — achieved for FREE by stacking a `resist:` trait onto a type the TYPE-MAP already resists (`combineDamageTypeMatch` multiplies 0.5×0.5), so no new resolver plumbing. **Read = DIEGETIC:** the WIS-gated (WEAKNESS_READ_WIS=12) detail popup now NARRATES what you notice — "You size it up — its hide is dry and cracked; fire would take fast. (Weak: Burn)" — via WEAK_FLAVOR/RESIST_FLAVOR maps in EnemyPanel, instead of a bare "WEAK: burn" label (names stay plain; the compact portrait keeps the terse gated label for at-a-glance HUD). Supersedes 818's flat WEAKNESS_POOL; the trait plumbing, WIS-gate, and defensesFor reconciliation from 818 are unchanged. All lore-neutral → all three lines. Tests: ota818 rewritten (weakness drawn from the type's thematic pool + never the 818 nonsense case; ×1.5 super-effective; medium — mismatched still ≥×0.5, never zero; ~⅓ get a ×0.25 wall; fixed type-default neutralized; idempotent/boss-skip/variety; folded into scalers). NOTE first-pass pools/flavor — retune per taste; the compact portrait still shows a terse label (flavor is on the detail read) — easy to make portrait flavor-only if wanted. Combat-engagement rework (packs 817 + thematic weakness 818→819) complete. |
| 818 | 798 | 1103 | PER-SPAWN RANDOMIZED WEAKNESS + WIS-GATED READ (second half of the "engaging low-level combat" ask — "random attack damages and random weaknesses so you can't have a 1-kit-fits-all build"; reveal chosen WIS-gated). Weaknesses were DETERMINISTIC by enemy TYPE (every Aetheric Creature always weak to slashing), so learning ten type-rows let one loadout autopilot forever. **Engine:** new `randomizeEnemyDefense(enemy, rng)` (encounter.ts) rolls a random primary weakness + a resistance from `WEAKNESS_POOL` (9 player-deliverable types) for each NON-boss spawn, stamped as `vulnerable:`/`resist:` TRAITS + a `profiled` idempotency marker. This rides the EXISTING combat resolver for free: `combineDamageTypeMatch` already lets a per-enemy trait WIN over the type-map on a discord, so a `resist:<type-default-weak>` trait cancels the old weakness and `vulnerable:<rolled>` installs the new one — ZERO changes to the ~10 `applyDamageTypeModifier(...enemy.type)` call sites. Folded into `scaledEnemyForContext` + `scaleEncounterForContext` (each pack member rolls independently → a drone/bandit/rat pack carries three different answers) so it applies at every scaled spawn INCLUDING a fresh player on a frontier tile (HP still authored, but the weakness varies — engagement at all levels). Bosses/Guardians keep their authored thematic defenses (OTA-798 preserved). **Reveal (WIS-gated, `WEAKNESS_READ_WIS=12`, matches the parley `WIS_REVEAL_THRESHOLD`):** EnemyPanel now takes `playerWisdom` (passed from ExplorationScreen `player.stats.wisdom`); a Wisdom-12+ character reads a non-boss enemy's RESIST/WEAK off the portrait + detail popup, everyone else sees "? — strike to learn" / "Defenses: unknown" and discovers by landing hits (the existing "Weakness exposed" combat-log line is the feedback). Wisdom becomes the combat-scouting stat. EnemyPanel's `defensesFor` now RECONCILES type-map vs traits with the same discord rule (a `resist:X` trait removes X from the shown weak list) so the panel never displays a weakness that randomization already flipped to a resistance. All lore-neutral → all three lines (engine screens share the component). Tests: ota818 (vulnerable+profiled stamp; type-default weakness neutralized in the reconciled combat match; idempotent; boss untouched; variety across rolls; folded into solo+pack scalers; fresh-tile still randomizes). SOCIAL/COMBAT ENGAGEMENT rework (packs 817 + randomized weakness 818) now covers both halves of the request. Knobs (WEAKNESS_POOL, WEAKNESS_READ_WIS) first-pass — retune after playtest; NOTE randomization ignores flavor (a mud creature may roll weak to electrical) by design (variety > thematic consistency); if you want thematic-bounded pools per archetype that's a follow-up. |
| 817 | 797 | 1102 | MIXED-ROLE PACKS + PACK-AWARE SCALING (player wants engaging low-level combat: "random attack damages and random weaknesses so you can't have a 1-kit-fits-all build"; "we have it wired for multiple-enemy encounters with swipe-select but I haven't seen that in weeks — imagine being hit by a drone, a bandit, and a rat, that brings in all the companions too"). ROOT CAUSE the multi-enemy UI vanished: `beginScene`'s curated ladder-enemy path (40–90% in explored areas) set a SINGLE foe and skipped the group roll entirely — packs only appeared via Menace. **(1) Packs return** — new `rollExtraPackMembers(location, existing)` (encounter.ts) appends role-DIVERSE foes to a rolled encounter, preferring a different enemy TYPE than what's already present (so a pack carries MIXED weaknesses through the existing type map — a drone/bandit/rat can't be answered by one coating; that's half the "no 1-kit" ask before per-instance randomization). Frequency scales with danger (`0.10 + danger·0.13` → frontier ~10%, deep ~75%), tapers the 2nd body to ~45%, never packs onto a boss/Guardian, capped at 3 total. Wired into beginScene right after the encounter roll (so the whole pack scales together); the target-swipe UI (`activeEnemyIdx`/`setActiveEnemyIdx`, already wired) and companions light back up automatically. **(2) Pack-aware scaling** (the player's explicit constraint — "scale multiples as a PACKAGE not individually; 3 solo-scaled foes together beat a boss"): `scaleEncounterForContext` no longer maps the solo scaler over each body. A multi-foe pack now SHARES one budget — anchored on `soloScaledHp(mean base HP)`, ×`(1 + 0.22·(N−1))` premium for the extra bodies (action economy already makes N foes harder per-HP, so the HP premium stays small), HARD-CAPPED under a boss's HP via `packHpCeiling = 70 + danger·10`, then distributed across members by base-HP weight (a brute out-bulks a rat; each body floored at 6). Attack/AC bumps are also softened ×0.6 for pack members. Solo spawns (rest-ambush, hook) still scale per-enemy. Refactor extracted `soloScaledHp`/`overLevelT` shared helpers. All lore-neutral → all three lines. Tests: ota817 (danger-scaled pack size; role diversity; never-onto-boss; 3-cap; pack total « 3× solo AND ≤ boss ceiling; solo path unchanged; boss in a pack untouched; base-HP-weighted distribution) + ota816 still green. **NEXT (818): per-instance RANDOMIZED weakness + WIS-gated read** — the second half of the "no 1-kit" ask (chosen: WIS-gated reveal). Pack knobs are first-pass; retune after playtest. |
| 816 | 796 | 1101 | REGULAR-ENEMY SCALING (companion to 815's Guardian scaling; player: "the rest of the enemies should scale on character strength AND the danger rating of the area, but not as high as the Guardian — I'm attacking 8-HP bats, raise them up some so I'm not farming, but low level is still low level"). Base enemy stats came straight from enemies.json, so an over-leveled character farmed trivial trash (a 15-HP Aetherbat stayed 15 HP forever); the danger tiers only ever changed WHICH rarity could spawn (`pickEnemyForLocation` rarity cap), never the numbers. New pure `scaledEnemyForContext(enemy, danger, power)` in encounter.ts lifts a NON-BOSS enemy by two axes: **(1)** a rising HP FLOOR `round((34 + danger·6)·t)` where `t = clamp((power−14)/18, 0, 1)` and `power = bestCombatStat + hpMax/10` (the same proxy as the Guardian scaler) — this is the anti-farm lever: a maxed player's trash floors at ~34 HP on a danger-0 tile up to ~64 on danger-5; **(2)** a gentle, FLAT-CAPPED HP multiplier `added = min(hp·0.5·t·areaFactor, 22 + danger·8)`, `areaFactor = 1 + danger·0.12` — so already-meaty enemies stay proportionate and a 360-HP Legendary gains only ~+62 (nudged, not ×1.7-exploded → stays gentler than a Guardian). Attack/AC get a small `round(t·(1+danger·0.5))` bump (+1 d0 … +4 d5 at max power) via the abilityPoint number (drives both, per combatRules) so a scaled foe can still land on a geared player (pairs with 815-B's nat-20 floor). A FRESH arrival on a danger-0 tile is returned EXACTLY as authored (`t≤0 && danger≤0` short-circuit) — "low level is still low level". Bosses/Guardians are skipped (they carry their own curve). Applied at the three spawn boundaries in gameStore: scene-arrival + group rolls (`beginScene`, the primary farm vector), the rest-ambush spawn, and the hook `spawn_enemy_tag` effect. All lore-neutral → all three lines. Knobs live in encounter.ts. Tests: ota816 (fresh-tile untouched; trash floored for a maxed player; deeper tile scales harder; Legendary nudged-not-exploded; boss skipped; whole-pack scaled; mid-game partial). FIRST-PASS numbers — retune the floor/cap knobs after a live playtest. |
| 815 | 795 | 1100 | COMBAT/ECONOMY TUNING (playtest conversation, 3 parts). **A · GUARDIAN POWER SCALING (HAL+golem only).** Core Guardians scaled by KILL-COUNT tier alone, so an over-leveled side-quester walked through the early Guardians — the fight was tuned for a fresh arrival no matter how strong the player was (player: "mashed out 2 Guardians, I'm end-game level, all I did were side quests"). `spawnGuardianForCapital` now layers a PLAYER-POWER factor on top of the tier profile: `guardianPlayerPower` = best offensive stat + hpMax/10; `guardianOverLevel(player,tier)` = clamp(power / (14+3·tier), 1..1.9). Factor 1.0 at/under the tier's expected power (the authored Tier-1 still stands for a kitted fresh arrival — OTA-448 promise holds), climbing to 1.9× for an over-leveled player. It lifts HP (×factor, replacing the old min-1.6 hpMax cap), and adds `powerBonus = round((factor−1)·8)` (+0..+7) to the abilityPoint number, which drives BOTH the Guardian's AC and its attack — so an over-geared player neither auto-hits nor is untouchable. Damage stays per-tier. Base stats (not gear) are the proxy — deterministic + an over-leveled character reads high regardless; a gear term is a noted future refinement. **B · DODGE FLOOR (all three).** The dodge stance resolves as an opposed d20+DEX vs the enemy's attack; a high-DEX player won ~always AND a win = zero damage + a ×2 opening, and the contest could beat even an enemy nat-20 → literal invulnerability (the B3 "dodge-dominant" open item). A NATURAL 20 now lands THROUGH a dodge (short-circuits the contest to a loss BEFORE the dodge roll), the same 5% floor the AC path already honors (nat-20 = auto-hit). Resolves as 2× out-of-position damage with crit dice-doubling still suppressed (dodgeWin != null) so a pierced dodge is 2×, not 4× — preserves OTA-796. Net: stack all the DEX/AC you like, an enemy still lands ~1 swing in 20. "Never invulnerable, a high miss rate is fine." **C · SIGIL → CHA RAPPORT (all three).** The CHA-scaled vendor discount (OTA-805) sat behind a bespoke per-faction fetch-a-relic quest (9 unplaced relics). Per the user, `turnInSigil` now ALSO establishes that faction's trade rapport — marks `rapportQuestId(fac.id)` complete in completedFactionQuestIds, which `hasFactionRapport`/`vendorPriceMod` already read, so the discount lights up with no new plumbing and no new items. Idempotent; announces the unlock (with the live CHA %). Authored fetch quests, where they exist, still work as an alternate path. Tests: ota815 (guardian scale up + fresh-arrival floor; nat-20 pierces a sky-AC dodge; sigil turn-in flips rapport on). B3 open item now CLOSED. |
| 814 | 794 | 1099 | COATING EQUIP RE-POINT + FUSED SOFT-NAME sweep — two bugs from a device-log re-read ("you didn't notice anything else?"). (1) BURN COATING LANDED ZERO: `applyCoating` on a STACKED weapon (quantity > 1) peels ONE unit into a fresh coated instance but LEFT `equipped.mainId`/`offId` on the uncoated stack remainder — so the on-hit coating resolver in `concludeRolls` (keyed off the equip slot) never fired. The weapon read "Now wielding the Burning …" yet did zero burn over 5 hits (the log). Fix: when the coated unit is peeled off an equipped stack, re-point the matching equip slot(s) to the fresh instance id. Single-unit weapons unaffected (they coat in place). (2) SOFT FUSED WEAPON NAME: a forged WEAPON was named "Aether Core" (the log) — `WEAPON_SOFT_TAIL_NOUNS` gained item/material end-nouns (core, orb, eye, heart, crystal, essence, stone, rune, sigil, dust, seed, husk, shell, node, glow, echo, hum) so `fusedWeaponNameReadsSoft` rejects them and the deterministic weapon pool renames it; `migrateFusedName` heals old saves. Left 'shard'/'spark' OUT (weapon-plausible: "Aether-Shard Spear" must still pass). Tests: ota814CoatingEquipRepoint (equip re-points to the coated instance, remainder uncoated), ota801NamingAndAnchors extended with Aether Core / Sunken Heart / Mud Crystal (soft) + Aether-Shard Spear (clean). All three lines (both fixes lore-neutral). |
| 813 | 793 | 1098 | BOSS NAME CASING — playtest (Heir Atalan-Drowned, a Core Guardian): the combat-arbiter templates injected the enemy name via `enemy.name.toLowerCase()`, which reads fine for a generic creature ("the mud boar is patient") but mangles a NAMED boss ("the heir atalan-drowned is patient. Be patienter."). New `combatEnemyLabel(enemy)` (narrativeGenerator, exported) returns the name AS-IS when `enemy.boss` (Core Guardians + boss-gate spawns all carry the flag) and lowercased otherwise; applied to the three combat-arbiter template sites (combatRemark's COMBAT_REMARKS `{enemy}`, the call-to-action "does not look away from the …" pick, and ARBITER_COMBAT_INTROS's `{enemyName}`). Generic mobs still read naturally. All three lines (engine copy uses getNarratorName; the casing helper is lore-neutral). |
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
