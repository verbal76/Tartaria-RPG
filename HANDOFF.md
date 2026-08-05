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
  "fix it"). ALL diagnosis + fixing follows the §3a ROOT-CAUSE PLAYBOOK. Use AskUserQuestion for genuine UX forks with 2-4 options.
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

**ROOT-CAUSE RULE (owner directive, 2026-07-26) — read before fixing anything:**
every fix targets the root cause of the issue's whole CATEGORY whenever
possible, eliminating the class of errors rather than the reported incident.
Prove the root cause (instrument if needed), fix at the shared choke point,
grep-verify every other instance of the pattern, add a category-lock test
where practical, and report category-complete vs named residuals. Full
checklist: CLAUDE.md "FIX RULE".

1. Edit code under `app/` in that line's worktree.
2. **CI gates (all BLOCKING on HAL + golem — run before pushing; a red gate now
   fails the PR):**
   - `npm run typecheck:ci` — **app/** source, strict-clean (0 errors).
   - `npm run typecheck:tests` — the test-typecheck RATCHET: pre-existing test-
     file type debt is frozen at `.ci-typecheck-tests-baseline`; new/edited tests
     must typecheck, the count may only shrink. If you clear some, lower the
     baseline (`node scripts/ci-typecheck-tests.mjs --update-baseline`).
   - `npm run test:ci:fast` — the deterministic suites (530 as of 2026-07-26; the real jest
     ratchet). `jest.setup.js` seeds Math.random + pins incidental weather, so
     runs are deterministic — a failure here is real, not a flake. (`test:ci:heavy`
     = the memory-hungry sims, non-blocking / reported everywhere — Open Item #2.)
   - `npm run lint` — ESLint 9 flat config (`eslint.config.js`), a lean high-
     signal rule set; must be 0 errors.
   NOTE — on **engine_Dev** the `test:ci:fast` (jest) job is **reported, not
   blocking** yet (Open Item #1: engine's own ~16-suite backlog); still run it,
   just don't be surprised the pre-existing engine reds are red. Lint IS blocking
   on engine too (it's green there). typecheck:ci + typecheck:tests are blocking
   on all three lines.
3. Bump `app/buildInfo.ts` `OTA_BUILD_ID` to the next `YYYY-MM-DD-NNN-desc` for
   that line, with a short comment block explaining the change. In the SAME
   edit, bump `DISPLAY_VERSION` (reactivated at 4.28.3, OTA-992/969): PATCH +1
   every OTA; MINOR +1 with PATCH→0 when the OTA closes a significant feature
   wave (log MINOR/MAJOR moves in `VERSION.md`, scheme + catch-up ledger there).
4. Update this `HANDOFF.md` (open-issues / recent-OTAs) in the same commit when
   the change is notable.
5. Commit with the trailers in §6, then push that line's branch (`git push -u
   origin <branch>`). All three worktrees are now checked out ON their branches
   (no detached HEAD). Retry network failures with exponential backoff.
6. After pushing, ensure an **open draft PR** exists for the branch (create one if
   not). PRs already exist for the standing lines (#2 HaL2001, #7 golem-line,
   #13 engine_Dev, etc.).

**Docs-only safety:** `**.md`, `docs/**`, `.github/**`, `app.json`, lockfiles etc.
are in every `eas-update.yml`'s `paths-ignore`, so a HANDOFF/docs-only push does
**NOT** publish an OTA — safe to push freely, even on the live line.

## 3a. ROOT-CAUSE PLAYBOOK (owner directive, 2026-07-27) — WORK THESE CHECKLISTS VERBATIM

Distilled from the studs-down teardown of HAL OTAs 992–1004 / golem 969–981 (§9): 13 OTAs audited,
5 fully correct, 8 shipped with real defects — and every defect fell into one
of the failure patterns below. Following these steps mechanically is what
closes the quality gap between sessions. Do NOT skip a step because a fix
"looks obvious"; every defective OTA looked obvious to the session that
shipped it.

### A. Bug / error report intake (owner logs, screenshots, playtest text)

1. **Find the emitting line first.** Grep the EXACT player-facing string from
   the report (or a distinctive fragment) across `app/` — that line is the
   entry point. Never start from where you assume the feature lives.
2. **Walk the code path backwards** from the emitting line to the state that
   fed it, reading every branch on the way. The cause is proven only when you
   can say "value X came from Y, therefore the line printed Z." If reading is
   not conclusive, prove it with a probe or a failing test FIRST. Never fix on
   a hunch, and never let a signal that pattern-matches a known failure stand
   in for proof — same symptom, different cause is common here.
3. **Check whether a previous OTA already "fixed" this** (`git log -S` the
   string/helper, grep §9). If a fix exists and the bug recurred, the fix was
   site-local — the real job is the sibling sites it missed. Case on record:
   the stat-toast fix covered 1 emitting site; the teardown found 8 more, and
   the lock test was green the whole time because it only asserted the one
   fixed shape.
4. **Name the CATEGORY** the report is one instance of ("every stat level-up
   toast", "any takeable item as a climb target"), then enumerate the sibling
   sites mechanically: grep the PATTERN (helper name, log channel, placeholder
   shape), not the literal string. Assume the first grep is incomplete —
   re-grep with a second, looser pattern and reconcile the two lists.
5. **Fix at the shared choke point** — one helper, one gate, one pool — so
   every site inherits the fix. If the sites don't share a choke point, that
   is itself a finding: CREATE one and route them through it
   (`statNowClause`, `announceMissionComplete`, `ledgeredSalvage` all exist
   because of this rule).
6. **Grep-verify AFTER the fix:** the old pattern's count must be 0, or every
   survivor individually named and justified in the commit + HANDOFF.
7. **Category-lock test**, house pattern: a source-scan test that asserts the
   NEW shape exists **AND** asserts the OLD shape is GONE
   (`expect(src).not.toMatch(...)` / `not.toContain`). A lock that only
   asserts the new shape goes green over every sibling you missed — this is
   exactly how the teardown's defective locks failed. Behavior tests beat
   source scans where practical; use both for the big categories.
8. **Report** category-complete vs named residuals. Residuals go in §8 with a
   reason — never silently dropped.

### B. Exploit lens — run on EVERY fix and addition

Ask "how would a player farm or bypass this?" The teardown's worst finds were
all one of these shapes:
- **A wipeable ledger:** dedup/exclusion state that a restock, reroll, or
  respawn cycle clears → farm. Persistence that must survive cycles lives in
  `worldMemory` as a permanent ledger, never keyed to a respawnable container.
- **One guarded door of several:** an invariant enforced on one mutation path
  but not another (single-active was enforced on ACCEPT but not on SET
  ACTIVE — two taps defeated the whole system). Enumerate EVERY path that
  mutates the guarded state and gate all of them.
- **A filter that starves:** an exclusion filter inside an RNG pick loop
  degrades or deadlocks as the exclusion set grows → post-filter the picked
  results instead, with an all-excluded escape hatch.
- **Loose string matching as a gate:** substring/suffix tests where head-noun
  matching is meant (the "sigil" gate matched any noun containing the word)
  → anchor the pattern (`(?:^|[\s-])` + word + `s?\s*$` style).

### C. Additions / new systems

1. **One predicate per invariant** (`anyTrackedContract`, `isRevenant`) and
   every consumer routes through it — never re-derive the condition inline.
2. **No silent state changes.** If the system parks, defers, caps, skips, or
   swallows something, it SAYS so in the log. Silent parking was a regression
   class of its own.
3. **Reuse the existing choke points** (`appendLog`, `statNowClause`,
   `announceMissionComplete`, the salvage/train helpers) instead of building a
   parallel path — parallel paths are where the next category bug is born.
4. **Interaction gates are part of the design:** a new spawn / encounter /
   hook must explicitly decide its behavior vs buildings
   (`activeBuildingId`), live escorts, climbs, and combat. The default of
   "fires anywhere" is almost always wrong (revenants ambushed players inside
   houses and mid-escort until gated).
5. **Carry identity in payloads.** If a hook/rumour/beat refers to a specific
   entity, put that entity's id in the payload (`Hook.chainId`-style channel)
   — never re-pick "some matching entity" at resolution time (the rumour
   named already-avenged revenants this way).
6. **Test end to end,** not just the units: the happy path AND each
   interaction gate. The Hollowed defects were all wiring gaps between
   individually-correct pieces.

### D. Ship-mechanics traps (each of these burned a prior session)

- **Golem port:** golem OTA number = HAL − 23. Ported code COMMENTS carry
  golem's renumbering, so python-transform anchors must be CODE-ONLY text.
  Golem test files may be RENAMED (ota994→ota971 etc.) — pass test paths as
  transform args, never hardcode them.
- **Transforms:** every `edit(old,new,n)` count-asserted. A count mismatch
  means the anchor drifted — re-read the file and fix the anchor; NEVER loosen
  the assert or fall back to a blind replace.
- **jest harness:** `jest.setup.js` globally mocks `pickWeather` → 'calm';
  tests measuring real weather need `jest.requireActual`. Store-boot tests
  need the standard AsyncStorage/onnx/llama/expo mock block AND explicit
  30000ms timeouts (cold-cache flake reads as a real failure otherwise —
  verify suspected flakes with a serial re-run before believing them).
- **Fixtures use REAL catalog items** (e.g. `Lightstone Amulet`), not
  synthetic ones — `effectiveStats` reads catalog + instance paths a
  synthetic item misses, and `ARMOR_SLOTS` excludes `amulet`.
- **Full gates before every push** (§3) in BOTH worktrees; push-per-OTA;
  `DISPLAY_VERSION` PATCH +1 every OTA; parity per §4.
- **RENAME POLICY (binding, OTA-1002):** never rename or remove a catalog item
  name (or content id) without a `LEGACY_ITEM_RENAMES` entry in the SAME OTA,
  and refresh `catalog-names.snapshot.json` (`node scripts/
  update-catalog-name-snapshot.mjs`) in the same commit as any content add.
  The ota1002 ratchet test fails the build on an unmigrated removal.

### E. Self-audit before declaring done (the 60-second gate)

- Did I PROVE the cause, or infer it? (If inferred: go prove it.)
- Did I grep for siblings twice, with two patterns?
- Any snapshot read answering an IDENTITY question? (§F — identity reads canonical.)
- Does my lock test fail on the OLD code? (Actually check — `git stash` the
  fix and run it, or assert the old shape's absence.)
- Ran the exploit lens (§B) over what I just changed?
- Both lines shipped, gates green, versions bumped, §8/§9 updated?

### F. THE SNAPSHOT LESSON (owner-named category, 2026-07-27) — read before ANY item/save code

The owner's framing, verbatim, because it is the clearest statement of the
category: *"the code was utilizing a shortcut by looking at the snapshot
image, not the full definition of the item — and that's what broke it."*

Saves persist SNAPSHOTS: an item's tags/kind/rarity/description are frozen at
the moment it was minted; equipped slot names, the golem's armament, known
recipe names and every world-memory ledger are frozen at write time. The
catalogs and defs keep moving with every OTA. Any DECISION read from the
snapshot silently diverges on an old install — and the owner's install is
months old, so every divergence is LIVE for the one player who matters.
One bandolier refusal unraveled into ~50 verified sites (OTA-1020, then the
five-batch audit 1021–1025 / golem 997–1002).

**THE RULE — identity vs provenance:**
- An IDENTITY question ("what KIND of thing is this?") is answered by the
  LIVE definition: `canonicalItemTags` / `canonicalItemKind` /
  `canonicalItemRarity` (crafting.ts — uniqueStats → catalog-by-name →
  instance), or a routed predicate (`isWeaponCoatingItem`, `itemIsThrowable`,
  `isQuestLockedItem`, `isSigilItem`). NEVER raw `item.tags` / `item.kind` /
  `item.rarity` in a decision.
- A PROVENANCE question ("what happened to THIS copy?") is answered by the
  instance and must STAY that way: `loot`/`bonus` stamps, `stolen`,
  `selfCrafted`, `fused`/`uniqueStats`, durability, coating, instanceStats
  AMOUNTS. Canonicalizing these would erase real per-copy history.
- REMOVAL semantics: a union can only ADD tags. When the catalog RETIRES a
  marking (the `trophy` case), the check must be catalog-AUTHORITATIVE
  ("row absent?"), not a union.

**REVIEW TRIGGER:** any new code reading `item.tags` / `item.kind ===` /
`item.rarity` inside a decision, or comparing a persisted name/id against
current defs, gets the question "identity or provenance?" BEFORE it merges.
Same for any new persisted collection keyed on a content name/id — plan its
rename story on day one.

**LOAD HEALS DO NOT ABSOLVE DECISION SITES:** the kind heal is upgrade-only
(a demotion never applies), rarity is NEVER healed anywhere, and the
stack-merge spreads a stale row onto every new copy of the same name.
Decision sites read canonical regardless of what the heals did.

**RENAMES:** the binding policy above (§D) — a retired catalog name without a
`LEGACY_ITEM_RENAMES` entry in the same OTA fails the catalog-name ratchet
test. That ratchet pattern (committed snapshot + refresh script + lock test)
is the TEMPLATE if any other keyed namespace — enemy names, location ids —
ever gets its first rename.

**HOW THE CATEGORY WAS FOUND** (repeatable): three parallel read-only audits —
(1) every tag-read classified identity vs provenance, (2) every kind/rarity
read with a stale-instance scenario, (3) every persisted name/id vs its live
def, cross-checked against the actual `git log` of `app/data/**` to separate
LIVE divergence from latent. Every claim hand-verified before fixing.

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

### ✓ RESOLVED — golem tutorial walk divergence (2026-08-03, same day)

The stall was this line's own `look` tutorial beat (commit 5d23d6fd, a
deliberate golem-line feature between `name` and `cudgel` — "Tap LOOK AROUND
YOU"; HAL never had it): the walk had no input for a beat it did not know
existed. Fixed in the WALK — one `look: 'look around'` entry in the
beat-input map, inert on a line without the beat — so ONE walk file plays
BOTH lines' real tutorials.

⚠ SUPERSEDED SAME DAY by HAL OTA-1094: the owner ruled the divergence was a
LAPSE, not intent — "never noted that lapse in the tutorial, HAL should have
the look around you beat as well" — and HAL adopted the beat (its
maybeAdvanceTutorial('look') handler and InputBox chip-lighting were already
ported; only the step definition was missing). Both lines now run the SAME
ten beats and the walk plays them identically. The earlier "do not fix into
parity" instruction is void.

### ⚠ THE PORT IS NOT DONE UNTIL THE VERIFIER SAYS SO (2026-08-03 audit)

Run after EVERY cross-line port, before pushing:

    node scripts/verify-parity.mjs /tmp/hal-main-fix '<hal-range>' /tmp/hal-golem '<golem-range>'

(one-arg ranges like `HEAD~1^` compare against the working tree). It maps
HAL's OTA numbering onto golem's (−23, all shapes: `OTA-####`, `ota####`
any case, bare date-slugs) and diffs the added/removed line multisets of the
two ranges. Exit 0 or the port is not finished.

Why this is a hard rule: the 3-day audit of the Fable→Opus window found
ELEVEN files where golem comments carried HAL's OTA numbers, one VERSION.md
row carrying a HAL build-id slug, and nothing else — every code line
matched. Root cause in every single case: the renumber regex was re-typed
per port in a scratch heredoc, and each fresh copy missed a shape
(lowercase refs, bare slugs, a wrong cutoff). One committed rule, one
committed comparison, zero scratch regexes — that is how the category dies.


### ⚠ PHASE 6 IS GOLEM-LINE ONLY (owner directive, 2026-08-03)

The immersion build plan's Phase 6 — **local-LLM NPC conversation** — does NOT
ship to HaL2001. The owner's call, and the plan agrees with it: *"Phase 6 is a
separate project. Treat it that way."*

Why it is the one phase that gets its own line:
- It is the **only phase that cannot ride an OTA.** It needs native config
  (`n_predict` 120 → ~40 for dialogue, thread count raised off 4, warm context
  held between turns), so it means a rebuild, a store submission, and the
  14-day closed-testing clock. Phases 0–5 were JS-only and landed in seconds.
- It is the **only phase flagged as able to regress the crash numbers**, right
  after the work that got the SVE crash wave under control.
- Today a generation takes **14–20s**; Phase 6's own bar is **under 4 seconds
  or it is not a conversation**. That gap is a native-config research problem,
  not tuning.

So: Phase 6 work lands on `golem-line` and stays there. HaL2001 keeps the
Phases 0–5 game — authored content plus modest engine work, shippable over the
air — and does not take the risk. Nothing in 0–5 depends on 6; the dependency
runs the other way (6 requires 1 and 2 shipped, plus the latency work).

⚠ This is a DEVIATION from the parity rule above, and the only standing one.
Every other gameplay OTA still ships to both lines in the same pass at the
HAL − 23 offset.


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

- **ESCORT SYSTEM — new live subsystem (2026-07-26, HAL 985–989 / golem 962–966; §9).** Knobs if the feel
  needs tuning after on-device play: `ESCORT_COLLATERAL_FRACTION` (0.20), `ESCORT_REST_HEAL_FRACTION`
  (0.10), escortee HP ≈35% player hpMax (clamp 8–45), party clamp 1–5, stranded-hook spawn ~6% on novel
  peaceful wild tiles. Watch on-device: bleed feel across long multi-pack escort runs, hook spawn cadence,
  all-or-nothing tier difficulty. Sources: faction boards/vendors (`FactionQuestDef.escort`), 9 rep-0
  stranded contracts, the wild `stranded_traveler` hook.

- **THE HOLLOWED — new live subsystem (2026-07-26, HAL 998 + 1004 / golem 975 + 981; §9).** Knobs:
  direct wild boss spawn **4%** and rumour plant **5%** (both on novel peaceful wild tiles in
  `stepDirection`), power gate **hpMax ≥ 60**, revenant HP band and drop chance in
  `app/engine/fallenRevenants.ts`. Watch on-device: how often a revenant surfaces once the Fallen roll is
  deep, whether the boss band stays a fight and not a wall at mid hpMax, and that a put-to-rest fallen
  never returns (`avengedTs` filters BOTH doors).

- **HEALING / OFFERS / WEATHER — tuned this session, verify by feel (HAL 1001–1003 / golem 978–980; §9).**
  Knobs: `scaledHealHP` percentages (15% kit / 4% meal / no-scale under flat 5) in
  `app/engine/itemEffect.ts`; rest heal **15%** of hpMax in both rest resolvers; the offer rotation is
  2-of-4 keyed on `macroVisitSeq`; `WEATHER_LOCALE_BIAS` multipliers in `app/engine/encounter.ts`, the
  ~6-game-hour weather persistence window, and `WEATHER_TICK_GAP` (**5**). All owner-directed numbers —
  change only on an owner call.

- **CRUCIBLE FUEL RATE — verify by feel (HAL 1005 / golem 982; §9).** `CURIO_CHANCE = 0.18` in
  `app/engine/salvagePools.ts` is the owner's starting number, not a settled one; the standing offer is
  to recount from the next device log (actual salvage rolls per journey) and retune to the fusion cadence
  they want. Note the effective rate against ALL rolls is a touch under 18% because the curio branch sits
  behind the nothing/consolation path. **`app/data/relics/curios.json` must stay catalog-absent** — a
  backfill silently re-starves the Crucible and the OTA-1005 suite will go red.

- **INTENTIONAL EXPLOITS ON RECORD (owner calls, 2026-07-26 — do NOT "fix"):** the early-game KO-loot
  money loop and the torch-vendor buyback loop are KEPT as known early-game money faucets. The temper
  floor 0.4 (glass-cannon tempering) is design, not a bug.

- **OPEN ITEMS (2026-07-20) — carried forward from the studio-level / CI-hardening
  session. Two tracked threads, neither blocking day-to-day work:**
  1. **Engine's own red-suite backlog (~16 suites).** Separate from the HAL jest
     triage. Engine-specific content/data failures — `collectables` (10-story
     fragment data), `outpostMapAssets` (per-faction map PNGs on disk),
     `blackCloakAgent`/`characterScreen` codex lore, `tartariaLeakScanner`
     baselines, `saveSnapshot`/`crashSaveCapture`/`inventorySnapshot` BEGIN/END
     envelope stamps, `devAccessAndPublish` (the "Verbal" backdoor),
     `starterWeaponDataDriven`, `companionTypeParity`, `ambientNounVariety`,
     `theftNarrationGuard`, `enemyTraits`, `ota1102MixedPacks`, `exploitFixes
     Hardening`. These are why engine's `jest (fast)` job is **reported, not
     blocking** (HAL + golem are blocking). Triaging them → flip engine's fast
     job to `required`, matching HAL. (This session already greened 12 engine
     suites, 28 → 16, as a side effect of the harness port.)
  2. **Engine world/persist super-linear tail-growth.** UPDATE 2026-07-28 (OTA-1034): first
     hard characterization from a metaNavStress heap probe — flat ~220 MB to ~action 2000,
     then a deterministic ~1 MB/action pure-heap leak (large strings, V8 dies in
     StringSubstring at 8 GB); AsyncStorage (~1 MB) and store state both exonerated, so the
     holder is module-scope JS. CLOSED 2026-07-28 (OTA-1012): the snapshot dig found the retainer —
     the jest.fn AsyncStorage mock recording every ~400 KB disk-log rewrite argument
     (test-only), stacked on appendLogToDisk's per-line full read-modify-write (real
     on-device I/O amplification). Plain mock via moduleNameMapper + batched appends;
     12 000-action proof run holds flat at ~249 MB. Heavy sims may be un-bounded at will. The heaviest stress /
     balance / long-run sims (700-day sims, chaos sweeps, balance probes) grow
     memory super-linearly over a single very long run and OOM / time out past
     ~400–1000 steps. This is why the `jest (heavy sims)` job is **reported, not
     blocking on ALL three lines**, and why several sims are bounded to their
     stable range. Root-causing the accumulation in the world/persist layer would
     let the heavy sims become a required gate everywhere. Deepest of the open
     threads — an engine investigation, not a quick fix.

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
  8. ~~Rework the fused-weapon naming pool.~~ **FIXED 801/781/1086 (C2 below).**
  9. ~~Climbing rope: warn at durability 4, fail only at 0 (stop stranding 15
     pts).~~ **FIXED 799/779/1084** (usable to last point; graceful break at 0,
     no fall; fraying warning while low; climbReadiness button mirrors ≤ 0).
  10. ~~Post-boss ambush grace window on outpost exit.~~ **FIXED 801/781/1086 (C3 below).**
  11. ~~Fusion material-type UX.~~ **FIXED 801/781/1086 (C1 below).**
  12. ~~MiniLM cognitive-label noise.~~ **FIXED 801/781/1086 (C4 below).**

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
      **UPDATE 2026-07-22 — DIRECTION PICKED, PASS 1 SHIPPED (HAL OTA-947 / golem 924).** The user chose
      (b)+(a-lite) but REFRAMED the intent: the fast fusion loop is SACRED (keep the dramatic early scaling
      + the "I got something" hit) — the real problem is raw AC dominating ONE uncounterable axis, which
      switches the DEFENSIVE half of combat off. Three named, tunable levers ('defense de-runaway'), all in
      `gameStore.applyEnemyCounter` + a shared `equipment.trimStandingAc` (used by BOTH combat and the
      StatsPanel, so shown AC = fought AC):
        · **LIGHT AC TAIL-TRIM** — standing AC climbs untouched to `AC_TRIM_KNEE`=22, then ×`AC_TRIM_RATE`=0.4
          per point (raw ~37 → ~28). Every piece still adds AC; only the runaway tail bends.
        · **ENEMY HIT FLOOR** — cap the natural d20 an enemy needs at `ENEMY_HIT_NEEDED_CAP`=13 (~40% floor),
          so NO AC buys literal immunity. Below the cap it is the IDENTICAL old AC math → low-AC / early
          fights are unchanged (that's why the full suite stayed green).
        · **GLOBAL MITIGATION FLOOR** — a landed hit always deals ≥ `MITIGATION_FLOOR`=0.30 of its RAW roll,
          so stacked resists soak MOST of a matched hit but never ALL — a MISMATCHED resist visibly leaks.
          (The shaped-stone WARD is a spent absorb pool, not a passive resist, so it still runs after this
          and may legitimately zero a hit.)
      **KNOBS for adjusting fire downrange (all named constants):** `ENEMY_HIT_NEEDED_CAP` (lower = hit more;
      11 ≈ 50%), `MITIGATION_FLOOR`, and the trim `knee`/`rate`. A design artifact (charts + full model) was
      produced this session; the user signed off on light-tail-trim + the legibility layer.
      **STILL OPEN — passes 2 & 3 (planned, NOT yet shipped):**
        · **OTA-948 'matched progression'** — fold worn armour into the enemy POWER metric. `enemyScalePower`
          (encounter.ts) and `guardianPlayerPower` (coreGuardians.ts) today read only `bestStat + HP/10` and
          are BLIND to armour, so a tank reads as LOW power and the world scales DOWN (Guardian tiers 1–2 even
          SUBTRACT to-hit). Fix: add the armour AC term so as you gear up, enemy HP + damage climb to match
          ("the world climbs with you"). One-directional (spawn-time read of the player, never re-fed → NO
          feedback loop). Invasive: threads armour through ~8 `enemyScalePower` call sites → do in isolation.
        · **OTA-949 'legibility layer'** — make gear/resists VISIBLE: resist/weakness call-out on the hit
          (strengthen the OTA-838 tags + OTA-197 swap-nudge to NAME a type the player carries); coating-soak
          feedback (extend the OTA-946 weather-resist "0 damage" line to combat hits); a "hit leaked — missing
          resist" cue. Once-per-encounter, no spam.
      Recommendation on record: playtest pass 1 BEFORE stacking pass 2 (combat changes compound).
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


- **Exploit-sweep backlog (2026-07-13) — RECONCILED 2026-07-28: every group below was
  subsequently closed (economy re-tiering B1 802/782; item dupes A2 800/780; water bounce +
  small bugs A1 800/780; HUNT turn-in gating 810/790) — and CORRECTION OTA-1012: the earlier claim here that mysteries + storylines
  still turned in remotely was WRONG; a later B2 pass made ALL kinds face-to-face
  (turnInMystery/turnInStoryline require an agent in scene, the UI COMPLETE delegates to
  them, typed couriers refused). Nothing in this backlog remains open. Original record kept
  below for the audit trail.**
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
  **now ~370 OTAs behind** (reconciled 2026-07-28: HaL2001 at 1034, merge baseline still OTA-660) — re-run the same merge to top them
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
history in `HANDOFF-ARCHIVE.md`). Latest per line: **HaL2001 `2026-08-03-1106`**,
**golem-line `2026-08-03-1083`** (parity offset still HAL − 23 — every gameplay
OTA ships to both in the same pass), **engine_Dev `2026-07-20-1177`** (engine
skipped the whole 948–1004 run by design: all of it is Tartaria combat/content
tuning or content the engine already has natively — the escort feature was
ported FROM engine_Dev, not to it))

**GAME VERSION (player-facing):** `DISPLAY_VERSION` in `app/buildInfo.ts`, shown
on the character-select screen. It is a KNOWLEDGE version, not a build number:
**PATCH +1 on every OTA**, MINOR on a feature wave, MAJOR on a systems
re-architecture. Currently **4.29.44**; ledger in `VERSION.md`.

### ⚠ OPEN ITEMS — THE LLM-HEADROOM TRACK (owner-approved, 2026-08-05)

Owner's direction: *"do it, and log the rest as open items that we can
continue to work on. I don't want to lose this train of thought."* Everything
below is **OTA-able and ships to all three lines** unless marked build-bound.

**The premise:** the app pays the full cost of carrying a 400MB on-device
model and extracts very little from it — while betting on that same model to
cover the content gap the production audit flagged. The fix is never to put
the model in front of a tap; it is to spend its idle time and stop wasting
its working time.

**SHIPPED:** golem OTA-1105 telemetry · OTA-1106 lean ambient + capped pack
(prefill was the stall — NOT the native rebuild parked on this line) ·
OTA-1107 native timings + wasted-work accounting · OTA-1108 the read on that
data (reuse metric corrected, ambient prompt de-contradicted, item-synthesis
silent failure closed, debug lines out of the talk popup) · OTA-1109 item
synthesis yields the lock + its brief shrinks (it was burning 41 of every 55
wasted seconds and starving every other job behind it).

**WHAT THE FIRST DEEP-TELEMETRY LOG SETTLED (OTA-1107 running, read in 1108):**

- **OTA-1106 worked.** Ambient ~1,145 prompt tokens / 16.8s → ~545 / 8–11.8s.
- **Prefill still dominates ambient** (~70–80% of wall clock) and runs at a
  near-constant **~10–11ms per prompt token** across every job — which is what
  makes prompt SIZE the lever and any saving predictable in advance.
- **`item_synthesis` is the opposite shape** — write 5.8s > read 3.5s, 179 out
  tokens — because it is the only job with a large output budget.
- **Prefix reuse is exactly ZERO.** Corrected in 1108: `tokens_cached` is the
  cache SIZE after the call, not reuse.
- **Discard rate is the headline risk:** two of three ambient generations in a
  short session were binned, ~16.6s of work for nothing. One was `stale`, one
  was `action-opener` — and 1108 found the action-opener was the prompt's own
  fault, so the next log is the check on whether that rate falls.

**NEXT — in order:**

1. **Read the next device log first.** The OTA-1108 check came back:
   ambient's prompt landed at **361 tokens** (predicted ~360) and its read
   time at **4.4s** — the trim was exactly right — but its TOTAL rose because
   item synthesis was saturating the device and the lock. `reuse` read a
   measured **0 on every job**, as expected. The check on OTA-1109 is
   therefore: (a) does `item_synthesis` stop appearing 3-for-3 as
   `unparseable`, and what does the new `raw="…"` sample say when it does
   fail; (b) with synthesis yielding, do ambient's `wait` (was 4.0s) and
   `write` (was 3.0s for 31 tokens) fall back toward the OTA-1107 rates,
   which would finally realise the 1106+1108 prompt savings; (c) does the
   ambient discard rate drop (no `action-opener` appeared this session, but
   n=2).
2. **STABLE PROMPT PREFIX — CONFIRMED WORTH DOING (reuse measured at 0).**
   Every generation re-reads its whole prompt. Two parts, and the second is
   the one the log actually argues for: (a) reorder `buildSystemPrompt` so the
   invariant block (persona + voice rules + instruction) comes FIRST and
   volatile scene facts LAST; (b) jobs INTERLEAVE — ambient, flourish, ambient
   — and llama.cpp keeps one KV cache per context, so a flourish whose prompt
   shares no prefix with ambient's evicts it. A prefix shared across ALL jobs
   is therefore worth more than a per-job one. At ~11ms/token, a 300-token
   shared prefix that survives is ~3s per call. Pure JS.
3. **THE BANK (bank-and-spend).** Generate while the player is provably busy
   (8-hour rest, travel leg, a sheet they are reading), store keyed to its
   target, spend instantly later, authored fallback when empty. The flourish
   slot proves the pattern. Hard rules: **model never in front of a tap**,
   **every slot has an authored fallback.**
4. **THE HOMEWORK SLOTS:** adjacent-room flavor (cleanest pilot) · bestiary
   flavor on first kill · vendor small-talk variants · chronicle day
   summaries at rest · rumour + echo-thread phrasing variants. Voiced or
   silent follows the channel each line lands in.
5. **TOKEN-BUDGET TRIM — HALF DONE.** `item_synthesis` was the live
   candidate and OTA-1109 acted on it: cap 180 → 240, and more importantly a
   much smaller requested SHAPE, since the real fault was a 0.5B model being
   shown a six-field nested object and dutifully filling it. Ambient's cap is
   still deliberately untouched — across two logs now its discards have been
   `action-opener`, `stale` and near-duplicate, never truncation, and the beat
   is clamped to one sentence anyway. The cap moves when a log blames it.

5b. **⚠ THE LOCK IS A SHARED RESOURCE AND NOTHING WAS PRIORITISING IT.**
   OTA-1109 fixed the worst case by hand (synthesis yields), but the general
   problem stands: `runExclusiveNativeMl` is FIFO, so whichever job asks first
   wins regardless of whether a player is waiting on it. If a second job ever
   starves a player-facing one the same way, the answer is a real priority on
   the lock — player-facing narration ahead of background enrichment — rather
   than another per-job hand-tuned gap.
6. **REMAINING DIAGNOSTICS:** lock-holder attribution (waiting behind Kokoro
   or another generation?) · battery/thermal state so a slow late session
   reads as throttling · the per-job rollup folded into the bug-report export.
7. **BUILD-BOUND, STAYS PARKED HERE (Phase 6):** native config only —
   `n_predict` 120→40, thread count off 4, warm context between turns — plus
   live LLM NPC conversation. ⚠ Note the correction OTA-1106 forced: speed
   work was assumed to live here and mostly does **not**.

### ⚠ WATCH LIST — SEEN IN A LOG, NOT YET ACTED ON

Owner: *"keep the handoff as an open item."* These are observations from
device logs that were deliberately NOT changed in the OTA that spotted them —
either because the sample is thin or because the fix is a design call rather
than a bug fix. They are here so a later log can promote them instead of
rediscovering them.

- **REST AMBUSH — MEASURED, AND IT IS FINE.** Read the numbers before
  changing anything (2026-08-05): rest ambush is **22% base in the wild / 8% in
  a hub**, times the time-of-day multiplier (**1.3 night / 0.85 day**) — so
  18.7% by day, 28.6% by night in the open. The OTA-1108 log's two rests
  (Day 7 afternoon, Day 8 evening) both hitting is roughly a **5%
  coincidence**, not a broken roll. What IS worth a look is the *wording*: both
  ambushes drew the identical "Something circled while you were out" line, so
  the dedup on that beat is the real complaint. **No rate change warranted.**

- **⚠ THE NOVELTY GATE PENALISES NEW PLAYERS — CONFIRMED, FIX DESIGNED, NOT
  SHIPPED.** Owner: *"if we are looking for not traveled in the last 50
  squares, doesn't that penalize new players since they haven't been
  anywhere?"* Yes, exactly. `tileIsNovel = !recentTileHistory.includes(key)`
  and the history starts EMPTY, so a brand-new character has every tile novel
  and rolls the full encounter chance on every step, while an established
  player working a known region has 50 tiles banked and rolls far less often.
  The encounter rate is therefore at MAXIMUM when the player is weakest and
  falls as they get stronger — backwards from any difficulty curve. In
  fairness the gate was never a difficulty knob: it was added to stop someone
  oscillating between two tiles to farm encounters and loot, and it still does
  that job. Two candidate changes, both awaiting the owner's call because they
  are game FEEL, not correctness:
  **(a) an early-steps ramp** — scale the roll by `recentTileHistory.length`,
  starting around a third and reaching full by ~25 tiles. The signal already
  exists and is already used this way: `fleeGraceApplies` gives a free escape
  while `tilesSeen <= FLEE_GRACE_STEPS (3)`.
  **(b) the baseline itself** — currently 0.58 auto-travel / 0.45 manual ×
  1.3 at night = **75% encounter chance per novel step auto-travelling after
  dark**, which is what "every move was a fight" actually is. The code's own
  comment at the constant says *"Tune down toward 'desolate' (~4-8%) from here
  once the feel is dialed in"* and nobody ever did. Proposal on the table:
  0.58 → ~0.45 and 0.45 → ~0.35.

- **QWEN DORMANCY IS FIRING REGULARLY.** Third log in a row ending with
  `qwen-watchdog: Qwen dormant (status='ready' but the native context was
  released — usually app-backgrounding); reinitializing (attempt #1)`. The
  watchdog is doing its job and recovering, and the ML-health block reports
  `Status: active, Crash count: 0` — so this is not a crash. But the recovery
  is not free (a reinit costs a model load) and the same session logged an
  `item_synthesis empty 8809ms … out 0t` — a full prompt read that returned
  nothing — moments before the watchdog fired. That empty is now reported as
  `item_synth:empty` (OTA-1109) precisely so the next log can show whether
  dormancy is silently eating generations before the watchdog notices.
  **Check first:** how often does a dormant context swallow a call, and can
  the AppState hook detach sooner so the call is never started?

- **BOG HOUND SAT OUT A FIGHT** after Silt Thief died. Carried from an earlier
  log across a truncated span, so it was never confirmed as a bug. Still
  unresolved; needs a log that captures the whole encounter.

- **⚠ THE DEATH SCREEN, AND THE LOCKDOWN AT ZERO (2026-08-05, latest). BOTH LINES.**
  golem OTA-1110 / HAL OTA-1133. Owner: *"The second my HP hits 0 for whatever
  reason there should be a crossfade between the game screen and a new screen
  like the intro screen that gives a brief description of my death lore style
  and how it ties to my reason for entering the mud world and after a few
  seconds to read it, it should go to the character collection screen. This
  should add immersion and a clean character death, and stop anything else from
  happening after I hit 0."* Two halves, and the second one was broken.
  **THE SCREEN.** The opening crawl asks why you came down and offers five
  motives — debt, missing, exile, calling, record. Nothing ever answered it:
  death was three log lines, a silent 3.5-second hold on the exploration
  screen, and a cut to the slot list. The run stopped; the story of it never
  closed. The ending is now written from the SAME motive as the opening
  (`engine/deathScene.ts` + `data/story/death.json`, three variants each so a
  replayed death is not a rerun) — an exile dies *"in a place that never
  learned the name"*, a scholar's account *"ends mid-sentence"*. Three beats:
  the fall, the motive's answer, then a plain factual ledger of days and kills;
  the Arbiter's last line sits apart from the body text. `DeathOverlay` is the
  intro overlay's deliberate sibling — same near-black, same measure, same
  letterspaced hint — with three chosen differences: the fade is **slow**
  (1.6s; the intro drifts UP because you are arriving, this one only darkens),
  there is **no SKIP** (a tap leaves early, but only once the text is legible,
  so a player mid-tap when they died cannot dismiss their own death unread),
  and it **leaves on its own** after 11s so a phone put down mid-fight never
  returns to a stuck modal. Variant choice is seeded from the death stamp, so a
  re-render cannot reshuffle words being read. Mounted last in `App.tsx`: a
  death can land on any screen, and last sibling renders over whatever modal
  was already on its way in.
  **⚠ THE LOCKDOWN** — *"stop anything else from happening after I hit 0"* was
  not rhetorical; the owner played at 0 HP. Two holes:
  (1) **THE PARLEY INTIMIDATE-AN-ANIMAL FAILURE HAD NO DEATH CHECK.** It deals
  3+d6 straight to HP and moved on. Every other damage site in the store —
  status DOTs, weather, falls, enemy counters, effect damage — calls
  `handlePlayerDeath` at zero; this one did not, and the enemy-counter volley
  that follows bails instantly at `hp<=0`. The result was a living character
  standing on exactly zero with no epitaph, no screen, and no death. Now routed
  through `playerIsDownNotDead`, which reads LIVE state on purpose: the entire
  bug class here is code acting on a player it captured before the killing blow.
  (2) **FOUR `Math.max(1, …)` HP FLOORS SILENTLY RESURRECT.** They sit on the
  equip / displace paths that re-bake `hpMax` and carry current HP along. The
  floor exists so an hpMax cut cannot strand a LIVING player on zero — right
  instinct, one hole: at ZERO the same floor stands a corpse back up, so
  equipping gear was a one-point revive. All four now route through
  `hpAfterMaxChange`, which keeps the floor for the living and returns 0 for
  the dead.
  The handover (`dismissDeath`) also voids everything still queued behind the
  death — chapter card, mission popup, talk sheet, story fork — because a popup
  surfacing on the title screen over a character who no longer exists IS
  "something else happening after 0". It is idempotent, so a tap racing the
  dwell timer runs it once. New suite `ota1110DeathScreen` (26 tests).
  **See §WATCH LIST for the encounter-rate question raised alongside this.**

- **⚠ THE AMBIENT TRIM LANDED AND THE LINE STILL ARRIVED LATER (2026-08-05). BOTH LINES.**
  golem OTA-1109 / HAL OTA-1132. Step 5 of the LLM-headroom track, and
  OTA-1108's own check coming back:
  ```
  investigate_lore n5 avg8.5s  read1.1s/write0.9s in126t→out25t reuse0t wait6.5s
  item_synthesis   n3 avg13.7s max19.6s in310t→out119t reuse0t cap2 ∅1 ✂2/32.2s
  ambient          n2 avg11.6s max14.6s read4.4s/write3.0s in361t→out31t reuse0t
  || WASTED 4 calls / 55.4s
  ```
  **What worked, exactly as predicted:** ambient's prompt fell **545 → 361
  tokens** (the estimate was ~360) and its READ time **5.8–9.9s → 4.4s**. The
  trim is not in question. `reuse` also read a measured **zero on every job**,
  confirming OTA-1108's correction and leaving the stable-prefix item open.
  **⚠ What the same log then showed:** ambient's TOTAL went UP anyway —
  8–11.8s before, 11.6s average now — because the saving was handed straight
  to something else. Ambient now waits **4.0s** for the lock and spends
  **3.0s writing 31 tokens**, about 2.5× the ~40ms/token it managed in the
  OTA-1107 log. Neither number is about ambient; both are about the device
  being busy.
  **⚠ What was busy: item synthesis.** Three calls, THREE failures, 41
  seconds — `item_synth:unparseable` every time, two of them having burned the
  entire 180-token budget without ever closing a brace (472ch and 488ch for a
  shape that needs ~200). That is 41 of the session's 55.4 wasted seconds, and
  while it burns them it holds the shared native-ML lock (arb159) — which is
  precisely why every other job in that rollup carries 4–6.5 seconds of queue.
  Stated plainly the trade was indefensible: a background enrichment that
  lands on the NEXT inventory open was delaying the companion line and the
  lore flourish the player is waiting on now. Four changes:
  (1) **IT YIELDS.** One synthesis at a time, with a 20s gap measured from
  COMPLETION — a 19-second call must not be followed instantly just because
  the clock ran while it held the lock. The old per-name `pending` set stopped
  duplicates and nothing else, so a salvage haul of five curios fired five
  calls. A dropped request is free: the name stays uncached and asks again on
  the next lookup, which is the fire-and-forget contract this path already had.
  (2) **THE BRIEF SHRINKS.** The old one handed a 0.5B model a six-field
  nested `effect` object and six prose rules, then asked for "ONLY a single
  JSON object on one line". It filled the shape it was shown and the cap
  arrived before the braces closed. Now the shape is one line holding exactly
  what the validator reads, with the rules folded in as inline hints: ~900 →
  ~430 characters (≈310 → ≈150 prompt tokens, which is prefill this job pays
  on every call).
  (3) **THE CAP RISES 180 → 240** — insurance, not a decision to generate
  more: a cap only costs time when it is reached, and 180 was guaranteeing
  failure.
  (4) **THE RAW TEXT IS PRINTED** on a parse failure (bounded to 160 chars,
  whitespace-collapsed, riding the existing discard sink so it needs no new
  plumbing). `unparseable` never said whether the model wrote prose, opened a
  markdown fence, emitted two objects, or simply ran long. And an **EMPTY
  return is now its own reason**: the log's `empty 8809ms … out 0t` was
  followed moments later by *"Qwen dormant … the native context was
  released"*, so that is the watchdog's bug, not bad JSON, and filing it under
  `unparseable` would have aimed the next investigation at the parser.
  **NOT changed:** the ambient token cap, again — its two discards here were
  `stale:combat-started` and a near-duplicate, not truncation. No
  `action-opener` discard appeared this session, which is the right direction
  for OTA-1108's fix at a weak n=2. New suite `ota1109SynthStarvation`
  (15 tests); the OTA-1108 reporting lock retargeted.
  **Track continues — see §OPEN ITEMS above.**

- **⚠ WHAT THE FIRST DEEP-TELEMETRY LOG SAID (2026-08-05). BOTH LINES.**
  golem OTA-1108 / HAL OTA-1131. Step 4 of the LLM-headroom track — OTA-1107
  shipped the instrumentation, this is the read on it. **Headline: OTA-1106
  worked** — ambient fell from ~1,145 prompt tokens / 16.8s to ~545 / 8–11.8s.
  Four things the numbers exposed:
  (1) ⚠ **THE CACHE NUMBER WAS BEING READ BACKWARDS.** Every row reported
  `cache` == in + out EXACTLY (546+31=577, 542+31=573, 309+179=488,
  127+22=149, 124+20=144). That is llama.cpp's KV cache SIZE after the call,
  not tokens reused — OTA-1107 read it as reuse, and on that reading the
  stable-prefix item would have been retired as already solved. Reuse is the
  REMAINDER, and the remainder is **zero**: every generation re-reads its whole
  prompt. The rollup and the per-call line now print `reuse<N>t` derived as
  `cached − in − out`, floored at zero, and a MEASURED zero prints while
  absent data still stays quiet — "no cache line" and "the cache saved
  nothing" are different findings and 1107 could not tell them apart.
  (2) ⚠ **THE AMBIENT PROMPT WAS ARGUING WITH ITSELF.** OTA-1106 removed the
  SYSTEM FACTS block from the ambient prompt and left the shared VOICE_RULES
  in place — which orders *"Only narrate the player's last action and the
  static facts already present"* and twice cites a section that is no longer
  there, while AMBIENT_INSTRUCTION says *"DO NOT narrate or react to their
  last action."* The log shows the model resolving that the wrong way:
  `reason=action-opener`, 8.5 seconds binned. New `AMBIENT_VOICE_RULES` keeps
  the guards ambient actually needs (second person only, no invented places
  — repointed at the anchor line the lean prompt DOES carry, end on a complete
  sentence) and drops the contradiction plus the ~470-character action-verb
  catalog that a beat narrating no action was reading every time. Rules 1,352
  → 622 chars; whole prompt ~2,157 → ~1,427, roughly **545 → ~360 tokens**,
  about two seconds of prefill per line at the ~11ms/token this device
  measures. The reaction prompt is untouched — this splits the block, it does
  not rewrite it.
  (3) ⚠ **ITEM SYNTHESIS WAS FAILING SILENTLY AT FULL PRICE.**
  `item_synthesis ok 9528ms … out 179t … HIT-CAP (813ch)` — 179 tokens against
  a 180 cap, and 813 characters for a shape that needs ~200: the model rambled
  past its JSON and was then cut off. `extractJsonObject` spanned first-brace
  to LAST-brace, which parses neither a trailing second object nor a truncated
  tail, so nine and a half seconds returned `null` without a word in the log.
  The extractor now takes the first **balanced** object (string- and
  escape-aware, so a brace inside a description can't move the depth counter)
  and falls back to the old span so nothing that used to parse is newly lost —
  and both failure exits report through `noteQwenDiscarded`, so this call site
  finally appears in OTA-1107's waste accounting instead of hiding from it.
  (4) **THE TALK POPUP SHOWED DEBUG LINES.** Reported by the owner from inside
  the game, typed at the Arbiter as a command: *"you are showing the qwen notes
  in the talk popup."* `TalkSheet`'s transcript filtered on timestamp only,
  while `AdventureFeed` drops `HIDDEN_LOG_CHANNELS` — so every `qwen⏱` line
  landed mid-conversation, arriving because background generation does not stop
  while you talk. Same set, one import; a channel hidden later can't leak here
  again.
  **NOT changed, deliberately:** the ambient token cap. Every ambient ends
  HIT-CAP at 31/32, but this log's discards are `action-opener` and `stale`,
  not truncation, and the beat is clamped to one sentence anyway. The cap moves
  when a log blames it. New suite `ota1108AmbientContradiction` (21 tests);
  the OTA-1107 cache test and the OTA-1095 transcript lock retargeted with the
  reasons written in. **Track continues — see §OPEN ITEMS above.**

- **DEEP LLM TELEMETRY (2026-08-05). BOTH LINES.**
  The native numbers + the wasted work. golem OTA-1107 / HAL OTA-1130. Step 3
  of the LLM-headroom track. OTA-1106 proved prefill dominance by INFERRING it
  from wall-clock; llama.cpp returns a `timings` object on every completion
  with the exact split and the runtime was throwing it away. Five additions:
  (1) **READ vs WRITE, measured** (`prompt_ms` / `predicted_ms`) — the pair
  points at completely different fixes (trim the prompt vs cut the budget).
  (2) **PROMPT SIZE in the model's own tokens** (`tokens_evaluated`).
  (3) ⚠ **WASTED WORK.** A discarded line costs exactly what a delivered one
  costs, and every one recorded as a clean success: narration cancelled
  because the player acted again, ambient filtered as a near-duplicate or a
  wrong-shaped opener, a flourish arriving after they walked away.
  `noteQwenDiscarded(reason)` attributes to the LAST call — safe because the
  native-ML lock (arb159) guarantees generations never overlap — logs
  `qwen⏱ ✂ DISCARDED …` as it happens, and the rollup ends with
  `WASTED n calls / Ns`. This is what decides whether a job is worth keeping,
  and the only honest way to price the background work coming next.
  (4) **STOP REASON** — natural end vs the token cap; the per-call line flags
  `HIT-CAP` (full price AND truncated prose).
  (5) **CACHE REUSE** (`tokens_cached`) — a persistent ZERO means every call
  re-reads its whole prompt, making a stable prompt PREFIX the next
  1106-sized win. Decided by the metric, not a guess.
  All optional-chained for older llama.rn / jest mocks. Suite
  `ota1107DeepTelemetry`. **Rest of the track: see OPEN ITEMS above.**

- **⚠ THE STALL WAS THE PROMPT, NOT THE MODEL (2026-08-05). BOTH
  LINES.** golem OTA-1106 / HAL OTA-1129. Step 2 of the LLM-headroom track;
  OTA-1105's telemetry paid for itself on its FIRST device log:
  ```
  qwen⏱ ambient          ok 16822ms wait 2255ms (139ch)   ← 14.5s GENERATING
  qwen⏱ investigate_lore ok  1131ms            (132ch)   ← 1.1s, same size
  ```
  Same model, same device, near-identical OUTPUT length — 13× the time.
  **Prefill dominates**: ambient was reading a ~1,145-token scene dossier to
  write an 18-word aside.
  ⚠ **THE CORRECTION.** This was assumed to need Phase 6's native rebuild
  (`n_predict` 120→40, threads, warm context) — the work parked on THIS line.
  It does not, and an output-cap cut would barely have moved it, because the
  output was never the cost. The prompt is JavaScript and ships in an OTA.
  (1) **Ambient reads a lean prompt** (~1,145 → ~542 tokens): its own
  instruction forbids reacting to the last action, so exits, entities, the
  environment paragraph, canon lore and the pack manifest were all material it
  may not use. The location anchor is kept verbatim (the guard against
  invented place names), as is the read of the player it reflects on. Ambient
  is also the job most often discarded by the near-duplicate / action-opener
  filters — the worst place to spend fifteen seconds of CPU.
  (2) **The pack manifest is capped** (`INVENTORY_PROMPT_CAP = 14`): the
  device log's salvage pack was ~1,440 characters of item names in EVERY
  narration prompt. Worn kit still named in full; the stowed list caps with an
  honest "…and N more". Big-pack narration ~1,081 → ~809 tokens.
  The check is the next device log's `qwen⏱ ambient` line (~7s, not ~17s).
  Suite `ota1106PromptWeight`.

- **QWEN TELEMETRY — THE MEASUREMENT BEFORE THE CUT (2026-08-05).
  BOTH LINES.** golem OTA-1105 / HAL OTA-1128. Step 1 of the owner-approved
  LLM-HEADROOM TRACK (owner: "move forward" — un-parking the JS-side LLM
  work wrongly assumed to need a native build; only Phase 6's native config
  stays build-bound on THIS line). Also the debt OTA-1093 left on purpose:
  the 29-second generation "gets per-intent timing first rather than a
  blind budget cut."
  (1) **ONE CHOKE POINT.** New `app/ai/generation/qwenTelemetry.ts`; the
  runtime records EVERY generation at the one boundary all nine consumers
  cross (`LlamaRuntime.generate`). Labels: narration PER-INTENT
  (`narration:<intent>`), ambient, flourish, ask_arbiter, investigate_lore,
  fusion_forge, forge_name, parse_fallback, item_synthesis; an unlabeled
  future consumer records as 'unlabeled' instead of vanishing.
  (2) **THE WAIT/GENERATE SPLIT IS THE DIAGNOSIS.** Completions queue
  behind the shared native-ML lock (arb159), so a "29s generation" can be
  4s of generating behind 25s of queue behind a Kokoro synth. `waitMs` =
  entry → lock-acquired. Queue problems need scheduling; generation
  problems need a token budget.
  (3) **THE LOG IS THE DELIVERY VEHICLE.** `hydrate()` registers a sink:
  `qwen⏱ <job> <outcome> <ms>ms (wait Nms)` per call + a per-job rollup
  every tenth call. Errors record; a throwing sink can never break a
  generation; session-scoped by design.
  **Track next (all OTA-able, all three lines):** bank-and-spend module,
  then homework slots (adjacent-room flavor pilot, bestiary first-kill
  flavor, vendor small-talk variants, chronicle day summaries, rumor/echo
  variants). Hard rules: model never in front of a tap; authored fallback
  everywhere. Suite `ota1105QwenTelemetry`.

- **FIRST VISITS TELL THE TRUTH (2026-08-05). BOTH LINES.** golem
  OTA-1104 / HAL OTA-1127. Root-caused with a LIVE-STORE REPRO (fresh game,
  hub walk, per-build call counting) — the log-archaeology theory (double
  scene builds) was WRONG: `_beginSceneCore` runs once per action. The
  counter was poisoned inside a single build. Three defects, one
  visitedRooms map:
  (1) **PHANTOM PRIOR VISIT.** The OTA-071 investigation-table seeder and
  the OTA-120 dog smell-find run BEFORE the visit-record block in the same
  build and CREATED the room record with `visitCount: 1` when missing — the
  counter then found an "existing" record on a genuinely-first entry, and
  every room greeted "You've stood here before. (visit 2)" on first sight.
  Created shells now seed `visitCount: 0`; the greeting requires `>= 1`.
  (2) **THE WRONG DRAWER AT BOOT.** `candidateKey` read `player.hubRoomId`
  off the pipeline-top snapshot, but hub AUTO-ENTRY assigns the gate room
  AFTER that capture — the opening scene filed the gate under a SUFFIXLESS
  key no later hub move ever touched (why the device log's Reception said
  "(visit 2)" at boot and "(visit 2)" AGAIN on return). The key now uses
  the RESOLVED hub room id; the investigation seeder keys the same way.
  (3) **RE-ENTRY WIPED THE ROOM'S MEMORY** — found by the new suite's own
  assertion. The visit block's field-by-field record literal dropped
  `searchNothingCounts`, `groundDigCount`, `firstInvestigateDone` and
  `roomInvestigationTable` on every re-entry — resetting the investigate
  consumed-state and un-doing OTA-1103's `echoed` stamps for that room. Now
  `...existing` + overrides, so a future field survives by default.
  New suite `ota1104VisitCount`; one playtest-sim repetition cap retargeted
  12 → 13 (the false greetings had been padding the feed's line variety;
  the guarded intent is unchanged).

- **DEVICE-LOG TRIAGE — THE ECHO THAT PAID FOREVER, THE ROOF THAT WASN'T,
  AND THE ARC THE FALL ERASED (2026-08-05). BOTH LINES.** golem
  OTA-1103 / HAL OTA-1126. Three defects from one APK-293 playtest log.
  (1) **⚠ ECHO-HOOK FARM (exploit).** The cross-room echo (OTA-075 era)
  plants a thread referencing the player's most recent consumed
  investigation — and nothing marked the discovery as used, so
  `findReferenceableInvestigation` re-picked the SAME most-recent entry in
  every peaceful scene (15% roll). The log shows the Giant Bone Longbow
  thread completing TWICE in 15 seconds — +12 TC, rations and a Rare each
  pass, repeatable forever. Fix: a memory surfaces ONCE.
  `InvestigationEntry.echoed` is stamped AT PLANT TIME (resolve-time
  stamping would let an ignored hook re-roll room after room), the scan
  skips echoed entries and returns `{ entry, roomKey }` so the store can
  stamp the source room. When every memory is spent the scan returns null.
  (2) **THE ROOF FOLLOWS THE FACTION SKIN.** The weather tick's open-air
  exemption (gate / square / culvert) describes Reclaimer courtyards, but a
  faction re-skin can move those rooms indoors — the Architects' gate is "a
  clerical office with filing cabinets", and the log shows Aetheric arcs
  biting the player inside it (−2/−2/−3 HP). Every faction variant of
  `outpost_gate` + `outpost_central` now declares `open_air` judged from
  its own description, `hubRoomOpenAir()` in `engine/hub.ts` consults the
  declaration with the base set as fallback, and a sweep test requires the
  declaration on every variant.
  (3) **THE FALL READS HP LIVE.** The climb-fall computed new HP from the
  `player` snapshot captured before the weather tick in the same submit,
  then wrote it absolutely — erasing the arc's damage (log: −3 lands at 14
  HP, fall still reads 14, ends at 10 where 7 was owed). Now reads live;
  the slide and wall-flee paths already did and are locked.
  **Logged, NOT fixed:** inflated first-visit counts ("visit 2"/"visit 3"
  on genuinely first entries — needs a local repro); the Bog Hound that sat
  out a fight (truncated log span — watch item). Suite `ota1103PlaytestTriage`;
  one weather-locality lock retargeted, and that legacy suite renamed to its
  port-rule slot (`ota980WeatherLocality`) in a separate pure-rename commit.

- **THE REPAIR TAB LEARNS THE GRIP, AND LEARNS TO COUNT (2026-08-05).
  BOTH LINES.** golem OTA-1102 / HAL OTA-1125. Owner: "I thought we were
  going to do the same tap and hold to multiselct for repair too. it will
  have to take into account the items needed for each item you sent and
  dim make items in selectable if the items you selected consume the items
  needed." The first sentence is OTA-1099/1100's gesture again — hold a row
  to start a group, tap to add or remove, act on the lot — and the sameness
  is the point. The second is what makes REPAIR structurally different from
  SELL and DROP: those groups are independent (selling a sword does not make
  the axe unsellable), but repairs all draw from ONE pile, so every pick
  changes what the next pick can afford.
  (1) **THE RUNNING BUDGET.** `repairPlan` walks the selection IN ORDER and
  SIMULATES the spend using the engine's own functions —
  `missingIngredientsList` to ask "can I still afford this?",
  `consumeIngredientsList` to spend it. Both are substitution-aware (Cloth
  Scrap standing in for Patched Cloth, and so on), so the dimming matches to
  the unit what the repairs will actually cost. Hand-rolled cost arithmetic
  would drift from the substitution rules the moment anyone touched them,
  and the drift would surface as a button that lies. First ticked, first
  served — the same order the repairs then run in.
  (2) **THE DIMMING SAYS WHY, AND SAYS THE RIGHT WHY.** A row the budget can
  no longer pay for is dimmed, un-tappable, and carries "The pieces you
  already picked are spending the materials this needs." A row that was
  never affordable is blocked too — but it keeps its existing "Missing:"
  line, because telling that player the group ate their cloth would be a
  lie. `groupStarved = groupBlocked && r.available` is that distinction.
  (3) **THE BAR TAKES REPAIR ALL'S SLOT** (the 1101 rule applied here): it
  sits outside the ScrollView so it cannot scroll away while you tick rows
  further down, carries the running bill (`Costs: 3× Scrap Metal, …`), and
  REPAIR ALL is not rendered while a group is open.
  (4) **THE CONFIRM NAMES THE SKIPS.** Stock can shift under a group — a
  craft in the next tab, a repair that resolved first — so a picked piece
  the budget cannot pay for is listed under "Not enough materials for: …
  These stay damaged." A group that mends six of the seven pieces you picked
  without saying which one it skipped is the exact bulk-action failure this
  whole run has been written against.
  The group calls `repairInventoryItem` per piece, so there is no second
  repair path that could disagree about cost, substitutions, or eligibility.
  New suite `ota1102RepairGroup` (source locks plus direct exercises of the
  simulate/spend pair, including the substitution agreement check). One
  OTA-1098 lock RETARGETED — REPAIR ALL's `&&` became the middle arm of a
  ternary when the bar took its slot; the condition it guards is unchanged.

- **THE GROUP BAR TAKES THE TAB ROW'S PLACE AND HOLDS IT (2026-08-05).
  BOTH LINES.** golem OTA-1101 / HAL OTA-1124. Owner: "the new line that
  says sell group needs to stay anchored at the top and replace the buy
  sell buttons until, you either sell the group or cancel the group."
  (1) **ANCHORED.** The bar was rendered INSIDE the scrolling sell list,
  so it scrolled away the moment you started ticking rows further down —
  losing sight of the running total exactly when it starts to matter. The
  tab row lives OUTSIDE the `ScrollView`, so moving the bar into that
  slot is what makes it stay put. Anchoring here is STRUCTURAL, not a
  style: the test asserts the bar's position in the tree relative to the
  ScrollView (and that the list no longer contains it), rather than
  checking a `position` value that would pass while the bar sat in the
  wrong parent.
  (2) **REPLACES.** While a group is open the BUY / SELL / CONTRACTS row
  is not rendered at all, so BUY is unreachable and the only two ways out
  are SELL GROUP and CANCEL. The earlier clear-on-BUY guard stays as
  belt-and-braces, but the tab is now simply not there to tap. A mode you
  can leave by accident is not a mode. One source lock RETARGETED.

- **THE INVENTORY LEARNS THE SAME GRIP (2026-08-05). BOTH LINES.**
  golem OTA-1100 / HAL OTA-1123. Owner, after the group sell: "yes wire
  drop, fusable select and scrap the same way." The point is the
  SAMENESS — one gesture, one meaning, wherever you are: HOLD a row to
  start a group, TAP to add or remove, act on the lot.
  (1) **GROUP ACTIONS: DROP, SCRAP, ♡ RESERVE, ♥ RELEASE.** Each button
  appears only when the SELECTION can take that action, counted by the
  same predicate the action uses. When nothing can act, the bar says why
  rather than going blank.
  (2) **ELIGIBILITY MIRRORS THE SINGLE-ITEM PATHS EXACTLY.** Drop skips
  worn and quest-bound rows. Scrap ALLOWS worn gear, because scrap
  auto-unequips rather than refuses — excluding it here would be a
  stricter, *different* rule. Reserve / release route through the golem
  OTA-1097 bulk action, not a second path.
  (3) **⚠ THE CONFIRM NAMES SCRAP'S SILENT AUTO-UNEQUIP.** At one item
  that is a kindness; at group scale, unsaid, it strips your kit because
  you ticked a row you forgot you were wearing.
  (4) **⚠ DROP IS INSTANCE-EXACT — AND THE FIRST FIX WAS WRONG.** The id
  was threaded through `submitPlayerAction('drop <id>')` because the drop
  verb also matches on id. It passed a probe with id `bbb`, then failed
  on `trinket_junk`: the id has to survive the intent PARSER to arrive as
  `parsed.target`, so resolution depended on whether it happened to look
  like a word — a coincidence, not a mechanism. The drop BODY moved into
  a new `dropInventoryInstance` store action and BOTH entry points call
  it, so there is exactly ONE implementation of dropping.
  (5) **THE FUSABLE LONG-PRESS HATCH IS GONE, ON PURPOSE.** One gesture
  has to mean one thing on a screen. The per-unit "Save 1 for fusion" it
  reached is still there — switch off the FUSABLE axis and tap — and the
  banner now says so. Two source locks RETARGETED, not deleted. Suite
  ota1100InventoryGroup (15), including a live-store test that drops the
  ticked copy of two same-name rows.

- **GROUP SELL — HOLD TO PICK, TAP TO ADD, SELL THE LOT (2026-08-05).
  BOTH LINES.** golem OTA-1099 / HAL OTA-1122. Owner: "if I want to have
  a hold to start multiple select so I can hold on an item and it gets a
  check mark then I tap to add others to that group and sell a group
  let's make that happen."
  (1) **THE LONG-PRESS IS THE MODE SWITCH**, which is what makes this
  safe to add: a plain tap keeps meaning "sell this one" until you have
  declared otherwise, so NOTHING changes for a player who never holds a
  row. Emptying the group leaves the mode; leaving the SELL tab ends it.
  (2) **WHOLE STACKS, AND THE TOTAL SAYS SO** — priced by the same
  `price × quantity` the sale uses.
  (3) **⚠ ONE NEGOTIATION.** The `social` flag goes to the FIRST unit
  across the WHOLE group; the counter lives outside both loops. Reset it
  per item and selling ten things together farms ten times the social XP
  of ten separate sales — a new exploit introduced by a convenience
  feature. The suite asserts the counter's declaration position.
  (4) **⚠ THE WARNINGS SURVIVE.** The group confirm itemises every piece
  and carries both single-sale callouts — the gate-loss warning (your
  last way to climb / breathe toxic) and the bandolier/pouch loadout flag
  — because the risk of any bulk action is that it quietly does what one
  action would have stopped to ask about.
  (5) **SELECTION IS DERIVED, NEVER STORED.** Picked rows are looked up
  in the live sell list every render, so a row that stops being sellable
  falls OUT of the group instead of lingering as a dead id. Built from
  the same `sellable` list, so the equipped-instance and unsellable
  exclusions cannot drift. Suite ota1099GroupSell (13).

- **⚠ THE TALK TRANSCRIPT WAS EMPTY, AND IT WAS MY BUG (2026-08-05).
  BOTH LINES.** golem OTA-1098 / HAL OTA-1121. Owner, on the conversation
  view: "I can talk and they can answer, but none of the text is in the
  popup window, it's still in the exploration window."
  (1) **ROOT CAUSE — a trap this codebase already documents.** The view
  marked where a conversation begins with an INDEX
  (`startedAtLogLen = gameLog.length`) and rendered `gameLog.slice(that)`.
  But `gameLog` is `.slice(-MAX_LOG_IN_MEMORY)`d on EVERY append, so at
  500 entries the array stops growing and every existing index shifts
  DOWN by one per new line. A mark of 500 then sliced past the end
  forever: the transcript rendered empty and every reply stayed in the
  exploration feed behind the sheet — precisely the bug the view was
  built to fix. It only bites once the buffer is full, which is to say in
  long sessions, which is to say in real ones — and is why a fresh-game
  test passed it. The OTA-1078 comment on `_playerVisibleLogCount` states
  this outright and I used a length as a mark anyway. **FIX:**
  `startedAtTs` is a TIMESTAMP. Trimming drops old entries; it never
  rewrites the ones that remain, so a ts mark cannot slide. The
  transcript is `gameLog.filter(e => e.ts >= startedAtTs)`, and
  appendLog's conversation-boundary merge guard compares timestamps for
  the same reason. A new test drives the log past its cap and asserts the
  window still fills — and asserts the old index mark would have found
  nothing there.
  (2) **REPAIR ALL.** Owner: "let's also add a select all to the repair
  tab." Repair has no deferred step — the action IS the repair — so a
  select-all with nothing to press afterwards would be two taps where
  there is one job. REPAIR ALL READY mends every row the current view
  lists as ready, in display order, so on the default EQUIPPED axis worn
  gear is mended first (which decides who gets the materials when they
  run short). It acts on the FILTERED view, and that is what makes it a
  selection: search "boot", tap REPAIR ALL, only boots are mended. It
  calls the SAME single-row action per item rather than growing a second
  repair path, so cost, substitutions and eligibility can never disagree
  between one tap and twelve. Hidden entirely when nothing is ready.

- **THE FUSABLE VIEW BECOMES A SELECTION SURFACE (2026-08-05).
  BOTH LINES.** golem OTA-1097 / HAL OTA-1120. Owner: "we also need a
  select all button on the category headers in inventory when we select
  sort by fusable so you can select a whole category. and if you tap on
  an item that has been selected it automatically deselects." Reserving
  a category one row at a time was the same complaint OTA-945 answered
  for a single stack, one level up.
  (1) **TAP IS THE SELECTION.** In the FUSABLE view — and only there — a
  tap toggles the reserve directly instead of opening the item sheet, in
  BOTH directions, because deselect-on-tap without select-on-tap would be
  maddening. It moves the WHOLE stack, matching the bulk intent of a view
  whose headers say ALL. The per-unit "Save 1 / Free 1" controls stay one
  LONG-PRESS away. A quest-locked row keeps its modal (it can never be
  fused, so swallowing the tap would just look broken), and the pouch /
  bandolier fill modes still win the tap — two armed tap modes at once is
  a coin flip.
  (2) **SELECT ALL / CLEAR ALL per category header.** New store action
  `reserveManyForFusion(ids, reserved)` moves them in ONE `set()`,
  enforcing every gate a single tap enforces: quest-locked rows skipped,
  a not-yet-reserved row must be forge-reservable or a faction catalyst,
  and FREEING is always allowed so no rule change can strand a row. Rows
  already in the target state are no-ops, so a double-tap cannot
  double-count. A moved row folds into an existing same-unit row already
  in that state. The chip's count comes from the SAME filter the store
  applies — it can never claim a number it cannot deliver — and it
  carries its own `onPress`, because inheriting the header's would fold
  away the very rows it just reserved.
  (3) **THE MODE SAYS ITSELF.** One banner, only in this view, naming
  both the tap and the long-press; a reserved row gets a lit border
  (quieter than the transient forge highlight — a dozen loud rows is no
  signal) and reads as a checkbox to a screen reader.
  (4) **`sameStackUnit` HOISTED.** The merge-safety predicate was defined
  THREE times as an identical local closure. Three copies is three
  chances for one to fall behind when a new per-instance field lands. One
  module-level definition now. Suite ota1097FusionSelectMode (16).

- **A FRAME ON THE TALK SCREEN, AXES ON THE REPAIR TAB (2026-08-05).
  BOTH LINES.** golem OTA-1096 / HAL OTA-1119.
  (1) **THE SHEET FLOATS.** Owner: "let's shrink the width of the talk
  screen so it doesn't touch the edges of the screen and let's put the
  outside edge detail [a brighter] gold color so it pops and you
  understand a border is there." OTA-1095 welded the sheet to the bottom
  bezel, which gives a panel no readable edge — it reads as the app
  rather than as a layer over the app. It now sits in a gutter on all
  four sides (backdrop centers it, 14pt horizontal / 22pt vertical
  padding), 92% tall so the gutter shows top AND bottom, a full 14pt
  corner radius instead of two top corners, and a 2px `#f0c96a` frame —
  deliberately brighter than any gold INSIDE the sheet so the border is
  the first thing the eye finds.
  (2) **EQUIPPED BECOMES AN AXIS, NOT A HIDDEN PRE-KEY.** Owner: "let's
  add some different sorting options in the craft repair tab, still
  prioritize equipped it's on top as default sort." OTA-1094 made
  worn-first an UNCONDITIONAL pre-key on every axis, which meant tapping
  NAME sorted by name *within worn* and *within unworn* — the axis you
  picked never really ran. EQUIPPED is now a real axis and the DEFAULT
  one, so opening the tab is unchanged while every other axis genuinely
  sorts. Inside the worn block, what you can fix RIGHT NOW leads.
  (3) **THREE NEW REPAIR AXES.** SLOT (head-to-toe body order; slotless
  gear — rope, lantern, tools — sinks below the kit), RARITY, KIND. SLOT
  reuses the SAME rank map as InventoryScreen, so "sorted by slot" means
  one order across the game rather than two that nearly agree. Eight axes
  now; `SearchSortBar`'s sortRow already carries `flexWrap: 'wrap'`. The
  ★ EQUIPPED marker renders off `r.worn`, never off the active axis, so
  gear stays findable after a re-sort. Two source locks RETARGETED, not
  deleted: the height pin follows 88%→92%, and the worn-pre-key lock now
  asserts the axis form AND that the old unconditional pre-key is gone —
  otherwise the new axes are theatre.

- **TALKING IS ITS OWN SCREEN NOW (2026-08-05). BOTH LINES.**
  golem OTA-1095 / HAL OTA-1118. Owner, from the device: "the talk box
  is bigger than the exploration window so I don't get to see what he
  actually says unless I stop talking." Then, weighing the fix: "should
  talking be a whole separate full or 3/4 screen popup that way the
  story text is the only thing to read."
  **The answer is yes — but only because the replies moved in with it.**
  A full-screen popup that still routed answers to the feed BEHIND it
  would be the current bug made total: you would have to close the
  conversation to read every single line. What makes the tall view work
  is that the exchange is rendered INSIDE it.
  (1) **THE CONVERSATION VIEW.** TalkSheet is an 88%-height overlay: the
  exchange on top (the larger share — it is the thing that could not be
  read), the topic tray below, STOP TALKING at the foot.
  (2) **THE TRANSCRIPT IS A WINDOW, NOT A COPY.** `pendingTalk` carries
  `startedAtLogLen` (the feed's high-water mark when the talk opened) and
  the view renders `gameLog.slice(startedAtLogLen)`. dialogue.ts still
  routes every reply through `appendLog`, so the exploration log remains
  the whole record and closing the conversation leaves the history intact.
  (3) **⚠ A REGRESSION THAT WOULD HAVE SHIPPED.** `appendLog`'s
  same-channel 500ms debounce merges a world line into the PREVIOUS world
  entry. Unguarded, the FIRST reply of a conversation is welded onto the
  arrival narration that predates it — landing outside the window, so the
  player watches their opening question get no answer: this OTA's own bug,
  arriving through the debounce instead of the layout. `canMerge` now
  refuses to weld across the conversation boundary; grouping WITHIN a
  conversation is untouched. Direct regression test in the suite.
  (4) **UNASKED FIRST.** The tray sorts unasked topics above asked ones
  (stable, so the authored ladder still reads as a ladder); an asked
  topic still renders, still marked "(asked)".
  (5) **THE COLLAPSE BAR SURVIVES, AS AN OPTION.** OTA-1094's breadcrumb
  is still there, holding the controls slot so collapsing never leaves a
  gap where the input box was — it is just no longer REQUIRED to read a
  reply. Tray capped at 34% so a 16-topic vendor cannot push the exchange
  off screen from the other side. **GIFT and PICKPOCKET unchanged:**
  single-choice pickers that close on the pick, so the reaction is already
  readable. Suite ota1095ConversationView (10).

- **GEAR LISTS TELL THE TRUTH (2026-08-04). BOTH LINES.** golem
  OTA-1094 / HAL OTA-1117. Three reports from the device, and the first
  one's fix is mostly an admission.
  (1) **THE CRUCIBLE'S VANISHING WEAPONS SECTION.** Owner: "went to
  upgrade at the fuse and it only allowed me to pick armor no weapons."
  Nothing was broken. The upgrade grants a COATING CHANNEL, and ~129 of
  the 276 catalog weapons are energy-based (runecasters, burn / aetheric
  / electrical casters) — they fire no edge, so they can NEVER take one.
  `FusionPickerModal` rendered `section.items.length === 0 ? null : …`,
  so the WEAPONS heading simply disappeared, indistinguishable from a
  bug. Both headings now always render; an empty one says so and then
  LISTS the pieces it turned away, greyed and inert, each with its
  reason. New `crucibleUpgradeVerdict` in itemFusion.ts is the single
  seam the picker and `upgradeCoatingSlot` both read.
  (2) **THE STACK DEAD END.** A quantity>1 piece was refused with "split
  one off first" — an instruction the game gives NO way to follow. It now
  PEELS one unit into its own instance and upgrades that; the stack stays
  bare so five reserved pieces still buy exactly ONE channel, and an
  equipped stack re-points to the peeled instance. OTA-873's exploit
  guard RETARGETED, not deleted.
  (3) **EQUIPPED FIRST, EVERYWHERE.** New `wornInstanceIds` /
  `byWornFirst` in equipment.ts — worn ids INCLUDING the dog's vest,
  which lives on `player.dog.equipped` and was therefore invisible to
  every worn check in the game. Applied to the REPAIR tab (a
  direction-independent pre-key outranking READY / DURABILITY / NAME /
  COST, plus a callout), the inventory list, both coating pickers, and
  the Crucible upgrade list. **Deliberately excluded:** sell, salvage and
  gift — those already exclude or refuse worn gear, and floating your
  armor to the top of a "what do you want to destroy" list is the
  opposite of a favour. Suite ota1094GearListsTellTheTruth (16).

- **FIVE FROM THE DEVICE LOG (2026-08-04). BOTH LINES.** golem
  OTA-1093 / HAL OTA-1116. From the owner's Pixel log on 4.29.26.
  (1) **A CORRECTION TO THE FIRST TRIAGE** — the raid builder was NOT
  dressing a non-human body; the raiders were human.
  `randomizeEnemyDefense` "neutralized" a kind's unrolled weaknesses by
  writing `resist:<type>`, which INVERTS softness into armour: a Human
  is weak to four types, so three became ×0.5 on every spawn and a man
  in a salvage vest shrugged off crossbow bolts (the Arbiter meanwhile
  correctly pointed at slashing, the one weakness left standing). New
  third trait state `inured:<type>` in enemyTraits.ts — cancels a
  kind-wide weakness to NORMAL, never below it, and never softens a type
  the kind already resists, so Constructs keep their plating. (2) The
  pack swing cap is RANGE-AWARE: the owner's five-raider fight was mixed
  (two crossbow, three cudgel) so the cap never engaged and he ate four
  attacks a round at arm's reach; a shooter in the scrum now takes a
  slot, ranged keeps the exemption at mid+. (3) `combatEnemyLabel` keeps
  case when the enemy carries a factionId. (4) `giveGift` refuses a worn
  piece and names the slot. (5) Two titles in one beat speak once, then
  name the rest. **Deliberately NOT included:** the 29s Qwen generation
  — it gets per-intent timing first rather than a blind budget cut.
  Suite `ota1093FromTheDeviceLog` (9 tests); the 1089 pack-cap source
  lock retargeted to the range-aware line. NEXT: the owner-approved
  sheet-collapse rework (talk/gift/pickpocket collapse to a breadcrumb
  bar on tap, tap-or-swipe to reopen, unasked-first sort, scroll memory)
  plus equipped-first sorting in every armour/weapon list.

- **THE SECONDARY CAST (2026-08-04). BOTH LINES.** golem
  OTA-1092 / HAL OTA-1115. Workstream B step 3 — data-only, closing the
  production audit's dialogue-thinness finding. The 21 secondary named
  NPCs each drew one known + one familiar + one trusted topic from
  their archetype's pool (blade ×7, maker ×2, seeker ×3, road ×3,
  office ×6), name woven into the prose, rotation ensuring archetype
  neighbours differ; the 11 class sets each gained a familiar + trusted
  pair written in register. Catalog 258 → 343; Workstream B total +161
  authored topics from the 182 baseline. `ota1092SecondaryCast` locks
  shape, rung coverage, neighbour divergence, and the template failure
  modes. WORKSTREAM B COMPLETE (1090 doorway → 1091 deep bench → 1092
  secondary cast); the audit's actionable findings (combat slog,
  dialogue thinness) are both closed. Remaining audit gap is external
  playtesting, which is owner-side.

- **THE DEEP BENCH (2026-08-04). BOTH LINES.** golem OTA-1091 /
  HAL OTA-1114. Workstream B step 2 — the writing wave (data-only:
  dialogue_topics.json + tests, no engine change). The nine authored
  vendors grow 5-8 → 14-16 laddered topics; catalog 182 → 258. Ladder:
  ungated shopfront; ≥2 known; ≥2 familiar (Irma's Berrin ring, Elara's
  Mirei, Nalren's brother Doval); ≥3 trusted (marriage/its shape,
  origin, why-this-trade, a fear, and ONE PAYING SECRET each — lead
  grants 25-34 TC). The 1090 gate roads live: 6 minLovedGifts doors, 2
  minPocketsMumbled doors. Re-ask depth on the heaviest topics (2-line
  arrays). `ota1091DeepBench` locks the structure; ota1058's exact
  two-item known-list lock retargeted to its superset invariant. Next:
  the secondary cast pools (4-6 topics via archetypes, → ~400 total).

- **THE DOOR YOU CAN SEE (2026-08-04). BOTH LINES.** golem
  OTA-1090 / HAL OTA-1113. Workstream B step 1 — the doorway before the
  writing wave. The talk sheet ends with a COUNT of this person's
  gated-shut topics, never the labels (`lockedTopicCount` /
  `lockedTeaserLabel` in engine/dialogue.ts): "…4 things Irma doesn't
  tell strangers", wording scaled by rung (strangers / still holds back
  / isn't ready to say). Shown only at regard >= known
  (TEASER_MIN_REGARD), never to the wronged, `onlyRegard` repair topics
  excluded. Tapping the row (`tapLockedTeaser`) lands an in-voice
  deflection — nine authored lines, three per rung, rotating per tap
  (`teaserDeflectionLine`). pendingTalk carries lockedCount/regard/
  teaserTaps; TalkSheet renders the row dashed + italic under the
  topics. TWO NEW GATE ROADS: `minLovedGifts` (rel.lovedGifts) and
  `minPocketsMumbled` (rel.pocketsMumbled), both optional in
  TalkContext, defaulting 0. AUTHORING LOCK: the ota1090 suite reds on
  any unknown gate key in dialogue_topics.json. Next: the nine authored
  vendors deepen to 14-16 laddered topics; then the secondary cast
  pools.

- **PACKS END TOO (2026-08-04). BOTH LINES.** golem OTA-1089 /
  HAL OTA-1112. Workstream A step 3 (owner: "keep going with the KO fix
  and ship 1112"), closing the stall-guard task legitimately. (1)
  ANTI-STUN-LOCK — a stun/paralyze that takes hold grants `braced`
  (BRACED_ROUNDS 3, per-encounter, cleared at fight end): further
  incapacitations cannot land while it runs; suppression is narrated
  ("…braced; you keep your feet."). (2) PACK ACTION ECONOMY —
  MELEE_PACK_SWINGS_PER_ROUND (3) non-boss melee swings per volley,
  rotating lead, overflow narrated once dedup-quiet; bosses/ranged
  exempt. (3) KNOCKOUTS RESOLVE FIGHTS — mid-fight KO moves sights to a
  standing enemy; when a KO or kill drops the last standing enemy the
  fight resolves by SUBDUAL: sleepers auto-stripped via the existing
  lootKnockedOutEnemy splice (same grants/TC/signature-weapon rules),
  scene back to peace. `stillFighting` now means a live CONSCIOUS enemy
  in resolveEnemyDefeat AND lootKnockedOutEnemy. (4) SIM HONESTY —
  combatStress: pack-scaled stall budget (25 + 5/extra member, 2.5% cap
  unchanged), per-stall anatomy telemetry, RANGE-AWARE beat-down phase
  (slow-weather repositioning had marooned the sim at mid spamming a
  close-only cleaver into the reach gate — the entire remaining stall
  tail). HAL's full 700-day sim: 0/1074 fights over budget; wins
  9.1% → 37.6%, deaths 67 → 17. Suite `ota1089PackEconomyAntiStunLock`
  (7 tests) drives the real volley + subdual through the store.

- **GUARD-CRACK: RESISTED FIGHTS END (2026-08-04). BOTH LINES.**
  golem OTA-1088 / HAL OTA-1111. Workstream A step 2, owner-approved
  ("let's go with the resists break == Guard-crack") over globally
  softening the x0.5. Three landed RESISTED hits of one damage type into
  one enemy wear its guard through: from the next swing that resist stops
  applying for the rest of the fight (crack line "…worn <enemy>'s guard
  through — it bites full from here."). Per-scene bookkeeping
  (`CurrentScene.resistWear` / `resistCracked`, key
  `${enemy.name}|${damageType}`; cleared where a fight's lineup is
  wholesale-replaced — climb ambush, revenant spawns, missing-walker —
  so a fresh encounter re-arms). `effectiveMod` carries the crack through
  damage, narration, and type-procs; `recordEnemyIntel` still receives
  the TRUE `combinedMod`, so the bestiary shows the real matchup. Damage
  floor 1 → 2. The swap advice re-keys off the same wear counter: FIRST
  skid when it can NAME a carried weapon ("Swap to the Cudgel — …"),
  second skid generic, once per enemy+type per fight; `weaponResistStreak`
  is retired (field kept for legacy saves; weaponResistNudge suite locks
  the surface). New suite `ota1088GuardCrack` drives REAL store combat
  (slashing cleaver vs Construct) through advice → crack → full-bite →
  intact intel, plus source locks (floor, threshold, intel arg). Next:
  OTA-1089/1112 anti-stun-lock + pack math re-baselines the heavy guard.

- **NAME THE SLOG (2026-08-04). BOTH LINES.** HAL OTA-1110 /
  golem OTA-1087. Workstream A ("fights that end") step 1 — test-only
  instrumentation in combatStress: per-stall composition (enemy sig,
  hands, resisted-line share) + rounds-to-kill per matchup, two new
  report tables. VERDICT: sim stalls are 4-5 member faction packs at
  0-5% resisted lines with 844 stuns/run — pack stun-chaining, not
  resistance. The device-side resist slog (solo big-HP Uncommon vs a
  fully-resisted kit) is separate. Fix splits: OTA-1111/1088
  guard-crack (3 landed resisted hits of a type breaks that resist for
  the fight, owner-approved) + min damage floor 2 + first-resist
  weakness advice; OTA-1112/1089 anti-stun-lock + pack math retier.
  Heavy suite stays red on its 2.5% guard until the retier re-baselines
  it legitimately.

- **SIX FROM THE LOG (2026-08-04). BOTH LINES.** HAL OTA-1109 /
  golem OTA-1086. Owner: *"fix all six bugs, ship to all three lines."*
  (1) `spawn_enemy_name` hook effect — mud_golem_stir raises a real Mud
  Golem instead of tag-rolling an Aetheric Scarab; the spawn line matches
  the mid-range state. (2) `acceptKeyword(title, taken)` — the four hint
  sites at a counter share a per-visit set so two contracts never share
  'accept X' (Irma's vigil pair → 'kindling' / 'giant-watch'; interior
  hyphens kept for the fuzzy matcher). (3) The Qwen forge-namer rejects
  input-echo and curio-catalog names ("Hollow Quill Sheaf"); deterministic
  name stands. (4) Raid news stamped on the relation (`raidHeardAtHours`,
  max-merged in recordNpcDealing; both greeting paths stamp) — told once.
  (5) Travel picker excludes the last `RECENT_ENCOUNTER_MEMORY` (8)
  archetypes (`worldMemory.recentEncounterArchetypes`); full-pool fallback,
  directional finds bypass. (6) In-combat sneak is ONE roll: the opener is
  carried by the visible gate roll, the engaged reset contests
  `skill.total + 2 + timeBonus` vs the enemy's fresh die. Test:
  `ota1086SixFromTheLog.test.ts`.

- **THE LEDGER EXPLAINS ITSELF (2026-08-03). BOTH LINES.** HAL
  OTA-1108 / golem OTA-1085. Two owner reports off the Character screen.
  (1) The Arbiter regard row *"1 answer he was standing there for -5"*
  named nothing — it was the Phase-3 fork-regard aggregate. `regardParts`
  now emits one row PER judged answer, labelled with the words the player
  chose (`your answer: Sell the bundle to a Tomekeeper  -5`, via
  `optionById` on forks.json). The ±20 aggregate sub-clamp retired with
  the aggregation: forks are one-shot and finite (ten questions, deltas
  ±5, perfect run +36 < kin 40) and the ±60 total clamp holds. (2) A Core
  Guardian kill was recorded twice ("cut down the Iron Litany Brother
  Konrad…" from the generic rare-kill writer + "defeated … at Nimari"
  from the guardian block). The generic writer now skips
  `isCoreGuardian(enemy)` — one corpse, one ledger line. Test:
  `ota1085LedgerExplainsItself.test.ts`; the ota1067 anti-farm fork test
  retargeted to the itemised rows.

- **THE LOG-EXPORT REINIT LOOP (2026-08-03). BOTH LINES.** HAL
  OTA-1107 / golem OTA-1084. The owner's 11-part device log ends with the
  Qwen watchdog burning 10+ reinit attempts in 64s, status 'idle' every
  time: exporting chunks bounces the app (copy → switch away to paste →
  return); every switch-away disposes the ~400MB context, every return let
  the OTA-1032 5s recovering cadence kick a fresh full context load that
  the next bounce killed. Two engine defects compounded it —
  `forceReinitialize()` reset status BEFORE `initialize()` (defeating the
  already-loading guard, letting concurrent loads STACK), and a load
  interrupted by `dispose()` still installed itself 'ready' behind a
  backgrounded app. Four locks: watchdog kicks only while
  `AppState.currentState` is active (held stretches logged once);
  exponential backoff after `QWEN_WATCHDOG_FREE_RETRIES` (4) up to the
  healthy 60s, reset by recovery or a fresh foreground; engine
  `initInFlight` (joiners share one load); engine `lifecycleGen` (stale
  loads tear their context down and stay 'idle'). Test:
  `ota1084QwenWatchdogBackoff.test.ts`; ota1032 source locks retargeted.

- **THE GIFT ECONOMY (2026-08-03). BOTH LINES.** HAL OTA-1106 /
  golem OTA-1083. Owner: *"do all three."* (1) THE FENCE: sketchy traders
  buy stolen goods at `FENCE_STOLEN_CUT` (40%) of the honest sell-back —
  "no questions asked, and none answered"; honest/hub keep the refusal.
  Completes the thief economy pocket loot opened. (2) TASTES: GIFT button
  joins TALK on the vendor chip; gift reactions record what they PROVED on
  the ledger (`giftTastes`: 'loves:metal' / 'cold:food' via
  `tasteDiscoveries`), and the gift picker shows what you've witnessed.
  `lovedGifts` counts loved landings. (3) THE RETURN GIFT: trusted regard
  + ≥1 loved gift → on a later arrival (same greeting hook as the mumble)
  the vendor pushes an authored, thematic item back — once ever
  (`returnGiftGiven`); all nine authored vendors carry one
  (gift_prefs.json `returnGift`/`returnGiftLine`), catalog-verified by
  test. stealOverhaul's refusal case flips its vendor honest — the fence
  buying IS the feature. Test: `ota1083GiftEconomy.test.ts`.

- **DISMISSING THE VENDOR ENDS THE CONVERSATION (2026-08-03). BOTH
  LINES.** HAL OTA-1105 / golem OTA-1082. Owner, on device: *"I hit ✕ to
  close the vendor chip while the talk menu was still open; the vendor went
  away but the talk menu stayed open."* The talk sheet's walk-away guard
  lives in submitPlayerAction; the vendor chip's ✕ doesn't route through
  it — the one uncovered exit. The ✕ now closes an open talk WITH THAT
  VENDOR first (ledger-id match; a wanderer conversation is untouched)
  with the STOP TALKING feed line, and does nothing mid-shakedown — the
  pay-or-fight choice cannot be dismissed from a chip.

- **THE SHAKEDOWN, THE CLIENT'S COAT, AND THE MUMBLE (2026-08-03).
  BOTH LINES.** HAL OTA-1104 / golem OTA-1081. Three owner decisions:
  (1) *"the pay them off option when caught; if you don't have the TC you
  fight"* — caught at a vendor's pocket with enough TC raises a PAY/FIGHT
  bottom sheet (`PayoffSheet`, no cancel; `pendingPayoff` blocks all other
  actions). Price is demeanor-tiered 20/30/40. Pay = no fight, no faction
  word, but the ledger takes the wrong. Broke = straight to steel.
  (2) *"do the escort leader pickpocket. it should kill the mission if
  caught, cost you money, and you have to fight the whole party"* — leaders
  with a `leaderName` are marks (DC 14); caught fails the quest with its
  own narration (failEscortQuests gained narrate:false), fines 40 TC
  (ESCORT_CAUGHT_FINE, clamped), and spawns the named leader (22 HP,
  1D8+2) plus the pool as guards. (3) *"they should eventually mumble
  about always losing things... so you know they realized it, and that
  you're not suspected"* — clean lifts record `pocketsLifted` on the
  ledger; `pocketLossMumble` (npcMemory) fires on later meetings (vendor
  return greeting, wanderer re-encounter, escort camp on rest), one per
  loss via `pocketsMumbled`, three deterministic variants tested to never
  accuse. Test: `ota1081ShakedownEscortMumble.test.ts` (9 cases; the 1078
  caught-fight case now empties the pouch first since the shakedown
  intercepts a funded catch).

- **PICKPOCKET GLOWS GREEN WHEN POSSIBLE (2026-08-03). BOTH
  LINES.** HAL OTA-1103 / golem OTA-1080. Owner: *"let's have pickpocket
  green when it's a possibility as well."* The quick-row PICKPOCKET button
  lights the torch's ready-green (#9ec96a) whenever a mark (vendor or
  wanderer) is in reach — one visual language with the TALK glow: green
  means live right now. Also fixed the stale block condition (vendor OR
  ambient nouns, a pre-pocket-loot leftover from when pickpocket lifted
  objects): block + glow both key on vendor/wanderer presence now.

- **THE TALK GLOW + THE POCKETS AUDIT (2026-08-03). BOTH LINES.**
  HAL OTA-1102 / golem OTA-1079. Owner: *"make the talk button glow green
  if there are unspoken lines of dialogue"* — new `hasUnspokenTalk` store
  query drives the vendor chip's TALK button: house green (#9ec96a) while
  any gate-open topic has unread lines, gold once all heard, re-lights when
  a warmth/story/standing gate opens a new topic. Same machinery as the
  conversation itself, so light and list can never disagree. AUDIT (owner:
  "who besides vendors can we actually pickpocket, don't guess"): vendors
  (30 named + 24 roadside + overlays) and wanderers (7 archetypes) are the
  only scene-present people with pockets — both already marks. Escort
  leaders are human/present but are the player's own charge; adding them
  needs contract-fallout design (owner's call, parked). Core Guardians =
  constructs; combat enemies = kill-loot; popup NPCs have no scene body.
  Mark list confirmed complete, no change. Test: `ota1079TalkGlow.test.ts`.

- **WHAT'S ACTUALLY IN THEIR POCKETS (2026-08-03). BOTH LINES.**
  HAL OTA-1101 / golem OTA-1078. Owner: *"only show what you can
  pickpocket. Stealing is for items, pickpocket is for what would be in
  their clothing or on them... something they wouldn't trust on the
  tabletop with all the thieves around."* The sheet shows MARKS (vendor /
  wanderer chips), not merchandise — items on tables stay with steal/take.
  New `pickpocketPerson`: same Stealth roll + consequences as vendor theft
  (demeanor DC, steal-heat, quiet fail; CAUGHT starts the same fight via
  the extracted `vendorCatchesThief` — shared, not copied; a wanderer who
  catches you leaves, no steel over a pocket). Payout table
  (`engine/pocketLoot.ts`): 50% TC 3-12, 30% collectable note (owned notes
  fall to coin — no dupes), 15% one Legendary material, 5% a tower map.
  Lifted goods carry the stolen flag; a clean lift trains Stealth. Test:
  `ota1078PocketLoot.test.ts`.

- **PICKPOCKET JOINS THE BOTTOM SLOT (2026-08-03). BOTH LINES.**
  HAL OTA-1100 / golem OTA-1077. Owner's first pickpocket on device: *"it
  did a popup — can we have it do a bottom cover as well when we pick the
  item?"* PickpocketModal → `PickpocketSheet` in the DiceRoller's controls
  slot: choose the mark at the bottom, feed stays readable, the Stealth
  roll + outcome land there. One-shot (attempt closes the sheet), LIFT /
  CANCEL, house tokens. His roll question — Stealth + DEX or just Stealth?
  — answered and left UNCHANGED at just Stealth: it's its own trained stat
  (split from DEX in OTA-348); stacking DEX would double-count vs DC 10.

- **ALL TALKING MOVES TO THE BOTTOM OF THE SCREEN (2026-08-03).
  BOTH LINES.** HAL OTA-1099 / golem OTA-1076 — the owner's design decision
  from his first live TALK, built: *"the popup should be at the bottom of
  the screen like the dice rolls and just have a list of things to ask, and
  then you close when you want to be done talking. I think all talking
  should be like this."* TalkModal + ParleyModal are GONE; `TalkSheet` +
  `ParleySheet` render in the DiceRoller's controls slot, replacing the
  input box while the conversation is open — the feed (where replies have
  always landed) stays readable the whole time. Topic list persists across
  asks, spent topics stay visible marked "(asked)", STOP TALKING / BACK OFF
  hands the slot back, and parley's "Just talk" swaps sheet for sheet in
  place. Covers ALL talk surfaces (vendors, roadside traders, wanderers,
  escort leaders, guardians — everything routes through `pendingTalk` /
  `pendingParley`). Because the sheets give up the modal's screen lock, the
  store covers the exits: any real action submitted mid-conversation walks
  away from it first (same feed line as STOP TALKING); silent LLM-internal
  submissions don't count. Test: `ota1076TalkSheetWalkAway.test.ts`.

- **TUTORIAL PACING, DOG CARD, KEYBOARD (2026-08-03). BOTH LINES.**
  HAL OTA-1098 / golem OTA-1075, all from the owner's device run. Salvage
  beat trimmed to one world sentence + reward; EXPLORE send-off is one line;
  the dog rescue no longer asks "What kind of dog is that?" in the feed (the
  popup asks it next — players were typing when the card hit), dwell
  4000→3200ms; rope-beat keyboard fixed with an explicit focus() on press-in
  (Android drops the tap→focus→keyboard chain under the tutorial pulse).

- **THE DIFFICULTY STEP SAYS THE WORD DIFFICULTY (2026-08-03). BOTH
  LINES.** HAL OTA-1097 / golem OTA-1074. The creation step's header
  'HOW MUCH DOES IT TAKE?' → **'CHOOSE YOUR DIFFICULTY'** at the owner's
  direction — evocative flavor failed as signage on a permanent,
  never-raisable choice. Matches the sibling steps' pattern; the flavor
  stays in the four first-person tier names. Sheet section untouched.

- **EVERY POPUP ON THE HOUSE PALETTE (2026-08-03). BOTH LINES.**
  HAL OTA-1096 / golem OTA-1073. Owner: *"make all of the pop ups fit the
  same color palette, and design style for the same look."* The audit across
  all 33 popups found eight with orphans: seven were TOKEN DRIFT (near-miss
  shades one or two digits off real tokens — snapped to the real ones,
  near-imperceptible visually), and `FusionPickerModal` was a full INVENTED
  teal wardrobe (11 of 14 colors orphaned) hovering near the real aether
  token without using it. The Crucible keeps its cool ceremonial identity,
  rebuilt from owned tokens: #8aa0a4 aether accent, #9ec96a material green,
  house text ranks and grounds. **All 33 popups now audit at zero orphan
  colors.** Remaining unique-color files (feed, EnemyPanel, InputBox,
  StatsPanel, etc.) are persistent HUD with purpose-coded colors, not popups.

- **THE FORK OVERLAY JOINS THE HOUSE PALETTE (2026-08-03). BOTH
  LINES.** HAL OTA-1095 / golem OTA-1072. The owner's style audit of the
  Phase 3-5 surfaces: creation pressure step, both character-sheet sections
  and the ending blocks all reuse existing styles or pre-existing tokens —
  clean. `StoryForkOverlay` was the exception: nine colors appearing nowhere
  else in the app. Restyled onto the house set (gold #c9a86a, the dark
  grounds, #3a342c rule, #6b5c3a border, parchment text ranks) — every value
  now shared with 4-50 other files; layout and the no-dismiss rule untouched.

- **THE TUTORIAL WALK AND THE COMBAT WALK (2026-08-03). BOTH LINES.**
  HAL OTA-1093 / golem OTA-1070. The audit's two named coverage edges, closed
  at the owner's direction. `playtestTutorialWalk` plays onboarding by typing
  what the Arbiter asks, beat by beat, and asserts the tutorial ENDS, every
  beat visits in order, and the lockdown restates the ask on an off-script
  command. Found in passing: the climb template double-articled nouns that
  carry their own ("the the surface in front of you") — fixed.
  `playtestCombatWalk` walks until the seeded world stages fights, then plays
  them like a person — ADVANCE at the reach gate, dodge, FLEE a 2v1, kit,
  rest — and asserts every engagement ends, combat narrates with numbers,
  death is told, nothing leaks. Its three own failures were each the harness
  outrunning the phone (dice overlay swallows input; reach gate refuses
  mid-range melee; death resolves on a microtask a synchronous loop starves),
  all documented in-file as walk rules. ⚠ Balance observation, reported not
  tuned: level-one attack-only loses a 2v1 in 2–7 swings on every seed, and
  the seeded run ends dead to a 1v1 Mud Spider even playing well. 14
  assertions.
  On THIS line the walk also exposed and resolved a divergence: golem's
  tutorial carries a `look` beat HAL never had (commit 5d23d6fd, deliberate);
  the walk now plays it via one inert-on-HAL input entry. 14 assertions.

- **THE PLAYTEST WALKS THE REAL STORY (2026-08-03). BOTH LINES.**
  HAL OTA-1092 / golem OTA-1069. Owner, shown the honest-walk experiment
  before any code shipped: *"actual events trigger storyline is the way to
  go."* OTA-1068's harness granted Cores by writing `coresRecovered` straight
  into the save — a character no real player can be (nine Cores, story still
  in its prologue) — and the fork system, reading that contradiction,
  correctly refused the second question per motive. The harness under-covered
  exactly the content it existed to reach.

  Every Core now goes through `advanceMainQuest('core_recovered', <real
  capital id>)` — the exact state machine a Guardian kill feeds the store —
  so phase and core list move in lockstep. The seeded 80-step walk reaches
  **both** debt forks and asserts that permanently. The fight itself stays
  skipped on purpose: combat's dice have their own suites; this harness
  grades the story consequence of winning. The repetition guard now skips the
  `player` channel (the walker's own typed commands echoed back).

  Parked tuning note per the owner ("we can tune it later"): two answered
  forks still left regard at `even (2)` — `sell_the_claim` cost −4, which is
  the system working, and a data point that the regard bands sit high for a
  low-conduct run. 20 assertions.

- **ACTIVE PLAYTEST OF PHASES 0-5 (2026-08-03). BOTH LINES.**
  HAL OTA-1091 / golem OTA-1068. `__tests__/playtestPhases0to5.test.ts` (new).
  Owner: *"lets do active play testing on phases 0-5."*

  The harness does not test a unit. It **plays**: starts a character, seeds
  `Math.random` so the run repeats exactly, walks 64 steps through `travelTo`
  and `submitPlayerAction` — the same two entry points a thumb drives — answers
  whatever the story asks, then reads the **feed** and asks of each phase *did
  the player actually SEE this?*

  That is the OTA-1064 lesson made permanent. Every other suite here asks
  whether content is authored and correctly gated, and 621 green ones were
  doing exactly that while most of Phase 2 was unreachable. It grades only
  channels the player can read — the hidden-channel list moved out of
  `AdventureFeed` into `engine/gameLog` (`HIDDEN_LOG_CHANNELS`) so the harness
  and the screen cannot drift, after the harness's own first run failed twice
  on `debug` telemetry nobody has ever seen.

  ⚠ **Finding 1 — the sky repeated itself sixteen times.** `Weather effect —
  Eerie Calm: +1 WIS` fired on every `beginScene`, and OTA-994 persists
  weather per location for six game-hours, so an UNCHANGED sky re-announced
  itself at every arrival. Now gated on `player.weatherEffectSeen`, keyed on
  the **weather** rather than the tile: calm → storm → calm still says all
  three, four calm tiles in a row say it once.

  ⚠ **Finding 2 — the arc silently skipped a chapter, and it was mine, one OTA
  old.** The digest came back `witness, invested, implicated, named` —
  `interested` **never fired**. `dueArbiterBeat` only ever offered the CURRENT
  stance, so crossing two Core thresholds between two arrivals put the
  intermediate beat permanently behind the player: never due again. It now
  walks UP from the lowest unspoken stance, so an over-levelled run delivers
  the missed beats in order, one per arrival, and the arc still reads in
  sequence. A chapter vanishing quietly is precisely what "derive it from the
  save" was chosen to make impossible, and Phase 5 put it straight back in.

  Both found on the harness's first run. 19 playtest assertions + 2 regression
  tests; 627 suites / 5,278 green.

- **PHASE 5 — THE ARBITER BECOMES SOMEONE (2026-08-03). BOTH LINES.**
  HAL OTA-1090 / golem OTA-1067. `app/engine/arbiterPersona.ts` (new),
  `app/data/lore/arbiter-persona.json` (new). The plan's brief, verbatim:
  *"memory of what you've done, an opinion that shifts with your choices, and
  an arc across the nine Cores. It has more screen time than any character in
  the game and currently less personality than any of them."*

  That is fair, and one line in the old pool makes it embarrassing: since
  OTA-236 he has been saying *"there is a name I have not used in a long time.
  Not even to myself. Not yet to you"* — with nothing anywhere in the game able
  to keep that promise. He said it on hour two and again on hour ninety, to a
  player who robbed him blind and to one who carried nine Cores out of the mud,
  in exactly the same tone.

  **Three things, deliberately separate.**
  - **STANCE — where he is.** An arc across the nine Cores: `witness` →
    `interested` → `invested` → `implicated` → `named`, at 0/1/3/6/9. Rises
    only. Changes WHAT he is willing to talk about.
  - **REGARD — what he thinks of you.** A score summed from conduct the run
    already records, banded `cold`/`wary`/`even`/`warm`/`kin`. Moves both ways.
    Changes HOW he says any of it, through **three** tones rather than five —
    five produced pairs nobody could tell apart across sixty lines, which is
    worse than three that read clearly.
  - **MEMORY — what he names.** The person you wronged, the debt you squared,
    the Phase 3 question you answered — by name. Every third remark reaches
    for one when there is one; a voice that only ever alludes has no memory,
    and a voice that names something every line will not shut up about your
    business.

  ⚠ **DERIVED, NOT STORED — the Phase 3 rule again.** Stance and regard are
  pure functions of the save. The ONLY new persisted field is
  `player.arbiterBeatsSeen`: the one-shot lines already SPOKEN, because "has he
  said this yet" genuinely is not derivable from anything else. Same shape and
  same reasoning as `tideStageSeen`. Absent on every older save, which reads
  correctly as "he has not said any of it yet", so a long-running character
  hears the beats it has earned rather than silently missing the whole arc.

  ⚠ **And nothing in the module rolls dice.** `npcMemory` made this argument
  first and it holds harder for him: he is one continuous voice, so his opinion
  must be a function of your conduct, not of a coin. Callers pass a rotation
  counter (tiles found + foes down, at the one narration site). WHETHER he says
  something personal is still chance; WHICH thing he says is not.

  ⚠ **The opinion cannot be farmed.** The exploit lens on any opinion system is
  the cheap repeatable input. Every one is clamped and the total is clamped
  again: lore read **+8**, gifts **+6**, relics preserved **+8**, Phase 3
  answers **±20**, wrongs **−24**, corruption **−15**, menace **−12**. What
  moves regard late in a run is conduct that costs something. The negatives are
  clamped for the opposite reason — `cold` has to be a place a fifty-hour run
  can climb out of.

  **All 29 Phase 3 fork options** carry a signed regard value AND an echo
  phrase in his own words, and a test fails the build if either side has an
  orphan. That cross-file completeness check is the OTA-1064 audit lesson
  applied across files: an option authored in `forks.json` with no entry here
  reads, in play, as the Arbiter having no opinion about the one thing the game
  made you choose.

  **Five routes in, each tested for REACHABILITY rather than for existing:**
  1. **Scene narration** — the 15% personal-beat branch asks the persona first
     and falls back to the old flat pool only when there is no character to
     read (title-screen previews, fixtures).
  2. **Arrival** — one due beat per arrival, yielding to a tide crossing rather
     than stacking on it. Unspoken means unconsumed, so a skipped beat lands
     next arrival instead of being lost.
  3. **"What is your name"** — matched BEFORE every lookup that would otherwise
     swallow it (the lore bank would cosine-match some near-miss), and ALWAYS
     answered: the name, "not yet", or "not to you".
  4. **The character sheet** — a `THE ARBITER` section with the ITEMISED why,
     signed, in the same words the engine used. A hidden opinion score is the
     Phase 4 legibility failure again: the game quietly decides something about
     the player and never says what moved it.
  5. **The ending** — his verdict on you, and, at nine Cores WITH the regard to
     match, the name he has been holding since OTA-236. Nine Cores alone is not
     enough: he said he had not used it even to himself.

  The one model touch is a one-sentence brief (stance + tone) appended to the
  live Qwen persona prompt. Additive — an empty brief leaves the prompt
  byte-identical and a failed generation falls through exactly as before. A
  personality that only exists while a 0.5B model happens to be warm is not a
  personality, so everything else is authored. 55 tests.

- **PHASE 4 — THE DEBT COMES DUE, BEHIND A DIFFICULTY TOGGLE (2026-08-03). BOTH LINES.**
  *(MINOR bump — a new axis, not another patch on the same one.)*
  The plan: *"the ledger actually calls… you have every substrate already —
  `hoursElapsed`, weather, corruption, faction standing — none of it currently
  threatens anything."* And in the same breath: *"⚠ highest risk of making the
  game worse… ship it behind a difficulty toggle and tune from logs."*
  - **The toggle.** Four tiers, Doom-shaped and first person, on a **new fourth
    step of character creation** that sits after the motive:
    *"I only came for the salvage."* / *"I know what I owe."* (default) /
    *"Let it come."* / *"Bury me with them."* Each carries a subtitle saying
    plainly what changes — a difficulty name that sounds good and explains
    nothing is a trap on a screen you cannot revisit.
  - ⚠ **Lowerable mid-run, never raisable.** You can always ask the buried
    country for less; nobody finishes on "Bury me with them" a run they spent
    on salvage. It lives on the **character sheet** afterwards, with higher
    tiers rendered dim rather than tappable, so the rule is visible instead of
    enforced by a refusal.
  - ⚠ **Why everything is not on a dial.** Corruption and weather *already*
    bite — stat penalties, price markup, extra encounters, reposition cost,
    attack penalty, HP and corruption ticks — and that is shipped, played and
    balanced. Re-scaling it from a difficulty tier would put a multiplier on
    top of a year of tuning. So Phase 4 turns the two substrates that threaten
    **nothing** into pressure, and only raises the **rate** the other two
    accumulate:
    - **TIDE** (time → scarcity): +4% vendor prices per stage, one stage per
      ~4 in-game days × dial, **hard cap 6 stages / +24%**, and exactly 1.0 for
      the whole of tier 1.
    - **HOSTILE** (standing ≤ −25 and a faction starts *finding* you): a gate
      on an interception that was already going to happen, not a new spawner.
      Capped at 22%; a bounty you took on purpose is exempt.
    - **CREEP**: weather notches corruption in faster.
    - **EXPOSURE**: a storm takes a heavier bite.
    The last two sit **after** the title perks and **before** the race immunity
    at the weather choke point, so earned mitigations still work and a Sentinel
    is still immune.
  - **Legibility is half the feature.** The quiet way this phase fails is
    pressure the player cannot see — prices creep over forty hours, nothing
    says why, the game just feels worse for no nameable reason. Every tide
    stage crossing gets an authored line, once (`player.tideStageSeen`).
  - Every save older than this reads as **'owed'** — the game exactly as it has
    always played, plus the two new systems at their gentlest — with a one-tap
    way down. That escape hatch is what makes an honest default safe. 27 tests.

- **PHASE 3 — MAKE THE STORY ASK QUESTIONS (2026-08-03). BOTH LINES.**
  The build plan, verbatim: *"the audience that pays premium for text is paying
  for consequence, and right now you have exactly one fork in the game… extend
  that shape: 1–2 genuine forks per motive, with lasting consequence. Chapter
  cards become decisions rather than broadcasts."*
  - **What makes this a fork and not what we had.** The Missing's
    grave/lie/walker resolution is **dealt** — `missingResolutionFor()` hashes
    the identity seed. It proved the plumbing (a thread that ends, carries a
    keepsake, overrides the epilogue) and the player never chose it. This is
    that plumbing with the hash replaced by a person. **10 forks, 29 options,
    two per motive**, in `app/data/story/forks.json`.
  - ⚠ **Forks are DERIVED, not queued** — and that is the whole answer to the
    risk the plan named: *"the one place a save-migration bug would be
    unrecoverable for a player mid-arc."* A queued fork can be lost to a crash,
    a kill or a bad backfill, and a lost fork is a chapter of the player's
    story that silently never happens. `dueFork(player)` is a **pure read of
    the save**: first fork whose motive matches, whose phase gate the run has
    passed, with no recorded answer. Kill the app in front of the card and it
    is due again on load; `store.pendingFork` is a *view* and is safe to drop
    at any moment.
  - The only persisted state is the **answer** (`player.storyChoices`,
    forkId → optionId). Absent on every older save, which reads correctly as
    "asked nothing yet" — **no migration to get wrong**. An id from a newer
    build is ignored rather than fatal. And `answerFork` writes the choice
    **before** paying the effects, so a death between the two costs the player
    coin, never a re-asked question they already answered.
  - **Lasting consequence, three places:**
    1. **Now** — an authored line, plus coin / a keepsake / one-shot faction
       standing. Keepsakes are `quest`-tagged, so a decision cannot be pawned.
    2. **At the end** — one sentence per answer under **WHAT YOU CHOSE** on
       EndingScreen, permanently, beneath the motive epilogue that still closes
       the arc.
    3. **In the world** — `TopicGate.requiresChoice` lets the Phase 2 cast
       react. Three authored: Tellin on the writ you signed, Korash on the
       districts, Vesryn on the pages you sent up early.
  - *"Chapter cards become decisions"* is done by asking the question the
    instant the card is dismissed, **not** by making the card answerable — a
    card holds nothing a fast tap can lose (OTA-1020) and a decision must hold
    exactly that. So the fork overlay is the **one modal in the game with no
    backdrop dismiss and no close button**.
  - Standing here is one-shot **by construction** rather than by a guard (a
    fork can be answered once, ever) — the opposite of the two repeatable acts
    OTA-1064 had to meter. 25 tests.

- **THE DOORS + AN AUDIT OF PHASES 0–2 (2026-08-03). BOTH LINES.**
  - ⚠ **Most of what OTA-1062 authored was unreachable, and 621 green suites
    said otherwise.** Every Phase 2 test asked whether a topic was *authored*
    and correctly *gated*. None asked whether any route in the shipped game
    reaches it.
    - The TALK chip and the `talk to <name>` router both asked
      `hasTopicsFor(vendor.id)` — the **spawn** id (`roadside_<seed>`,
      `overlay_<id>_<ms>`). The topic sets are keyed on the **ledger** id
      (`roadside:grit_maalen`). Wrong namespace, `false` every time, for all 24
      roadside and 5 overlay traders. The 30 named vendors worked only because
      their raw id happens to equal their ledger id — which is why it hid.
    - `talk to <wanderer>` has always landed on the parley branch, which
      returns. All 28 wanderer-archetype topics: dead.
    - An escort leader is not in the scene at all (`player.activeFactionQuests`).
      Nothing routed to them.
    - A Core Guardian only ever exists as an **enemy**, and every route into a
      conversation required an empty scene.
  - **Fixed:** one `talkablePeople()` list with one identity function feeding
    all three consumers; the wanderer conversation is a **third option on the
    parley modal** so nothing is displaced (the parley still pays a lead, goods
    or standing); escort leaders route by name; a Guardian answers questions
    mid-fight. ⚠ It still **cannot be talked off its post** — OTA-806's
    guardrail is older and outranks this, and the conversation is free precisely
    *because* it changes nothing: no damage, no heal, no turn, no counter.
  - All 11 class sets shipped with the **same four button labels**, so a
    scavenger and a Core Guardian both offered "Ask what they are not saying".
    Each set now has its own.
  - **Audit — fixed:**
    1. ⚠ **Hostility was a rival-standing farm.** `applyRepChange` propagates
       half of any delta to the target faction's **rivals with the sign
       flipped**, so every standing *loss* is a standing *gain* elsewhere. Fine
       once; a generator for anything repeatable — and two acts were. A refused
       gift does not consume the item (deliberate, OTA-1060), so −2 / +1-per-
       rival cost a tap. Beating a vendor into submission was −12 / +6-per-rival
       and the vendor is anchored to the room (OTA-1029). Closed by
       `dockHostileStanding`: the largest hit already taken for a person is kept
       as a **magnitude** on their ledger row; a heavier act tops up the
       difference, a repeat costs nothing. Magnitude rather than a flag is what
       shuts the downgrade hole — a −2 insult must not buy immunity from the −12.
    2. **A topic grant could evaporate.** With a lead already in hand the branch
       printed "the tip will keep" and the caller spent the topic anyway. A
       payout gated behind `familiar` plus a chapter check paid nothing, once,
       forever. `applyTopicGrant` now reports whether it delivered, and the
       counter is bumped only when it did — and only when *nothing* landed, so a
       lead+coin topic can never be replayed for the coin.
    3. **Gifting reached a smaller cast than talking.** Escort leaders were
       talkable and absent from the gift picker, which is now derived from the
       same list. And a gift to somebody with no ledger row consumed the item
       while writing no memory — the one clause the owner asked for by name —
       now refused instead.
  - **Reported, not changed:** caught theft applies its standing loss on every
    attempt (same shape as 1 — what repeated stealing from one person should
    cost is a design call); and restitution (OTA-1053) banks only coin the
    player *hands over*, so buying and re-selling launders amends at the cost of
    the spread — bounded, but softer than 600 TC a wrong. 26 tests.

- **THE FLOURISH (2026-08-03). BOTH LINES.**
  The build plan's last unbuilt line, and the last item on the owner's
  seven-item list: *"the LLM contributes at most one short flourish line per
  exchange, off the critical path, with a template fallback if it's slow."*
  A flourish is **not more dialogue** — the authored reply owns the words, the
  flourish owns the hands. One short beat of what somebody is *doing* while they
  answer: a rag over a joint, a count that does not falter, a pack that never
  comes off the shoulder. 55 authored lines in `app/data/npcs/flourishes.json`,
  keyed two ways at once — by **trade** (ten buckets; all 30 named vendors map,
  and the procedural cast buckets straight off the OTA-1062 class keys) and by
  **regard** (six rungs including `wronged`, so posture tracks the Phase 1
  ledger). The pools concatenate and index by a hash of person + topic, so the
  same state gives the same beat, deterministic like everything since OTA-1049.
  - ⚠ **The model is still not in the critical path.** OTA-1058 built the
    conversation synchronous *because* a 14–20s generation in front of a tapped
    topic is a loading screen, and nothing about that changed. The order is
    inverted instead: a request fires when the topic **list opens** — the one
    moment in an exchange where the player is reliably busy reading — the result
    sits in **one module-level slot** keyed to that person, and raising a topic
    *takes* from the slot if it is full or takes an authored line if it is not,
    and cannot tell the difference. Slow model, dormant model and no model are
    all the same case: an empty slot. No `await` anywhere in the exchange, no
    spinner, no degraded mode. The slot dies with the conversation and is never
    persisted.
  - The **judge** for a generated line is pure and synchronous, beside the brief
    that asks for it so the two cannot drift: must name the person, one sentence
    under 160 chars, terminated, no quotes / questions / first person /
    second-person opener (the two registers OTA-1031 caught the ambient path
    falling into) and no instruction echo (OTA-1030).
  - **Frequency.** First raise of a topic only — a re-tread gets the words back
    but not the business; at most 3 per conversation; never the same line twice
    in one; silence rather than a repeat once the pool is spent.
  - `engine/flourish.ts` carries the same no-await guard `dialogue.ts` carries,
    and the test asserts **both** files plus that `emitFlourish` contains no
    `await` at all. 30 tests.

- **THE NON-VENDOR CAST GETS A VOICE (2026-08-03). BOTH LINES.**
  30 named vendors were authored one at a time. The rest of the population
  cannot work that way and **should not**: roadside traders are 24 procedurally
  named people sharing two archetypes; wanderers are archetypes × first names,
  so per-person authoring would be dozens of near-identical entries and the
  seventh "Corin the refugee" would read exactly like the first; escort leaders
  are drawn from a name pool at spawn; Core Guardians are one voice per Capital.
  What makes those people distinct is their **kind**, not their name.
  So topic lookup falls back to a **class entry** (`class:wanderer:refugee`,
  `class:roadside`, `class:escort`, `class:guardian`, `class:overlay`) — 11 sets,
  44 topics, 179 total. The **ledger still treats them as individuals**: Grit
  remembers you personally, and what he *says* is what a roadside trader says.
  Exact id always wins, so authoring a specific person later needs no code
  change.
  **And the verb caught up with the ledger.** `talkToNpc` only ever looked at
  `currentScene.vendor`, because vendors were the only cast the ledger covered —
  OTA-1057 finished that and the verb had not been told. It now resolves against
  the vendor, the wanderer, **and** active escort leaders, who are the one
  population you are guaranteed to have time with. Roadside and overlay traders
  arrive through the vendor slot, so those 29 people became talkable with **no
  wiring at all** — the class fallback was the whole change.
  ⚠ **Two class sets are authored and not yet reachable**, and that is worth
  saying rather than letting a green suite imply otherwise. `class:guardian`
  needs an entry point because a Core Guardian is an **enemy** — talking to one
  is the parley system's job, not this one. And an escort leader is only
  reachable while their contract is tracked and their party alive, which is
  correct but narrow. The content is written and gated; the doors are the open
  work.
  Files: `dialogue.ts` (`classKeyFor`, `setFor`, `TOPIC_CLASS_KEYS`),
  `dialogue_topics.json` (+11 class sets), `gameStore.ts` (`talkToNpc` resolves
  the whole cast), `ota1081TalkTopics.test.ts` (41).

- **TOPIC GRANTS + WHISPERS FROM CONVERSATION (2026-08-03). BOTH LINES.**
  Topics were gated, characterful and **inert**. The neighbouring system already
  pays — parley hands you a lead or their goods — so a talk that never yielded
  anything read thin next to one that did. Topics can now carry a `grants`
  block: a traceable **lead**, an authored **whisper** chain, or a small
  **payment**. Six authored.
  ⚠ **Fire-once, and not by a separate flag.** The grant is keyed off the same
  `talkedTopics` counter that already drives *"I have told you that one"* —
  `asked === 0` **is** the first raise. One fact read twice, so the payout and
  the acknowledgement cannot drift apart. A parallel `granted` set would have
  been the obvious shape and the wrong one.
  ⚠ **No standing, deliberately.** OTA-803 deleted gifting because faction
  standing had a side door; OTA-1060 reopened that verb only behind a lifetime
  per-faction budget. A topic granting standing would be a **second** door into
  the same economy with no budget on it. Talk pays in information and
  occasionally coin — never reputation. A test reads `applyTopicGrant` and fails
  if `applyRepChange` or `factionStanding` appears in it.
  **Whispers from conversation** close a real gap: the Yulka chain could only be
  planted by walking into the Mess and winning a 15% roll. Now Tellin — who buys
  the Discs and has never asked where they come from — and Elara, who knows
  everyone working nights, can tell you directly. That is what "word travels"
  should mean. Hearing it twice is not two rumours: an already-held chain is
  skipped silently.
  **Leads** reuse `player.pendingLead` and the OTA-809 payout site rather than a
  parallel one, and an **unclaimed lead is never overwritten** — that slot is
  single, and replacing it would quietly delete something the player was told to
  go and find.
  Everything that pays is gated behind `familiar` or better, and a robbed
  shopkeeper grants nothing at all — a stranger who can talk a lead out of
  somebody makes the relationship layer pointless, because the payout becomes
  the fast path.
  Files: `dialogue.ts` (`TopicGrant`), `dialogue_topics.json` (+6 granting
  topics, 135 total), `gameStore.ts` (`applyTopicGrant`, first-raise gate),
  `ota1084TopicGrants.test.ts` (12).

- **GIFTING (2026-08-03). BOTH LINES.**
  Type `gift`, pick an item, pick a person. They take it, react in character,
  and **remember the object** — `NpcRelation.gifts` stores names, not a score.
  A gift that only moved a warmth number would be a second currency; the memory
  of the thing is what makes it a relationship.
  ⚠ **This verb was deleted once, on purpose, and that decided the design.**
  OTA-803's note is still in `parser.ts`: *"Faction standing is earned through
  mission completions + sigil/pendant turn-ins, not by handing vendors loot; the
  gift-for-rep side door undercut that."* Restoring the verb without closing
  that door restores the bug — and a per-person cap is **not enough**, because
  several vendors share a faction (four boons each across five members is eighty
  standing through the side door). So faction standing from gifts is metered
  against a **lifetime, global per-faction budget** (`GIFT_STANDING_FACTION_CAP`
  = 10, roughly one mission's worth). What gifts really buy is the **personal**
  relationship — one ledger row, that person's discount via OTA-1053's
  `regardPriceMult`, and the memory — which cannot cascade to anybody else.
  **Insults are not capped**: a metered penalty would let a player be rude for
  free once the positive budget was spent.
  Three more exploits closed. **Gift-farm:** repeat gifts of the same item name
  decay to nothing — the second identical present is not a surprise.
  **Trash-flood:** anything under `GIFT_FLOOR_TC` (12) is **refused** and stays
  in the pack; accepting junk would let a player empty a bag into somebody at a
  cost of taps only. **Buy-back loop:** gifts are consumed and never re-enter
  stock, and the per-person boon count is capped at 4.
  Reaction is driven by **who they are**, not what it cost — value is a floor,
  not the score. Irma wants metal and is unmoved by beads; Halem wants food and
  curios; Tarek takes a mechanism apart before he has finished thanking you.
  Nine authored preference sets plus a fallback, and something genuinely
  valuable is welcome from anybody — a specialist who can only be given their
  own trade reads as a lookup table rather than a person. Deterministic.
  Files: `gifting.ts` (new), `gift_prefs.json` (new), `GiftModal.tsx` (new),
  `gameStore.ts` (`pendingGift` / `openGift` / `chooseGiftRecipient` /
  `giveGift` / `applyGiftStanding`), `types.ts` (`gifts`, `giftBoons`,
  `giftStandingGranted`, restored `gift` Intent), `parser.ts` + `llmParser.ts`,
  `ota1083Gifting.test.ts` (21).

- **PHASE 2 — FULL CAST, FIFTH GATE, WAY IN (2026-08-03). BOTH LINES.**
  The three things the OTA-1058 slice left open.
  **(1) The whole cast.** 27 more named vendors authored — all 30 in
  `vendors.json` now have topics, **129 in total**. Everyone gets a shop-front
  line anyone can hear, something about their people once they place you,
  something they actually believe once you have earned it, and a single closed
  door if you robbed them. Adding a vendor is still a JSON entry.
  **(2) ⚠ The fifth gate — and the three that were never exercised.** The plan
  named five dimensions: warmth, standing, contracts, titles, story chapter.
  OTA-1058 shipped machinery for four and *content* for one. `minStanding`,
  `requiresTitle` and `minContractsTurnedIn` were unit-tested and had never
  executed on a device — which is not the same as working. Story chapter did not
  exist at all; `TalkContext` had no chapter field. Now `minChapter` (ordered
  against `MainQuestPhase`) plus `minCores`, because `cores` is a long phase
  with five Cores inside it. All eight dimensions are used by real content and a
  test walks the JSON to prove it, so *tested* and *exercised* cannot drift
  apart again. A character with no `mainQuest` block reads as `hook`, the
  beginning — defaulting the other way would unlock every story topic on a fresh
  character.
  **(3) A way in.** OTA-1058 shipped the exchange reachable only by typing
  `talk to <name>`, which is a feature nobody finds. The vendor chip now carries
  a **TALK** button, shown only for someone with authored topics — a TALK button
  on somebody with nothing to say is a worse lie than no button.
  Files: `dialogue_topics.json` (+27 NPCs), `dialogue.ts` (`minChapter`,
  `minCores`, `PHASE_ORDER`), `gameStore.ts` (chapter + cores in
  `talkContextFor`), `ExplorationScreen.tsx` (the TALK button),
  `ota1081TalkTopics.test.ts` (26).

- **PHASE 2 VERTICAL SLICE — GIVE THE WORLD A MOUTH (2026-08-03). BOTH LINES.**
  A `talk <npc>` exchange with three named vendors — Irma Ironhand, Halem the
  Trader, Tellin Mak — opening a list of topics, each gated on what has actually
  passed between you, each with an authored reply. A **vertical slice on
  purpose**: the build plan flagged this phase's real cost as *writing*, not
  engineering, so the framework ships against three people and the rest of the
  cast is a JSON entry each with no code changes.
  ⚠ **The model is not in the critical path, and that is the whole design.** A
  Qwen generation on device measures 14–20s. A conversation turn at that speed
  is a loading screen with dialogue in it. So the exchange is entirely authored
  and entirely synchronous — no spinner, no async, no fallback, no way for a
  slow model to make the game feel broken. There is a test that greps
  `engine/dialogue.ts` for `async`/`await`/`Promise`, so a later "just make it
  dynamic" cannot go out quietly. The narrator's eventual job here (Phase 6) is
  one optional flourish *after* the authored reply has landed.
  **Gating is the point.** This is the first feature that reads the Phase 1
  ledger for something the player **chooses** rather than something that happens
  at them. Irma talks about armour to anyone; about the encampments once she
  places you; about the flood once you are a regular; about what she makes of
  you only if you have earned it. Gates are **AND, not OR** — world state (a
  raid on their ground) never substitutes for a relationship.
  ⚠ **And robbing somebody is not a warmth level.** `wronged` is deliberately
  off the regard ladder: a naive scale would sort it somewhere and hand a thief
  the most private topic in the set. Rob them and exactly **one** topic remains.
  My first `gateAllows` put the ungated short-circuit above that check, so every
  shop-front topic survived a theft — caught by this OTA's own test, which
  asserts the wronged list is exactly one item rather than merely "contains the
  apology".
  Repetition is acknowledged, not replayed: `worldMemory.talkedTopics` counts
  raises per (npc, topic) and a spent topic answers *"I have told you that
  one."* Bounded by the authored topic count, so it cannot grow with play. The
  topic stays **visible** marked `(asked)` rather than vanishing — a list that
  silently shrinks reads as the game losing content.
  The modal mirrors `ParleyModal` deliberately, so it is an interaction the
  player has already learned, and the exchange stays **open** after a topic —
  a conversation, not a menu that fires once.
  Files: `dialogue.ts` (new), `dialogue_topics.json` (new, 16 topics),
  `TalkModal.tsx` (new), `gameStore.ts` (`pendingTalk` / `talkToNpc` /
  `raiseTopic` / `closeTalk` / `talkContextFor`, diplomacy routing),
  `types.ts` (`talkedTopics`), `ota1081TalkTopics.test.ts` (20).

- **WANDERER + ESCORT LEDGER COVERAGE (2026-08-03). BOTH LINES.**
  Phase 1 built a per-person relationship ledger and then wired it to vendors
  and Core Guardians only — which left the two populations the player actually
  **talks to** invisible to it.
  **Wanderers.** Persuadable travellers on the road: talk to them, talk a
  location lead out of them, or put a hand on them and take their coins. None of
  it was remembered by anybody. And `makeWanderer` mints
  `wanderer_<archetype>_<tile seed>`, so even once they were on the ledger the
  same person met on two tiles would have been two rows — the OTA-1053 roadside
  leak waiting to happen again in a system that had never been keyed at all.
  Archetype + name is the person. A returning traveller now gets the greeting
  layer, so meeting somebody twice on the road reads as meeting somebody.
  ⚠ **And extortion was the one free robbery in the game.** Lifting an item off
  a vendor's counter has cost a `wrongs` since OTA-1049; shaking down a
  traveller cost nothing personal at all. It does now — and like every other
  wrong it is payable off through OTA-1053's amends rather than permanent.
  **Escorts** were worse: there was nobody to put on the ledger. An escort is a
  **pool** — label, hp, count — with no individuals in it, so you could walk
  three people across the flats, lose one, and the survivors had no more
  identity than a stack of rations. `spawnEscortPool` now names whoever walks at
  the front, drawn deterministically from the party's own shape so a save reload
  cannot reshuffle who you are travelling with. They go on the ledger when you
  take the contract, and getting them home is recorded against them — so the
  second time you walk with the same leader, you are not a stranger.
  `leaderName` is optional on `EscortPool`, so pre-1080 saves load without one.
  ⚠ **Not recorded: a wiped party.** There is nobody left to remember it, and
  inventing a row for the dead is the same mistake as inventing an identity for
  an archetype. A failed escort already costs the contract and the pay.
  The ledger needed no extending — only pointing at the rest of the cast.
  `vendorLedgerId` is renamed `npcLedgerId` to stop the name lying about its
  scope (it has covered roadside, market and overlay ids for three OTAs); the
  old name stays as an alias so nothing churns.
  Files: `npcMemory.ts` (`npcLedgerId` + wanderer/escort branches),
  `wanderers.ts` (unchanged — the id already carried what was needed),
  `escort.ts` (`escortLeaderName`, `leaderName` on the pool), `types.ts`,
  `gameStore.ts` (`sightPerson`, wanderer sighting + greeting, parley outcomes,
  escort accept ×2 and delivery), `ota1080WandererEscortLedger.test.ts` (13).

- **VENDORS DO NOT DIE (2026-08-03). BOTH LINES.**
  Owner's design call, and it closes the **last open item of Phase 1**.
  The death half was never designed. It fell out of the caught-theft path
  converting the vendor into an ordinary `Enemy`, which then flowed into the
  generic defeat routine like any wasteland raider. Two things were wrong with
  that. **It breaks the game quietly:** a killed armourer is the turn-in point
  for every contract chain that ends at their counter, and there is no dead-NPC
  list anywhere in the code — so the "death" was really a scene wipe that the
  next scene regeneration undid. Nobody decided that; it happened. **And it paid
  better than the mechanic it competes with:** `buildTraderEnemy`'s loot pool is
  the vendor's own first two offers, so *steal → get caught → win the fight* beat
  stealing, on a target still standing there for a second round.
  So: you win the fight or you lose it, and either way they are alive after. A
  successful **theft** still hands you the goods — that is what the steal roll is
  for. A **beating** hands you nothing:
  they keep hold of the pack; where there are other traders and guards you are
  walked out (and `exitBuilding` actually fires, so the prose and the state
  agree — you cannot re-open the stall tab and start again); on the open road
  there is nobody to raise a hand, so the trader gets their stock away and goes.
  It costs **−12 standing**, taken here where the kill used to take it, and a
  **`wrongs` on their personal ledger** — so it shows in the Chronicle, drops
  them to `wronged`, and prices everything they sell you at +25% until you have
  made it good. That last part is deliberate: OTA-1053's amends (600 TC per
  wrong) give a road back, which is why this lands on the ledger rather than
  being permanent.
  The person is carried through the fight on `CurrentScene.vendorInFight` —
  OTA-1055's review found the conversion threw them away entirely, so there was
  nothing to restore and nothing to write the consequence against. The intercept
  sits at the **top** of `resolveEnemyDefeat`, so none of the corpse machinery
  runs: no loot roll, no `defeatedEnemies` row, no kill milestone.
  Files: `gameStore.ts` (`vendorInFight`, `resolveVendorSubmission`, the
  intercept), `ota1079VendorsDoNotDie.test.ts` (10).

- **LEDGER HOLES + NOISE FLOOR (2026-08-02). BOTH LINES.**
  Six defects the OTA-1054 review turned up, five of them mine from the Phase
  0/1 run. One OTA because they share a root: the ledger and the noise floor
  were both wired by following the code that already existed rather than the
  **set** of places that needed it.
  **(1) Roadside traders had collapsed into two people.** OTA-1053 was right
  that `roadside_<demeanor>_<Date.now()>` is not an identity — it split one
  trader into unbounded one-encounter strangers — but keyed the replacement off
  the archetype **name**, and `roadside_traders.json` holds exactly **two**
  archetypes whose names are furniture ("Road Hawker", "Sketchy Stall"). So it
  over-corrected into the mirror bug: from the second roadside stall a save ever
  saw, arrival narration was skipped as a familiar face, `tcTraded` pooled
  across strangers, and **one** caught theft made every roadside trader on the
  map charge the wronged markup. Neither id was ever an identity because the
  **data** had no people in it — so the fix is content, not keying: twelve named
  traders per archetype (24 in all). The archetype still supplies demeanor,
  stock and description.
  **(2) Two of the three vendor-install sites never recorded the meeting.**
  Nothing but `patchSceneForBuildingRoom` can mint a `hidden_market_*` id, so
  the four Hidden Market stalls had **no relation at all** — every
  `recordNpcDealing` against them silently no-opped, meaning a caught theft
  there cost nothing, permanently. And `stepDirection`'s roadside stall — the
  path the code itself calls dominant, *"one every ~5 travel steps"* — never
  calls `beginScene`, so no sighting, no greeting, no absence line, no raid news
  for the traders the player meets **most**. Same shape as the OTA-1052 Guardian
  gap; one helper (`sightVendor`) now, so a fourth vendor source cannot
  half-copy it.
  **(3) …and collapsing them introduced a third bug**, caught before it shipped.
  The same-vendor guard first read `currentScene.vendor` — but `beginScene`
  **commits the scene** long before it sights the vendor, so the guard compared
  the new vendor against itself and would have killed every sighting the ledger
  has taken since OTA-1049. It is a parameter now, supplied only by the
  stall-tab path, which is the only caller with a meaningful "before".
  **(4) Story beats were being merged away.** `appendLog`'s world/system
  debounce rebuilds the merged entry as `{ ...lastEntry, text }`, so meta comes
  from the **first** line: a beat glued onto a preceding world line lost
  `storyBeat` entirely — no rule, no STORY chip, no air. Not a corner case; most
  authored drip beats are world-channel and `advanceStoryDrip` runs microseconds
  after `beginScene`'s own world lines. Exactly the complaint OTA-1051 was
  written to fix, reintroduced by a debounce written years earlier.
  **(5) `log-moved-on` was dead in every real session.** It compared
  `gameLog.length` across the 14–20s generation, and `gameLog` is `.slice(-500)`
  on every append — so past ~500 entries (roughly ten minutes of play) the
  length is pinned and the difference is permanently zero. It is the **only** one
  of the five staleness checks that catches the OTA's own stated case: a player
  standing still who "looted three things" while the musing generated.
  **(6) Auto-granted contracts poisoned the accept burst.** Three sites hand a
  contract over off a hook the player walked into, and all three ran the full
  burst path — so a stretch of road that dropped three hooks could have the
  Arbiter tell a player who accepted **nothing** that they were "stacking
  promises", and, because OTA-1048 keys the compact accept card off the same
  counter, could make their next genuinely **first** manual accept render as the
  compact repeat form. The milestone still counts; only the burst does not.
  **(7) Raid dialogue printed slugs.** Somebody who lives at Reclaimer's Stake
  called it "reclaimer stake"; the Tartarian Pilgrim Camp came out "pilgrim
  waycamp". `npcMemory` has no location catalog and should not grow one, so the
  store stamps `safeLocName` onto the record at write time; the de-slugged id
  survives only as the migration fallback.
  Also: `acceptFactionQuest` — the sixth and most face-to-face accept path — was
  the only one not crediting `contractsTaken`.
  **⚠ SECOND PASS — what four review agents found in the above, before it was
  pushed.** The pattern is the point: five of the seven items are "a rule
  applied at some sites out of several", and the first draft repeated that
  mistake three more times.
  **(8) "two of three" was two of FIVE.** The elevated-overlay trader and the
  `spawn_vendor` campfire Reclaimer are also vendor-install sites and were also
  unsighted, under a docblock claiming the hole was shut. Both wired;
  `vendorLedgerId` gains an `overlay:` rule; the test counts the call sites in
  the source rather than restating the comment.
  **(9) The stall-tab guard was dead code and the inflation was still real.**
  `goBuildingRoom` early-returns when you re-tap the tab you are on, so the same
  stall never re-patches; the reachable case is *alternating* tabs, where the
  previous vendor is the other stall and the ids never match. A review measured
  a rep at **six** meetings after six taps — past `MEETINGS_FOR_NAME`, so a
  shopkeeper used the player's name with no business done. The rule moved into
  `recordNpcSighting`: **a sighting at the same in-game clock is the same
  visit** — one rule for every caller instead of a guard each new site forgets.
  **(10) Wiring those sites silently regressed OTA-1052.** A sighting advances
  `prevSeenHours`, the anchor the absence line measures against, but only
  `beginScene` had a greeting emitter — so the new sites consumed the anchor and
  said nothing. Greeting block lifted into `emitVendorGreeting`; all four
  non-`beginScene` sites now speak.
  **(11) The amends residue fix only covered full settlement** — a partial clear
  banked up to `600×outstanding − 1`, which then pre-paid the next theft. A
  fresh betrayal now costs you your restitution progress outright.
  **(12) No migration for the 4.28.87 bank**, which was fed from `tcTraded`
  (sales included): a live save can hold `wrongs: 0, amendsTc: 49_400`. The
  save-healing pass now enforces the invariant the live code already maintains.
  **(13) The archetype rows became permanent ghosts** — `roadside:road_hawker`
  and `roadside:sketchy_stall` can never be minted again, so they sit in the
  Chronicle forever, and a `wrongs` on one is a debt that can never be paid.
  Swept by the same pass.
  **(14) Raid records were evicted by the wall clock.** The patrol sim runs
  every ~6 real seconds regardless of in-game time; 60 idle ticks overflowed the
  12-slot buffer, so OTA-1054 was near-inert in exactly the sessions it was
  written for. Deduped on (defender, in-game hour).
  **(15) The Chronicle could print "caught stealing · a debt settled".** Now "an
  old debt settled" while a wrong stands.
  **Tests.** A mutation audit reverted each fix and measured which tests died.
  Four were guarded only by grepping `gameStore.ts` for their own source line
  and one guarded a condition that could not fire; those are behavioural now —
  the ambient stamp is proven to *consume* the monotonic counter, a granted
  contract is proven not to make the next real accept render compact, and buying
  from a vendor you robbed is proven to clear the debt end-to-end. One test that
  was a pure tautology (it passed unchanged under the mutation that deletes the
  feature) was replaced with a partition check that can fail.
  Files: `vendors.ts` + `roadside_traders.json` (the cast), `gameStore.ts`
  (`sightVendor` × 5, `emitVendorGreeting`, merge guard, monotonic counter,
  `granted` burst opt-out, `safeLocName` stamp, faction-accept credit, raid
  dedup), `npcMemory.ts` (same-visit rule, amends, save-healing, `raidNewsLine`
  place name), `types.ts` (`OutpostRaid.locationName`),
  `ota1078LedgerHolesAndNoiseFloor.test.ts` (37) + `ota1076…` (35).

- **RAID NEWS REACHES THE PEOPLE (2026-08-02). BOTH LINES.**
  ⚠ **Correction to the OTA-1053 entry**, which records *"there is no offscreen
  location-raid event in the game at all"*. That was wrong and should have been
  checked before it was written down. The world step has emitted
  `outpost_assault` events since OTA-844/864/867 — a full offscreen war sim that
  raids outposts, culls patrols and moves faction power and relations.
  What was actually missing is far narrower: those events name only **factions**
  and go only to the **World board**. They are never joined to a location the
  player has walked or a person the player knows, and nobody says one out loud.
  Every piece of the join already existed — the assault knows its defender,
  `FACTION_STARTING_LOCATION` maps faction to home ground, and every
  `NpcRelation` carries a `factionId`.
  So this OTA **simulates nothing new**. It keeps the same assault as data
  (`OutpostRaid` on `worldMemory.recentRaids`, capped at `RAID_MEMORY_CAP` = 12)
  and lets the people whose outpost burned mention it next time you walk in.
  ⚠ Records are kept **whole, not sampled**. The board's `FEED_PER_STEP` = 3
  sample exists so the World screen reads as a story rather than a wall; a raid
  trimmed out of the *display* still happened, and the trader whose outpost
  burned should still be able to say so.
  **Gated hard**, because Phase 0 was spent on the noise floor: it must be their
  faction's ground, it must have happened since they last saw you (measured
  against OTA-1052's `prevSeenHours`, so a first meeting never qualifies), and
  they must actually know you — an acquaintance does not confide, and someone
  who caught you stealing tells you nothing. Deterministic: the most recent
  qualifying raid, ties broken on location id. Sits **above** gossip in the
  greeting — what happened to *them* outranks what they heard about somebody
  else.
  **Still not done: the death half.** The vendor-kill path converts the vendor
  into a generic `Enemy` that no longer carries its ledger id, **and** a killed
  vendor currently respawns (there is no dead-NPC list anywhere in the code).
  That needs an identity thread through combat resolution plus an owner decision
  on permadeath — if the player murders the only armourer at their home outpost,
  do they lose that service for good?
  Files: `npcMemory.ts` (`raidNewsFor` / `raidNewsLine` / `RAID_MEMORY_CAP`),
  `types.ts` (`OutpostRaid`, `recentRaids`), `gameStore.ts` (record at the
  assault site, persist, greeting wire), `ota1054RaidNews.test.ts` (18).

- **LEDGER IDENTITY + AMENDS + RELATIONSHIP PRICES (2026-08-02). BOTH LINES.**
  The last Phase 1 residuals. Two were leaks I shipped.
  **(1) Ledger identity was runtime identity.** `pickRoadsideTrader` mints
  `roadside_<demeanor>_<Date.now()>` — a fresh id on **every** spawn — while
  the trader's name and description come from a fixed archetype. One authored
  character, split into unbounded one-encounter strangers. Two consequences,
  both mine: OTA-1073's roadside recognition could never fire for the very
  population it was written for (the relation was new every time), and — worse
  — since OTA-1072 sights every vendor, **each spawn appended a permanent row
  to both `npcsMet` and `npcRelations`**. Neither is capped, both persist, so a
  long save accrued hundreds of dead rows and the Chronicle's people column
  filled with strangers met once.
  FIX: `vendorNpcId` keys roadside traders by **archetype**; the runtime id
  keeps its per-spawn uniqueness because nothing reads past the `roadside_`
  prefix. Plus `pruneSpawnKeyedRelations()` sweeps the rows 4.28.83–4.28.86
  already leaked into live saves — self-healing on vendor arrival, a no-op when
  clean. Those rows are worthless by construction: a spawn-unique key can never
  be seen twice, so none of them holds a relationship that could still matter.
  **(2) `wronged` was a life sentence.** OTA-1072 made it permanent and I
  flagged it as the owner's call. Permanent is wrong — one failed DEX roll shut
  a stall forever, in a game whose steal system exists to be attempted — but
  cheap forgiveness would make theft free. **Amends:** coin spent at that stall
  *after* the theft banks toward it at 600 TC per outstanding wrong, so a second
  theft doubles the bill and a repeat thief digs faster than they fill.
  ⚠ Settled against wrongs **outstanding when the patch arrived**, never one the
  same patch adds — live code never does both at once, but a rule that depends
  on callers behaving is not a rule.
  **(3) Prices move on the relationship.** `regardPriceMult`: trusted 0.90,
  familiar 0.95, wronged 1.25, everything else 1. Deliberately small — standing,
  CHA/rapport, tides and war heat already move prices, and a relationship that
  outswung all of them would be the only lever worth pulling. `regardMult` is
  **optional** on `BuyPriceParts` so every existing caller stays byte-identical,
  and is excluded from `strangerBuyPrice` on purpose: the existing *"you saved
  N TC"* line now reports what being a regular is worth alongside the charm.
  ⚠ **NOT done, and not fudged:** *"an NPC you know is killed / their outpost is
  raided"* from the Phase 1 delta. Raids target the **player** — no offscreen
  location-raid event exists at all — and the vendor-kill path converts the
  vendor into a generic `Enemy` that no longer carries its ledger id. Both need
  new plumbing, not a wire-up. Phase 3 work.
  Files: `npcMemory.ts`, `vendorPricing.ts`, `types.ts`, `gameStore.ts`,
  `ota1053LedgerIdentityAmendsPrices.test.ts` (21).

- **ABSENCE LINE + LEDGER COVERAGE (2026-08-02). BOTH LINES.**
  Three Phase 1 defects; two of them shipped in OTA-1072/1073.
  **(1) The absence line was unreachable.** `recordNpcSighting` overwrites
  `lastSeenHours` with the current clock the moment the player walks in, and
  the greeting is composed **after** that write — so `longAbsence` compared now
  against now and returned false every single time. *"It's been a long stretch
  — I'd started asking after you"* could never appear on device.
  ⚠ **The tests shipped green anyway.** `ota1072NpcMemory.test.ts` hand-built
  relations in which `lastSeenHours` still held the *previous* visit, so it
  asserted the rule while never once exercising the wiring. That is the third
  distinct flavour of the "tests written from the implementation" problem in
  this codebase — the first two guarded **defects**; this one guarded a
  **contract the store does not satisfy**. The new suite drives
  sighting-then-greet in the real order.
  FIX in the **data**, not the call order: `prevSeenHours` carries the previous
  visit's clock forward, so the greeting can be composed before, after, or
  nowhere near the sighting and still be right.
  **(2) Every first meeting was double-counted** — shipped in OTA-1072, found
  by a 1075 test. `recordNpcMet` ran **before** `recordNpcSighting`, so on a
  save with no `npcRelations` yet the sighting's own `seedRelationsFromMet`
  swept up the row that had just been appended, manufactured a relation at
  `meetings: 1`, and the sighting incremented it to 2. A first-ever arrival
  read as a **second** meeting — and OTA-1073's `seenBefore = meetings >= 2`
  turned that into greeting a total stranger as a returning face. Seeding
  before the append makes the inner seed a no-op.
  **(3) Only vendors were on the ledger.** Of the three `recordNpcMet` sites,
  OTA-1072 paired only the vendor arrival; both Core Guardian sites recorded
  the milestone row and nothing else, so a Guardian appeared in the Chronicle's
  people column with a blank where its regard should be.
  FIX: `rememberNpcMeeting()` is now the **one** way to record meeting somebody
  and `gameStore` no longer imports `recordNpcMet` at all. Two calls at one
  site is a pattern the next person to add an NPC will half-copy; one call
  cannot be half-copied. A test asserts the store contains no unpaired
  `recordNpcMet`, so the gap cannot reopen.
  Files: `npcMemory.ts` (prevSeenHours, longAbsence, rememberNpcMeeting),
  `types.ts` (`prevSeenHours`), `gameStore.ts` (3 sites through the helper),
  `ota1052AbsenceAndCoverage.test.ts` (12).

- **ARBITER COOLDOWN DISCIPLINE + STORY BEATS (2026-08-02). BOTH LINES.**
  Phase 0 items 3 and 4, both root-caused before any code moved.
  **(3) Interjections that don't follow from the last action.** ROOT CAUSE:
  every guard on the ambient path runs at generation **start** — no combat, not
  in the tutorial, cooldown expired — and **none** run at emit. On device a
  musing takes 14–20s (owner's 4.28.79 log: `arbiter: ambient ✓ 14080ms`), by
  which time the player has crossed a room or opened a fight. The line was
  composed for a moment that no longer exists. ⚠ This was **deliberate** — the
  `arb163` comment says ambient asides *"can run to completion in the background
  and speak whenever ready"*. The **reactive** path (`narrateViaArbiter`)
  already carries the discipline this one lacks (`arbiterGenerationEpoch`,
  checked as *"cancelled mid-flight"*); ambient was exempted from it.
  FIX: `takeAmbientStamp()` at t0 (location / room / micro-micro / in-combat /
  log length) and `ambientStaleReason()` immediately before the line speaks.
  Drops on `combat-started`, `moved-location`, `moved-room`, `moved-scene`,
  `log-moved-on` (> 12 player-visible lines). The reason rides the **existing**
  `arbiter: ambient …` debug marker, so a pasted log shows the drop and its
  cause the way OTA-1057 surfaced the ∅ reasons.
  ⚠ Deliberately **not** the epoch: every reactive generation bumps that
  counter, so gating ambient on it would discard nearly every musing and
  silently undo OTA-1054 — the OTA that finally got ambient working at all.
  **(4) Story beats read as loot chatter.** ROOT CAUSE: there is no notion of
  "story" in the log at all. A main-quest phase turn, the 3-Core twist, the
  4-Core forge unlock and every motive-drip beat call `appendLog('arbiter', …)`
  — the same channel, colour and chip the Arbiter uses to shrug about your
  stamina. FIX: a `storyBeat` **meta flag** (`STORY_BEAT_META`), not a new
  `LogChannel` — a channel drives TTS routing, `HIDDEN_CHANNELS` and the
  copy-all export, and none of that should change; only the look should. The
  flag rides the same meta bag as `combatOutcome`. `AdventureFeed` gives a
  flagged entry a gold rule, a `STORY` chip and its own air.
  Six sites marked: phase narration, descent, 3-Core twist, 4-Core forge,
  motive drip, The Missing's resolution. Contract stage narration is
  deliberately **not** marked — it already has the MISSION chip and the
  Contracts card, and if half the feed is a story beat the marker is wallpaper.
  Files: `gameStore.ts` (stamp + staleness + 6 marked sites),
  `AdventureFeed.tsx` (story render branch + styles),
  `ota1051ArbiterCooldownStory.test.ts` (15).

- **NPC MEMORY SLICE 2 (2026-08-02). BOTH LINES.**
  The four things OTA-1072 deliberately deferred.
  **1. Turn-in credit.** Slice 1 counted contracts *taken* but not *finished* —
  the one act most worth remembering (you came back and delivered) moved
  nobody's regard. New `creditTurnIn()` at the five `announceMissionComplete`
  sites. ⚠ Deliberately at the **callers**, not inside the choke point: only
  the caller knows whether the turn-in was face to face, and a *"send word"*
  courier turn-in (OTA-456, faction quests only) can fire while the player
  happens to be standing at some unrelated stall — crediting it would be a lie
  the greeting layer then repeats for the rest of the save.
  **2. Roadside recognition.** Slice 1 re-greeted only *anchor* NPCs — a proxy
  for "someone you come back to" that existed because no ledger did. The ledger
  now says it directly: `meetings >= 2` means *"A figure crests the rise"* is
  the wrong sentence, because they are not new. The sighting for this arrival
  is recorded upstream in `beginScene`, so a genuine first meeting reads
  `meetings === 1` and still gets the arrival line.
  **3. The people column.** Contracts › Milestones › NPCs Met was a roll-call
  (name, role, place). It now reports the **relationship** — regard label plus
  the dealings that earned it — ordered worst-regard first, because the person
  who watches your hands is the one you most need to see. It reads the same
  ledger the greeting layer does, so the Chronicle and the world cannot
  disagree about who knows you. Anyone with no relation still shows, with no
  claim made about a history there is no record of.
  **4. Gossip.** A faction-mate mentions someone else you've built something
  with. Both ends must be familiar-or-better, same faction, and it fires only
  every `GOSSIP_EVERY`-th (4th) visit — deterministic cadence off the meeting
  count. Phase 0 was spent cutting the noise floor; a line that fired on every
  arrival would put it straight back.
  ⚠ **Ladder fix found by a slice-2 test:** `contractsTaken` earned the
  player's *name* in slice 1 but no *regard*, so someone who had handed you
  work ranked below someone you'd merely walked past three times. It now sits
  on the `known` rung. The ladder was wrong, not the test.
  Files: `npcMemory.ts` (REGARD_LABEL, dealingsSummary, knownPeople,
  gossipSubject/gossipLine), `gameStore.ts` (creditTurnIn ×5, return-visit
  gate, gossip), `ContractsScreen.tsx` (people column),
  `ota1050NpcMemorySlice2.test.ts` (18).

- **NPCs REMEMBER YOU (2026-08-02). BOTH LINES.**
  Phase 1, slice 1 of the immersion build plan. **The gap:** `recordNpcMet` is
  idempotent on `id` — the second meeting with an NPC returns the memory object
  unchanged — so the only question the game could answer about a person was
  *have you ever stood in a room with them*. That is a checklist, not a
  relationship. The only thing that varied a vendor's greeting was the player's
  standing with their **faction**, a number shared with hundreds of strangers,
  which cannot tell a shopkeeper whether you ever bought anything from **them**.
  One greeting line literally read *"the kind of nod that knows your name"* and
  then did not say the name.
  **New:** `app/engine/npcMemory.ts` — a per-person ledger (meetings, trades,
  TC across the table, contracts taken/turned in, wrongs, first/last seen) on
  `worldMemory.npcRelations`, keyed by the same id as `npcsMet`.
  **Determinism is the feature, not an implementation detail.** Owner: *"make
  it deterministic per NPC."* `arbiterAddress` names the player on a ~60%
  per-line coin flip (OTA-635) and that works because the Arbiter is one
  continuous voice; applied per NPC it reads as a fault — a shopkeeper who uses
  your name, then doesn't, then does, has a head injury. So **both** axes are
  pure functions of stored state: whether they know your name, and which
  greeting variant they use (indexed off the meeting count, never rolled — so
  successive visits still read differently while any single state replays
  identically).
  **The name is earned:** one trade, one contract, one caught theft, or three
  visits. A stranger gets *"traveler"*. ⚠ The wrong counts deliberately — the
  person you stole from learns your name faster than the one you bought bread
  from. The regard ladder (`stranger / met / known / familiar / trusted /
  wronged`) is monotone in custom, and `wronged` outranks everything: 99,999 TC
  of business does not offset a knife at the stall.
  **Wired:** sighting at the vendor-arrival site (`recordNpcMet` stays
  idempotent alongside it — the milestone list is a list of *people*), buys,
  sells, contract accepts, and the **CAUGHT** branch of theft only. A theft
  they never noticed cannot change how they greet you: the ledger records what
  the NPC *knows*, not what the player did. A bulk buy/sell is ONE piece of
  business, not one per unit — counting units would let a single stack purchase
  vault a stranger to *trusted*.
  **Migration:** `seedRelationsFromMet()` promotes pre-OTA saves on first
  touch, so a player forty hours in is not demoted to a stranger by an update.
  **Not in this slice** (slice 2): turn-in credit, roadside/non-anchor traders,
  the Chronicle people column, NPC-to-NPC gossip.
  Files: `npcMemory.ts` (new), `types.ts` (`NpcRelation` + `npcRelations`),
  `gameStore.ts` (sighting, greeting, buy/sell/theft/accept),
  `ota1049NpcMemory.test.ts` (30) + `ota1049NpcLedgerWiring.test.ts` (5).

- **ACCEPT-BURST COMPACTION (2026-08-02). BOTH LINES.**
  Phase 0, item 1 of the immersion build plan: clear the noise floor. From the
  owner's 4.28.79 log — thirteen hunts accepted at one board inside fifty-six
  seconds, roughly **sixty-five lines** of board copy. Each accept spent up to
  five: poster text, stage narration, an Arbiter line naming the destination,
  the two-sentence *"(paused — you're already on another contract)"* notice,
  and the difficulty warning. That last one — *"This one will kill you as you
  are right now…"* — fired **thirteen times**, and per-message dedup could
  never have caught it because the HP numbers interpolated into it differ per
  hunt.
  The fix is not a shorter message. The first accept of a burst is worth
  narrating and the twelfth is not — by then the player has stopped reading and
  is collecting. So **#1 of a burst is unchanged** and **#2 onward collapse to
  one line**: title, destination, and a `(parked)` marker where the
  two-sentence notice used to be. Nothing is lost — poster text, stage
  narration and the full recommended-HP numbers all live on the Contracts card,
  which is where someone reviewing thirteen commitments actually looks.
  The burst boundary is the **existing** `BURST_WINDOW_MS` (5s of silence) that
  `bumpQuestsAccepted` already used to throttle its own meta-nag, reused rather
  than reinvented so the compaction and the Arbiter's *"you're stacking
  promises"* agree about what a burst is. `acceptIsCompact()` is a pure **peek**
  — all six accept paths (faction quest, faction hunt/mystery/storyline, and
  the two neutral fallbacks) read it **before** their own `bumpQuestsAccepted`
  call, so the value is the index of the accept in hand rather than the next
  one's. ⚠ Getting that order wrong makes the FIRST accept read as compact.
  ⚠ The parked notice became a parked marker, so OTA-995/972's accept-unify
  test was retargeted from counting the old sentence to asserting `(parked)` on
  the accept line — that test's real subject is the `tracked === false`
  assertions above it, which are untouched.
  Files: `gameStore.ts` (helpers + six paths), `ota1048AcceptBurst.test.ts` (5).

- **THE LAST THREE FREE TITLES (2026-08-02). BOTH LINES.**
  OTA-1046 raised the storm family and flagged three more. Owner: *"fix the other
  three."* Each was checked against its own canon requirement in
  `arbiter-titles.json`, and in all three the code was not testing what the
  canon asks for.
  - **`scion_of_the_giants`** — canon *"PROVE direct descent from the Tartarian
    Giants."* Code was `raceId === 'tartarian_giant' && a Giant-respecting
    faction`: the DESCENT half only, and both values are chosen at CHARACTER
    CREATION, so the title landed before the player had taken a single action.
    Descent is now the prerequisite; **standing ≥ 25 with a Giant-respecting
    faction is the proof**. 25 is the codebase's existing "they really like
    you" tier (`gameStore` ~8081) rather than a number invented for this.
  - **`golem_whisperer`** — canon *"Successfully CONTROL an Aether Golem."*
    Code was `!!player.golem`. A golem standing beside you is not control. New
    `golemStrikesLanded` counter, incremented at the golem's own hit site;
    **15 landed strikes**.
    - ⚠ **Deliberately NOT also gated on a live golem.** The title records what
      you did; it must not blink out the moment a construct falls.
  - **`architects_eye`** — canon *"Repair or restore a piece of ancient
    Tartarian architecture."* Was ONE repair. Now **ten** — a body of work.
  - **The blank-slate test is now total.** OTA-1046's "nothing earnable from a
    blank slate" assertion had to exclude these three; with them fixed the
    exclusion list is empty and the check covers the whole table. That is the
    strongest form of the owner's rule and the thing to keep green.
  - ⚠ **`titles.test.ts` asserted all three old behaviours** and was retargeted.
    That makes THREE tests today found guarding a defect rather than an intent
    — `dogOnboardingFuzz` pinned the three-name dog pool, `titles.test.ts`
    pinned storm-threshold 1, and now this. Tests written from the
    implementation lock in whatever the code happened to do that day. Worth
    watching for across the rest of the suite.

- **TITLES TAKE EFFORT — no more legends from the tutorial (2026-08-02). BOTH LINES.**
  Owner: *"you shouldn't be able to earn titles in the tutorial. what titles are
  so easy to get that you earn them in the tutorial? they should take effort."*
  - **The answer to the question**, straight from the award table:
    `etherbound_survivor` = `stormsSurvived >= 1`; `aetheric_attuned` =
    `stormsSurvived >= 1 || maxCorruption >= 5`; `stormcaller` =
    `stormsSurvivedWithCompanion >= 1`. And `stormsSurvived` incremented on ANY
    tick of Etheric weather, decorative ones included. One line of black rain
    in the tutorial room paid out two titles a millisecond apart.
  - **Fix 1 — the tutorial feeds nothing.** `recordTitleProgress` returns early
    while the tutorial is running and unskipped. Progress is not merely
    un-awarded, it is NOT RECORDED: banking counters through a scripted sandbox
    and collecting the instant the tutorial ends reads exactly as unearned.
  - **Fix 2 — a tick must bite.** Counts only when `wtick.hpDelta < 0` or
    `wtick.corruptionDelta > 0`. ⚠ Measured on the RAW delta, not the
    post-resist one, so owning the Aetheric resist perk can't stall progress
    toward Stormcaller.
  - **Fix 3 — real numbers.** `STORM_TICKS_FOR_SURVIVOR` 12,
    `STORM_TICKS_FOR_STORMCALLER` 10, `STORM_TICKS_FOR_ATTUNED` 20 (highest of
    the three because its perk halves ALL Aetheric damage, in combat and from
    weather), and `CORRUPTION_FOR_ATTUNED` 5 → 15. ⚠ Raising the count branch
    without raising the `||` corruption branch would have achieved nothing.
  - ⚠ **STILL CHEAP, DELIBERATELY NOT CHANGED — owner's call.** Flagged rather
    than silently redesigned, because each is arguably an identity payoff
    rather than an achievement:
      - `scion_of_the_giants` — pure race + faction check. Earned at CHARACTER
        CREATION with zero gameplay. By the owner's standard this is the worst
        offender in the table.
      - `golem_whisperer` — `!!player.golem`. Summon once, hold the title.
      - `architects_eye` — one repair.
    If "titles should take effort" applies to these too, say so and they get
    the same treatment.
  - A test asserts NO title fires on an all-zero progress record (excluding the
    three sheet-gated ones above), so a future threshold-1 title can't slip in.

- **MIXED-PACK ANNOUNCE — "2 SCRAP DRONES", THEN A MUD WASP (2026-08-02). BOTH LINES.**
  Owner log 4.28.75 @ 23:41:56. Root-caused before fixing, at the owner's ask.
  - **The line.** `gameStore` announced
    `${n} ${enemies[0].name}s close on you` — true only for a homogeneous
    party.
  - **That invariant was real when it was written.** `pickGroupForLocation`
    was the only multi-enemy source and it spawns `count` copies of ONE
    prototype, so pluralising member 0 was correct.
  - ⚠ **Two later features broke it and neither revisited the announcer.**
    OTA-808 (menace pressure) appends an independent ladder pick. OTA-817
    (mixed-role packs) appends members that are *guaranteed* to differ —
    `rollExtraPackMembers` filters the pool by `usedNames` and prefers an
    unused `type`. Every pack OTA-817 produces is heterogeneous by design, so
    the announcer was not occasionally wrong on those — it was always wrong.
  - ⚠ **The narration path explicitly delegated this job to that line.**
    `gameStore` ~7623: narration names only the first enemy as "the scene
    representative" because "the full group is surfaced via the EnemyPanel +
    a follow-up line when it's actually a pack." The announcer IS that
    follow-up line. Nothing else was ever going to name the second enemy.
  - **Fix:** `grammar.ts` gains `pluralizeNoun` + `describeEnemyParty` /
    `describeEnemyPartyCap` — groups by name, keeps first-seen order so the
    lead matches the enemy the paragraph already named, counts duplicates,
    joins with correct articles and a serial comma. Homogeneous output is
    unchanged ("3 Mudlings close on you").
  - **Swept, no change needed:** `EnemyPanel` FlatLists every member (its
    single-card branch is gated on `length === 1`); `ExplorationScreen`
    guards `length === 1`; `talkDown`'s `enemies[0]` is a deliberate
    spokesperson, not a whole-party claim.
  - **The lesson worth keeping:** this is a display invariant silently
    invalidated by a gameplay feature. When a future change makes encounters
    more varied, grep the announcers before shipping it.

- **THE GOLEM CARD BROUGHT IN LINE (2026-08-01). BOTH LINES.**
  `GolemNamingModal` carried all three of the faults the owner reported
  against the dog card. Found by reading the file rather than waiting for a
  second device report — the owner should not have to report the same defect
  twice because it lives in two components.
  - **Instant render.** It opened the moment `pendingGolemNaming` flipped —
    the same tick that logs *"Aetherstone lifts out of the ground… (HP x/y,
    NdM type)"*. That summon line is the ONLY place the golem's stats are
    stated, and the card covered it. Now holds for any live
    `missionCompleteNotice`, then `GOLEM_CARD_DWELL_MS` (2500ms).
  - ⚠ **The golem dwell is deliberately SHORTER than the dog card's 4s.** A
    summon is player-initiated and the line is one sentence; a rescue lands on
    top of a fight result the player is still assembling. Don't unify them.
  - **Same cold palette** → restyled to `MissionCompleteModal`.
  - **No ROLL button at all**, while its sibling has one. Added, backed by
    `app/data/golems/golem-names.json` — 50 names, its own shuffle bag, and
    the tail-side refill guard (the dog version shipped that backwards on the
    first cut and only the test caught it).
  - The golem register is deliberately unlike the dog list: a dog is an animal
    you name, a golem is a thing you MADE and are sealing a name into the
    Aetherstone of. A test pins the two pools apart so they can't drift into
    each other.
  - **Both naming cards are now consistent.** If a third naming beat is ever
    added, copy this pair — dwell + notice-gate, house palette, shuffle-bag
    ROLL — rather than starting from the original cold template.

- **THE DOG CARD: TIMING, PALETTE, NAME POOL (2026-08-01). BOTH LINES.**
  Three owner reports against `DogOnboardingModal`, all correct.
  - **Fired too fast.** *"I hadn't seen the results of the fight and that I had
    won before that popped on the screen."* `completeRescueScenario` sets
    `pendingDogOnboarding` inside `resolveEnemyDefeat` — the SAME tick that
    appends the victory lines — and the modal rendered on `pending` alone. It
    now holds while any `missionCompleteNotice` is up, then waits
    `DOG_CARD_DWELL_MS` (4s) with the screen clear. The dwell restarts from
    when the competing card is dismissed, not from the kill.
  - **Wrong palette.** The card was cold — `#8aa0a4` labels, `#3a4448`
    borders, a near-opaque `#040608` backdrop, full-bleed with no card body —
    while every other popup is a BOUNDED warm card: `#17150f` body, `#c9a86a`
    gold border and accents, `#f0e6cc` title, on translucent
    `rgba(0,0,0,0.78)`. Restyled to `MissionCompleteModal`, the house
    reference. The translucent backdrop also keeps the fight result visible
    behind the card, which reinforces the timing fix.
  - **Three names.** `defaultDogName` drew from `['Rust','Cinder','Marrow']`
    WITH REPLACEMENT, so fifteen taps could never produce more than three
    distinct names. Now 50 authored names in `app/data/dogs/dog-names.json`,
    handed out from a Fisher-Yates shuffle bag — consecutive taps cannot repeat
    until the bag empties.
  - ⚠ **The refill guard must look at the TAIL of the bag.** Names are taken
    with `pop()`. The first cut guarded `next[0]`, which is the wrong end, and
    a double-tap repeat went straight through the seam. The test caught it;
    review did not.
  - ⚠ **`GolemNamingModal` is the sibling and was NOT touched.** It very likely
    carries the same cold palette and the same instant-render timing. Not
    changed here because the owner reported the dog card specifically and no
    device evidence exists for the golem one — check it before the next
    naming beat ships.

- **THE TUTORIAL VOICE RAN A BEAT BEHIND (2026-08-01). BOTH LINES.**
  Owner on 4.28.75: *"I hear 'you'll want a weapon' while I'm already typing in
  take the rope."*
  - **Why it compounds.** Every beat appends TWO arbiter lines — an
    acknowledgement of the action just taken, then the next instruction — and a
    player clears a beat in a couple of seconds. On-device Kokoro synthesis is
    slower than that, so the queue gains entries faster than it drains. The lag
    is not constant; it grows with every beat.
  - Beat instructions now carry `meta.supersede`. The controller answers it
    with `clearQueueKeepCurrent()` + `speak(front: true)`.
  - ⚠ **`clearQueueKeepCurrent`, NOT `stopAndClear`.** stopAndClear would clip
    a word mid-syllable and would race `piperStopAndClear`'s async expo-av
    teardown against the new utterance — the same class of unhandled rejection
    that once crashed Android to the home screen on SILENCE ARBITER.
  - Useful side effect: when the voice is NOT behind, the acknowledgement is
    already `currentlySpeaking` rather than queued, so it survives and the
    instruction follows it. The acknowledgement is only dropped when audio is
    genuinely lagging — exactly when it should be.
  - `clearQueueKeepCurrent` had shipped in TTSManager but was never called from
    anywhere. Its own comment describes this exact problem ("so the player
    isn't 30 seconds behind the visible scene"). Now wired. A test asserts it
    still exists so it isn't reaped as dead code.
  - **Scoped to tutorial beats on purpose.** Ordinary narration must NOT
    supersede — a player wants to hear the combat lines they queued up, not
    have them dropped. If the same lag shows up outside the tutorial, the fix
    is a queue cap or a scene-transition flush, not blanket superseding.

- **OTA TEARDOWN RUNS CONCURRENTLY (2026-08-01). BOTH LINES.**
  The four native disposes before `reloadAsync` ran in SERIES, each behind its
  own 3-second deadline (OTA-243). Worst case is 12 seconds of a screen that
  shows a static *"Releasing resources…"* and nothing else.
  - ⚠ **This is the leading suspect for the FabricUIManager NPE.** The owner's
    hypothesis was right: hung update -> player taps -> crash -> second update.
    A touch dispatched into that window hits a surface teardown has already
    destroyed (`SurfaceMountingManager` null), and it lands BEFORE
    `reloadAsync` commits -- which is exactly why the update appeared to run
    a second time.
  - expo-av, ONNX Runtime, llama.rn and executorch are independent subsystems
    with no teardown ordering between them, so they race their deadlines
    concurrently via `Promise.all`. ~12s -> ~3s.
  - `stopTTSController` + `stopTTS` are hoisted ahead of the group (both
    synchronous) so the expo-av Sound `playPcm` created is released before
    audio teardown begins.
  - `Promise.all` is safe here because `disposeWithDeadline` catches its own
    rejection and resolves null -- no member can reject the whole set.
  - `disposeWithDeadline` now clears its deadline timer when the dispose wins;
    four handles previously stayed armed for the full 3s.
  - **AUDIT, no change needed:** swept all 17 `gameStore` enemy-spawn sites for
    the OTA-1063 `range: null` defect. Every one already sets `range`. The
    elevated overlay was the only gap and OTA-1063 closed it.
  - **NOT a bug (withdrawn):** the dog's hits logging on the `reward` channel
    while misses log on `combat` is OTA-146, deliberate, from playtester
    feedback ("Rockey's hits are red, they should be green"). Left alone.

- **THE TUTORIAL CLIMB SOFTLOCK (2026-08-01). BOTH LINES.**
  Owner device report on 4.28.73: topped out the tutorial climb, the summit
  overlay spawned an Aetheric Raven, and every input answered *"Not yet — do
  what I've asked of you."* Two defects stacked into a genuine softlock.
  - **The lockdown outranked a live enemy.** arb108's typed-input lockdown
    accepts only the current beat's verb. At the `climb` beat that is `climb`.
    With a hostile on the board the player could not attack, flee, sneak, or
    use an item — the only accepted escape was `climb down`, and nothing told
    them it existed. Fixed: `TUTORIAL_SELF_DEFENCE` (tutorialSteps.ts) always
    passes while `currentScene.enemies` is non-empty. World verbs (fuse,
    craft, travel, rest) still hold, so the tutorial can't be exited sideways.
  - **The refusal was dead text.** "Do what I've asked of you" is unusable
    once the instruction scrolls off the feed. Every lockdown-gated beat now
    carries a `remind` clause the refusal interpolates: *"Not yet — finish the
    climb — climb again to go higher, or climb down to come back."*
  - **Root cause of the spawn:** `rollElevatedOverlay` had no tutorial guard.
    Suppressed for the whole tutorial now — the scripted beat says "top out,
    then climb back down", and a hostile there is a trap, not a lesson.
  - ⚠ **The overlay scene never set `range`.** It inherited the base scene's,
    which is `null` on a peaceful room (gameStore ~6685 sets `'mid'` only when
    the scene is BUILT with enemies). Null was then coalesced to `'close'` by
    the attack gate and `'mid'` by the move handler — two subsystems
    disagreeing about the same fight. Now set explicitly. This affected every
    summit-overlay encounter in the game, not just the tutorial.
  - ⚠ **No ranged weapon is granted, deliberately.** The owner's read was that
    they were stuck for lack of a ranged option. The raven carries no airborne
    trait and range resolved to `'close'`, so the starting cudgel could reach
    it. Adding a tutorial rifle would have changed the intended loadout to
    treat a symptom that wasn't the cause.

- **THE AMBIENT FILTER FAILS OPEN (2026-07-31). BOTH LINES.**
  golem **1039** / HAL **1062**. The OTA-1034 instrumentation paid for itself on the owner's
  very next session (build 4.28.72), naming in one line what four builds of reasoning could not:
  ```
  arbiter: ambient ∅ 30603ms
  arbiter: ambient-empty reason=action-opener
  raw="You, my companion, have traveled far and wide, but the distance
       between you and the ancient city you once called home ha…"
  ```
  The model was producing EXACTLY the reflective companion line ambient exists for. It was
  being destroyed by the filter OTA-1031 added to save it.
  ⚠ ROOT CAUSE IS THE FILTER'S **SHAPE**, NOT ITS CONTENTS — read this before touching it.
  `REFLECTIVE_YOU_OPENER` was a **whitelist**: it enumerated known reflective openers and
  dropped everything else beginning with "You". It required `you\s+have` (literal
  whitespace); the model wrote `"You, my companion, have"`. One appositive, one comma where
  the regex wanted a space, and the whole feature produced nothing across four builds.
  That is **fail-closed**. Teaching it about appositives would have fixed this sentence and
  left the next unanticipated phrasing to die exactly the same way.
  The rule is now INVERTED. `SCENE_ACTION_OPENER` names the BAD opener — a present-tense
  physical action ("You step back", "You reach for the lid") — and everything else passes.
  **Fail open.** The asymmetry is the argument: a scene line slipping through costs one odd
  sentence; a reflection wrongly blocked costs the entire feature.
  ⚠ DO NOT ADD AMBIGUOUS VERBS to `SCENE_ACTION_OPENER`. take / drop / strike / run / rise /
  stop are deliberately absent — "You drop your guard less often now" is reflection and
  "You drop your pack" is scene. Adding a verb here can silence a real line; when in doubt,
  let the companion speak.
  All six OTA-1031 tests pass unchanged, so the original contract still holds. The
  `reason=` instrumentation STAYS — if something else starts eating lines, it names that too.
  Locked by ota1039/1062AmbientFailOpen (6 tests per line), including the verbatim string
  from the device log and a fail-open case with five reflective phrasings that were never in
  the whitelist and would each have been destroyed silently.
  WATCH: no ambient line has still ever reached a player. The next peaceful wander on
  4.28.73 is the real test — look for `arbiter: ambient ✓`.

- **THE CRAFT LIST SAYS WHICH SLOT (2026-07-31). BOTH LINES.**
  golem **1038** / HAL **1061**. Owner: "under the craft tab for armor, it needs to list
  what slot its for. some of the names don't explain it. it took me a few minutes to find
  something in the hand slot."
  The catalog knew all along — `previewArmor` has built `kindLabel: "Hands Armor"` since it
  was written — but the craft row only ever rendered the STATS line, so the slot never
  reached the screen. Measured, guessing from the name fails often: of the 90 distinct
  nouns armor names end in, **17 are used by more than one slot**. "Greaves" is legs AND
  feet; "mantle", "vest", "jacket" and "coat" are each split between chest and cloak;
  "cloak" itself appears on chest pieces. A test asserts that ambiguity, so the label can
  only become redundant by a deliberate rename rather than by accident.
  TWO HALVES, because the owner's sentence has two. LABELLING fixes reading it: every
  armor row gets a "HANDS SLOT" line above the stats, spaced-caps grey so it reads as a
  label rather than another stat and the eye can run the column without reading names.
  SEARCH fixes FINDING it: typing "hands" narrows 293 armor pieces to the 41 you can wear
  there. The name match is untouched — the slot is an ADDITION to the filter, not a swap.
  ⚠ PLUMBING NOTE: `ItemPreview` gains `slot?: string`. The slot was already present, but
  only as PROSE inside `kindLabel`, so any caller wanting to show or filter by it had to
  parse English back out of a label. Read the field, don't regex the label. Fused pieces
  carry theirs too (`u.armorSlot`) — a fusion re-rolls the numbers, never the slot.
  Locked by ota1038/1061CraftArmorSlot (9 tests per line, incl. a sweep asserting every
  catalogue piece reports its real slot and that non-armor reports none).

- **THE DOUBLE-DIAMOND PAYOFF GETS A CARD (2026-07-31). BOTH LINES.**
  golem **1037** / HAL **1060**. Owner asked whether the ✦✦ items read right on the
  awards popup. The TEXT was fine. The finding was that the one line written that way could
  never reach a popup at all: `assembleBeaconRifle` fires from a USE-ITEM path, nowhere
  near the boss-defeat capture window, so the payoff for all five great climbs — a
  Legendary weapon plus seven Legendary/Rare materials, the end of the entire Skyreacher
  chain — announced itself with a single feed line, exactly the way a mud cloth does. That
  is precisely the failure OTA-1010 was written to prevent ("I didn't even realize I
  completed the mission"), and the doubled ✦✦ was the only thing marking it as bigger.
  It now raises a card of its own: the crack-open narration and the Arbiter's line as
  story, then the rifle and every granted material as the take.
  ⚠ THE FEED LINES ARE UNCHANGED, deliberately — the log stays a complete record, same
  rule as every other announcement since OTA-1010. Anything that greps the log keeps
  working.
  The VICTORY card from 1035/1058 was already the right shape, so it is GENERALIZED rather
  than copied: `raiseSpotlightNotice(heading, title, flavor, rewards)` is the one
  implementation and `raiseBossVictoryNotice` is a three-line delegate passing 'VICTORY'.
  A spotlight already had the behaviour this needed — gold instead of mission green, a
  custom kicker, story above the take, and the merge rule that stops an unrelated job
  completing underneath it from clobbering the card.
  ⚠ USE A SPOTLIGHT FOR A MILESTONE, NOT A PICKUP. A test asserts the rifle is still the
  ONLY line in the store written with ✦✦, so a second double-diamond payout fails the
  build until someone decides whether it deserves a card too.
  Locked by ota1037/1060SpotlightCard (6 tests per line).

- **ONE THING, ONE BULLET ON THE VICTORY CARD (2026-07-31). BOTH LINES.**
  golem **1036** / HAL **1059**. Follow-up to 1035/1058, found by walking the owner's
  Iskan-Veil log line by line against the card that OTA had just built — he asked what that
  kill would actually have shown, and reading the answer surfaced the defect. The Core
  Guardian gear drop is ONE reward line carrying both pieces with a ✦ between them
  (`✦ Veilkeeper Blades taken from X. ✦ Grey Leather of Iskan-Veil taken from X.`), and
  `mergeRewardLines` stripped only a LEADING ✦ — so it landed as a single bullet with a
  stray marker sitting in the middle of it. It now splits ON the marker.
  ⚠ THE `✦✦` FLOURISH IS EMPHASIS, NOT A SEPARATOR — the Beacon Rifle line opens with two.
  Splitting on `/✦+/` and dropping empty pieces keeps it as one entry; a naive split on a
  single `✦` would have turned it into a blank bullet plus the real one. Locked by test.
  Applies to the plain mission notice too — one choke point, one rule. Cosmetic only:
  nothing about what is granted, what is logged, or when the card appears changes.
  Locked by ota1036/1059RewardBullets (5 tests per line).

- **A FACTION SOLDIER IS A PERSON + THE BATTLE FOLLOW-UP IS A CARD (2026-07-31). BOTH LINES.**
  golem **1035** / HAL **1058**. Two owner items off the Asgardar / Iskan-Veil log.
  • **HUMANS DROPPING BEAST LOOT.** Owner: "let's fix the loot drop issue where humans
    drop beast loot." A faction party is BUILT, not authored — `injectFactionParty`
    reskins a roster entry (rename, stamp a factionId) — and outdoors that entry was
    whatever the WILD table rolled for the tile. A "Conspiracy Architects Patrol" could
    be a Mud Cyclops underneath: 202 HP, tinder-dry to fire, swinging a beak, dropping
    Raven Feather and Aether Wing off a man's corpse. OTA-1056 fixed the INDOOR half by
    only ever dressing a human body; that list moved to `app/engine/factionBodies.ts` and
    the outdoor builder now shares it. **The wild roll still decides HOW MANY and at what
    RARITY** — the tile's danger still governs — it just no longer decides what a soldier
    is made of.
    ⚠ DIFFICULTY IS UNMOVED, and the reason matters if you touch this:
    `scaleEncounterForContext` anchors a pack on its MEAN HP against the tile's danger,
    not on the template's authored numbers. What the body actually decides is the loot,
    the resist profile and the attack name. The roster holds six humans and NONE at
    Common, so `pickFactionBody(rarity, { nearest: true })` borrows the cheapest
    (Uncommon) rather than handing the raid back to a beast — a patrol is people at
    every tier by definition. Indoors keeps the strict form (no `nearest`) because there
    a Common-tier intruder really is a rat.
  • **THE BATTLE FOLLOW-UP.** Owner, after a Core Guardian kill: "if the whole giants and
    vigil thing was the player's reasons flavor text it needs to be last so it will be
    read, it gets pushed up screen and missed. it should be a pop-up I think. the battle
    follow up should be, it should have the flavor text, and the rewards on it." A boss
    kill fires eight-plus lines from FIVE modules in one tick — spoils, hard-won material,
    TC, the dying words, the signature gear, the Core, the faction's reaction — and the
    story beat lands in the middle, then gets shoved off screen by the reward lines behind
    it. Reordering five call sites would lose the same argument again next time something
    is added, so instead a capture window opens for the duration of `resolveEnemyDefeat`
    and everything the fight produced goes on ONE card: story first, then THE TAKE.
    ⚠ THE WINDOW IS STRICTLY SYNCHRONOUS, and that is what keeps it clean — the canned
    post-kill Arbiter beat ("Make the next strike count for two") comes from
    `narrateViaArbiter`, an async path that cannot resume until this call stack is gone,
    so it can never land on the card. Anything that arrives LATE has to be pushed on by
    name, which is what the Resurrection Gem does. Bosses only; a rat gets no popup.
    Reuses MissionCompleteModal (gold not green, a VICTORY kicker, a 60s safety valve
    since there is prose to read), and a job finished in the same fight MERGES into the
    card rather than raising a second popup that fights it for the screen.
  Locked by ota1035/1058FactionBodiesVictoryCard (15 tests) + ota1035/1058BossVictoryCardRuntime
  (5 tests, driving a real defeat through the real store — including a check that the
  window SHUT and that an ordinary kill raises nothing).

- **AETHER MUD ON THE SHELF + THE AMBIENT ∅ NAMES ITS CULPRIT (2026-07-31). BOTH LINES.**
  golem **1034** / HAL **1057**. Two items.
  • **MUD SUPPLY.** Owner: "did we work on getting limited amounts of aether mud to named
    vendors for sale". We had not — this is new. A Mud Golem costs 2 Aether Mud per summon
    and NOT ONE vendor stocked it; the only material any named vendor sold was Patched
    Cloth, so foraging was the sole route to a golem. Six named sellers now carry it:
    Halem the Trader (6 TC), Tellin Mak (6), Tarek the Tinkerer (7 — he already sells the
    Golem Controller Ring), Naha (7), Veska of the Hollow (5 — Mud Monarchs), Foreman
    Drest Holloway (6 — Stone Builders). Deliberately spread so no single counter and no
    single faction gates golem fuel.
    ⚠ ONLY VENDORS WITH AUTHORED OFFERS ARE ELIGIBLE. Twelve entries in `vendors.json`
    carry `offers: []` and are stocked dynamically at runtime — an offer added to one of
    those is silently overwritten. Korr Stonefoot and Mara Stoneskin were in the first
    draft of this list for exactly that reason; a test now asserts every mud seller has an
    authored list.
    LIMITED IS ENFORCED, NOT INTENDED: materials otherwise roll 1-10 per visit (five
    golems' worth off one counter), so `SCARCE_STOCK` in `vendors.ts` gives 'aether mud'
    2-5 and is consulted BEFORE the food/material bands. One summon guaranteed, two at
    best. Stock re-rolls per vendor INSTANCE, so the shelf refills between visits without
    ever being deep. Add future scarce items to that table, not to the roll body.
  • **AMBIENT ∅ — A CORRECTION, THEN INSTRUMENTATION.** OTA-1031/1054 claimed the
    ambient companion aside was fixed. It was not: the owner's next log, on build 4.28.66
    which CARRIES that fix, still reads `arbiter: ambient ∅ 55801ms`. Verified along the
    way that `trimToLastSentence` and `clampSentences` both fall back to raw text, so
    neither is the culprit — but the ∅ line has never said which of the five filters ate
    the line, or whether the model returned anything at all, which is precisely why the
    last fix was a guess. The empty path now logs `reason=` (model-returned-nothing /
    cleaners-emptied-it / third-person / they-opener / action-opener / instruction-echo /
    off-canon-entity / near-duplicate-of-recent) plus the raw output's first 120 chars.
    Debug channel ONLY — a test asserts the block cannot append to arbiter or world — and
    generation is untouched. The next pasted log names the filter outright.
  Locked by ota1034/1057MudSupply (12 tests per line), including a shelf check that goes
  through `findVendorByName` for all six sellers rather than the roll helper alone.

- **RAIDERS, SOLDIERS + AETHERKIN INDOORS (2026-07-30). BOTH LINES.**
  golem **1033** / HAL **1056**. Owner asked the indoor cast to cover raiders, soldiers and
  Aetherkin explicitly. Audit result: AETHERKIN already complete — all five roster entries —
  and now locked by a test that READS enemies.json and demands the indoor list equal the
  full `Aetheric Undead` set, so adding one to the roster without listing it fails CI.
  RAIDERS were in at Uncommon only. SOLDIERS were the real gap: the roster holds six humans
  TOTAL and exactly one martial one below Legendary, so a name-list can't carry "a rival
  faction broke in" at every tier. Fixes: (a) Mud Monarch Purifier joins the Rare pool;
  (b) `pickIndoorFactionIntruder()` BUILDS raiders/soldiers by dressing a same-rarity HUMAN
  body in the colours of the faction with the worst (negative) standing — "Mud Monarchs
  Raider", "Stone Builders Soldier". Contrast with the outdoor `injectFactionParty`, which
  reskins whatever the WILD table rolled and can therefore put a soldier's name on a
  cyclops statline (OTA-1038 fixed only the Aetherkin half of that); the indoor builder
  only ever dresses a human. ~50% of indoor ambushes are people now. Common deliberately
  has no faction body — the cheapest human is Uncommon, and a Common-tier intruder in a
  fortified capital is a rat, not a soldier. Locked by ota1033/1056IndoorCastGroups
  (9 tests per line).

- **INDOOR AMBUSH CAST + FASTER QWEN RECOVERY (2026-07-30). BOTH LINES.**
  golem **1032** / HAL **1055**. Two owner asks off the Asgardar log. (a) CAST: a
  rest-ambush drew from the WILDERNESS table wherever you slept — hence a Rare 202-HP Mud
  Cyclops in the Builders' crew bunks, narrated as if it crossed open country. The odds
  were already right (hub rest 8% vs wilds 22%); the cast was wrong. New
  `app/engine/indoorAmbush.ts` holds a rarity-keyed indoor cast — intruders, vermin,
  patrol machines, the Aetherkin sealed in the walls — and the rest handler swaps the pick
  for a SAME-RARITY indoor one under a roof, so difficulty is untouched. Both beats are
  re-voiced indoors ("circled" / "closes the distance" are open-ground images). The roof
  test REUSES the enclosing action scope's `underRoof`, which excludes
  `OPEN_AIR_HUB_ROOMS` — the gate, square and culvert descent stay exposed, so something
  can still walk in off the mud where the outpost opens to the sky. Note the module-level
  `underRoof(s, player)` FUNCTION is shadowed by that local boolean inside
  submitPlayerAction; calling the function there is a type error (it bit this OTA).
  (b) WATCHDOG: the flat 60s poll meant every step of recovery waited a full tick (~2 min
  of canned templates in the log). Now adaptive — `QWEN_WATCHDOG_HEALTHY_MS` 60s vs
  `QWEN_WATCHDOG_RECOVERING_MS` 5s, driven by `runQwenHealthCheck()`'s boolean — plus an
  `AppState` 'active' hook, because dormancy is CAUSED by backgrounding and the app knows
  the instant it returns. Locked by ota1032/1055IndoorAmbushWatchdog (10 tests per line,
  incl. a rarity-parity check and an explicit deny-list for the open-country megafauna).

- **AMBIENT COMPANION REVIVED (2026-07-30). BOTH LINES.** golem **1031** /
  HAL **1054**. Found reading the owner's Asgardar logs, not from a report: every ambient
  generation ends `arbiter: ambient ∅` (75627ms in one log, 26173ms in the next) and never
  once `ambient ✓`, across two builds. It was a CONTRADICTION, not bad luck — the shared
  `VOICE_RULES` order the model *"Sentences must START with \"You\" or \"Your\""*, and the
  ambient filter then dropped every sentence starting with "You". The path discarded its
  own output by construction. And it isn't free: ambient holds the SHARED `isGenerating`
  lock, so up to 75s of guaranteed-discarded work is 75s the REACTIVE Arbiter can't
  narrate in — the `reason=cooldown` templates clustered around those ∅ entries are that.
  Fix: `isSecondPersonActionOpener()` filters on REGISTER instead of the pronoun. An
  action opener ("You step back, surveying the alleyway") is still scene-hallucination and
  still dropped — that's the real failure the filter was written for; a reflection ("You
  have come a long way…", "You've grown harder…") is what ambient exists to produce and
  now survives. The reactive path never had this filter and must never get one — it is
  supposed to narrate actions. Locked by ota1031/1054AmbientRevival (6 tests per line).
  WATCH: no ambient line has EVER shipped to a player, so the first device session on this
  build is the real test of whether the lines read well.

- **PROMPT ECHO LEAK (2026-07-30). BOTH LINES.** golem **1030** / HAL **1053**.
  Owner at Asgardar: a line about having walked beside "the player" a long while appeared
  twice — "it's like someone was talking to the arbitor." It was: that sentence was the
  literal opening of `AMBIENT_INSTRUCTION` in contextInjector, and the model recited its
  brief instead of answering it. THE LEAK PATH IS THE STREAMING TAIL: both narration
  paths mirrored raw model tokens into `partialArbiterText`, which ExplorationScreen
  renders live under "The Arbiter:" — while the output filters, which only ever see the
  FINAL assembled text, correctly dropped the echo to nothing. The log proves it
  (`arbiter: ambient ∅`): a line the feed never recorded but the player still read for
  the whole generation. Fixes: (a) both streams accumulate LOCALLY and stop mirroring the
  moment `looksLikeInstructionEcho()` trips, blanking the tail to a thinking frame;
  (b) the same detector filters the final sentences on both paths; (c) the ambient brief
  is fully imperative now — no complete, narration-shaped second-person sentence for the
  model to copy. IMPORTANT for anyone extending the detector: a bare imperative is NOT a
  tell — the Arbiter really does say "Do not look behind you." and "Speak carefully.", and
  an earlier draft of this guard silently ate all three such authored lines. It matches an
  imperative only when aimed at a CRAFT OBJECT (a sentence, a word count, a register).
  Locked by ota1030/1053PromptEchoLeak (14 tests per line), including a sweep of every
  authored line in the six narration lore files (4,036 strings) asserting zero false
  positives.

- **CAPITAL TIDY-UP (2026-07-30). BOTH LINES.** golem **1029** / HAL **1052**.
  Owner, standing in Asgardar: "it just feels disorganized, like all of the capitals do."
  Three separate causes. (a) THE STAY/LEAVE POPUP: the POLISH-4 vendor-leave gate
  intercepted any cardinal move while a trader was in the scene — and a capital's room
  chips submit `go <dir>`, so every interior hop asked "leave Tarek behind?". The gate is
  removed entirely; vendors are anchored to rooms via hub `anchorNpc`, so walking back in
  finds them unchanged. (b) THE ✕ DIDN'T STICK: the Crucible dismiss was ROOM-keyed
  (arb154), so it popped back next door. Both it and the NEW vendor ✕ are keyed to the
  macro TILE via the exported `chipDismissTileKey(player)`; beginScene clears a dismiss
  whose tile no longer matches, which is what makes "dismissed until you leave the tile
  and come back" literally true. (c) FOUR STACKED BANNERS: trader / board / wanderer /
  Crucible were each full-width, two-line, 44px; they now share one wrapping
  `placeChipRow` two-across at 34px. A BLOCKED Crucible keeps its two-line reason so
  OTA-220's "tell them what's missing" fix survives the squeeze. Locked by
  ota1029/1052CapitalTidy (6 tests per line, incl. a runtime beginScene check that a
  dismiss survives a room hop and clears on a real tile change).

- **MUSIC CROSSFADE + CRUCIBLE UPGRADE LIST (2026-07-30). BOTH LINES.**
  golem **1028** / HAL **1051**. Two owner items. MUSIC: AudioManager transitions are now
  true crossfades (outgoing + incoming ramp in one epoch-guarded loop — the old
  hard-stop-then-fade is gone). Reflective beds (explore/menu) hand over at
  SMOOTH_FADE_MS 2200; entering boss/combat/shop is SHIFT_FADE_MS 450 so the boss and
  market music land as a noticeable shift, and combat tiers always restart from the top.
  The outgoing bed PAUSES IN PLACE (pauseInPlace, never stop) and resumes mid-phrase when
  its context returns within RESUME_WINDOW_MS (4 min) — a fight or market stop no longer
  resets the bed. Pools keep the owner's upload labels (boss-* / the single happy
  shop-quiet-back-alley / reflective rest). UPGRADE LIST: the Crucible upgrade stage-2
  target list is grouped ARMOR & VESTS then WEAPONS, worn pieces sort first and carry an
  amber EQUIPPED badge (dog vests badge ON <dog>) via equippedInstanceIds — same resolver
  as the inventory badge. Locked by ota1028/1051CrossfadeUpgradeList (7 tests per line,
  incl. a mocked expo-av double proving pause-not-stop + no-position-reset resume).

- **DOG + GOLEM NAMING POPUPS / NO SECOND HOOK POPUP (2026-07-30). BOTH LINES.**
  golem **1027** / HAL **1050**. Playtester at the dog rescue typed "rest", read the naming
  beat as another fight, and the in-feed takeover silently stored "rest" as the breed. The
  typed takeovers are GONE: breed/name/sex commit together from DogOnboardingModal
  (`confirmDogOnboarding` — same OTA-142 preamble-stripping + caps + feed beats; a save
  wedged mid-way through the old flow heals on open, part-answers pre-filled), and golem
  naming commits from GolemNamingModal (`confirmGolemName`: SEAL THE NAME / KEEP ITS
  MAKING). Typed feed input during either ask is never an answer — the Arbiter points at
  the card. Separately (owner): story-hook COMPLETE no longer raises the redundant
  mission-complete popup; the `completionNotice` stash is retired and HookContinueModal's
  completed state spotlights the payout in a boxed YOUR REWARD strip (the feed's ✦ line
  remains the permanent record). Locked by ota1027/1050DogGolemPopups (7 tests per line);
  6 suites per line retargeted off the typed flow (dogBreedParsing, dogOnboardingFuzz,
  dogRescueIntegration, golemCompanion, the MissionComplete category lock, HookCompleteFlow).

- **NARRATION CONTEXT (2026-07-30). BOTH LINES.** golem **1026** / HAL **1049**.
  Owner's log: post-combat crate salvage drew "Don't make me decide which one of you to
  leave breathing" with zero enemies. Two-part root cause: the template picker's mood is
  read from `cognitiveLastResponse` — one action STALE (the fresh classification lands
  after the line prints) — and the AGGRESSION pool is the one mood whose every line
  presupposes a live opponent. `pickMoodPool` now takes `hasLiveEnemy` and refuses the
  AGGRESSION pool without one (other moods read fine ambient; no staleness surgery
  needed). Plus the Aetheric Torch mark line: was one verbatim string per use, leaning on
  "resonance" — now 4 rotating variants, exactly one keeping the word. Locked by
  ota1026/1049NarrationContext (3 tests per line incl. a 300-draw no-menace sweep).

- **PLAYER-FEEDBACK BATCH (2026-07-30). BOTH LINES.** golem **1025** / HAL **1048**.
  Three device-session items: • GUARDIAN DAMAGE now tracks over-level (`monotoneTierDmgBonus`
  in coreGuardians — the missing fourth dimension; HP/AC/attack already scaled). Fresh
  arrivals byte-identical (bonus 0 at over=1); the owner's tier-2 case goes 1d8+4 → 1d8+8;
  cap +9. Running-max staged; ota954/931 monotone suites still green. • The travel/room
  row (InputBox `travelRow`) WRAPS (minWidth 92, font floor 0.55→0.8) instead of shrinking
  a 5-button row unreadable. • RESONANCE hook: weight 5→2, plant pool 2→5 lines. Locked by
  ota1025/1048FeedbackBatch (5 tests per line).

- **FUSION LEGIBILITY (2026-07-30). BOTH LINES.** golem **1024** / HAL **1047**.
  Owner's log told the whole story in two minutes: a CORRECT "too alike" refusal (2 kinds
  reserved), self-corrected spread, then a fee bounce at 11 TC learned from a buried
  system line. Fixes: (1) every forge-reservable inventory row carries its material
  kind(s) — `[organic]`, `[stone · crystal]` — rendered from `fusionMaterialTags`, the
  SAME helper the diversity gate counts (mirror property locked in tests); (2) the vendor
  Crucible button states fee + balance BEFORE the tap — amber "25 TC — you have N" when
  short. (The fusion PICKER already had per-row kind labels + a live kinds meter from
  OTA-679/1007 — the gap was the inventory, where reserving actually happens, and the
  paid button.) Locked by ota1024/1047FusionLegibility (4 tests per line).

- **REPLAY OPENING FINDABLE (2026-07-30). BOTH LINES.** golem **1023** / HAL **1046**.
  Owner: "I went to settings and about and there was no replay opening." Root cause: About's
  only real entry is the TITLE screen (no live player), so OTA-1018's player-gated button
  never rendered on the path players take. Fix per owner's placement: the button lives in
  the CharacterScreen HEADER row (BACK | CHARACTER | REPLAY OPENING); StoryIntroOverlay
  moved from ExplorationScreen to App.tsx's GLOBAL overlay stack so the crawl plays over
  any screen (replay no longer navigates); About's dead button removed. Source locks in
  the 1018/1041 suite retargeted (global mount + CharacterScreen button).

- **ONE-TIME VETERAN MOTIVE PICKER (2026-07-30). BOTH LINES.**
  golem **1022** / HAL **1045**. Owner: "let's do the one time motive picker" — pre-story
  saves had their motive DEALT by backfill (deterministic guess, never a choice). New
  `player.storyMotiveChosen` flag: creation sets TRUE always (explicit pick or rolled
  fallback — a sim that smashed BEGIN "chose"); backfill's dealing sets FALSE. Both load
  paths (`loadSlotIntoGame` + `resurrectSlot`) raise `motivePickerPending` for un-chosen
  saves → full-screen `MotivePickerModal` (global mount): five motive cards, the dealt one
  tagged THE MUD'S GUESS, CONFIRM commits via `confirmMotivePick` (validates the id, falls
  back to the dealt motive on garbage, marks CHOSEN, persists, Arbiter ack in the feed).
  Android back = confirm current selection — the one-time ask can never wedge the save.
  Asked once ever; drip beats seen under the old motive keep their ids (motive-prefixed, no
  collision) and the new motive's thread starts from its first beat. Locked by
  `__tests__/ota1022MotivePicker.test.ts` (7 tests incl. a full save→load→pick→reload
  round trip through real slots).

- **THE MOTIVE DRIP — STORY FEATURE PHASE 3 OF 3, ARC COMPLETE (2026-07-29). GOLEM-ONLY.**
  golem **1021** — ✔ PROMOTED TO HAL as **OTA-1044** on 2026-07-30 (owner: "push all of
  this to HAL"); the golem-only divergence is CLOSED, both lines now carry the identical
  story arc. NOTE the OTA-TAG SKEW inside otherwise-identical code: HAL comments/tests say
  1041-1044 where golem's say 1018-1021 — expected, do not "fix" by clobbering either
  side on a sync. Owner: "we need to keep updating the
  player as they play." With this, the full story stack is: crawl (1018) → tutorial hold
  (1019) → chapter cards + epilogues (1020) → drip + The Missing's ending (1021).
  • **THE DRIP** — five authored beats per motive (25 total), delivered on TRAVEL ARRIVALS
    via `advanceStoryDrip` (called in travelTo after triggerMainQuest). Strict order,
    one-shot each (`player.storyBeatsSeen`), gated per-beat on hoursElapsed (6/16/30/48/70)
    and coresRecovered (0/0/1/2/3). At most ONE story event per arrival; holds while the
    tutorial/crawl runs, while a chapter card is up, or when the arrival scene is hostile —
    a held beat just waits for the next arrival.
  • **THE MISSING'S TRAIL ENDS** — motive 'missing' only: once all five trail beats are
    seen and 3+ Cores carried, the next Lost Capital arrival answers "the grave, the lie,
    or the thing that walks" — dealt deterministically from the character seed
    (`missingResolutionFor`), person named by `missingPersonName` (stable per character).
    GRAVE/LIE: 3 arrival paragraphs + guaranteed keepsake (Weathered Locket / Unsent
    Letter) + `player.missingResolved` set on the spot. WALKER: a Hollowed boss wearing
    their face spawns into the arrival scene (same scene shape as revenant events; carries
    REVENANT_TRAIT so mercy rules apply and every activeRevenant-dependent block no-ops) —
    the KILL PATH hook (isMissingWalker) grants the closing beats + Mud-Kept Locket and
    marks resolved THERE, so a fled fight re-offers the walker at the next Capital instead
    of losing the ending. KO-strip does not resolve (deliberate — the mercy is the kill).
  • **EPILOGUE OVERRIDE** — a resolved thread replaces the standard 'missing' EndingScreen
    epilogue (which assumes the question is open) with the resolution's own closing
    (`missingResolvedEpilogue`).
  • Locked by `__tests__/ota1021MotiveDrip.test.ts` (10 tests incl. real travel-arrival
    delivery and a real Capital-arrival resolution through the store).

- **CHAPTER CARDS — STORY FEATURE PHASE 2 OF 3 (2026-07-29). GOLEM-ONLY.**
  golem **1020** — ✔ PROMOTED TO HAL as **OTA-1043** on 2026-07-30 (formerly: do NOT port, do
  NOT let a HAL→golem sync clobber app/data/story/chapters.json, app/engine/chapters.ts,
  app/components/ChapterCardOverlay.tsx, or the wiring in gameStore / App.tsx /
  EndingScreen). Owner: "we need to keep updating the player as they play."
  • **FOUR CARDS**, one per main-quest phase transition, raised at the single
    `triggerMainQuest` choke point (`nextState.phase !== prevState.phase` →
    `chapterCardFor(phase, player.storyMotive)`): CHAPTER II — NINE HEARTS (hook→revelation,
    first Lost Capital), III — THE FIRST HEART (revelation→cores, first Core), IV — THE
    ENDLESS STAIR (cores→descent, all nine), V — THE MUD FLOOD NEXUS (descent→choice,
    arrival). Each card = kicker + title + universal body + a line authored for THIS
    character's OTA-1018 motive (5 motives × 4 chapters, all in
    app/data/story/chapters.json). The feed narration is unchanged — the log stays the
    complete record; the card is the cinematic marker on top, one tap dismisses.
  • **GLOBAL MOUNT** — ChapterCardOverlay renders from App.tsx's global-overlay stack (own
    SilentBoundary), NOT per-screen: travel arrivals land on exploration but the Nexus
    choice fires from Contracts. `store.chapterCard` transient; cleared on slot load /
    delete / hard reset / new game (locked by count in tests).
  • **'ended' HAS NO CARD BY DESIGN** — EndingScreen is already the ending's full-screen
    moment. It instead renders the new per-motive EPILOGUE (3 endings × 5 motives matrix in
    chapters.json → `epilogueMotiveLine`) under the faction ending prose — the per-motive
    ending echoes originally planned for phase 3, delivered early.
  • **Phase 3 SHIPPED** as golem 1021 (the motive drip + The Missing's ending) — see the
    entry above. Locked by `__tests__/ota1020ChapterCards.test.ts` (11 tests incl. a real
    travel-into-Asgardar transition through the store).

- **THE ARBITER HOLDS HIS TONGUE — crawl/tutorial ordering fix (2026-07-29). GOLEM-ONLY.**
  golem **1019**, no HAL twin (extends the golem-only 1018 story feature; the planned chapter
  cards move to 1020+). Owner: "the arbiter says his tutorial opening line over top of the new
  origin text screens — it needs to hold until you are in the tutorial." startNewGame armed the
  tutorial AND spoke the beat-0 name prompt in the same breath, so "Your name, traveler..."
  printed into the feed underneath the opening crawl. Now: the tutorial still ARMS immediately
  in startNewGame (tutorialStep 0 + awaitingTutorialName — keeps the scene-entry Arbiter hints
  suppressed, per the 1018 comment there), but **startTutorial() — the spoken prompt — fires
  from dismissStoryIntro()**, the moment the crawl closes. Guard: `storyIntroSeen === false &&
  !hasSeenIntro` — true only on a brand-new character's FIRST dismissal, so a REPLAY OPENING
  dismissal (About) or a backfilled save can never re-speak the prompt or restart the tutorial.
  The immediate startTutorial() call in startNewGame survives only as a no-crawl fallback
  (`!get().storyIntro`). Locked by `__tests__/ota1019TutorialHold.test.ts` (3 tests: silent
  under the crawl / fires exactly once on dismissal / replay can't re-arm).

- **THE REASON YOU CAME DOWN — STORY FEATURE PHASE 1 OF 3 (2026-07-29).**
  golem **1018** — ✔ PROMOTED TO HAL as **OTA-1041** on 2026-07-30 (owner: "push all of
  this to HAL"); the whole arc (golem 1018-1021 = HAL 1041-1044) now lives on BOTH lines
  and the former golem-only rule is retired. The owner's original call: "we have a ton of
  lore, a living civilization and economy, but no real story... we need a scrolling text
  intro akin to the Skyrim criminal-in-a-cart intro... and we need to keep updating the
  player as they play." (Story files: app/data/story/, app/engine/story.ts,
  app/components/StoryIntroOverlay.tsx, plus wiring in gameStore / types / character /
  CharacterCreationScreen / ExplorationScreen / AboutScreen.)
  • **FIVE MOTIVES** — the personal reason this character went below (debt / missing / exile /
    calling / record), picked at creation step 3 ("WHY DID YOU COME DOWN?"), stored as
    `player.storyMotive`. Callers that omit it (sims, legacy tests) get a random one;
    pre-feature SAVES are dealt one deterministically in backfillPlayer (identity hash — same
    save, same motive, every load) with `storyIntroSeen: true` so the crawl never ambushes an
    existing character.
  • **THE OPENING CRAWL** — full-screen paged intro over a new game's first scene:
    3 universal pages (the flood / the thousand years / the nine hearts), 2 motive pages,
    1 faction page ("who took you in", all 9 authored), 1 closing hand-off. Tap to advance,
    SKIP always, REPLAY OPENING in About. All authored text in app/data/story/intro.json;
    assembly in engine/story.ts (introPagesFor); StoryIntroOverlay renders whenever
    store.storyIntro is non-null; every load/reset path clears it (locked by test).
  • **NEXT PHASES** (updated): phase 2 (chapter cards + per-motive epilogues) SHIPPED as
    golem 1020 — see the CHAPTER CARDS entry above. Remaining phase 3: the motive drip +
    The Missing side-thread (Hollowed tie-in). The motive id on the player is the key
    everything hangs from.

- **INITIATIVE FINALLY DECIDES THE ORDER + THE STRAP IS THE ONLY ANCHOR (2026-07-29).**
  HAL **1040** / golem **1017**. Both are the OWNER'S CALLS on the two items left open by
  1038/1039 — and the first turned out to be a BUG, not a balance choice:
  • **INITIATIVE.** Owner: "I thought the initiative roll was the deciding factor on who went
    first on any series of attacks." It never was. The roll had exactly ONE consumer in the
    entire codebase — the log line — so "X moves first. The pressure is immediate." described
    something that never happened; the player's swing always resolved first and the enemy group
    always answered afterward, win or lose. Losing initiative now runs the enemy volley BEFORE
    the strike, and a volley that drops you means your swing never lands at all. The volley is
    **MOVED, NOT ADDED** — all four post-strike counter sites (dodged / barehand-gate / hit /
    miss) are suppressed when it already fired, so a round still contains exactly ONE enemy
    volley either way. Locked by a test that counts the guarded sites (4) AND asserts the
    ordering behaviourally in both directions.
    ⚠ THIS RAISES LETHALITY BY DESIGN — a lost initiative at low HP can now kill before you act.
    That is what the owner asked for; the dial to soften it is the initiative DC in
    combatRules' step (d10 vs enemyInit), not the ordering.
  • **ELEVATED REST.** Owner: "no it shouldn't, you need the hardened climbing strap for that."
    The Reclaimer's-Rope allowance for resting on an ordinary climb is GONE — the strap is the
    single answer on every climb, great or not. A rope is a line you climb, not a harness you
    can hang and doze in. The refusal names what you're carrying and why it isn't enough. The
    old "rope rests fine" test is flipped to assert the refusal, with a new companion test
    proving the strap still works.
  • Process note: OTA-1039's lock test pinned the LITERAL refusal sentence, so this rule change
    tripped it — retargeted to the invariant (a line-carrier is told their line won't hold them
    asleep). Third time a wording-pinned assert has cost a gate cycle this span; prefer
    invariant matches in new locks.

- **NO OPEN-GROUND AMBUSHES INDOORS (2026-07-29).** HAL **1039** / golem **1016**.
  From the owner's 6-part log: a Mud Monarchs patrol "crosses your path IN THE OPEN" while the
  player stood in a flooded house's KITCHEN (12:16:43), and six minutes later a Conspiracy
  Architects war party "crests the rise" while they stood in its STUDY (12:22:19). Both lines
  are explicitly open-ground. ROOT CAUSE (a whole category, not two lines): the three outdoor
  world-event spawners — `maybeSpawnRaid`, `maybeInterceptPatrol`, `maybePatrolAmbush` — each
  asked `player.hubRoomId` for "am I inside?", and that field is set ONLY in an OUTPOST room.
  Explorable building interiors live on the STORE's `activeBuildingId`, which none of them
  consulted, so all three read "outdoors" indoors. Fixed at one choke point: a shared
  `underRoof(s, player)` predicate that counts BOTH kinds of interior, and all three spawners
  route through it (locked by a test that counts the call sites, so a fourth spawner can't
  quietly get it wrong).
  • Also, an HONEST REFUSAL: climbing accepts a Reclaimer's Rope OR a plain Climbing Rope
    (pickActiveRope), but resting on a wall accepts only the Reclaimer's. The player who had
    just climbed on a Climbing Rope was told to "carry a Reclaimer's Rope" — reading as "you
    have no rope" while they hung from one, then retried the climb at 0 stamina and fell for
    21. The refusal now names the line they're on and what it can't do. NOTE — whether a plain
    Climbing Rope SHOULD anchor an ordinary-climb rest is an open OWNER'S CALL; only the
    message changed, not the rule.

- **ONE KILL, ONE PRICE — AND STEALTH KEEPS ITS PROMISES (2026-07-29).** HAL **1038**
  / golem **1015**. From the owner's log part 16, re-verified with runtime probes before any
  code was touched (owner: "reverify all findings and continue"):
  • **THE DOUBLE DOCK.** Every patrol kill cost Eternal Dynasty **−6**, not −3 (log shows two
    separate −3 lines per kill; probe: aetherkin-trait patrol with a factionId measured −6,
    control without the trait −3). Cause: `injectFactionParty` reskins whatever the LOCAL WILD
    TABLE rolls — rename + stamp a factionId, keep every trait — so an Aetherkin roll walked in
    as "Eternal Dynasty Patrol 1", a corpse wearing a soldier's name (which is also why the
    Arbiter kept saying piercing wasn't biting). The reverence penalty's own comment assumes
    "they carry no factionId in data"; that assumption broke, and the victim's faction paid
    twice. Fixed at BOTH ends: special-marked templates (aetherkin / revenant) are excluded
    from faction parties outright, and the reverence pass now takes an exclusion set of every
    faction the same kill already docked. The other three revering factions still pay −3.
  • **A FAILED SNEAK WAS THE ONLY FREE ACTION IN COMBAT.** Probe: failed sneak `hp 200 → 200`,
    no statuses, no enemy swings; successful sneak `hp 200 → 193` **even when it won the init
    race** (the reset branch always runs the group counters). Rolling BADLY was the better
    play. And the game already told the player otherwise — the sneak-odds warning says a miss
    "lets the whole pack swing free", and the OTA-936 comment that authored it says a failed
    sneak "burns the turn AND the whole enemy group swings free". Nothing ever charged it.
    The failed-FLEE path has charged this since OTA-372 ("a FAILED flee is not free"); stealth
    now matches. This is a promise being kept, not a balance change.
  • **THE STEALTH TITLE SAT OUT THE DECIDING ROLL.** Shadow Diver's +1 rides the GATE
    (buildSkillSteps folds in titleSkillBonus — the log's "STE 1 + 1 (title: Shadow Diver)")
    but was absent from the break-away init contest that actually decides the outcome. Same
    bonus, both rolls now.
  • Two cosmetics: the `surprised` label read as a fragment when it expired ("caught mid-vanish
    fades.") → "exposed opening"; and the sneak-odds warning said "at arm's reach" at MID range
    → range-aware phrasing.
  • **OPEN / OWNER'S CALL — INITIATIVE IS NARRATION ONLY.** "X moves first. The pressure is
    immediate." has exactly one consumer in the codebase (the log line). The player's attack
    still fully resolves first either way, so losing initiative costs nothing. Options put to
    the owner: leave as flavor / loser's swing resolves first (raises lethality) / winner takes
    a small to-hit edge. NOT changed unilaterally — a lethality change is the owner's to make.

- **THE WEDGED CONTRACTS CARD — COURSE-CANCEL NOW STANDS DOWN ROUTING + REFUSALS ANSWER
  ON-SCREEN (2026-07-28).** HAL **1037** / golem **1014**. Owner's report (screenshot +
  log part 16): after accidentally tapping quit-navigating, a READY faction contract showed a
  stale "Auto-routing" note with NO route button, and ~15 taps on the green COMPLETE "did
  nothing" — the log shows 7 invisible wrong-faction refusals spoken to the world feed while
  the Contracts screen (which never renders that feed) was up. Deactivate → reactivate was the
  accidental workaround (deactivation clears routedMission). Three fixes, one category:
  • **stopTravel + stopWhisperCourse now clear `player.routedMission`** — cancelling the
    course cancels the route chain (deactivation already did; the cancel paths were the gap).
  • **The card's routed note requires a LIVE course** (`travelTarget`/`whisperCourse`), so the
    ROUTE button returns the moment no course is running — this also HEALS saves already
    carrying the stale flag (including the owner's).
  • **`completeContractFromUI` is now a wrapper**: if a COMPLETE tap doesn't raise the
    completion popup, the freshest Arbiter refusal — or, when the arbiter dedup swallowed a
    repeat tap, the line it suppressed — surfaces as `contractsNotice`, rendered as a
    dismissible amber strip at the top of the Contracts screen. Refused taps can never read
    as "the button does nothing" again; a successful tap clears any stale strip.

- **THE TC GHOST — INVESTIGATED, PRECONDITIONS ELIMINATED, TRIPWIRE ARMED (2026-07-28).** HAL **1036** / golem **1013**. Owner: "work towards the root cause, do this one
  last." The intermittent `tc.challengeForLocation is not a function` crash (2 combatStress
  runs, 232/370 hits each, all during raid windows) was investigated to its evidence floor:
  single call site (gameStore ~8161), export intact, no module cycle, no mock interference —
  and BOTH crashing runs sat at 6-8 GB heap under the since-fixed OTA-1035 mock leak, while
  every low-heap run (4 clean full runs + 3 ARMED reproduction attempts at the exact original
  configuration) shows zero recurrence. VERDICT: not conclusively provable, but the strongest
  reading is V8 misbehavior under near-OOM pressure, and the pressure itself is gone.
  The watch item converts to a SELF-DIAGNOSING one: combatStress's crash catch now carries a
  permanent tripwire — any future `challengeForLocation` crash records the stack, the live
  module's export list + typeof, and heap size to the report and `/tmp/tartaria-tc-ghost.txt`.
  If the weekly heavy gate ever trips it, the diagnosis writes itself. Costs nothing healthy.

- **THE LEAK THAT ATE THE SIMS — ROOT-CAUSED AND KILLED (2026-07-28).** HAL **1035**
  / golem **1012**. Owner: "do the root cause dig." Done — the §8 "world/persist super-linear
  tail-growth" open item (the deepest open thread, deferred since 2026-07-20) is CLOSED. The
  heap-snapshot autopsy of metaNavStress found the retained gigabytes were HUNDREDS of copies
  of the capped ~400 KB DISK GAME-LOG buffer. Two stacked causes:
  • **TEST-SIDE (the OOM):** the official AsyncStorage jest mock wraps every method in
    jest.fn(), and jest.fn RETAINS EVERY CALL'S ARGUMENTS forever — every disk-log rewrite's
    ~400 KB payload, kept until V8's 8 GB wall. Fixed at one choke point:
    `jest.moduleNameMapper` resolves the official mock path to a PLAIN mock
    (`test-utils/asyncStorageMock.js`, same API, no recording) — the 100+ per-file
    `jest.mock(...)` blocks pick it up with zero edits. PROOF: the metaNav leak probe re-run
    at 12 000 actions holds DEAD FLAT at ~249 MB (was 8 GB OOM by ~9 750). Sim horizon
    bounds (metaNav 4000 etc.) are now purely wall-clock budgets — raise freely.
  • **APP-SIDE (real on-device cost):** `appendLogToDisk` did a FULL read-modify-write of the
    whole capped log for EVERY line — several lines per action ≈ megabytes of AsyncStorage
    bridge traffic per player action once the log is full. Now BATCHED: pending lines drain
    in ONE read + ONE write per flush (order preserved, cap + error stamp unchanged,
    flushLogWrites still covers everything).
  • **CORRECTIONS (2026-07-28):** the OTA-1034 reconciliation wrongly claimed mysteries +
    storylines still turn in remotely — WRONG, and corrected below: a later B2 pass already
    made ALL contract kinds face-to-face (turnInMystery/turnInStoryline hard-require an agent
    in scene; completeContractFromUI delegates to them; typed couriers are refused for every
    kind). The owner's "face to face like the rest" call was already satisfied in the live
    game. The stale arb171 comment claiming a "remote HALF option" is also fixed in-code.

- **HEAVY-GATE HYGIENE — THE WHOLE AVIARY (2026-07-28).** HAL **1034** / golem
  **1011**. Owner: "are there any other preexistings listed in any doc that still exist?" The
  audit ran the FULL heavy gate for the first time ever — and found `npm run test:ci:heavy`
  itself had NEVER been runnable: the package.json script's `(Stress|…)` pattern was unquoted,
  so sh rejected the command on sight (why the canaries sat dead). Quoted. First real sweep:
  24/27 green; the 3 red fixed:
  • `playerInputChaosSim` — its OTA-356 source-anchor window (1600 chars) stopped reaching
    `climbFall(` as comments grew (measured 2504); widened to 5000. 15/15 green.
  • `twoYearChaosSim` — 240s budget vs ~440s measured full run (same drift class as
    combatStress); budget now 900s.
  • `metaNavStress` — V8 OOM at 8 GB. HEAP-PROBE CHARACTERIZATION (the §8 world/persist
    open item's first hard data): flat ~220 MB until ~action 2000, then a DETERMINISTIC
    ~1 MB/action pure-heap leak (large strings; dies in StringSubstring). AsyncStorage stays
    ~1 MB / 8 keys, store state stays tiny → the holder is MODULE-SCOPE JS, not persisted or
    store state. Bounded 28000 → 4000 (measured stable; 4500 completed at ~2 GB peak); the
    characterization is the entry point for the deep investigation.
  Plus the §8 RECONCILIATION: punch-list items 8/10/11/12 struck (shipped 801/781 C-group),
  the exploit-sweep backlog annotated as closed EXCEPT the deliberate mysteries/storylines
  remote-turn-in slice (owner called out hunts only — an OWNER DESIGN CALL if it should
  tighten), spin-off staleness refreshed (~370 OTAs behind, merge baseline OTA-660).

- **THE DEAD CANARY — OFF-HAND PROMOTION GUARD + combatStress REVIVED (2026-07-28).**
  HAL **1033** / golem **1010**. Owner: "is the preexisting issue something we need to look
  at?" — yes. The heavy `combatStress` sim (test:ci:heavy, NOT in the per-OTA fast gates) had
  been red since ~Jul 20; the autopsy found one REAL bug and four layers of harness drift.
  • **REAL BUG (shipped fix):** "attack <enemy> with <weapon>" promotes the named weapon into
    the MAIN hand (OTA-205 grip-switch); its off-hand protection compared INSTANCE IDS only,
    so an equipped state carrying name-only slots (never passed backfillPlayer's id stamp,
    gameStore ~2047) fell through — the promotion bound ONE off-hand instance to BOTH hands
    and silently evicted the real main weapon. Real saves get ids healed at load; the guard
    now falls back to NAME when the off slot has no id (§3a id-first-name-fallback rule).
    4-test lock (`ota1010OffhandPromotionGuard`): name-only protected, id path protected,
    legitimate pack-weapon promotion preserved, source lock.
  • **HARNESS DRIFT (repaired in the sim):** (1) fixture equipped name-only slots →
    triggered the bug above, knife-in-both-hands, close-only refusals forever; (2)
    living-world patrols/raids (newer than the harness) arrive outside its injector — the
    verb rotation never re-advanced from mid → 100% stall rate; now a FIGHT = peace→combat
    transition and the rotation restarts on enemy-membership change; (3) 480s budget vs a
    measured ~610-640s full run → 900s; (4) dodge tracker asserted the RETIRED 'dodging'
    +AC status — dodge is a CONTEST now (perfect_opening / evasive), tracker follows; the
    old ≥60% duel win-rate floor (predates swarms/death-cycles) → absolute kills ≥ 40, and
    the <1% stall-rate + zero-crash floors stay.
  • **VERIFIED GREEN** end-to-end: 20 000 actions, 0 crashes, 0.8% stalls, 98 kills. The
    intermittent raid-window `tc.challengeForLocation` crash seen in two early runs did NOT
    recur across three consecutive full runs — RESOLVED-WITH-TRIPWIRE — see the OTA-1013 entry above:
    preconditions (mock-leak heap pressure) eliminated, armed stack-capture now permanent in
    the canary's crash catch.
  • RULE GOING FORWARD: run the heavy gate (`npm run test:ci:heavy`) after any combat-loop
    OTA, or at least weekly — a red canary hid a real bug for 8 days.

- **THE UNLOSABLE FLEE — CONTESTED ESCAPES (2026-07-28).** HAL **1032** / golem
  **1009**. Owner: "I don't think I ever lost a flee roll" — and the math agreed: escape was
  d20 + DEX vs a FLAT DC 9 (the lowest DC in the table, opposed by nothing), so at DEX 8+ the
  minimum total (1 + 8) already met the bar — failure was IMPOSSIBLE and the wired
  consequence (the enemy's free round) was dead code. Same category as the old dodge
  dominance: a level-1 constant that stats outgrow. Owner's design pick (AskUserQuestion):
  the enemy contests the flee. `escapePursuit(enemies)` in combatRules reads bestiary DATA —
  the AP number + movement traits (quick +2, agile +2, aerial +3 via enemyIsAerial, slow -3),
  clamped 0..14, fastest live pursuer only — and `buildSkillSteps` rolls that pursuer's d20 +
  speed as the escape TARGET (dice line: "Pursuit 17 — Mud Hound (d20 12 + SPD 5)"). Ties go
  to the runner. The store's skill dispatch passes hp-filtered live enemies; no pursuer
  (traps, hook escape stages, cleared scenes) keeps the flat DC 9; the first-3-steps flee
  grace for brand-new characters is untouched, as is the summit-boss escape valve (bosses get
  no extra pursuit bonus — their AP already carries it). 7-test suite + category lock
  (`ota1009ContestedFlee`). NOTE: the heavy `combatStress` sim (test:ci:heavy, NOT part of
  the fast gate) times out at 480s on this container at BASELINE too — pre-existing, and the
  sim never submits a flee; verified by a stash-run before shipping.

- **WHICH ONE AM I HOLDING — COATING PICKERS TAG THE EQUIPPED PIECE (2026-07-28).**
  HAL **1031** / golem **1008**. Owner: "when you are applying coatings to weapons or armor,
  it should show you which one you have equipped at that time." Both coating pickers (paint a
  vial onto a weapon; work a resist vial into armor) listed candidates by bare name. Each row
  now appends `· EQUIPPED (main hand)` / `(off hand)` / `(chest)` etc. via a tiny
  `withEquippedTag` helper that rides `equippedSlotLabelFor` — the SAME instance-id resolver
  (id-first, legacy name fallback) that drives the inventory EQUIPPED badge. One source of
  truth, per the §3a-B divergent-copies lens: the pickers can never disagree with the badge,
  and with two same-named weapons the tag lands on the exact worn instance. Category-lock
  test pins one definition + two call sites and that the helper reads equippedSlotLabelFor.

- **THE POPUP THAT COULDN'T WAIT — STORY-THREAD COMPLETE FLOW (2026-07-28).** HAL
  **1030** / golem **1007**. Owner: "as soon as you hit the last part of the story hook, it
  immediately pops up a completion pop-up... the last part is completed, so it shouldn't say
  continue or abandon — it should only say complete, and when you hit complete the pop-up
  should pop up." Root cause: the story-thread completion notice was raised SYNCHRONOUSLY
  inside `resolveHookOneStep` the instant the terminal stage resolved — the
  MissionCompleteModal mounted ON TOP of the HookContinueModal the player was still reading.
  Story threads are the only completion with a reading modal in front, which is why only they
  misbehaved. Fix: the payload is STASHED on `pendingHookContinue.completionNotice` and raised
  by `dismissHookContinue` via the new `raiseMissionCompleteNotice` (the notice-only half of
  the OTA-1010 choke point — announceMissionComplete now delegates to it). The terminal stage
  renders a single **COMPLETE ✦** button (no CONTINUE, no ABANDON); scrim taps and the back
  button route through COMPLETE too, and the stale-CONTINUE defensive branch closes via the
  dismiss path, so a held payout can never be silently dropped. Mid-thread stages keep
  CONTINUE / ABANDON unchanged. Category-lock test (`ota1007HookCompleteFlow`) drives a real
  footprints thread end-to-end (stash held, popup deferred, raise on dismiss) and pins the
  modal's completed-branch; the OTA-1010 choke-point lock is retargeted (6 direct announce
  sites + the stash path).

- **THE GREEN LIE — DIVERGENT REACH COPIES (2026-07-28).** HAL **1029** / golem
  **1006**. Owner: "why is the Resonant Spike glowing green if I'm out of range? make sure
  that all weapons correctly reflect that they are active at their appropriate range." Root
  cause category: DIVERGENT COPIES of a resolver (§3a-B lens). The attack gate rolls with
  `playerWeaponReach` (throwable instance → catalog row → forge-stamped
  `uniqueStats.reachClass` for fused weapons → runecaster INT gate), but the weapon
  quick-button tone (InputBox `bandsReachRange`) and the enemy panel's in-range flag
  (ExplorationScreen `enemyViews.canHit`) each kept a LOCAL re-derivation that missed the
  OTA-978 forge stamp — so a close-only fused weapon glowed green at mid range while the
  gate refused every swing. Fix: `playerWeaponReach` is EXPORTED and both consumers read
  it; the local copies are deleted; a category-lock test (`ota1006ReachHighlightUnified`)
  pins the fused/stamp/off-hand/barehand bands AND forbids a `reachClassFor` derivation
  from reappearing in either screen. Buttons now glow exactly when the swing would land.

- **THE WEDGED BANDOLIER — GHOST EQUIP REFERENCES (2026-07-27).** HAL **1028** / golem
  **1005**. Racked/stowed instance ids whose items left the pack by any path other than
  throw/unrack rendered as EMPTY slots that still counted against the cap — unfillable and
  unclearable. Ghost sweep in backfillPlayer + live-id cap checks (bandolier AND tool pouch).
  The REFERENCE sibling of §3a-F: persisted instance-id indexes must validate against inventory.

- **THE CRAFT-SCREEN STALL (2026-07-27).** HAL **1027** / golem **1004**. Pre-existing
  (bisect-proven): ingredientShortfall annotated the whole inventory PER RECIPE; the craft badge
  runs 130 recipes per open and per inventory change — seconds per repairs-tab tap on device.
  Fix: SHORTFALL_META WeakMap on the immutable inventory array; 900ms → 3-23ms. Plus canCraft
  gains the exact-ingredient exclusion parity with preview/drain.

- **THE KILL-BEAT FREEZE (2026-07-27).** HAL **1026** / golem **1003**. Owner: the final
  blow hung "resolving" 7-8s — kills only. Root cause: the snapshot-audit batches' canonical
  helpers were uncached linear catalog scans, multiplied by the kill path's inventory loops into a
  blocked JS thread (kills touch inventory; ordinary rolls don't). Bisect-proven (22ms pre-audit →
  281ms at batch D). Fix: per-name memo caches (CANON_TAG_CACHE / CANON_ROW_CACHE) — identical
  semantics, probe back to 25-33ms. LESSON for §3a-F: canonical identity MUST be O(1) — a helper
  that N call sites route through inherits the sum of their hot loops.

- **THE SNAPSHOT AUDIT, BATCH A — RESTITUTION (2026-07-27).** HAL **1021** / golem **998**.
  Owner approved all five batches (A–E) from the 3-agent stale-snapshot sweep (~50 verified sites;
  the coating-rack category generalized: code trusting persisted snapshots over live definitions).
  A ships: `itemMigrations.ts` `LEGACY_ITEM_RENAMES` — every retired catalog name maps to its
  surviving row (Boltcaster→Beacon Rifle, Greaves→Mantle incl. the legs→cloak slot move, 2 torches,
  4 original golem armaments) — applied by backfillPlayer on every load to inventory + equipped +
  golem armament + knownRecipes; the golem's held weapon joins the restamp/durability passes it was
  excluded from; `migrateLoadedWorldMemory` extracted and used by BOTH load doors, so a gem
  resurrection no longer strips canon locations / contract pins for the session (NOTE: golem's
  helper has no enemyIntel line — the intel backfill is HAL-only).
  Lock: every map key must be dead in the raw catalogs and every value alive (6 tests).
  **BATCH B SHIPPED** (HAL 1022 / golem 999): the four FAIL-OPEN loss holes now fail CLOSED —
  quest-lock canonical (one predicate, all doors + the two raw sibling reads routed), forge
  blocklists canonical ('loot' provenance stamp stays instance-read by design), the substitute-
  drain guard reads canonicalItemRarity, collect_only canonical at both the sell pin and the
  Crucible upgrade gate. NEW: canonicalItemKind + canonicalItemRarity; canonicalItemTags union
  widened to amulets/rings/dog gear. 8-test lock incl. whole-catalog fail-closed sweeps.
  **BATCH C SHIPPED** (HAL 1023 / golem 1000): the ECONOMY reads canonical values — sell price,
  scrap gate/yields, repair cost, golem substitute feeding (×3 call sites), coating-drink potency.
  'trophy' is catalog-AUTHORITATIVE (applies only while the name is catalog-ABSENT). golemCompanion
  fixture retargeted to a catalog-absent name. 8-test lock incl. stale-vs-fresh parity sweeps.
  **BATCH D SHIPPED** (HAL 1024 / golem 1001): the identity TAIL (~25 sites) — sections, throwable
  cluster, sigils, itemIsTool, crafting substitution (+ the exact-ingredient exclusion canonical
  exposed), digging, racial gear, faction catalysts, rope/treat/torch/barehand/food/repair-perk —
  all canonical; fused-kind load guard; CHA stat-channel heal; canonicalItemTags nameless-shim
  guard; inventorySnapshot + sigilTurnIn fixtures retargeted.
  **BATCH E SHIPPED — THE AUDIT IS CLOSED** (HAL 1025 / golem 1002): THE CATALOG-NAME RATCHET
  (snapshot + refresh script + build-failing lock on unmigrated removals), orphan-safe ABANDON,
  def-resolving contract count, staged-record turn-in gate, loud location fallback, canonical
  deep-link/relic-perk/trade-away. RENAME POLICY binding in §3a-D. Accepted residuals documented
  (display-only rarity label/stripe/sort, itemWeight/parseValidator kind fallbacks, use/eat kind
  routing, latent ledger renames).

- **EVERY COATING RACKS (2026-07-27).** HAL **1020** / golem **997**. Owner: "there were
  coatings that I couldn't load into my bandolier." Root cause CATEGORY: identity-by-instance-tag-
  snapshot — five sites asked "is this a coating?" from the instance's tags, and instances keep the
  tag set they were MINTED with, so vials acquired before a catalog tag existed failed the bandolier
  gate / coat-a-weapon button / equip guard / drinkable gate / throw burst forever while identical
  new ones passed. Fix at the choke point: `canonicalItemTags` (crafting.ts — instance UNION catalog
  row by name, lowercased; fused non-catalog names keep instance-only behavior) +
  `isWeaponCoatingItem` (weaponCoating.ts, THE one answer); all five consumers routed, the
  bandolier's throwable/spear tests canonicalized too. 7-test lock incl. a whole-catalog sweep
  (every coating racks as a stale tagless instance) and a stale-vs-fresh drinkability parity sweep.

- **THE RESIDUALS, CLOSED (2026-07-27).** HAL **1017** / golem **994**. Owner: "complete
  1-4 that were left open. ask design questions where required." Owner's design calls (via
  AskUserQuestion): reclaimed gear returns PRISTINE; the died-in WEAPON is a GUARANTEED drop while
  armor stays on the chance rolls; the Hollowed door gains a proven-progress gate (10 kills OR 12
  in-game hours) beside the HP bar. Shipped, 15 tests:
  • **THE RECLAIM** — `FallenGearPiece` snapshots (full item copies, instance stats intact) captured
    at death (`buildFallenGearSnapshot`); put-to-rest grants the weapon outright
    (`revenantReclaimWeapon` → `reconstructFallenPiece`, durability restored to max) and the chance
    rolls grant REAL snapshot pieces instead of misc trophies; the guaranteed weapon sits OUT of the
    roll pool (no dupes); KO-strips count as put to rest (closes the rise-again kit farm); legacy
    seeded kits PIN at first generation (`pinFallenGearNames`) so catalog edits can't re-dress a
    named fallen.
  • **itemPreview** heals promise the #120-scaled value for the live frame (`effectiveHealAmount`,
    lazy store require; flat value stands outside a live game). The effect-less 2d6 default is
    genuinely unscaled in the engine — its preview line was already honest and is untouched.
  • **WEATHER** — `worldMemory.sceneWeatherByLoc` per-location map (self-pruning at 6 game-hours;
    legacy `sceneWeather` slot reads once as migration, never written again; drift stamps
    'open-road' as a map key). `ota1003WeatherLocality` retargeted — its pin now exercises the
    migration path.
  • **THE MARKER** (follow-up, HAL 1018 / golem 995): the Fallen roll now labels every
    un-avenged entry "— STILL WALKING" in amber and counts them in the header, so the
    player can see at a glance which of their dead are still out there as risable Hollowed.
  • **THE TABS** (follow-up, HAL 1019 / golem 996, owner screenshot): the codex tab row was a
    cue-less horizontal scroll — FALLEN and LORE sat past the right edge and effectively did not
    exist. The row now WRAPS; every tab always on screen.
  • **HOLLOWED POLISH** — proven-progress gate; `revenantRolledTiles` per-tile bank (slice -120,
    mirrors stranded escorts); the memorial write retries ×3 with backoff; the rumour marker can no
    longer spawn the boss over a live fight (the spawn clobbered the enemies array — pool keeps, the
    Hollowed rises at a later door).

- **THE STUDS-DOWN TEARDOWN (2026-07-27).** HAL **1013–1016** / golem **990–993**. Owner:
  "take all of opus fixes down to the studs and verify root cause and proper implementation of new
  systems." Five parallel read-only audits re-derived every OTA-992..1004 claimed root cause against
  PRE-fix code (git-archaeology, not summaries), verified all 13 golem ports patch-identical, and
  adversarially probed the seams. 13 OTAs: **5 held clean** (992 version tracker, 999 stealth, 1001
  healing core, 993-E escort board filter, 1003 mechanics), **8 had defects** (~30 findings), all
  verified by hand before fixing. Shipped in three batches — 1014 exploits+spawns, 1015
  contracts+toasts, 1016 input+world (see VERSION.md row + buildInfo for the full inventories).
  **DOCUMENTED RESIDUALS (known, deliberate, or deferred):**
  • Whisper/lead/broker are AMBIENT-TIER — exempt from single-active by design, test-locked.
  • ALL FOUR DEFERRED RESIDUALS BELOW WERE CLOSED BY THE NEXT ENTRY (HAL 1017 / golem 994) —
    kept here only as the audit's record: gear-snapshot reclaim (trophies + per-BUILD seeded kits),
    per-location weather map, scaled heal preview, and the Hollowed polish set (tile bank, gate,
    optimistic markAvenged, continueHook guard).

- **THE TRUST BATCH + ROOT-CAUSE AUDIT (2026-07-27, later).** HAL **1008–1012** / golem **985–989**.
  • **1008/985** — the voice-crash counter is scoped to the BUILD that produced it (stamped with
    OTA_BUILD_ID, re-zeroed on build change; the OTA reload that delivers a fix can no longer count as
    a crash). Confirmed live on the owner's device. The Qwen/init guards deliberately keep their
    install-lifetime counts (arb128's crash-to-home lesson) — test-locked scope.
  • **1009/986** — CHARISMA IS NOT A TO-HIT STAT: the weapon catalog had assigned `stat` BY GRIP and
    the whole single_handed bucket carried charisma (37/37 melee + 5/5 ranged = 42 weapons, 7
    Legendary). Retargeted from the six sibling-pair rows that revealed intent (heavy one-handers →
    STR, knives/batons/thrown → DEX, pistols → DEX). Runtime backstop `isValidAttackStat` + a suite
    that fails the build if any weapon ever carries charisma. The earlier "melee rolls CHA" fix had
    patched a CODE path; the DATA was the cause — never again.
  • **1010/987** — a finished mission ANNOUNCES itself: `announceMissionComplete` is the one way a job
    ends (7 sites funneled: bounty, contract, hunt ×2, mystery, storyline, story-thread finale), raising
    a holding modal with kind + name + rewards; merge-by-title folds a finale and its bonus into one
    popup. SOURCE lock: a completion written straight to the feed fails the build.
  • **1011/988** — travel-by-name matches what the player TYPED: `app/engine/locationMatch.ts`
    normalises both sides (punctuation, spaces, leading articles), fixing 7 unreachable punctuated
    names (Zharak's Teeth et al.). Ambiguity REFUSES (five places alias "city", three "tower").
  • **1012/989 — THE AUDIT.** Owner: "run a root cause analysis of all fixes done in the last 12
    hours and thoroughly test everything." Re-verified all seven OTAs, byte-parity across lines,
    adversarial probes. Found TWO defects in this session's own fixes, both lying-proxy shaped:
    craftRecipeBatch judged success by TOTAL pack delta (the Club, 1 Stick → 1 Club, nets zero → one
    silent club, made=0, no summary; only 1-in-1-out recipe of 130) — now counts the RESULT item; and
    the partial-name tier still silently picked shortest on ambiguity ("camp" names 3 places) — now
    refuses, with the base-name carve-out ("Nimari" in "Red Tower of Nimari"). Both source-locked.

- **THE CRUCIBLE BATCH (2026-07-27) — feed it, then make it honest.** HAL **1005–1007** / golem
  **982–984**. All three came out of one device session where the owner sat in the fuse menu for ten
  minutes believing they were fusing. FIX RULE throughout: prove the cause, fix the choke point, grep
  the category, lock it with a test.
  • **1005/982 — the salvage valve (owner's number: 18%).** The Crucible eats ONLY catalog-ABSENT
    "inferred" items — that is the FEATURE, not a limitation (it exists to give junk a destiny; owner:
    "burning junk devalues the fuse crucible"). Two later cleanups had starved it: arb61 filtered
    salvage output down to `materials.json` names — every one of them catalog — so salvage produced
    ZERO fuel structurally, and the standing inferred-stats BACKFILL practice converted the remainder
    into catalog rows. Fix at the single salvage choke point `rollSalvagePool`: a new
    `app/data/relics/curios.json` — **50** deliberately catalog-absent names spanning all seven material
    families — drops at `CURIO_CHANCE = 0.18` IN PLACE of the material that would have dropped. `salvage
    all` calls that function once per noun, so all ten things roll independently. Measured 18.0%, ~1.8
    curios per ten-noun sweep. The suite LOCKS the drain shut: if a curio ever gains a catalog row it
    goes red. **Do NOT backfill curios.json into materials.json** — the header says so too.
  • **1007/984 — the Crucible refuses out loud.** ROOT CAUSE was a band-aid WE shipped: OTA-801 made a
    FAILED gate OPEN THE PICKER anyway to dodge repeat-refusal spam, trading a visible annoyance for an
    invisible one — a menu you cannot act in that logs NOTHING (reproduced from the log: three `fuse`
    commands, one line each, the player's own echo). This OTA REMOVES that patch rather than layering on
    it. All three Crucible doors funnel through `fuseAtCrucible`, so one choke point covers the category:
    the picker opens ONLY when a fusion is genuinely possible; otherwise `fusionBlockedNotice` +
    `FusionBlockedModal` name exactly what is short in plain English (the engine word "inferred" is gone
    from player copy), HOLD until dismissed, and the Crucible closes. Also: the vendor's portable rig
    checks BEFORE taking its 25 TC, the FUSE button gates on the real rule (`nMats >= 3`) so a lit button
    always fuses, and the stale `pendingFusionSelection` is cleared on refusal.
  • **1006/983 — crafting asks HOW MANY.** OTA-264 put the decision AFTER the work: a tap crafted exactly
    one, then a modal asked CONTINUE CRAFTING / CLOSE MENU — a question whose answer was always the same,
    so ten stews cost twenty taps and the modal could take the menu away. The step moves to the FRONT:
    `CraftQuantityModal` (−/+ stepper and MAX), the batch runs, the menu stays open until BACK. MAX is
    honest — `maxCraftableCount` simulates the real drain one craft at a time through the same
    substitution-aware `consumeIngredientsList` the craft uses, capped at `MAX_CRAFT_BATCH = 20`.
    `craftRecipeBatch` mirrors `salvageAllAmbient`'s shape: every pass is an ordinary craft with every
    gate intact (so it can never over-consume), it stops on a refusal / full pack / substitution prompt,
    and emits ONE aggregated reward line instead of N. The OTA-264 modal is retired for a self-clearing
    haul banner.

- **LATE SESSION (2026-07-26) — device-log root-cause run + two owner features.** HAL **992–1004** /
  golem **969–981**. Every fix in this run followed the FIX RULE (§3): prove the cause, fix the shared
  choke point, grep the whole category, add a category-lock test.
  • **992/969** — the game-version tracker is LIVE again. `DISPLAY_VERSION` had been frozen at 4.1.0 for
    ~27 OTA waves; a wave-by-wave census recomputed it to **4.28.3**, and the per-OTA PATCH bump rule +
    `VERSION.md` ledger keep it honest from here.
  • **993/970 — TRUTH BATCH** (playtest findings #112–#117, all root-caused at shared choke points):
    the arrival scene now states WHERE you are before the room's Paths line (#112 — hub auto-entry raced
    the outdoor narration); takeable catalog items are no longer climbable perches, with great-climb
    nouns taking precedence over same-named weapons (#113 — "the Great Fang of Zharak" is both);
    `qwenRephraseRejection` validates the local narrator's typo-repair against the ACTUAL resolved noun
    and intent instead of accepting any rewrite (#114); the ranged refusal reads for the weapon in EITHER
    hand and answers in ranged words (#115); stranded-escort contracts are hook-sourced ONLY and never
    posted on a board (#117 — 5 surfaces filtered).
  • **994/971 — #116 stat toasts.** Every "+1 STAT (now N)" toast printed the BASE stat while the sheet
    showed the EFFECTIVE one. One helper, `statNowClause(p, stat, base)`, now feeds **22** toast sites,
    and `ota994StatToastLock` SOURCE-SCANS gameStore.ts so a 23rd can never regress (the `+1 max HP` /
    `+1 max stamina` toasts are exempt — no gear duality there).
  • **995/972 — #118 accept parity.** Hunts/mysteries/storylines auto-ACTIVATED while faction contracts
    auto-PAUSED. All four kinds now carry `tracked?: boolean` and consult one predicate,
    `anyTrackedContract(p)`, across **8** grant/accept sites; a parked contract says so and points at
    the Contracts screen.
  • **996–997/973–974 — #119 polish + the missing names.** Ambient gear spawns keep a 10-name variety
    window (`worldMemory.recentTakeableGearNames`); "climb down from the scholar" became a real descent
    noun per overlay; Buried Market Row lost its strip-mall reading (id kept for save continuity). Then
    the CATEGORY cause behind the missing names: portability matched by RAW SUBSTRING, so `mud` banned
    every Mud-* weapon and armor (~58 Common names) from spawns AND pickup, `arch` banned "Architect's"
    gear, `rain` matched "training". Now word-boundary matching everywhere plus an exact-catalog-item
    exemption — a real item is by definition pocketable, while substances ("wet mud", "fog bank") stay put.
  • **998/975 + 1004/981 — THE HOLLOWED (owner feature).** Characters lost to this install's Fallen roll
    return as violent Aetherkin REVENANT boss events wearing the gear they died in, with a chance to drop
    it and a sentimental put-to-rest line that credits the avenger. New `app/engine/fallenRevenants.ts`;
    `FallenHero` gained `gearNames` / `avengedBy` / `avengedTs` (pre-998 records get a stable SEEDED kit,
    so the existing install backfills itself); the kill is EXEMPT from the Aetherkin reverence penalty;
    the codex memorial marks them rested. **Both doors, per the owner:** a ~4% roll on novel peaceful wild
    tiles spawns the boss outright (power-gated at hpMax ≥ 60), and when that misses, a ~5% roll plants a
    `fallen_whisper` rumour marker naming the fallen — follow it two beats and the same revenant answers
    (`spawn_fallen_revenant` hook effect; empty pool = cold trail).
  • **999/976 — stealth stops standing still.** Owner: "my STE is still at 0." Two causes: the progress
    curve gave a stat with nothing invested the same crumbs as a mastered one, and only SUCCESSES taught
    anything. Cold-start band (trained ≤ 2 → **+6** per success) plus `trainStatNearMiss` — a failed check
    within **3** of its DC awards **+1**, the deliberately lower road the owner asked for ("don't let it
    snowball once the needle starts moving").
  • **1000/977 — a pried sigil is a sigil.** Owner: "a pried sigil awards coin?" Every salvage yield —
    pry, strip, break, bulk — flows through `rollSalvagePool`, which had no sigil awareness, so the noun
    fell to the junk table. That one choke point now yields a REAL faction sigil, faction read from the
    noun's own words via the `sigils.ts` keyword map, and the OTA-691 turn-in economy takes it from there.
  • **1001/978 — #120 healing, LIGHT (owner: "keep its fix numbers on the lighter side").** Heal numbers
    were FLAT in a game where hpMax scales. One scaler, `scaledHealHP(flat, hpMax)`: kit-grade (flat ≥ 20)
    heals max(flat, **15%** hpMax), meal-grade max(flat, **4%**), and a NIBBLE (flat < 5) never scales.
    Wired at all three consumable apply sites AND the InventoryScreen button math. Rest knits **15%** of
    max HP per full sleep — this SUPERSEDES arb37's "rest never heals"; the two suites that pinned the old
    rule were retargeted, not weakened. Being wounded is now a reason to sleep; the "save the hours"
    refusal fires only when you are genuinely whole.
  • **1002/979 — #121 the offer firehose.** Four independent offer emitters (contract / bounty board /
    mystery notice / thick scroll) each fired whenever stocked. Agents now pitch **two rotating
    categories** per macro visit, keyed on `macroVisitSeq`, walking one step per visit so nothing is ever
    unreachable; turn-in hints stay unbudgeted. The **all_or_nothing** escort tier (full pay or lose
    everything) sat at rep 18–22 — all 8 floored at **rep 25**.
  • **1003/980 — #122 weather learns geography.** `pickWeather` weighed only NOVELTY: no location linkage,
    no persistence, so a scene rebuild re-rolled the sky and a spire hailed like a mud flat. Locale keyword
    bias at that single chooser (aether/spire → Aether Lightning + Aetheric Storm ×3; mud/marsh → Black
    Rain ×3, Whisper Fog ×2; ash → Ash Storm ×3; frost → Silent Blizzard ×3), the rolled sky PERSISTS per
    location ~6 game-hours (`worldMemory.sceneWeather`), weather no longer bites INDOORS, and the chip gap
    went 2 → **5** (owner: "so you're not trying to re-spec your armor every 2 seconds").
  • **DEBUG BREADCRUMBS (owner-approved, debug channel only — never player-facing):** `scene: loc=… hub=…
    arrival=… opening=… passing=…`, `accept: <kind> <id> tracked=<bool>`, `spawn: gear=[…] window=N`,
    `spawn: revenant <name>@<ts> pool=N`, `spawn: fallen_whisper rumor …`, `hook: fallen_whisper answered …`,
    `revenant: <name>@<ts> put to rest`.

- **SKYREACHER MAPS + OUTPOST CRUCIBLE FEE (2026-07-26).** HAL **990–991** / golem **967–968**.
  • **990/967** — the OUTPOST Crucible now charges the roadside vendor's **25 TC per fire** (fuse AND the
    extra-channel upgrade). Fee is taken only AFTER every gate passes and before any consume, so a refusal
    or cancelled picker never costs a coin; vendor fires + wild benches (`fusionPending`) stay pre-paid; the
    Hidden Market cauldron keeps its free-fire perk. Helper `chargeOutpostCrucibleFee` (gameStore). Owner:
    "make the outpost run the same as a roadside vendor" — closes the free-mint faucet from the playtest log.
  • **991/968** — 'Skyreacher Chart (N of 5)' → **'Skyreacher Map N of 5 — <tower>'** (gameStore
    `SKYREACHER_CHARTS` + gear.json rows/descriptions; owner: "it's not a chart. we should call it a map").
    The inventory modal wires a DEDICATED always-on Use button for the maps ("Use — add the location to your
    MAP") instead of the generic effect-resolution gate — the owner's device showed NO Use button on a bought
    chart, and the generic gate runs three catalog lookups inside the render path where any hiccup silently
    eats the button. A fresh unlock pops "✦ Skyreacher location added to your MAP and MISSION LOG — <tower>".
    OLD SAVES MIGRATE: `backfillPlayer` renames held legacy charts on load; legacy names in the `soldMapIds`
    sell-once ledger still block re-offers (`LEGACY_SKYREACHER_CHART_NAMES`). `ota915GreatClimbCodex` keeps a
    legacy-name ledger assert ON PURPOSE as the migration-tolerance proof.

- **ESCORT MISSIONS (2026-07-25 → 26) — engine_Dev's shared-pool model, ported to Tartaria as a full
  feature.** HAL **985–989** / golem **962–966**. New `app/engine/escort.ts`: an `EscortPool`
  {label,hp,hpMax,count} rides on the accepted faction-quest record; escortee HP ≈35% of player hpMax
  (clamp 8–45), party size 1–5; HUD rows in StatsPanel (`livingEscortPools`, parked pools hidden); the
  Contracts toggle NAMES the party it stands down/recalls (`escortToggleLabel`). **Combat is UNTOUCHED** —
  escorts only take COLLATERAL: after a landed enemy counter, `applyEscortDamage` bleeds
  `ESCORT_COLLATERAL_FRACTION`=**0.20** of the final post-mitigation damage into the active pool (tuned
  down from 0.30 — a solo escortee survives ~1.5–2 pack fights, a 3-member party ~4). Rest heals pools 10%
  (`healEscortsOnRest`, wired into BOTH rest resolvers); a dead pool fails the contract (`failEscortQuests`,
  fired from the same sweep that kills the escortees). **PAY MODEL (owner call):** scaled-by-survivors
  (pool hp/hpMax, floor 0.1) is the DEFAULT; top-tier contracts are **all_or_nothing** (full pay or
  nothing; rep is always full either way). Delivery grants First Aid Kits (2 aon / 1 scaled); escort loot
  = **TC + health items ONLY** (the recipe roll is gated off for escort kills). **29 escort contracts** in
  faction-quests.json (`FactionQuestDef.escort` {count,label,mode}; `_escort` id suffix also recognized),
  incl. 9 rep-0 `fq_<faction>_stranded_escort` field contracts at 55 TC with per-faction authored flavor
  (3 normal + 2 all-or-nothing hard flavors per faction on the board tiers). **HOOK SOURCE:** new
  `stranded_traveler` hook kind (hooks.ts; weight-0, spawner-driven) — ~6% roll on novel peaceful wild
  tiles in `stepDirection`, 2-beat accept chain (CONTINUE), never while a live escort is out
  (`worldMemory.strandedEscortRolledTiles` 120-tile window). **989/966** = the escort gauntlet suite:
  every acceptance source (board, vendor, hook) run through combat to delivery in both pay modes; the
  0.20 bleed and the TC-worth were tuned against those runs.

- **PLAYTEST SWEEP (2026-07-26) — 10-finding device log: 6 fixed, 4 ruled on.** HAL **979–984** /
  golem **956–961**.
  • **979/956** — dog-vest equipped visibility: one resolver, truthful modal, renames follow the vest.
  • **980/957** — combat truth batch: DOTs at 0 HP actually KILL (per-dead-enemy `resolveEnemyDefeat` in
    the tick sweep, live-scene reads); a thrown weapon's transient equip SETTLES before the roll resolves
    (`throwSettlement` — no more wrong-weapon narration); point-blank +2 follows the SWUNG hand.
  • **981/958** — exploit batch: the `worldRealtimeTick` standing drip (+rep every 36 s of real time,
    the "recurring 4-faction standing block" in the log) is DELETED; the take-use-take ambient-item farm
    is closed (take-once-per-room, absolute, across all 4 take sites).
  • **982/959** — durability rebalance: one landed hit chips ONE worn piece (`wornSlotHit`), not the whole
    set; armor frays OUT LOUD at durability 3. The temper floor 0.4 is KEPT deliberately — glass-cannon
    tempering is the intended tradeoff, not a bug.
  • **983/960** — elevated combat, owner's design: the `enemiesAtBase` model — AIRBORNE enemies reach you
    mid-climb (and any weapon can hit them back), grounded shooters fire UP at you, and firing DOWN at the
    ground party requires a weapon that actually shoots. Summit/wall fights (enemies WITH you) unchanged.
  • **984/961** — "Save for quest" shows ONLY when an accepted fetch contract wants that item
    (`activeFetchItemNames`); specific quest items keep hard-locking automatically. (The button was the
    owner's bulk-fetch idea — "go get me 15 rusted metal" — not a blanket hint.)
  **DESIGN CALLS ON RECORD:** the early-game KO-loot money loop stays (owner: known exploit, used for
  early healing money); the torch-vendor buyback loop stays (same call); mid-climb melee ambush → the
  983 model; the standing-block cadence WAS the 981 drip.

- **REAL-HEIGHTS CLIMBING ARC + REACH (2026-07-24 → 25).** HAL **968–978** / golem **945–955**.
  968 stack-sized fusion reserve (one tap reserves the pile); 969 stale-charge clobber (buffs/DOTs tick in
  combat again); 970 playtest batch (word-level targeting, honest Aether fuel, scenery snark, refusals
  always answer); 971 the salvage button that lied from a pillar; 972 one climb at a time (no mid-air
  hops); **973–976 = the climbing arc** — placements + reachability skeleton, perches as exploration,
  zero grip means gravity (fall at empty, slide down, eat where you hang), one-tap wall flee; **977** an
  out-of-range attack REFUSES — it never auto-moves you; **978** fused weapons get real reach bands
  (+ old-save recheck).

- **LOOT AUDIT BATCH (2026-07-23 → 24).** HAL **960–967** / golem **937–944**. A multi-agent loot audit,
  then: 960/961 the outright bugs + canonical resolution (rarity trophies); 962 curated trophy pass
  (35 real materials + provable aliases); 963 boss spoils table (every boss pays out like a boss);
  964 Iron Spider materials become the real thing; 965/942 loot alias precedence (exact catalog names
  always win); 966/967 v2-audit knobs (mid-tier windfalls closed, trophy sell discount, KO mercy premium,
  the Reaver stops double-dipping).

- **QoL / CORRECTNESS TAIL (2026-07-23).** HAL **948–959** / golem **925–936**. Dev-grant cleanup I+II
  (948/949 — retire spent one-time drops, keepers to creation); look-around hides investigated-and-cleared
  nouns (950); input-bar keyboard fixes (951, then the 956 Android-only per-focus poll rework — hide always
  wins); enemy portrait no longer blanks after a group-fight kill (952); flavor-exhausted noun matching
  goes word-level (953); Guardian ramp monotone at every player power (954); the Power gauge respects the
  OTA-947 AC trim (955); correctness batch (957 — full weather symmetry, coating-slot guard, barehand
  reach); hygiene batch (958); **959 = the legibility layer — combat rebalance III of III COMPLETE**
  (resist/weakness callouts on the hit, coating-soak feedback, "hit leaked — missing resist" cue; closes
  the §8.B3 pass-3 plan; pass 2 'matched progression' remains open).

- **COMBAT-FEEL SESSION (2026-07-22) — coatings, weather/stealth correctness, defense de-runaway.**
  HAL **940–947** / golem **917–924** (engine_Dev EXCLUDED — all of this is combat/content tuning, not
  engine-level; the levers are documented in §8.B3 so it can be ported later if wanted).
  • **940** — barehanded-weapon coatings fire now: `isBareHandAttack` tripped on a weapon NAME containing
    a body word ("Mud-FIST Wraps") → the whole coating block was skipped. Now strips the equipped weapon
    name before the bare-hand test. + fixed the stale downed-dog Arbiter line.
  • **941/942/943** — one-time OWNER-SCOPED Mud Siren rematch (name 'Verbal' + ≥1 recovered Core): refund
    the consumables/throwables spent under the 940 bug, re-stage a scaled Mud Siren, clean pre-fight
    restore (full HP/stam, gear repaired, throwables topped up). Latch-gated via grantTestSupplyGiftOnce.
  • **944/945** — coating UX: a coat that REPLACES an existing coating routes through a destructive-toned
    confirm; on a FULL multi-slot weapon (or a full armor resist piece) it opens a which-to-replace PICKER
    (empty slots fill first). applyCoating gained `replaceSlot`; applyCoatingToArmor gained `replaceResist`.
    + a coating2 save-round-trip regression lock.
  • **946** — WEATHER respects armour resists: a matching-element coating shrugs off that element's weather
    (electrical coat vs Aether-lightning), generalising the OTA-934 cold rule (tickWeather now takes the
    player's full resist list). + STEALTH contradiction GUARD: a "stealth … PASS" no longer precedes a
    "surprised"; a reusable guard (`HANDLER_OWNED_IN_COMBAT`) suppresses the generic skill-check verdict
    when a handler owns the real outcome. The failed-disengage penalty itself is preserved.
  • **947** — DEFENSE DE-RUNAWAY (combat rebalance **I of III**). Full lever list + the planned passes 2
    (matched progression) & 3 (legibility) live in **§8.B3**. The fusion/acquisition loop is UNTOUCHED.

- **STUDIO-LEVEL / CI-HARDENING BATCH (2026-07-19 → 20).** Six items SA-1…SA-6
  plus three CI/quality closes, shipped across the three lines (HAL 895–903,
  golem 874–879, engine 1171–1174; engine skips SA-5 content per the lore-neutral
  rule). SA-1 CI gate (tsc + test-typecheck ratchet + jest + lint scaffolding);
  SA-2 Aether/Etheric lore reconcile; SA-3 monotone contract-reward re-tier;
  SA-4 static bosses + Legendaries routed through the Guardian over-level scaler
  (HAL+golem); SA-5 voiced the bestiary (HAL+golem); SA-6 accessibility baseline.
  Then the CI hardening:
  • **jest → BLOCKING** (HAL OTA-901 / golem 878). Split into `jest (fast ·
    required)` = 467 deterministic suites (~3950 tests, the real regression
    ratchet, verified 467/467) and `jest (heavy sims · reported)` = the 27 stress/
    balance sims (non-blocking; they exercise the tail-growth finding — Open Item
    #2). Killed a class of latent RNG flakes at the source: a seeded Math.random
    (jest.setup.js), an incidental-weather pin, fixture hpMax pins, and a
    recalibrated outcome-split band. Engine (OTA-1173) got the same harness and
    greened 12 of its own red suites (28 → 16); its fast job stays reported
    (Open Item #1).
  • **a11y sweep → every screen + component** (HAL 902 / golem 879 / engine 1174).
    On top of the SA-6 baseline: ~230 button roles, ~60 header roles, labels on
    every icon-only control, selected/disabled/expanded state reused from existing
    conditions, modal focus-traps, decorative-image hiding, grouped EnemyPanel
    label. Purely additive props — tsc clean, fast jest 467/467.
  • **lint → BLOCKING** (HAL 903 / golem / engine). The `lint` job never actually
    ran (no ESLint flat config existed; ESLint 9 errored out). Added a lean, high-
    signal ESLint 9 flat config (`eslint.config.js`) + pinned toolchain; green on
    the current tree; job flipped from `continue-on-error` to required.
  See Section 8 "OPEN ITEMS (2026-07-20)" for the two threads left open.

- (843–845 = the complete Tier-3
emergent-depth batch, all three lines. 845 = The Fallen (cross-character death memorial).
844 = World Pulse (factions drift offscreen + rumours), ships to all three.
843 = Tier-3 depth #1, Character Chronicle — new engine/chronicle.ts + a Character-sheet section, ships to all three.
840–842 = the complete Tier-2 QoL batch, all three lines. 842 = combat-log damage-modifier breakdown (one clean bracket
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
| 845 | 825 | 1126 | TIER-3 DEPTH #3 — "LOSING IS FUN": THE FALLEN (cross-character death memorial). Death used to be a clean wipe — a character fell and, absent a Resurrection Gem, was simply gone. Now every death is remembered install-wide: `saveSystem` GlobalStash gains a **`fallen: FallenHero[]`** roll (`{name, raceName, epitaph, locationName, kills, corruption, hours, ts}`) with **`recordFallen`** (append, capped 25) + **`loadFallen`** readers. **`handlePlayerDeath`** builds the fallen record (from the epitaph it already picks + race name + milestones kills + corruption tier + location + hours) and appends it, then adds a beat: "You join the Fallen of Tartaria — N names the buried world keeps now." A new **FALLEN tab in `LoreCodexBody`** (async `loadFallen` via useEffect, newest-first) renders the memorial — readable BETWEEN runs from the title-screen codex host too, so a long-dead predecessor is never forgotten. **The `**AskUserQuestion**` for the death-content direction aborted (transient tool error), so I built my recommended core — The Fallen — and deferred the two heavier variants: (a) dead/hollowed PC rising as a corrupted enemy a later character can put down; (b) permanent corruption "scars" that persist even after a cleanse. Both are natural follow-ups if the owner wants them.** Ships to all three lines (saveSystem type+helpers + 1 gameStore death hook + 1 codex tab). Test: ota845TheFallen (record/read/accumulate/field round-trip/cap/return-size). |
| 844 | 824 | 1125 | TIER-3 DEPTH #2 — THE WORLD THAT MOVES OFFSCREEN (World Pulse). Tartaria used to sit still between the player's actions — factions never gained/lost ground on their own; nothing happened the player didn't cause. New **`app/engine/worldPulse.ts`** `nextWorldTide(factions, tides, tickIndex)` (pure, DETERMINISTIC — the tick index picks the mover, no RNG, so it's reproducible + testable) advances the balance of power one pulse: the mover faction gains a point of momentum, its `rivals` lose one, its `allies` gain one (clamped ±5), and it returns an in-world rumour. **`worldTideCheck(get,set)`** (gameStore, called at the end-of-action settle next to dogThresholdCheck, gated to ~one pulse per in-game DAY via `WORLD_TICK_HOURS=24`) runs it, stores per-faction momentum in **`worldMemory.factionTides`**, appends to **`worldRumors`** (last 12), stamps `lastWorldTickHour`, and drops a `🗞 Word on the wind: the Mud Monarchs press their claim…, and the Forgotten Order give ground.` world-log line so the player SEES the shift. First action on a save just stamps the baseline (no turn-one rumour). The Character-sheet FACTION STANDINGS panel now tags each faction rising ▲ / ascendant ▲▲ / waning ▼ / collapsing ▼▼ via `tideLabel`. **Scope note (MVP):** this is faction TIDES + rumours only — the fuller "NPC fates resolve, rumours generate from richer world state" is deferred; tides don't yet feed contract availability or prices (a natural follow-up). Ships to all three lines (new engine module + 3 WorldMemory fields + one gameStore tick + one Character-sheet tag). **Engine note:** engine reads factions via the content pack (`getFactions`) not the JSON — reconcile the require on that line. Test: ota844WorldPulse (deterministic mover/rival/ally + clamp + the day-gated pulse firing). |
| 843 | 823 | 1124 | TIER-3 DEPTH #1 — CHARACTER CHRONICLE / legends log (owner's Tier-3 batch: "deepen toward DF — make each character a story"). A long-lived character already ACCRETED a story (`worldMemory.memorableEvents` logs the dramatic beats — first kill, faction oath, Guardians felled, the Choice; `milestones` count lifetime deeds; corruption marks the descent) but nothing pulled it into one readable place. New **`app/engine/chronicle.ts`** `buildChronicle(player, events, ctx)` (pure) returns `{title, headline, deeds[], entries[]}` — a headline (`<race> · <faction> · Nd Mh in Tartaria`), a deed-list (foes bested · kinds catalogued · titles earned · Cores recovered · corruption tier), and the memorable beats as a **glyph-marked timeline** (a per-kind glyph map; oldest → newest — the events array is already append-ordered, capped 40). Surfaced as a collapsible **CHRONICLE** section at the TOP of the Character sheet (reuses the existing sectionHeader/collapse pattern; empty state "Your legend is unwritten. Go and make it."). Also NEW: a WORSENING corruption-tier crossing now records a **`corruption_tier`** memorable event (added to the MemorableEvent kind union) at the weather-accrual site (guarded on a local tier-order array so a recovery doesn't log), so the Aether's arc shows in the timeline, not just the live number. Ships to all three lines (new engine module + Character-sheet section + one type + one gameStore record site). Test: ota843Chronicle (title/headline/deeds/timeline/empty/corrupted). |
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
