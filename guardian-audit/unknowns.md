# Guardian Critical-Path Audit — Unknown / Ambiguity Register (Pass 1, §13)

Per hard rule: "Do not fill holes with guesses." Every entry below is a genuine gap this pass identified
and deliberately left open, with the evidence already inspected and what would close it — not a guess at
the answer. IDs are referenced from across the other `guardian-audit/` deliverables; this file is the
consolidated register those references point to.

---

## UNK-001 — Branch-topology documentation drift (`main`'s HANDOFF.md vs. observed CI/promotion practice)

- **Question:** Is `HaL2001`-first-then-`golem-line` (as `main`'s `HANDOFF.md`, dated 2026-08-07, describes)
  still a live parallel process, or has the team fully moved to the `golem-line` (trunk) → CI → promotions
  → `hal` pipeline this container's history shows in practice?
- **Why it matters:** Determines which branch is the actual authority for "current state of the game" —
  this audit chose `golem-line`, and a wrong choice here would misattribute every downstream finding to the
  wrong source tree.
- **Evidence inspected:** `main`'s `HANDOFF.md` (read in full), `golem-line`'s `HANDOFF.md` (read), the
  presence of `.github/workflows/ci.yml`, `eas-update-golem.yml`, and a `promotions` branch with
  per-SHA promotion records.
- **Competing interpretations:** (a) pure documentation lag — the process changed, the doc didn't; (b) both
  lines are still live and `main`'s doc is accurate for some parallel track this pass didn't find evidence
  of.
- **What would resolve it:** Ask the repository owner directly, or find a dated commit/PR that explicitly
  retired the `HaL2001`-first workflow.
- **Status:** OPEN.

## UNK-002 — Exact coup-de-grâce mechanism location in `playerWalker.ts`

- **Question:** Where, by file:line, is the "60-round coup-de-grâce" overlong-fight stop condition
  implemented? The Walker's own header states it exists; this pass did not locate the implementing code.
- **Why it matters:** A future Guardian Walker will fight genuinely harder, longer encounters (Guardians
  scale to tier 9 / `FINAL_GUARDIAN_HP=660`) — knowing whether this safety valve is reusable, and exactly
  what it does (force a result? abort the mission? something else) matters before relying on it.
- **Evidence inspected:** `playerWalker.ts`'s header comment (quoted twice in `existing-walker-map.md`);
  the `drainRolls`/`guard++ > 60` loop cap that WAS located (a related but distinct mechanism — that one
  caps the roll-draining loop, not combat rounds generally).
- **Competing interpretations:** (a) the same `guard++ > 60` cap IS the coup-de-grâce and the header is
  describing it loosely; (b) a separate, not-yet-located mechanism exists elsewhere in the 1720-line file
  or in `combatResolution.ts`.
- **What would resolve it:** A full-body read of the remaining ~60% of `playerWalker.ts` not covered by
  this pass's three targeted reads, cross-referenced against `combatResolution.ts`.
- **Status:** OPEN.

## UNK-003 — Supporting harness files not read in full

- **Question:** What do `test-utils/placePlayer.ts` (44 lines), `test-utils/factionProbes.ts` (168 lines),
  and `test-utils/storeSource.ts` (66 lines) actually do? Only inferred from filename/import context this
  pass.
- **Why it matters:** Any of these could contain reusable machinery (placement logic, faction-state
  probing, source-pinning) relevant to a future Guardian Walker's setup phase.
- **Evidence inspected:** Filenames, `__tests__/playerWalkerSim.test.ts`'s reference pattern; none of the
  three files' bodies were opened.
- **Competing interpretations:** none formed — genuinely unread.
- **What would resolve it:** Read all three files in full.
- **Status:** OPEN.

## UNK-004 — Whether a straight Guardian-to-Guardian run (skipping ALL optional content) is achievable across all 9 capitals

- **Question (original):** Beyond the architectural fact that Guardian order is free and `canRecoverCore`
  is confirmed dead as a summon gate (see UNK-005, RESOLVED), is there any PER-CAPITAL hidden requirement —
  faction standing threshold, story-phase flag, or world-state condition reachable only through optional
  content (a hunt, mystery, or faction-quest chain) — that would force a player to touch excluded content
  just to physically REACH or SUMMON a specific Guardian?
- **UPDATE (addendum pass) — mission/quest-gate sub-question RESOLVED, narrowed to one remaining part:**
  `mainQuest.ts` was read in full this pass (previously ~20%, now 100% — lines 834-1096 newly read:
  `remainingCapitals`, the 3-Core/4-Core twist functions, `advanceMainQuest`). Findings:
  1. `advanceMainQuest`'s `core_recovered` case (mainQuest.ts:1073-1085) has **no mission/hunt/quest
     prerequisite check at all** — only phase-state guards. This is the entire gate.
  2. `FACTION_CORE_GATES`'s own header comment (mainQuest.ts:932-943) states the per-faction `intents`
     are a **"simple intent-match check"** (a parser-verb match), not a hunt/mystery/quest completion.
  Both points are read directly from source, not inferred. **This closes the "does Core recovery secretly
  require optional content" question: it does not, by the gate's own documented design.**
- **Remaining open sub-question (bounded, not pursued further this pass per addendum §10):** whether
  *physically reaching* a Lost Capital's map tile is itself gated by any world-map/travel lock (as opposed
  to a mission-state gate). One targeted grep (`LOST_CAPITAL_LOCATIONS` usage in `worldMap.ts`,
  `travelTime.ts`, `gameStore.ts`) found only reactive checks (code that runs after arrival), no
  travel-blocking logic — evidence toward "no lock," not proof, since `worldMap.ts`'s full routing body
  was not read start-to-end.
- **What would resolve the remainder:** A full-body read of `worldMap.ts`'s routing/movement-gate logic
  (or a live/Walker-driven attempt to route directly to each of the 9 capitals from a fresh start).
- **Status:** OPEN, narrowed. Mission/quest-gate layer: **PROVEN no optional-content requirement.**
  Physical-travel layer: **UNPROVEN, UNCONTRADICTED** (no evidence of a lock found, not exhaustively ruled
  out). See `core-guardian-map.md` §4 (updated) and `critical-path-map.md` §A for the full restatement.

## UNK-005 — `canRecoverCore`'s actual role — RESOLVED during this pass

- **Question (as originally raised):** What does `canRecoverCore`'s function body actually do, and does it
  gate the Guardian summon?
- **Resolution:** Read in full (`mainQuest.ts:1029-1037`). The function's own header comment states
  verbatim: *"THIS NO LONGER GATES THE SUMMON, AND MUST NOT BE RE-WIRED TO"* — an explicit owner ruling
  that Guardian summon must stay separate from `investigate`/`examine` so side-capital-city content isn't
  consumed as a side effect of gating. The function is kept only for flavor-text/pinning purposes, not as
  an active gameplay gate.
- **Evidence:** `mainQuest.ts:1029-1037`, full body read; corroborated by `coreGuardians.ts`'s own
  Guardian-spawn path, which does not call `canRecoverCore`.
- **Status:** **RESOLVED** (during this pass — see `core-guardian-map.md`'s edited §6).

## UNK-006 — `test-utils/contraryWalker.ts` (1159 lines) not read in full

- **Question:** Does the older "data-shaped" walker contain any machinery (non-happy-path stress patterns,
  its own replay/seed handling, or anything Guardian-adjacent beyond the sampled FLEE-detection regex that
  merely matches a Guardian rebuke LINE, not Guardian orchestration) worth carrying into a future Guardian
  Walker?
- **Why it matters:** It is explicitly still present in the repo (not deleted/deprecated per any evidence
  found), so it may be either live, reusable infrastructure or a fully-superseded predecessor to
  `playerWalker.ts` — this pass could not tell which from sampling alone.
- **Evidence inspected:** One targeted grep sample only (`FLEE_LINES` / Guardian-rebuke-regex match);
  `playerWalker.ts`'s own header framing it as the older approach being replaced.
- **Competing interpretations:** (a) fully superseded, kept only because its own test suite still runs it;
  (b) still actively maintained for a distinct stress-testing purpose `playerWalker.ts` doesn't cover.
- **What would resolve it:** Full read of the file plus a check of whether `docs/contrary-walker-*.md` (seen
  referenced but not opened) describes an active or retired role.
- **Status:** OPEN.

## UNK-007 — Relationship between `PlayerCharacter.dog`, `.golem`, and `.companion` fields

- **Question:** `dog?`, `golem?`, and `companion?` are three separate optional fields on `PlayerCharacter`.
  Is `companion` a generic slot that `dog`/`golem` alias into, a legacy field being migrated away from, or
  a genuinely independent third companion type?
- **Why it matters:** Companion state (esp. `dog`) is heavily involved in combat (the original OTA-1884
  "picker takes the region" work this container closed immediately before this audit began was DOG/HEAL
  picker code) — any future Guardian Walker or state-mutation trace needs to know which field is
  authoritative.
- **Evidence inspected:** `types.ts`'s `PlayerCharacter` interface (field list only, via extraction — not
  the full 2913-line file, so no usage-site cross-reference was done for these three fields specifically).
- **Competing interpretations:** none formed — the interface declaration alone doesn't disambiguate.
- **What would resolve it:** Grep all three field names' read/write sites across `app/engine/dogCompanion.ts`,
  `app/engine/golems.ts`, and `gameStore.ts`.
- **Status:** OPEN.

## UNK-008 — `PlayerCharacter.aetherBuff`'s relation to the combat buff system

- **Question:** Is `aetherBuff?` a distinct buff category from `statusEffects` (also on `PlayerCharacter`),
  or a specific instance/alias within it?
- **Why it matters:** Buff/status tracking is a likely candidate-relationship target for any future
  Guardian-fight instrumentation; conflating two actually-separate systems (or missing that they're the
  same) would corrupt a later trace.
- **Evidence inspected:** Field list extraction from `types.ts` only.
- **Competing interpretations:** none formed.
- **What would resolve it:** Grep `aetherBuff` usage sites against `statusEffects` usage sites and compare.
- **Status:** OPEN.

## UNK-009 — Full many-to-many trace: 341 system candidates × 112 `PlayerCharacter` fields not attempted

- **Question:** Which of the 341 catalogued system candidates read or write which of the 112
  `PlayerCharacter` fields, specifically (not just "gameStore.ts is the near-universal writer")?
- **Why it matters:** This is the actual causal graph a second-pass architectural review would need to
  reason about state-mutation reachability precisely; this pass's relationship ledger and state-mutation
  ledger are evidenced summaries, not this full trace.
- **Evidence inspected:** `system-candidates.json` (341 entries) and `character-state-inventory.md` (112
  fields) both exist as complete inventories; the CROSS-PRODUCT between them was not built.
- **Competing interpretations:** n/a — scope decision, not an ambiguity.
- **What would resolve it:** A dedicated, deliberately-scoped pass (per-module static analysis or targeted
  greps per field name), explicitly called out in `relationship-ledger.md`'s closing section as work the
  next pass should scope rather than have this pass rush.
- **Status:** OPEN — explicitly deferred, not attempted.

## UNK-010 — `app/engine/saveSystem.ts` (1927 lines) not read in full

- **Question:** What does the save-system's full implementation do beyond the export/header-level sweep
  this pass performed?
- **Why it matters:** It is the largest single file in the persistence surface and the audit's own §11
  asks for enough detail to support "creating reproducible before/after snapshots" — a header-level sweep
  establishes WHAT concepts exist (slot saves, global stash, etc.) but not exactly how a snapshot/restore
  would be implemented against it.
- **Evidence inspected:** Export list and header comments only (regex/grep-level), not full-body read.
- **Competing interpretations:** none formed.
- **What would resolve it:** Full-body read, focused on the actual save/load function implementations.
- **Status:** OPEN.

## UNK-011 — Whether `get().persist()` collides in name only, or in behavior, with the zustand `persist` middleware

- **Question:** `persist()` is called as a store method in `gameStore.ts` (4+ call sites found). Is this
  purely a hand-rolled method sharing a name with the well-known zustand middleware, or does the codebase
  also use the actual middleware somewhere, creating two overlapping persistence mechanisms?
- **Why it matters:** Building any snapshot/replay tooling on top of "persistence" needs to know which
  mechanism is actually in effect — assuming the wrong one could silently miss state.
- **Evidence inspected:** 4+ `get().persist()` call sites found via grep in `gameStore.ts`; no `import {
  persist } from 'zustand/middleware'` was found in the files read, but `gameStore.ts`'s full 36,793-line
  body was not read in full (see UNK-012), so this is not a complete negative.
- **Competing interpretations:** (a) purely hand-rolled, no middleware use anywhere; (b) middleware used
  for a subset of state this pass's partial read didn't reach.
- **What would resolve it:** A targeted grep for `from 'zustand/middleware'` across the whole tree
  (narrower and cheaper than reading all 36,793 lines).
- **Status:** OPEN.

## UNK-012 — `app/state/gameStore.ts`'s full 36,793-line body not read in full

- **Question:** What does the store's own ~230 top-level exported action functions actually DO, beyond
  their names (extracted via regex) and the ~10 `require('./coreGuardians')` call sites that were
  specifically grepped for?
- **Why it matters:** This is the single largest and most central file in the entire codebase — every
  other finding in this audit that references "gameStore.ts calls X" is evidenced at the
  import/export/grep level, not by reading the calling code's actual logic. This is the largest single
  reading gap in the whole pass, named honestly rather than papered over.
- **Evidence inspected:** Top-level import block (regex-extracted), top-level export list (regex-
  extracted), ~10 targeted grep hits for `require('./coreGuardians'` and `persist()`), and the specific
  ~40-line comment thread around line 7931-7968 (the save-size root-cause comment, read directly).
- **Competing interpretations:** n/a — scope decision, not an ambiguity, given the file's size relative to
  a single pass's practical reading budget.
- **What would resolve it:** A structured, sectioned read (the file likely has internal grouping/comment
  banners given its decomposition-in-progress state) rather than one linear read; or targeted reads scoped
  to specific action names as the next pass identifies which ones matter.
- **Status:** OPEN — explicitly deferred.

## UNK-013 — Why `coreGuardians.ts` is reached via deferred `require()` from `gameStore.ts` at 10+ sites, while ~131 other `app/engine/*` modules are statically imported

- **Question:** Is this a deliberate circular-dependency-avoidance pattern, an artifact of incremental
  refactoring (Guardian code added later, into a file already too large to safely add new top-level
  imports to without risking an ordering issue), or something else?
- **Why it matters:** An unusual pattern isolated to exactly the Guardian subsystem is worth understanding
  before a second pass builds new Guardian-domain code that also needs to reach `gameStore.ts` — if it's a
  real circular-dependency constraint, new code needs to respect it; if it's incidental, it may not matter.
- **Evidence inspected:** The one static import line (`isCoreGuardian`, `capitalIdFromGuardian`, line 97)
  and 8 of the 10+ `require()` call sites (grepped, not each individually read in context).
- **Competing interpretations:** (a) real circular-dependency constraint (`coreGuardians.ts` importing
  something from `gameStore.ts` or a module that itself imports `gameStore.ts`); (b) incidental — no
  constraint, just how it was written.
- **What would resolve it:** Check whether `coreGuardians.ts` (or anything it imports) imports FROM
  `gameStore.ts`, directly or transitively — if yes, that's the answer.
- **Status:** OPEN.

## UNK-014 — Whether production code ever writes to the store via direct `store.setState(...)` outside a named action

- **Question:** `test-utils/playerWalker.ts`'s `resetForMission()` does this (confirmed, test-only). Does
  ANY production (non-test) code path do the same, bypassing the store's own named-action surface?
- **Why it matters:** Matters for reliability of "every state mutation goes through a named, traceable
  action" as an assumption for any future instrumentation — if production code also bypasses named actions
  in places, those mutation doors wouldn't show up in an action-name-based trace.
- **Evidence inspected:** One example found (test-only). No systematic grep for `store.setState(` /
  `set({` restricted to production (`app/`) files was run this pass.
- **Competing interpretations:** none formed — genuinely unchecked.
- **What would resolve it:** `grep -rn "setState(\|^\s*set(" app/` (excluding `test-utils/` and
  `__tests__/`) and manually classify hits.
- **Status:** OPEN.

## UNK-015 — Which of the 53 UI-reachable components call which specific store action

- **Question:** `grep -rl "useGameStore(" app/components app/screens` returns 53 files (of 101 total). This
  pass confirmed those 53 files reach the store SOMEHOW, but did not map each file to the specific
  action(s) it calls.
- **Why it matters:** §4 of the audit asks specifically "whether UI can reach it" per mutation door — this
  pass answered that at the file-count level, not the per-door level.
- **Evidence inspected:** The 53-file grep result itself (`components_using_store.txt` in this pass's
  scratch output); no per-file action-call extraction was done.
- **Competing interpretations:** n/a — scope decision.
- **What would resolve it:** For each of the 53 files, grep the specific store method/action names called
  (e.g. `useGameStore(s => s.submitPlayerAction)` patterns) and build the per-door UI-reachability map.
- **Status:** OPEN — explicitly deferred.

## UNK-016 — Statement-level call path from "an Enemy in the fight array has `core_guardian` trait" to `combatResolution.ts` actually running that fight

- **Question:** The inference that Guardian fights resolve through the same `combatResolution.ts` machinery
  as any other fight is STRONG but not statement-traced — is there any branch anywhere in the actual combat
  loop that checks `CORE_GUARDIAN_TRAIT` or `isCoreGuardian()` and does something fight-mechanically
  different (not just reward/narration different)?
- **Why it matters:** If a hidden Guardian-specific branch exists in the combat resolution path itself
  (not just in `coreGuardians.ts`'s pre-fight scaling), a future Walker's combat-handling code would need
  to account for it specifically.
- **Evidence inspected:** `coreGuardians.ts`'s `spawnGuardianForCapital` return-type shape (ordinary
  `Enemy`, not a special type) and `combatResolution.ts`'s export-name list (no Guardian-named export) —
  both are strong indirect evidence, not a trace of the actual runtime call path.
- **Competing interpretations:** (a) genuinely no special-casing, Guardian difficulty comes entirely from
  pre-fight stat scaling; (b) a small, easy-to-miss conditional exists inside one of `combatResolution.ts`'s
  ~3285 lines that this pass's export-level read wouldn't surface.
- **What would resolve it:** `grep -n "CORE_GUARDIAN_TRAIT\|isCoreGuardian\|core_guardian" app/state/combatResolution.ts`
  followed by reading any hits in context.
- **Status:** OPEN.

---

## Summary count

| Status | Count |
|---|---|
| RESOLVED (during this pass) | 1 (UNK-005) |
| OPEN | 15 (UNK-001, 002, 003, 004, 006–016) |
| **Total unknowns registered** | **16** |
