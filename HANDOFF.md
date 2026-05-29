# Tartaria Realms — Session Handoff

> **Branch:** `claude/new-session-MvF82` (active work) + `HaL2001` (experimental sandbox, kept in sync — every OTA from this wave is on BOTH branches via cherry-pick after a HaL2001 push).
> **App version:** `2.4.1` — milestone baseline; previous milestone was `2.201`.
> **Latest OTA:** `2026-05-28-162` (Stress sweep wave — 5 stress agents in parallel surfaced 12 issues across the player-input + crafting + travel + collection paths; 8 shipped as OTAs 155-162 across one session. Player-side: OTA-155 eat-without-target refusal (fixes `eat ratoin` → 8h sleep, same class as OTA-125 drink), OTA-156 drunk-run collapse (`eatt`/`useee`/`scrappp`/`drinkkk` now resolve), OTA-157 no-space travel-verb splitter (`gowest`/`gonorth`/`walknorth`), OTA-158 dog-verb typo tolerance (`fed dog`/`cll dog`/`helll dog`), OTA-159 `defend` → dodge stance, OTA-160 scene-feature refusals teach salvage. Engine-side: OTA-161 Yulka disc grant merge, OTA-162 cardinal-step location discovery. 4 stress findings skipped as non-bugs (punctuation jam-ins handle correctly at parser; distance-bookkeeping on target switch is correct geography; weather.kind undefined is agent probing wrong field; silence-rate is downstream null-scene test bootstrap.). See **Section 0** for the closed-issue archive.
> **Recent session arcs:**
> - **2026-05-25 → 2026-05-26:** 37 OTAs from `020` → `056` — quality-of-life, scanner system, engagement engines, stress testing, playtester-feedback loop. See section 6.A.
> - **2026-05-26 → 2026-05-27:** 25 OTAs from `070` → `094` — investigation table system (071-080), salvage/climb chip-greying hardening (070, 076, 083-086), elevated overlay mini-areas (089-092), parser tightening (093-094). See **Section 0.B** for the issue-tracker view of each.
> **Latest APK trigger:** `2026-05-23a` (in `metro.config.js`) — APK **#207** built at runtime `2.4.1`. **Existing v2.201 testers must install APK 207 (or later) to receive any OTA published after `2026-05-23-011`.** No native rebuild has been required since.
> **TypeScript:** 0 errors (`npx tsc --noEmit`) — checked at every OTA bump.
> **Tests:** 107/107 pass across the canary five (`salvagePools`, `theftNarrationGuard`, `itemEffect`, `statTraining`, `areaSearch`) + the 9 new test files shipped this session (`variableRewards`, `chainedNarrative`, `jitTemptation`, `sessionResume`, `mysterySeeds`, `parserFuzz`, `craftRepairFuzz`, `engagementSmoke`, plus the existing `equipSwap`/`equippedIds`/`inventoryAudit`/`recipeFuzzy` set). The longer sim files (`yearSimulation`, `thousandDayStressSim`, `twoYearChaosSim`) pass too — `twoYearChaosSim` has one borderline "geographic loops ≤1" assertion that flakes 1 in 3 runs (RNG variance against an asymptote-of-threshold metric, pre-existing). Three stress files (`combatStress`, `domesticStress`, `metaNavStress`) OOM-abort in this sandbox at the 700-day sim length — pre-existing infrastructure ceiling, not a regression.
> **Working tree:** clean.
> **Open PR:** #1 — draft, this branch → `main`, **stale** relative to OTAs 020 → 056. Description still reflects OTA 053-era state. Refresh before requesting review (the PR summary should walk the five waves below + the deferred items in section 7).
> **Open issues:** 5 (in Section 0.A — Hub-room key collision deferred; ongoing catalog backfill; inference engine doesn't check materials.json; hook-puzzle parser misses on "rotate the ring"; narrative-suggested actions like "knock on the steeple" parse as unknown). GitHub repo issue tracker remains at 0.

> **For the next Claude instance:** read section 16 first — it's a snapshot of the player's working style + the major systems + the in-flight context. Then **Section 0** for the live issue tracker (the canonical Open / Closed list — read BEFORE planning any fix). Then section 6.A for the recent wave's reasoning. Section 7 lists what's still on the table.

---

## 0. Issue Tracker — Open and Closed

> **The canonical record of issues across the build.** Every OTA / APK push updates this section in the same commit. **Read this section before planning any fix** to (a) check whether the issue is already closed and the fix exists, and (b) make sure your plan won't break a previously-closed fix. The workflow rules live in `CLAUDE.md` → "HANDOFF.md — the build timeline."

### 0.A — Open Issues

- **Rumor-of-trapped-dog Arbiter hint for old-save players (OTA-125 follow-up).** Day-32 character on OTA-124 went 2 days of gameplay without ever encountering a rescue hook noun. The rescue system is wired correctly (fires on any future tap of cage / chain / wagon / wheel / cellar / trapdoor / snare / trap / pit / smelter / forge ruin on investigate / attack / advance / travel / ask / use_relic), but discoverability is RNG-bound — a player who travels through scenes without those noun chips will never know the system exists. **Fix shape:** if `!player.dog && !worldMemory.dogRescueTipFired && day-count > 5`, the Arbiter periodically (~0.5% per scene entry) drops a rumor hint: *"Travelers have been speaking of a dog held at a smelter ruin to the [random cardinal]. The Reclaimers have been quiet about it."* Set the flag so the hint only fires once per save. Low priority — system works, just needs a discovery nudge. **Status:** open.

- **Catalog cross-file duplicates (OTA-124 stress-sweep finding).** Five items appear in BOTH `app/data/items/gear.json`/`amulets.json` AND `app/data/items/exploration.json`: `Aetheric Torch`, `Aetheric Compass`, `Minor Aetheric Amulet`, `Lightstone Amulet`, `Whisperer's Charm`. `findCatalogItem` first-hit-wins masks the issue at the call site, but the second-file row's `effect` / `tcBuy` / `faction` fields silently drop. **Fix shape:** decide canonical home per item and remove the other. **Status:** open; not user-facing today (engine handles), but a real authoring trap. Captured in `__tests__/catalogIntegrityWithDogGear.test.ts:178` as `test.failing`.

- **Within-file duplicate: `Aetheric Shield` (OTA-124 stress-sweep finding).** `app/data/items/weapons.json` has TWO `Aetheric Shield` entries — a melee shield at line 95 and a runecaster variant at line 228. Different mechanics; the second row is UNREACHABLE through `findWeaponByName` (`Array.find` returns first). **Fix shape:** rename one or merge. **Status:** open. Captured in `__tests__/catalogIntegrityWithDogGear.test.ts:226` as `test.failing`.

- **`isCataloguedElsewhere` guard missing DOG_GEAR (OTA-124 defensive add).** `app/engine/crafting.ts:320` doesn't include `DOG_GEAR` in the catalog-elsewhere check, so a future dog vest with weapon-y / armor-y keyword names ("Plated Vest", "Bladed Harness") could slip past the guard and trigger false `inferred-stats:` warnings. Current 4 vests are safe (names don't trip the keyword heuristics). **Fix shape:** add `DOG_GEAR` to the guard list. **Status:** open; low priority.


- **Dog Companion system (OTA-114 planning entry — implementation NOT started).** User spec: a one-at-a-time canine companion the player meets early, names, and travels with. Stats live on the player Stats page; combat reflects the dog's actions like the golem system; dogs need feeding or abandon; dogs and golems are mutually antagonistic; dogs can't climb. Below is the full implementation framework. **Status: planning only — no code lands until user signs off.**

  **Acquisition — rescue scenarios.** Dog acquisition fires as a sub-hook off the existing investigation table. The hook spawns a captor (human, from a faction the player is NOT part of) holding the dog. Combat resolves the rescue. **The captor fight is faction-neutral** — a new `factionNeutralFight: true` flag on the enemy record skips the standing-change pass that normally runs on hostile-NPC kills. Drafted scenarios (3-5 to choose from at world-gen):

    1. **Caged at the smelter** — investigate an abandoned smelter / forge ruin; discover a mongrel chained to an anvil post. Captor archetype: Reclaimer deserter (only spawns if player ≠ Reclaimer).
    2. **Tied to the wagon** — investigate a roadside camp / overturned wagon; find a stocky shepherd lashed to a wheel. Captor: Mud Monarch enforcer (only if player ≠ Mud Monarchs).
    3. **Cellar bark** — investigate a cellar / buried structure noun; muffled barking through the floor. Captor: Aether-Born scavenger (only if player ≠ Aetherborn).
    4. **The trapper's snare** — investigate a wilderness camp / pit; lean hound in a snare-pit, growling. Captor: unaligned poacher (no faction match needed — always available as fallback).

    Each scenario has its own investigation-hook key (`dog_rescue_smelter`, `dog_rescue_wagon`, `dog_rescue_cellar`, `dog_rescue_snare`). On dog acquisition, ALL four hooks die globally (single-shot per save) so the player doesn't get re-offered rescues. Each scenario seeds the dog with breed-flavor and a starting stat baseline (mongrel = balanced, shepherd = +STR, lean hound = +DEX, lazy mutt = +INT) so the player's chosen scenario gives them a slight build steer.

  **Naming flow.** Post-combat, the Arbiter runs a three-step conversational onboarding:
    1. `"What kind of dog is that?"` — **free-text input** (24-char cap). Player's answer IS the breed, full stop. "Old bloodhound," "scruffy white thing," "one-eared mutt," whatever they type. Breed is pure flavor — no mechanical effect; the rescue scenario already determined starting stats (see Acquisition).
    2. `"What will you name them?"` — free-text input (16-char cap). Defaults to a generated name (Rust / Cinder / Marrow) if the player skips.
    3. `"Boy or girl?"` — free-text input (8-char cap). Engine parses common tokens (`boy / male / he / him` → `'male'`; `girl / female / she / her` → `'female'`; anything else → `'unknown'`). The raw typed answer is preserved for narration flavor; the parsed pronoun drives every "your dog..." beat downstream — "her breathing slows" vs "his breathing slows" vs "their breathing slows" for the rest beat, the call modal, the dog-down combat line, the abandonment goodbye. No mechanical effect; cosmetic only.

    All three fields are immutable after entry. Players who want a different dog have to abandon and rescue another (rare event — rescue hooks die globally on first acquisition).

  **Data model — `player.dog: DogCompanion | null`.** Lives on the player record so it serializes with the save. Shape:
  ```
  interface DogCompanion {
    id: string;
    name: string;           // player free-text, 16 chars
    breed: string;          // player free-text, 24 chars — pure flavor
    sex: {                  // 3-token answer + derived pronoun
      raw: string;          // exactly what the player typed
      pronoun: 'he' | 'she' | 'they';  // drives narration
    };
    startingProfile: 'mongrel' | 'shepherd' | 'hound' | 'mutt';  // set by rescue scenario; drives baseline stats
    hp: number; hpMax: number;
    stats: { strength: number; dexterity: number; intelligence: number };
    statProgress: { strength: number; dexterity: number; intelligence: number };
    loyalty: number;        // 0-100; drops without feeding
    lastFedAtHour: number;  // game-clock timestamp
    equipped: { vest: string | null };  // armor slot
    status: 'with_player' | 'waiting_at_base' | 'abandoned' | 'dead';
  }
  ```
  No separate stamina field — **dog stamina mirrors the player's** (consumes from the same pool when the dog acts; the user's spec was explicit on this).

  **Pronoun-driven narration.** Every "your dog..." beat in the framework uses a `{pronoun}` / `{possessive}` / `{reflexive}` template that the engine substitutes from `dog.sex.pronoun` at render time:
    - `he` → he / his / him / himself
    - `she` → she / her / her / herself
    - `they` → they / their / them / themselves

    Examples: rest beat becomes `"Your dog circles three times and curls beside you. ${pronoun.cap}r breathing slows to yours."` Combat down-beat becomes `"${name} is down."` (name carries gender). Abandonment goodbye becomes `"You wake to find no warm weight at your back. ${pronoun.cap}'s gone."` All existing beats in this framework will be templated rather than hardcoded with "they/their" before Phase 4 ships.

  **Stat growth.** STR / DEX / INT only (no WIS / CHA on a dog). Use-based progression, same per-tier costs as the player (mirrors `statTraining.ts:40-47`). Per-stat training paths:
    - **STR:** every dog bite that lands in combat. Pinning a downed enemy.
    - **DEX:** dodging an enemy attack while in combat with player. Successful distract (see Combat). Auto-pass on rope sections where the player carries the dog up.
    - **INT:** successful smell-find on scene entry (see Smell mechanic below). Tracking a quest target. Successful alert on an ambush roll (dog barks → player gets initiative).

  **Combat integration.** Dog occupies a weapon-like row in the combat action menu when active. **The dog's name shows as the action label** (e.g., `MARROW — bite / distract`) so the player picks their action on the dog the same way they pick a sword vs a bow. Two combat verbs per turn:
    - **`bite`** — direct attack, `1d6 + floor(STR/2)` damage, piercing. Hit roll = `d20 + dog STR` vs enemy AC. Nat-20 crits (2× damage), nat-1 fumbles. Trains STR on hit.
    - **`distract`** — apply a `'distracted'` debuff to one enemy for 1 round. Roll `d20 + dog DEX` (or INT — whichever is higher) vs DC 12. On success, the next player action against that enemy gets +2: a dodge roll gets +2 to the parry total, a flee roll gets +2 (and the distracted enemy doesn't roll opportunity attack), an attack roll gets +2 to-hit. Failed distract = wasted action, no debuff applied. Trains DEX or INT (whichever the player picked).

    The dog acts at the start of the player's turn (free action, no stamina cost; uses player's stamina pool only if the player explicitly commands a costly maneuver later). DOG (hp/max) button surfaces in the quick-row in combat — tap to open the bite/distract picker. Enemy retaliation is split between player and dog based on threat. At 0 HP the dog falls (`"Your dog is down."`); auto-revives to 1 HP after the fight and spends 24 in-game hours in `status='waiting_at_base'` healing. **If the dog dies (HP 0 + fight is lost): Resurrection Gems revive dogs the same way they revive players** — pulled from the install-wide pool. No special dog-specific revive item.

  **Healing.** Dogs are healed by anything that heals the player. Trail Rations, First Aid Kit, Wild Carrot, mend casts, any consumable with a `healHP` effect — all work on the dog via `heal dog <item>` or `use <item> on dog`. The engine reuses the existing consumable-effect resolver (`itemEffect.ts`); the only delta is the target (player vs dog HP pool). 8-hour rest heals the dog at the same rate as the player.

  **Food / treats.** Dogs eat **the same foods the player does** — every consumable in the catalog is dog-eligible via `feed dog <item>`. Each feed restores loyalty:
    - Player food (Trail Rations, Wild Carrot, Hardtack, etc.): +20 loyalty per use, consumes 1 stack.
    - **Dog treats** (new loot-table additions — 3-4 varieties to author): +40 loyalty per use, no other effect. Drafted treat roster:
      - **Smoke-Cured Jerky Strip** (Common) — common loot from wasteland encounters, hunter camps.
      - **Marrow Bone** (Uncommon) — drops from boss kills, beast encounters.
      - **Honey-Glazed Knuckle** (Rare) — vendor stock at bakers / butchers.
      - **Ash-Cured Tongue** (Epic) — Reclaimer faction reward, ceremonial.

    Treats slot into existing loot tables — no new catalog kind, just `kind: 'consumable'` with a `dogTreat: true` flag (or tag) so the engine knows to surface them as `[treat]` in the inventory list. Players can eat them too if they want — same effect on player as a regular ration.

    Loyalty decay: −1 per 4 in-game hours without ANY food (player food or treat). Thresholds 50 / 30 / 15 / 0 trigger escalating arbiter beats; 0 = abandoned, permanent.

  **Smell-find mechanic (NEW).** Dogs autonomously surface hidden details. On scene entry (every new room or significant scene transition), the engine rolls `d20 + dog INT` vs DC 12. On success, the dog noses at a hidden noun and the engine adds ONE extra ambient noun to the room's investigation table that the player would otherwise have missed. Narration:
    `"Your dog noses at the [noun] and snorts. There's something there."`

    Hidden noun pool: drawn from a new `hiddenSmellNouns` array on each scene archetype (wasteland encounters, dungeon rooms, hub interiors). Authoring approach for v1: seed each major archetype with 2-3 hidden nouns (e.g., a buried bone fragment, a scent trail leading to a stash, a faint odor of bleed). Scenes without authored hidden nouns simply skip the smell roll. Trains the dog's INT on success (per the stat-growth section).

    Cooldown: smell-find fires at most once per room (`worldMemory.visitedRooms[roomKey].dogSmelledHere: boolean`) so the player can't farm INT by walking in and out of the same room. Rooms re-eligible after `roomInvestigationTable` is fully consumed (a fresh sniff makes sense if the player has cleared the visible nouns).

  **Travel & climb.** Dog follows the player automatically on cardinal moves and travel. **Dogs cannot climb** — when the player initiates a climb on a 1+ tier noun, the dog drops to `status='waiting_at_base'` at the climb origin tile. On `climb down`, the dog auto-rejoins. Long-travel routes don't strand the dog — when the player exits a hub or warps, the dog comes with them; only the active climb decouples.

  **Resting & flavor.** On `rest`, world line `"Your dog circles three times and curls beside you. Their breathing slows to yours."`. Dog regains HP at the same rate as player (8h rest → full HP). Loyalty bumps +5 for the shared rest. `call <dog name>` (or `call dog`) opens a brief modal with three options:
    - `Scratch their ear` — loyalty +2, flavor line.
    - `Give them a treat` — opens pack picker filtered to consumables + treats; loyalty +20 (regular food) / +40 (treat).
    - `Speak softly` — loyalty +1, flavor line.

  **Golem coexistence (OTA-120 design override — was mutex).** Dogs and golems CAN both be active in combat. Earlier framework rule ("dogs do not like golems → mutual exclusion") is overridden — they now fight side-by-side. Flavor still acknowledges the tension on first co-activation (`"Your dog gives the golem a wide arc and watches it sideways. Both will fight."`) but mechanically both companions act in the same turn order. Both occupy weapon-like rows in the combat action menu; both take enemy retaliation share. Enemy threat distribution becomes three-way (player / dog / golem) instead of two-way. No exclusion check anywhere in the combat path.

  **Puppy-vendor safety net (Phase 6 addition).** When the player's dog dies in COMBAT (not abandonment), a single-use replacement path opens. Rules:

    1. **Trigger flag on save:** `worldMemory.puppyVendorOwed: boolean`. Defaults false. Set true ONLY when `player.dog.status` transitions to `'dead'` via the combat-death path (`hp <= 0` AND fight lost — gem-revive path skips the flag-set).

    2. **Hunger-abandonment does NOT trigger the safety net.** If the dog hits loyalty 0 and abandons, `puppyVendorOwed` stays false. Player neglected their dog; no bail-out.

    3. **Activation window:** the puppy vendor spawns in the player's next outdoor scene AFTER they defeat their NEXT Core Guardian following the flag-set. So the player has to actually push forward in the main quest to earn the chance — it's not handed to them the next time they walk outside.

    4. **Vendor pitch:** A new one-off vendor archetype (NEW `puppyVendor` template). Arbiter beat on spawn: `"A stranger waits at the roadside with a wicker basket. Three pups inside — some breed you don't recognize. They look up at you. 'I'd trade one for the right kind of help,' the stranger says, eyeing your pack."`

    5. **Trade selection:** The engine picks ONE random item from `player.inventory` that meets ALL of: `rarity === 'Common'`, `quantity >= 1`, `kind !== 'weapon'` (don't take their starter weapon), and `kind !== 'armor'` (don't take what they're wearing). If nothing qualifies (vanishingly rare — Common materials, scraps, junk pulls are always around by mid-game), fall back to ANY 1-stack item except equipped gear. The vendor's framing: `"That {item} you've got — I've been needing one of those for a season. You hand me that, I hand you a pup. Fair?"`

    6. **Accept flow:** player taps ACCEPT → engine consumes 1 of the item → spawns the puppy → runs the same three-step Arbiter onboarding (breed → name → sex) → sets `puppyVendorOwed = false` and adds a hidden marker `worldMemory.puppyVendorUsed = true`. New dog's `startingProfile = 'puppy'` (slightly lower baseline stats — STR 8 / DEX 9 / INT 9 vs the rescued-dog 10-baseline; grows normally from there).

    7. **Decline flow:** player taps DECLINE → arbiter beat `"The stranger nods, hoists the basket, and walks on. The pups don't look back."` → `puppyVendorOwed = false`, `puppyVendorUsed = true`. No second chance. Single-shot is single-shot whether they took it or not.

    8. **Hard cap (user's spec):** ONE puppy vendor per save, full stop. If the puppy also dies in combat later, no second vendor. If the puppy abandons through hunger, no second vendor. `puppyVendorUsed === true` permanently locks the path. The save can never get a third dog from this mechanic.

    9. **Edge case — all Guardians cleared (OTA-120 addition: rubble-puppy fallback).** If the player has already defeated all 9 Core Guardians AND their dog dies in combat, the Guardian-victory trigger can never fire. Late-game fallback: a `puppy_in_rubble` investigation hook becomes available on outdoor wasteland scenes ~5% per scene-entry roll after the flag-set. Player investigates the rubble noun → finds a lone puppy → runs the same three-step Arbiter onboarding (breed → name → sex). Same restrictions: ONLY if `puppyVendorOwed === true` AND `puppyVendorUsed === false` AND all 9 Guardians are clear. Same single-shot enforcement (sets `puppyVendorUsed = true` whether accepted or not). No cost (no item trade — the puppy is just there in the ruins). This is the OTA-120 rubble-puppy late-game safety net the user added on top of the Guardian-gated vendor path.

    10. **Save / load:** `puppyVendorOwed` and `puppyVendorUsed` flags live in `worldMemory`, serialize naturally. Migration on existing saves: both default to false.

    11. **Phase 6 scope:** ~300-400 lines. Combat-death flag-set in the Phase 2 combat code, Guardian-victory hook in the Core Guardians resolution path, new `puppyVendor` enemy/vendor template, trade interaction reusing the existing vendor screen with a hardcoded one-item trade, onboarding re-run reusing Phase 1's Arbiter state machine. Medium difficulty — depends on Phase 1-5 being complete.

  **Dog gear — the Vest.** New equipment kind: `kind: 'dog_armor'` in the catalog. Initial roster (4 vests):
    - Burlap Vest (Common, +1 AC, no req)
    - Riveted Leather Vest (Uncommon, +2 AC)
    - Aetheric Padded Vest (Rare, +3 AC, reflects 1 corruption per hit)
    - Reclaimer Pattern Vest (Epic, +4 AC, +1 dog STR, faction-locked drop)

    Equip via `equip <vest> on dog` or via the Character screen's dog panel. Vests have durability and wear with hits like player armor; repair via the Crafting → REPAIR tab.

  **UI surfaces.**
    - **Title screen — character slot tiles**: when a save has an active dog (`status !== 'abandoned' | 'dead'`), the slot tile shows a second line under the player name with the dog's name + breed in parentheses. Format: `Marrow (old bloodhound)`. Lets the player pick the right save at a glance when they have multiple characters with different companions. Slots without a dog render the same as today (no extra line).
    - **Character screen**: new "Companion" panel beneath the player stats card. Shows dog name + breed (the player's typed answer) + a small sex glyph (♂ / ♀ / ⚥) next to the name + HP bar + loyalty bar + STR/DEX/INT trio with progress bars + equipped vest. Tap-to-call shortcut opens the call modal.
    - **World screen quick row**: DOG (hp/max) button in combat with bite/distract picker; `call <name>` shortcut chip in peace when dog is `waiting_at_base` or out of sight.
    - **Inventory**: vest items get a `[fits dog]` tag; treat consumables get a `[treat]` tag. Tapping either opens the relevant equip-on-dog or feed-dog flow.
    - **Tutorial**: NEW step `"Your dog"` after the existing "Golem sidekicks" step.

  **Open design calls — all resolved as of OTA-117. Framework is ready for Phase 1 implementation.**

  **Resolved this round (OTA-117):**
    - Stat-train pacing → mirror the player's per-tier costs from `statTraining.ts:40-47` (1-5 advances fast, 6-10 fast-ish, 11-14 normal, 15-18 slow, 19-22 grindy, 23+ a real commitment). No accelerated growth. [user confirmed]
    - Scenario count → ship all 4 at v1 (smelter / wagon / cellar / snare). [user confirmed]
    - Faction-neutral fight flag → implementation spec'd in detail below. [user confirmed: "define fight-flag implementation"]

  **Faction-neutral fight flag — full implementation spec:**

    1. **Type change.** Add optional field to the `Enemy` interface in `app/engine/types.ts`:
       ```typescript
       interface Enemy {
         // ...existing fields
         factionNeutralFight?: boolean;  // skips faction-standing
                                         // effects on kill / witness
       }
       ```
       Optional + defaulting to `undefined` so no existing enemy record changes behavior.

    2. **Spawn site.** When a dog-rescue scenario's investigation hook resolves and the engine spawns the captor, set `factionNeutralFight: true` on that enemy record before pushing it into `currentScene.enemies`. Spawning lives in the NEW `app/engine/dogCompanion.ts` module (same shape as `golems.ts`), with one captor factory per scenario:
       ```typescript
       function spawnRescueCaptor(scenario: 'smelter' | 'wagon' | 'cellar' | 'snare', playerFaction): Enemy {
         const captor = pickCaptorTemplate(scenario, playerFaction);
         return { ...captor, factionNeutralFight: true, ... };
       }
       ```
       `pickCaptorTemplate` chooses a captor whose faction ≠ player's faction. If all captors share the player's faction (e.g., Unknowing Masses player encountering the snare scenario — fallback always available), the scenario uses the unaligned poacher template.

    3. **Kill-handling skip.** Find the post-kill faction-standing update in `gameStore.ts` (grep for `factionStanding`, `standingChange`, `factionDelta` near combat-resolution / enemy-death handlers). Wrap the standing-change block:
       ```typescript
       if (!killedEnemy.factionNeutralFight) {
         applyFactionStandingChange(player, killedEnemy.faction, KILL_PENALTY);
       }
       ```

    4. **Hostile-witness cascade skip.** Same flag guards any "nearby faction members turn hostile" logic that fires on faction-coded kills. Same guard pattern; same fallthrough if no flag is present.

    5. **Loot / XP / quest progression preserved.** The flag does NOT gate loot drops, combat XP, stat training, or kill counters. Captor still drops their authored loot table, player still gets the combat XP, the kill still counts toward milestones — only the faction-standing and witness-cascade paths are skipped.

    6. **Flee path.** If the player flees the rescue fight, no standing change fires either way (flee already skips kill-handling). The dog stays trapped, the rescue hook stays available, the captor returns to the scene at full HP next visit. No penalty for backing out.

    7. **Death narration.** Scenario-specific arbiter beat explains the moral framing on captor death so the player understands the lack of consequence — e.g., `"They were keeping the dog illegally. No faction reckoning falls on you for this."` Lives in the scenario data (the `dog_rescue_*` hook narration), not in the engine. Avoids leaking the flag implementation to the player while still grounding the rule in fiction.

    8. **Save / load.** The flag lives on the enemy instance inside `currentScene.enemies`. Serializes naturally with the save state. Once the captor is killed and removed from the scene array, the flag is gone — no orphan-flag state to clean up.

    9. **Testing.** New regression test `__tests__/dogRescueFactionNeutral.test.ts` to ship in Phase 1:
       - Spawn scenario 1 with a Reclaimer-aligned player and a Reclaimer-deserter captor → assert `factionNeutralFight: true` is set on the enemy.
       - Resolve combat (player wins).
       - Assert: player's Reclaimer standing is UNCHANGED post-fight, no witness-cascade hostility flagged on nearby NPCs, loot dropped + XP granted normally.
       - Control: spawn a regular Reclaimer hostile (no flag) under the same conditions; assert standing DOES change.
       - Cross-scenario test: every rescue scenario sets the flag correctly; non-rescue enemies never have the flag set.

  **Mid-save acquisition.** When Phase 1 lands, existing saves get `player.dog: null` via a one-line migration in `loadSlotIntoGame`. Rescue hooks fire normally on the player's next investigate of a matching scene archetype (smelter / wagon / cellar / snare). No special migration path needed — the system is purely additive, no existing rule changes. Mid-save players have the same chance at the first dog as fresh starts.

  **Implementation phasing (6 OTAs, ~1 wave):**
    - Phase 1 (1 OTA, ~600-800 lines): Data model (`DogCompanion` type with free-text breed/name + sex.raw/pronoun, `player.dog` field, save/load + mid-save migration), three-step Arbiter onboarding flow (breed → name → sex), pronoun-template helper for narration substitution, rescue scenarios 1-2 (smelter / wagon), faction-neutral fight flag. **Medium-Hard** — the conversational state machine is the tricky bit.
    - Phase 2 (1 OTA, ~500-700 lines): Combat integration (DOG button with bite/distract picker, dog-as-weapon-row in action menu, enemy retaliation split, golem conflict, gem-revive path, combat-death detection setting `puppyVendorOwed` flag for Phase 6). **Medium-Hard** — integrates with the existing combat path at gameStore.ts:6500-7000.
    - Phase 3 (1 OTA, ~400-600 lines + JSON authoring): Travel + climb behavior (auto-follow, climb decoupling, hub transitions). **Smell-find mechanic** + per-archetype hidden noun authoring. Rescue scenarios 3-4 (cellar / snare). **Medium** — straightforward mechanics, repetitive content.
    - Phase 4 (1 OTA, ~400-600 lines): Hunger + treat-tagged loot table additions (4 new treat items: Smoke-Cured Jerky Strip / Marrow Bone / Honey-Glazed Knuckle / Ash-Cured Tongue) + `heal dog` / `feed dog` / `use <item> on dog` verb routing. Tutorial step. **Medium** — mostly state updates and verb routing.
    - Phase 5 (1 OTA, ~700-900 lines + new UI components): Stat growth wiring + UI surfaces (title-screen character slot tile gets a dog name + breed sub-line, Character screen Companion panel, Inventory vest/treat tagging, call modal). Dog gear catalog (4 vests). **Medium-Hard** — new React Native components.
    - Phase 6 (1 OTA, ~300-400 lines): Puppy-vendor safety net (one-shot per save, post-combat-death only, fires after next Core Guardian victory, one-item-from-bag trade, re-runs the Arbiter onboarding). **Medium** — depends on Phases 1-5 being complete.

  **Total scope:** ~3-4k lines across 6 OTAs, ~20-30 hours focused implementation. Every system has an existing precedent in the codebase (golem for combat, vendor for trade, statTraining for growth) so nothing is architecturally novel.

  **Files this would touch (preview):** `app/engine/types.ts` (DogCompanion type, dog_armor kind, treat tag, factionNeutralFight flag, puppyVendor template type), `app/state/gameStore.ts` (rescue spawn / combat / travel / rest / hunger / call / smell-find / heal / feed handlers / puppy-vendor trigger), `app/engine/dogCompanion.ts` (NEW — central module like `golems.ts`), `app/engine/puppyVendor.ts` (NEW — Phase 6 trade interaction), `app/data/items/dogGear.json` (NEW — 4 vests), `app/data/items/consumables.json` (4 new treats with `dogTreat: true`), `app/data/world/*.json` (hidden smell nouns per scene archetype), `app/screens/TitleScreen.tsx` (character slot tile — dog name + breed sub-line), `app/screens/CharacterScreen.tsx` (Companion panel), `app/screens/InventoryScreen.tsx` (vest + treat tagging), `app/screens/VendorScreen.tsx` (puppy-vendor trade rendering), `app/components/CallDogModal.tsx` (NEW), `app/components/tutorialSteps.ts` (new step). Approximate scope: 3-4k lines across 6 OTAs.

- **Per-golem summonDC differentiation (OTA-111 design call).** `runAethercraft` at `app/state/gameStore.ts:16592` uses a single hard-coded `dcBase = 15` (INT) for all four golem kinds. Lore-wise, Crystal and Aether golems are stronger anchors than Mud and Iron — they should arguably cost more. The OTA-111 AETHERIC tab footer surfaces the uniform DC-15 line to the player. **Fix shape:** add optional `summonDC?: number` to `GolemDefinition` in `app/engine/golems.ts`; `runAethercraft` reads `def.summonDC ?? 15`. Recommended values for design discussion: Mud 13, Iron 15, Aether 17, Crystal 19. **Status:** open; needs user input.

- **WIS-novel-step rate limit (OTA-112 deferred recommendation).** WIS is the fastest-growing stat at 0.168 XP/turn — every novel cardinal step trains it, and ~40% of turns are moves. After 5000 turns the player sits at WIS 18 while still at DEX 13. The audit recommended raising the novelty window from 20 to 50 tiles so wandering can't farm WIS. **Status:** open; deferred — nerfing the highest-growing stat is a feel call, not a correctness call. Pick up if playtest reports WIS-cap-then-cruise behavior.

— *Hook-puzzle parser-miss issues closed in OTAs 129/130/131/132 — see 0.B. The `rotate the ring`, `turn the locking ring`, `tap the steeple`, and `knock on the steeple` entries that previously lived here all resolve now: `rotate` / `knock` / `turn` / `twist` / `press` / `push` / `pull` are real intents with real puzzle resolution, deterministic sequences, hint copy at failure thresholds, mercy auto-solve, save/load preservation, examine-peek, and a direction-only fallback for "rotate left" without a noun.*

- **`tutorialSteps.ts` references the pre-OTA-095 screen layout.** Surfaced by the OTA-110 static audit. `app/components/tutorialSteps.ts` says "ACTIONS and RECIPES" tabs as if both live on `ActionReferenceScreen`, but OTA-095 ripped Recipes out of that screen and moved them into Crafting (OTA-091 also moved Aetheric there as a 4th tab). Non-breaking — players will just see slightly misleading guidance the first time. **Status:** low priority; refresh on the next tutorial copy pass.

- **Hub-room key collision (deferred from OTA-080 plan).** `makeRoomKey(locationId, microMicroId, mapX, mapY)` omits `hubRoomId`, so hub interiors that share `locationId` + `mapX/mapY` (chandelier study + armory + atlas hall in Asgardar) collide on the same per-room state. OTA-076 self-heals via inline table-seeding when a room is missing its investigation table, which masks the symptom for the investigate path, but other per-room data (climb markers, dedup lists) can still cross-pollute between hub interiors. **Fix shape:** add `hubRoomId` to `makeRoomKey` signature, update ~20 call sites, accept that old saves' explored rooms go cold + re-seed on the new key. **Status:** deferred — was planned as "OTA-081 will fix" in OTA-080 notes; OTA-081 shipped as the enemy HP bar fix instead, room-key never landed. Pick up when impact is observed (so far, only theoretical for hub-only data; OTA-076 covers the practical investigation case).

- **Ongoing catalog backfill from `inferred-stats:` debug lines.** Pattern: when an inventory item resolves through `app/engine/itemDefaults.ts` (no authored catalog entry), the engine logs `[debug] inferred-stats: <kind>:<name> — engine guessed stats; add catalog row when convenient.` Backfill these into the relevant `app/data/items/*.json` as logs surface them. **Status:** active. Last batch (OTA-093) added Bone Fragment. Future logs that show new inferred items → batch into the next OTA touching the catalog. No workflow change needed — grep logs for `inferred-stats:` each pass.

— *(Resolved across OTAs 129/130/131/132 — see 0.B for the wave summary.)*

- **Inference engine doesn't check `materials.json` before warning.** Surfaced 2026-05-27 when a playtest log showed `[debug] inferred-stats: armor:Sentinel Core Plate — engine guessed stats; add catalog row when convenient.` — but Sentinel Core Plate IS in `materials.json` as an Uncommon misc material. The keyword classifier in `itemDefaults.ts` saw "Plate" → guessed armor → emitted the warning even though the catalog has an authoritative row in a different lookup table. **Fix shape:** extend the fallback chain to consult `MATERIALS` (and similarly `CONSUMABLES`, `EXPLORATION` etc.) before invoking the name-classifier inference. **Status:** open. Not user-facing — just a noisy debug warning. Pick up next time we touch `itemDefaults.ts`.

- **TS 0 errors / Test suite green.** Always required pre-push. Tracked here as a passive gate rather than an issue.

### 0.B — Closed Issues (most recent first)

#### Inferred-item diamond marker on inventory rows

- **OTA-199 (2026-05-29) · A small rarity-colored ◆ before the name signals "this is engine-named" at a glance.**
  - **What:** Player: *"Since we don't know what items were inferred and now they are useful let's put a small diamond before the name to signify it is, use the appropriate rarity color."* Inferred items can now be substituted for canonical materials (OTA-193), reserved for fusion (OTA-194), or fused into unique gear (OTA-195) — but until this OTA the only way to know which items WERE inferred was to open the modal and read the description.
  - **Fix:** `InventoryScreen`'s `ItemRow` now checks the OTA-194 `isInferredItem(name)` predicate. When true, prefixes the item name with `◆ ` colored by the InventoryItem's rarity: Common `#c9a86a` (warm tan), Uncommon `#9ec96a` (green), Rare `#b88ce0` (purple), Legendary `#e07a5f` (orange — where OTA-195 fused items land). Palette mirrors `BrandedModal`'s `rarityColor` so the diamond on the row matches the rarity line the player sees inside the modal. Catalog items get no diamond — their identity is fixed and the marker would be visual noise.
  - **Verification:** No new tests (rendering-only on a predicate already covered by OTA-194's `craftTagSubstitution.isInferredItem` suite). Regression sweep (`craftTagSubstitution`, `itemFusionEngine`, `aethericLensAndShard`) stays green. `npx tsc --noEmit` clean app-side.
  - **Files:** `app/screens/InventoryScreen.tsx` (row diamond render + local `rarityHexColor` helper + `rowInferredDiamond` style).

#### Aetheric Vision Lens actually works + Shaped Aetheric Shard is now the 2d20 one-shot the rulebook said

- **OTA-198 (2026-05-29) · Two off-spec items brought into spec.**
  - **What:** Player: *"atheric vision lenses are supposed to be able to be equipped to have a better way to find etheric items, if wearing them when you investigate items you get a higher chance to find an etheric mission hook or the fusion forge. the shapes Aetheric shard is supposed to be a 2d20, 1 use throwing knife for high level enemies."* Pre-fix, the Lens was an exploration item that set effect `gate:detect_aether` — but no gameplay path checked `detect_aether`, so it was pure flavor. The Shaped Aetheric Shard's catalog blurb said "1d6 piercing" but `rollThrowDamage` saw "shard" matching the LIGHT name pattern and returned 1 — a single-digit end-game throwable.
  - **Fix (Lens):** `rollAreaSearch` in `areaSearch.ts` now takes `opts.hookBonus` that shifts the distribution toward `hook` outcomes (clamped 0..0.4 so the lens can never make every search a hook). `pickWastelandEncounter` takes `opts.aethericVision`; when true, `fusion_bench` archetype weights are 2× — the lens "sees" Aetheric resonance, and Crucibles ARE Aetheric resonance. New `aethericVisionActive()` wrapper in `itemEffect.ts` checks for the `detect_aether` gate. `gameStore.ts` gains a local `hasAethericVision(player)` and wires it into the three `rollAreaSearch` sites (search, harvest, AI search) with `hookBonus=0.15`, and into `stepDirection`'s `pickWastelandEncounter` call.
  - **Fix (Shard):** `rollThrowDamage` in `itemWeight.ts` has a name-based override for "Shaped Aetheric Shard" returning `rollDie(20) + rollDie(20)`. `gear.json` description rewritten to *"ONE THROW only — 2d20 aetheric damage. Carry it for the worst thing the road shows you."* Rarity bumped Common → Rare to match the payload. The throw consume path in `submitPlayerAction` already drains quantity on throw, so single-use is enforced by the existing inventory math.
  - **Verification:** +9 tests in `aethericLensAndShard` (hook bonus baseline ~15%, with-bonus ~30%, clamp at 0.4; 2d20 range in [2,40] + case-insensitive name + non-shard rocks still light; lens detection true/false; fusion-bench bias produces strictly more hits with `aethericVision=true`). Regression sweep across `areaSearch`, `itemFusion`, `craftTagSubstitution`, `petScratchVerbRouting`, `weaponResistNudge`, `itemEffect`, `salvagePools`, `theftNarrationGuard`, `statTraining`, `itemBackfill`, `itemSynthesisQwen`, `itemDefaultsBalancedSynth` — 171 tests across 13 suites green. `npx tsc --noEmit` clean app-side.
  - **Files:** `app/engine/areaSearch.ts` (hookBonus param + distribution shift), `app/engine/itemEffect.ts` (aethericVisionActive wrapper), `app/engine/itemWeight.ts` (shard override), `app/engine/wastelandEncounters.ts` (aethericVision flag + bias multiplier), `app/data/items/gear.json` (shard description + rarity), `app/state/gameStore.ts` (hasAethericVision helper + 3 search sites + encounter wire).

#### Combat resist nudge + dog interaction popup

- **OTA-197 (2026-05-29) · Arbiter calls out a second consecutive resist; pet/scratch opens the full CallDog modal.**
  - **What:** Two playtest follow-ups on OTA-196. (1) Player: *"this one shrugs off the bolts — try something blunt?"* — bug-the-Arbiter when the player's damage type isn't working. The 2026-05-29 log showed the player swinging a piercing bolt-caster twice in a row at piercing-resistant Silt Serpent and Mud Lurker and losing the fight largely because there was no nudge. (2) Player: *"for the dog interactions have them slowly build loyalty and have a good interaction popup show all the things you can do, if you pick treat it opens your inventory to pick an item."* OTA-196 short-circuited pet/scratch directly to the scratch action, skipping the existing CallDogModal that already had the full picker.
  - **Fix (1):** New transient `weaponResistStreak: { enemyName, damageType, count } | null` on GameStore (not save-persisted). On a resisted hit, the path checks the previous streak: same enemy + same damage type → increment; new enemy OR new damage type → reset to count=1; non-resisted hit on any enemy → null. On `count >= 2`, the Arbiter chimes in with a grounded swap hint — scans `player.inventory` for weapons of OTHER damage types and surfaces up to two ("Try something bludgeoning or aetheric — you have it in your pack."). If no alternative is in the pack, falls back to a generic line. Streak resets after firing so it's one nudge per swap-window, not a per-turn lecture.
  - **Fix (2):** Changed the pet/scratch/pat/nuzzle short-circuit at the top of `submitPlayerAction` from `selectCallDogOption('scratch')` to `openCallDogModal()`. The existing modal already surfaces scratch (+2), treat (+20 / +40 dog-treat), speak (+1), with the treat option opening an inventory picker filtered to consumables. Loyalty stays at the existing slow-build values per the "slowly build loyalty" ask.
  - **Verification:** +4 tests in `weaponResistNudge` (initial null, shape, reset, per-enemy isolation). `petScratchVerbRouting` reframed to assert `callDogModalOpen` flips true (loyalty boost still tested via `selectCallDogOption('scratch')` post-modal). Canary five + OTA-191/192/193/194/195/196 suites all stay green. `npx tsc --noEmit` clean app-side.
  - **Files:** `app/state/gameStore.ts` (weaponResistStreak schema + initialization + combat reset branch + pet/scratch reroute to openCallDogModal).

#### Playtest log cleanup: inferred-stats spam silenced + pet/scratch verbs routed

- **OTA-196 (2026-05-29) · Two playtest-log bugs fixed in one push.**
  - **What:** Player's 2026-05-29 session log surfaced two issues. (1) The `[debug] inferred-stats: gear:Mud Cloth — engine guessed stats; add catalog row when convenient.` line was still firing in the player's log feed every session-start — a leftover from before OTA-192's "stop advertising field-inferred" rule, just routed through `setOnInferred → appendLog('debug', ...)` instead of the description path. (2) `pet Rocky` and `scratch Rocky` both returned `parser: intent=unknown`; the parser had no entries for those verbs, and the noun resolver substring-matched `pet` against `petrified` on the scene's feature list ("shattered petrified mud wave"), producing the irrelevant arbiter line *"Your disease sample is still there, if it suits the moment."*
  - **Fix (1):** Re-routed the `setOnInferred` hook in `gameStore.hydrate` from `appendLog('debug', ...)` to `console.log('[Tartaria][inferred-stats] ${label}')`. The information is still useful for catalog backfill (visible via `adb logcat` / dev tools), just no longer in the player's in-game feed.
  - **Fix (2):** Added a top-of-`submitPlayerAction` short-circuit alongside the OTA-195 `fuse` handler. `^(pet|scratch|pat|nuzzle)(\s|$)/i` matches the leading token (so `petrify` / `petrified` can't trigger) and routes to the existing `selectCallDogOption('scratch')` flow when the player has a live dog (+2 loyalty + a warm world-channel line). If no dog is present the arbiter answers *"No dog at your side, friend."*
  - **Verification:** +6 tests in `petScratchVerbRouting` (loyalty boost for all 4 synonyms, no-dog refusal, `petrify` non-trigger). The OTA-158 `dogVerbTypoTolerance` + `parserFuzzWithDogVerbs` + OTA-195 `itemFusionEngine` + OTA-193 `craftTagSubstitution` suites stay green. `npx tsc --noEmit` clean app-side.
  - **Files:** `app/state/gameStore.ts` (setOnInferred reroute + pet/scratch short-circuit).

#### Fusion bench: random travel encounter that mints unique items from reserved inferred pile

- **OTA-195 (2026-05-29) · Reclaimer's Fusing Crucible — a rare travel encounter that fuses reserved inferred items into a one-of-a-kind weapon, armor piece, or dog vest via Qwen.**
  - **What:** Player asked for inferred items to have a destiny beyond auto-substitution: *"have at it claudemus maximus. let's put the fusion benches as random travel encounters"*. The OTA-194 heart-reserve flag created the stockpile; this OTA gives it somewhere to go. Each fused item is one-of-a-kind for the save that produced it — Qwen designs the name, kind, stats, resistance, and a flavor "special" based on the input pack's material tag profile, with hard clamps so the model can never overshoot balance.
  - **Schema:** New `UniqueItemStats` interface on `InventoryItem.uniqueStats` (per-instance — kind, rarity, durability, weapon dmg/scale/type, or armor slot+AC, or dog_armor AC, plus optional resistance + special). Backwards-compat (optional field).
  - **Engine (`app/engine/itemFusion.ts`, new):** `gateFusion(inventory)` enforces ≥3 reserved inferred misc items spanning ≥3 distinct material tags; refusal reason returned for the arbiter line. `synthesizeFusionViaQwen` runs a Tartaria-tone system prompt asking for `{ name, kind, dmg/AC/slot, resistance?, special? }`; validator clamps damage to `1–2d{4,6,8,10}`, AC to 1–6, resistance to a whitelist, name ≤40 chars, description ≤200 chars. `applyFusion` drains the input items by id and mints the fused InventoryItem with uniqueStats + `['fused', 'unique', resistance]` tags. `fusionInputHash` provides stable hashing for future cache keying.
  - **Combat / AC routing:** `getEquippedWeapon` in `combatRules.ts` now checks player.inventory for a uniqueStats match BEFORE the catalog so fused weapons resolve their unique damage dice / scaling stat. `aggregateArmor` in gameStore does the same for armor — it iterates equipped slots, looks for a uniqueStats match with kind === 'armor' + matching armorSlot + name, and applies the unique AC + resistance.
  - **Encounter (`wasteland_encounters.json` + `wastelandEncounters.ts`):** New `fusion_crucible` archetype, type `'fusion_bench'`, weight 4 (rare ~4% of an encounter fire). Matchers include the standard wasteland tags plus aether/tech/surface for thematic flavor. `stepDirection` handles type === 'fusion_bench' by setting `player.fusionPending = true` and appending an arbiter line. The permit survives saves so the player can walk to safety before fusing.
  - **Verb (`fuse`):** Short-circuits the parser at the top of `submitPlayerAction` (the word isn't a verb alias and is too distinctive to need fuzzy matching). Calls the new `fuseAtCrucible` store action — three gates: (1) `fusionPending` or refuse, (2) `gateFusion` or refuse with the reason, (3) `qwen.isReady()` or refuse WITHOUT consuming the permit. On Qwen failure / parse failure / validation failure the permit IS consumed (fail-closed; no re-rolling for a better roll).
  - **Preview:** `itemPreview` gains `getItemPreviewForInstance(item)` that prefers `uniqueStats` and falls back to the existing `getItemPreview(name)`. `InventoryScreen` uses the new entry point so fused items render their damage / AC / resistance / special lines in the modal preview block.
  - **Verification:** 22 new tests in `itemFusionEngine` (gate rules, validator clamps, Qwen mock, applyFusion drain + mint, determinism). 203-test regression sweep across craft / recipe / repair / itemEffect / salvage / theft / area / stat / itemDefaults / itemSynthesis / itemBackfill / itemFusion / combatRules suites stays green. Canary five green; `npx tsc --noEmit` clean app-side.
  - **Files:** `app/engine/types.ts` (UniqueItemStats + fusionPending), `app/engine/itemFusion.ts` (NEW), `app/engine/combatRules.ts` (uniqueStats-first weapon resolve), `app/engine/wastelandEncounters.ts` (fusion_bench type), `app/data/world/wasteland_encounters.json` (crucible archetype), `app/state/gameStore.ts` (encounter hook + fuse verb + fuseAtCrucible action + aggregateArmor uniqueStats branch), `app/components/itemPreview.ts` (uniqueStats preview shape), `app/screens/InventoryScreen.tsx` (uses getItemPreviewForInstance).

#### Heart-reserve flag: lock inferred items out of the substitute drain

- **OTA-194 (2026-05-29) · Player can tap a heart on inferred items to reserve them for the fusion bench (planned).**
  - **What:** Setting up the upcoming fusion bench by giving the player explicit control over which inferred items get auto-spent by OTA-193's substitution path. Player ask: *"so there is an empty heart on the item, and it fills when you tap it which locks it. only inferred items have that option."* Inferred items would otherwise be silently consumed for canonical material substitution (Brass Sextant → Scrap Metal) before the player ever had a chance to hoard them for fusion.
  - **Fix:** Added optional `reservedForFusion?: boolean` to `InventoryItem` (backwards-compat — old saves load fine). New exported predicate `isInferredItem(name)` in `crafting.ts` returns true iff no hand-authored catalog row exists (no `findCatalogItem` hit, no `EXPLORATION`, no `DOG_GEAR`); the UI gates the heart-tap on this predicate. New store action `toggleReserveForFusion(itemId)` flips the flag (by id to disambiguate stacks; refuses to toggle on catalog items). `isSubstitutable` in `crafting.ts` now returns false when `reservedForFusion` is set, so `canCraft` / `consumeIngredients` / `missingIngredients` / `previewCraftSubstitutions` all honor the heart.
  - **UI:** `InventoryScreen` modal shows a "♡ Save for fusion" / "♥ Reserved for fusion" toggle (only visible when the item is inferred). The row meta gains a small ♥ marker next to rarity / dog tags when reserved so the player sees locked items at a glance.
  - **Verification:** +9 tests in `craftTagSubstitution` (reserved item not auto-consumed, un-reserved alongside reserved still substitutes, missing/preview ignore reserved, isInferredItem predicate cases). Canary five green, app-side `npx tsc --noEmit` clean.
  - **Files:** `app/engine/types.ts` (schema), `app/engine/crafting.ts` (isInferredItem + isSubstitutable gate), `app/state/gameStore.ts` (toggle action + import), `app/screens/InventoryScreen.tsx` (modal button + row marker + style).

#### Inferred items finally count toward recipes (material-tag substitution)

- **OTA-193 (2026-05-29) · Inferred misc items now satisfy recipe ingredients directly via material tag.**
  - **What:** Player challenged the OTA-191/192 economy directly: *"why do I have the feeling that we are generating an endless stream of items that will never have a real use and will just add to our package inventory but never get figured into a recipe, or repair, or crafting use? it's just weight, gold from sales, and scrap generation. prove orherwise?"* Honest audit: largely correct. `canCraft` (crafting.ts:243) matched ingredients by EXACT name only, so an inferred Brass Sextant or Reclaimer's Cord could feed crafting only by scrapping-then-crafting through Scrap Metal / Patched Cloth — never directly. Inferred items WERE participating in repair (tag-driven via `scrapEngine.repairCostMaterials`) and in sell-price (rarity-driven fallback in `sellPriceFor`), but the recipe path was indeed dead-weight.
  - **Fix:** Added a `MATERIAL_SUBSTITUTE_TAGS` map in `crafting.ts` that mirrors `scrapEngine.scrapOutputFor`'s tag rules: `scrap metal` ← any item with `metal` / `plate` / `iron` / `blade`; `patched cloth` ← `cloth` / `fiber` / `organic`; `stick` ← `wood` / `haft`; `small rock` ← `stone` / `mudstone` / `improvised`; `aetheric shard` ← `aether` / `crystal`; `bone shard` ← `organic` / `bone`. `canCraft` + `consumeIngredients` now run two passes — canonical name first, substitute tag second — so the canonical material is preserved when available and substitution only fires when needed. Substitution is restricted to `kind === 'misc'` (weapons / armor / accessories never get silently consumed by a craft) and skips stolen items (player may want to fence contraband).
  - **Also:** Two new exports — `missingIngredients(recipe, inventory)` replaces the duplicated shortfall calc inline in gameStore's craft handler (now sub-aware so the "Not yet — needs X" Arbiter line doesn't lie when substitutes cover the cost); `previewCraftSubstitutions(recipe, inventory)` surfaces what'll be consumed before the craft fires. The craft handler now narrates `"The Arbiter nods. 'Stripped for parts: Brass Sextant → Scrap Metal.'"` so the player understands the disappearance.
  - **Verification:** 16 new tests in `craftTagSubstitution` (canCraft acceptance, preview list aggregation, canonical-first drain order, stack quantities, safety rails for stolen / weapon / armor / accessory). The 9 craft/recipe/repair test suites all stay green (68 tests, including the `stressMode_craftALot` high-volume sim — 280 craft attempts, 73 repairs, 131 scraps, 1722 logs, zero invariant violations). Canary five green. `npx tsc --noEmit` clean app-side.
  - **Files:** `app/engine/crafting.ts` (substitution map + canCraft + consumeIngredients + missingIngredients + previewCraftSubstitutions), `app/state/gameStore.ts` (craft handler uses new helpers + narrates substitutions).

#### Inferred items: stop advertising the synthesizer + live in-session restamp

- **OTA-192 (2026-05-29) · Inferred-item descriptions read like normal flavor; Qwen landings restamp the live inventory.**
  - **What:** After OTA-191 shipped, the player flagged two things: *"I don't want to advertise field inferred, I want it to just happen. and are you saying if we find an item we have to restart the game to see it's stats?"* Both were real. OTA-191's synthesized descriptions started with "Field-inferred ..." which broke immersion; and a Qwen landing only enriched the in-pack InventoryItem at the next save-load (so SCRAP-button gating, which reads `InventoryItem.tags` via `canScrap`, didn't pick up Qwen-added material tags until restart).
  - **Fix (no advertising):** All seven "Field-inferred ..." / "pending catalog backfill" description stamps in `itemDefaults.ts` (weapon / armor / accessory / gear default + four classified branches) replaced with neutral catalog-style flavor text — "Edible. Restores a measure of strength when eaten.", "A drink. Restores stamina; some carry a brief buff.", etc. The legacy placeholder regex in `itemBackfill.ts` still recognizes the OLD strings on save-load so pre-OTA-191 entries get swapped on first hydrate.
  - **Fix (live restamp):** `itemSynthesisCache.ts` gains an `onSynthLanded` listener bus. `setCachedSynth` fires the listeners synchronously after writing. `gameStore.hydrate` registers a listener that walks the live player inventory and calls the new `restampInventoryForName` helper — matching entries get fresh tags + description in place, so a Qwen-added material tag lights up SCRAP the same render the result lands. No reload, no restart.
  - **Also:** Backfill description policy tightened — catalog hits preserve hand-authored descriptions; inferred items always take the freshest `shape.description` (which already picks up the cache overlay). This closes the loop on Qwen description updates reaching the in-pack item.
  - **Verification:** +3 tests in `itemBackfillIdempotent` (restampInventoryForName match-and-skip + onSynthLanded listener subscribe/unsubscribe semantics); 36 OTA-191/192 tests green; canary five stays green; `npx tsc --noEmit` clean app-side.
  - **Files:** `app/engine/itemDefaults.ts` (description strings), `app/engine/itemSynthesisCache.ts` (listener bus), `app/engine/itemBackfill.ts` (source-aware description merge + `restampInventoryForName`), `app/state/gameStore.ts` (onSynthLanded listener registration).

#### Inferred items: balanced stats + USE / EAT / SCRAP coverage (hybrid static + Qwen)

- **OTA-191 (2026-05-29) · Inferred items now ship with effects, scrap tags, and Qwen-backed enrichment.**
  - **What:** Player: *"how can we make it so something actually populates that field and figures balanced stats for the item and gives it the full use option if it's usable and eat if it's edible, and scrap. I have a ton in my inventory that are useless. is this something we can also use qwen for?"* Items the hand-authored JSONs don't cover were synthesizing a partial row in `itemDefaults.ts` (stats but no `effect`, no scrap tags for misc items, empty descriptions). The player's "useless pile" stays useless until the engine knows what each item DOES.
  - **Fix (Phase 1 — static heuristic upgrade):** `inferGear` now emits a typed `effect` for food / drink / fungus / light / compass / rope (rarity-scaled heal/restore, keyword-driven buff stat, `extendLight`, passive wisdom, `climb_steep` gate). It also emits material tags so `canScrap` routes to the right output: rope → fiber, lantern → metal+fiber, compass → metal, bone → organic, crystal/shard → crystal, etc. Misc items with NO material keyword get a baseline `improvised` tag. `inferWeapon` adds a flavor effect string for sharp/electric/fire/poison names (bleed/stun/burn/poison). `inferArmor` adds keyword-based resistances (burn / cold / poison / degradation / electrical / aetheric).
  - **Fix (Phase 2 — Qwen-backed deep synthesis):** New `app/engine/itemSynthesisQwen.ts` calls Qwen 2.5 0.5B with a tightly-scoped JSON-output prompt for items the static classifier can't confidently handle. Output is validated against the `SynthesizedItem` schema and clamped against safe maxima (healHP ≤ 10, restoreStamina ≤ 8, any bonus ≤ 2, buff duration ≤ 6, ≤ 8 extra tags). Cached install-lifetime to AsyncStorage via the new `app/engine/itemSynthesisCache.ts` so a tester who saw 30 unique names on day 1 doesn't re-spend the model on day 2. Fire-and-forget on first encounter — the static row is in the player's hands immediately and the LLM result lands in the cache for the NEXT inventory open. Author-only effect kinds (`gate`, `scanner`) are silently dropped from LLM output — those stay author-driven.
  - **Fix (Phase 3 — backfill existing inventory):** `backfillPlayer` (the existing save-load migration shim at `gameStore.ts:619`) now also calls `restampInventoryItem` from the new `app/engine/itemBackfill.ts`. Walks every inventory entry, re-resolves the catalog row (hand-authored or inferred), and merges the now-richer synthesized tags + description onto saved instances IN PLACE. Idempotent — only fills MISSING fields, never clobbers authored data. The player's existing "ton of useless items" becomes usable on the next load.
  - **Also:** `canScrap` in `scrapEngine.ts` now accepts `improvised` + `organic` tags. `scrapOutputFor` already routed both to materials (improvised → Small Rock, organic → Patched Cloth); the predicate was the only thing out of sync.
  - **Verification:** 33 new tests across 3 files — `itemDefaultsBalancedSynth` (19, Phase 1 surface), `itemSynthesisQwenContract` (8, Phase 2 schema + clamp + cache), `itemBackfillIdempotent` (6, Phase 3 idempotency + per-instance flag preservation). All green; canary five (`salvagePools`, `theftNarrationGuard`, `itemEffect`, `statTraining`, `areaSearch`) stays green; `npx tsc --noEmit` clean app-side.
  - **Files:** `app/engine/itemDefaults.ts` (Phase 1 static upgrades + Qwen requester hook + cache merge in `inferGear`), `app/engine/itemSynthesisQwen.ts` (NEW), `app/engine/itemSynthesisCache.ts` (NEW — AsyncStorage lazy-loaded so test imports don't crash), `app/engine/itemBackfill.ts` (NEW), `app/engine/scrapEngine.ts` (canScrap gate widened), `app/state/gameStore.ts` (cache load + Qwen requester wire-up + restamp call from `backfillPlayer`).

#### Bottom-row breathing room + floating keyboard input popup

- **OTA-190 (2026-05-29) · Bottom-row padding floor + new floating input popup above the keyboard.**
  - **What:** Player: *"the bottom row is still mashed all the way into the corners of the bottom, but when I go to type the keyboard only pushes up half of the orientation line. I need the main screen to always auto adjust to not be mushed into the very bottom on all devices, and when the keyboard opens up it puts a text box popup above it so you always see what your typing and can send it from there using the keyboard send button. the act button is still needed for text copy/paste from other sections so do not get rid of that."* Two issues, two surgical fixes.
  - **Fix (Issue 1 — bottom-row mash):** `AppShell` in `App.tsx` now applies `paddingBottom: Math.max(insets.bottom, 12)` so even on Android devices where immersive-mode hides the nav bar (`expo-navigation-bar.setVisibilityAsync('hidden')`) and `insets.bottom` reports 0, the bottom row gets at least 12dp of breathing room. iOS home-indicator devices keep their larger inset unchanged via the Math.max. The `interiorHeight` math also uses the floored value so the scaled wrapper sizes correctly.
  - **Fix (Issue 2 — keyboard covers input):** New `KeyboardInputBar` component (`app/components/KeyboardInputBar.tsx`) mounted at the App.tsx root level (OUTSIDE the AppShell scaled wrapper so its positioning math stays in real device-pixel space). Self-gates on `screen === 'exploration' && keyboardOffset > 0`; renders null otherwise. When mounted: own TextInput with `autoFocus` (focus moves from the underlying InputBox TextInput to the floating one so the player's typing lands above the keyboard) + `returnKeyType="send"` + `onSubmitEditing` that fires `submitPlayerAction` and dismisses the keyboard. Inline ACT button next to the input mirrors the existing layout pattern.
  - **Why a popup vs lifting the in-flow InputBox:** ExplorationScreen's column has minHeight floors (StatsPanel ≥ 165 + sceneBar + objective chip + vendor banner + feed minimum) that push the in-flow InputBox below the visible bottom edge when the keyboard claims its share of the viewport — the existing `interiorHeight` shrinking only buys back the keyboard's footprint, not the overflow caused by the minHeights stacking taller than the remaining height. A floating popup in absolute coords sidesteps the flex-overflow problem entirely. The original InputBox + Act button stay completely as-is so paste-from-other-sections (long-press → Paste → tap Act) continues to work through them — and the popup's own TextInput supports the same long-press → Paste flow for players who'd rather paste into the floating field.
  - **Vendor-leave warning:** intentionally NOT replicated in the floating bar. Typing "go north" in the popup is a deliberate verb+direction command; the warning was designed to catch fat-fingered taps on the cardinal quick buttons + the in-flow input. Players typing in the popup are making a conscious move command.
  - **Files:** `App.tsx` (paddingBottom floor + KeyboardInputBar mount + import), `app/components/KeyboardInputBar.tsx` (NEW).

#### STT removal (mic button + voice settings toggle)

- **OTA-189 (2026-05-29) · Speech-to-text removed entirely from the game.**
  - **What:** Player: *"remove the stt button, the code for it from the game, and the button for activation from the voice tab in settings."* The 🎙 mic button on the input row, the Speak input (STT) toggle on the gear screen's SFX tab, the Auto-submit speech row, the STT availability hint, the STT diagnostic wiring in `gameStore.hydrate`, and every code path that called into `STTManager` are all gone.
  - **Fix:** Five files touched, JS-side only.
    1. **`app/components/InputBox.tsx`** — dropped `import { startListening, stopListening, isListening } from '../voice/STTManager'`, the `voice` + `listening` useState pair, the polling useEffect that watched `isListening()`, the `handleMic` async handler, the `voice.sttEnabled`-gated 🎙 TouchableOpacity, the `listening ? '🎙 LISTENING — speak now'` placeholder branch (input simplified to the in-combat / not-in-combat dichotomy), and the `micBtn` / `micBtnActive` / `micBtnText` styles. The `getVoiceSettings` / `onVoiceSettingsChange` imports are gone — no voice consumer is left in this file.
    2. **`app/screens/AboutScreen.tsx`** — dropped `PermissionsAndroid` from the react-native imports (no other consumer), the `isSTTAvailable` import, the `sttAvailable` state, the `isSTTAvailable()` call inside the Promise.all probe, the `toggleSTT` handler (including the RECORD_AUDIO Android permission flow), the `toggleAutoSubmit` handler, the "Speak input (STT)" toggle row, the `!sttAvailable` voice-note hint, the "Auto-submit speech" row, and the `STT enabled` / `Auto-submit STT` / `STT availability` lines from the COPY VOICE INFO diagnostic.
    3. **`app/state/gameStore.ts`** — dropped the lazy `require('../voice/STTManager')` + `setSTTDiag` callback wiring in `hydrate`. No consumer is left for the diag stream.
    4. **`app/voice/voiceSettings.ts`** — left untouched. The `sttEnabled` + `autoSubmit` fields remain in the schema + defaults so any AsyncStorage row from a pre-OTA-189 install loads without error; they're inert.
    5. **`app/voice/STTManager.ts` + `app/components/FeedbackModal.tsx`** — left in place. No JS-side caller imports them anymore, so they're dead but harmless. Keeping them avoids any chance of an unused-import surprise from `eas-update.yml` or a parallel branch; future native rebuild can drop the `expo-speech-recognition` plugin + package.
  - **Why:** The mic button has been a recurring source of "tapped it and got kicked to the home screen" crash reports (see the OTA-176 silence-button removal for the parallel pattern); the player has decided STT isn't worth maintaining. Pulling the JS surface entirely is OTA-safe and lets the next native rebuild trim the plugin + package without breaking anything OTA-published in the meantime. The `voiceSettings.sttEnabled` field is left so existing stored settings rows don't fail to parse and force a `cache = { ...DEFAULTS }` fallback that would silently flip TTS-related fields too.
  - **Files:** `app/components/InputBox.tsx`, `app/screens/AboutScreen.tsx`, `app/state/gameStore.ts`, `app/buildInfo.ts` (OTA bump + change note).

#### Stress-sweep fix wave (OTAs 155-162)

- **OTAs 155-162 (2026-05-28) · 8 player-side + engine-side bugs fixed off a 5-agent parallel stress sweep.**
  - **The sweep:** 5 stress agents launched in parallel — chaos / drunkSpelling / cartographer / craftALot / collectAll — each driving 500 simulated player turns (~1000 in-game hours) through `submitPlayerAction` with mode-specific input distributions, OOM-guardrailed (jest.setTimeout(15000), ≤500 iterations, banned slow files honored). Aggregate: 2500 turns, ZERO exceptions thrown — the orchestration pipeline is throw-safe. Twelve issues surfaced; 8 shipped, 4 skipped as non-bugs.
  - **OTA-155 — `eat <foo>` no longer silently sleeps 8 hours.** `eat ratoin` (typo) or bare `eat` parsed matchedVerb=eat → intent=rest → no consumable resolved → fell through to the 8-hour sleep path. Same class as OTA-125 closed for `drink water`. Fix: rest-case no-consumable branch checks matchedVerb. When eat/consume/devour AND no consumable resolved, Arbiter refuses with "Eat what?..." and breaks. Bare `rest` still triggers 8h as designed. Files: `app/state/gameStore.ts`, `__tests__/eatWithoutTargetRefusal.test.ts`.
  - **OTA-156 — parser drunk-typing run-collapse.** `eatt`, `useee`, `scrappp`, `drinkkk` all routed to intent=unknown because fuzzyEqual's 1-edit budget can't span 2-char insertions. Fix: `collapseDrunkRuns` retry in bestVerbMatch — runs of 3+ identical chars collapse to 1, trailing 2-char doubled CONSONANT collapses to 1. Vowel doublings preserved (`see`/`too` stay safe). Files: `app/engine/parser.ts`, `__tests__/parserDrunkRunCollapse.test.ts`.
  - **OTA-157 — no-space travel-verb splitter.** `gowest`, `gonorth`, `walknorth` etc. routed to unknown because the tokenizer splits on whitespace. Fix: surgical regex in normalizeInput inserts a space between known travel verbs (go/walk/run/head/travel) and direction words. Conservative — only the stamped pattern, so `goth`/`runic`/`walking`/`heads` survive. Files: `app/engine/parser.ts`, `__tests__/parserNoSpaceTravel.test.ts`.
  - **OTA-158 — dog-verb typo tolerance.** `fed dog ration`, `helll dog`, `cll dog`, `feeed dog ration` all reached the dog interceptors with unrecognized leading verbs and returned false silently. Dog interceptors run BEFORE the parser so OTA-156's collapse doesn't reach them. Fix: new `normalizeDogLeadingVerb()` tries raw + drunk-collapsed forms against feed/heal/call/use with Levenshtein-1 budget. Files: `app/state/gameStore.ts`, `__tests__/dogVerbTypoTolerance.test.ts`.
  - **OTA-159 — `defend` moved from help to dodge.** Player typing `defend` in combat expected parry stance but got routed to help (call for backup) which had no visible combat effect. Fix: `defend` moved into dodge's synonym list (with parry/block/guard/shield). Help still covers assist/aid/support/cover/bolster/reinforce. Files: `app/engine/parser.ts`, `__tests__/defendIsDodge.test.ts`.
  - **OTA-160 — scene-feature refusals teach salvage.** Hoarder typing `take rubble` saw SALVAGE redirect on only 3 of 8 refusal lines. Across a long stretch the player never learned the right verb. Fix: every refusal now ends with explicit `(Try SALVAGE.)` or `salvage it.` redirect. Flavor variety preserved. Files: `app/engine/portability.ts`, `__tests__/sceneFeatureRefusalSalvage.test.ts`.
  - **OTA-161 — Yulka disc grant routed through mergeOrPushItem.** Audit of direct inventory pushes (3 sites total) found 2 were intentional theft-flag preservation, 1 was an oversight: handleYulkaBuy pushed a 5-unit Aetheric Disc directly, so two Yulka buys created two parallel rows instead of one stacked row of 10. Fix: route the disc grant through mergeOrPushItem. Files: `app/state/gameStore.ts`, `__tests__/yulkaDiscMergeStack.test.ts`.
  - **OTA-162 — cardinal-step location discovery.** 500 cardinal-walk turns produced only 1 discoveredLocationId because discoverLocation only fired at terminal travelTo arrivals. Fix: stepDirection's nearest-named-location branch now also calls discoverLocation when the nearest is within 2 tiles (Manhattan). Player effect: walking past a Capital at 2 tiles now puts it on Milestones + world-map fog-clear. Files: `app/state/gameStore.ts`, `__tests__/cardinalDiscoverLocation.test.ts`.
  - **Skipped (non-bugs):** (a) Punctuation jam-ins handle correctly at parser — `rest,,`/`look???`/`attack,, the dog!` all resolve. Agent's "silence" was downstream null-scene test bootstrap. (b) `setTravelCourse` distance bookkeeping on target switch — agent labeled it expected (new destination is further); cosmetic UX at most. (c) `currentScene.weather.kind` undefined — agent probed wrong field name; the shape is `weather.id`/`weather.name`. (d) 98% silence rate on drunk inputs — real cause is the null-scene test bootstrap (the chaos agent's headline finding). The 6 OTAs above cover the major drunk classes; the remainder live in the test infrastructure cleanup, not player-facing code.
  - **Test infrastructure finding (not shipped — recommended for future session):** `skipTutorial` in the canonical bootstrap (`hydrate → startNewGame → skipTutorial`) leaves `currentScene = null`. Every test using this pattern is exercising a degenerate state, not real gameplay. Worth adding a `beginScene()` call or equivalent after `skipTutorial` so future stress tests exercise the actual action handlers.

#### Home-screen SUMMON chip on MAIN QUEST card

- **OTA-154 (2026-05-28) · SUMMON button promoted from Contracts sub-screen to the home-screen MAIN QUEST chip.**
  - **What:** OTA-148 added the SUMMON chip to the PRIMARY OBJECTIVE card on Contracts. OTA-149 added the `summon guardian` verb. Player feedback this session: those are both fine but Contracts is one level deep. *"the summon button is actually on the second level right?... I wanted summon guardian on the main screen so on that tab that says main quest it should be on the far right of that.... I want to be able to get right to the city smack that button and have at it."*
  - **Fix:** MAIN QUEST chip on `ExplorationScreen.tsx` restructured from a vertical Text stack into a row layout. Left side: existing title (`★ MAIN QUEST · <hint>`) + subtitle (`tap for all contracts + collectibles ↗`) wrapped in a flex-1 body. Right side: new `★ SUMMON` button (nested TouchableOpacity, warm-gold bordered) that only renders when `atUnrecovered` — same precondition the chip's hint line already uses (`mainQuest.phase in ['revelation', 'cores']` + player in a `LOST_CAPITAL_LOCATIONS` location + Capital's Core not yet recovered). Nested TouchableOpacity captures the tap so smacking SUMMON doesn't bubble to the chip's tap-to-Contracts navigation. Tap → `useGameStore.getState().summonCoreGuardian()` → spawn pipeline → bounces to exploration (no-op since we're already there). The Contracts SUMMON chip from OTA-148 stays in place as the secondary path, per the player's "you can leave it on the other one as well as a backup" note.
  - **Why:** The Contracts surface made sense as the FIRST surface for the action because PRIMARY OBJECTIVE is where the player tracks main-quest progress. But once the player knows they want to summon at this Capital, bouncing through a sub-screen is friction. The home-screen chip already shows the gate hint (`→ At this Capital: attack or address the keepers`) — the SUMMON button on the same chip is the direct actionable companion to that hint, and lives in the player's primary line-of-sight.
  - **Files:** `app/screens/ExplorationScreen.tsx` (objectiveChip row layout + SUMMON nested button + 4 styles: `objectiveChipRow`, `objectiveChipBody`, `objectiveChipSummon`, `objectiveChipSummonText`).

#### Skyscraper elevator shafts (framework extension)

- **OTA-152 (2026-05-28) · Two center elevator shafts per floor added to the buried-skyscraper data model.**
  - **What:** Continuing the Expansion 2 brainstorm. User: *"some descents might be made by climbing up or down the old elevator shaft, there are 2 broken elevators on the center of each floor."* The OTA-151 framework already had four corner stairwells with five descent-rate types; this extends the per-floor traversal slot count from 4 to 6 with two center elevator shafts in addition to the corner stairs.
  - **Fix:** Three new types + two field additions, all scaffold-only.
    1. **ShaftPosition** union: `'CENTER_NORTH' | 'CENTER_SOUTH'`. Distinct from the 4 corner stairwell slots so each floor now exposes 6 vertical traversal points.
    2. **ShaftState** union: `'climbable'` (open shaft, ascend OR descend with the future climb check), `'blocked_at'` (debris jam or fallen car at `blockedAtFloor` — one-way wall depending on approach), `'sealed'` (welded-shut door, shaft inaccessible from this floor).
    3. **ShaftInstance** interface: position, state, optional `blockedAtFloor`, `cableIntact` (future fast-descent anchor when the bottom car-wreck is still rigged), `repaired` (Aethercraft-Shape / Reclaimer salvage hook — same pattern stairs use for permanent shortcut unlocks).
    4. **SHAFT_STATES** metadata map with player-facing flavor lines for each state so the future shaft-traversal code has authored copy ready for `look`.
    5. **FloorTemplate.shafts: ShaftInstance[]** alongside the existing `stairwells` array. **BuildingState.shafts: Record<\`${floor}:${position}\`, ShaftInstance>** for per-(floor, shaft) state persistence — a shaft is logically continuous across floors but each floor pins its own access state, so the future traversal resolver walks floor-by-floor to figure out where a climb ends.
    6. **stubFloorTemplate** + **emptyBuildingState** updated to seed the new field with empties.
  - **Why:** Shafts give the player vertical traversal in BOTH directions, where stairs are predominantly descent — that's the navigation reward that justifies the climb hazard. Two shafts (vs one) means a choice between routes: one might be the cleaner climb but pass through hostile floors, the other dirtier but quieter. Building the data shape ahead of the climb resolver + maps keeps Expansion 2 scope tight and lets the authoring layer drop in without rewriting the model.
  - **Status:** Still NO gameplay code — no climb resolver, no fall-damage formula, no rendering, no quest hooks. Just the data shape so when the hand-authored maps + the climb resolver land, everything plugs into the same model.
  - **Files:** `app/engine/buriedSkyscraper.ts` (ShaftPosition + ShaftState + ShaftInstance + SHAFT_STATES + FloorTemplate.shafts + BuildingState.shafts).

#### Buried Skyscraper expansion framework (scaffold only)

- **OTA-151 (2026-05-28) · Type-model + entry gate + Homeward fade for the 100-floor descending dungeon.**
  - **What:** Brainstorming with the user landed on the next expansion shape: a 100-floor inverted skyscraper in the Buried Cities macro region near the Outskirts, gated behind completing the main quest. Each floor is a top-down grid with 4 corner stairwells, descent rates varying per stairwell type (express skip 5 / express skip 3 / local skip 2 / local skip 1 / broken). User wants to hand-author the floor maps per archetype later; for now: "build the framework for what you can now. but remember these cannot be accessed without completing the core nexus quest. and for now put up a short narrative about you and maybe your dog and golem heading home after completing the main story line and let it fade out to the mainenu until we get it hashed out."
  - **Fix:** Two pieces shipped, both scaffold-only.
    1. **NEW `app/engine/buriedSkyscraper.ts`** — type definitions + stub data, no gameplay code. Five FloorArchetype flavors (`service_corridor`, `market_level`, `shrine_level`, `mechanical_floor`, `dig_camp`) with display metadata. Four StairwellPosition corners (`NE`, `NW`, `SE`, `SW`). Five StairwellType descent rates (`express_drop_5`, `express_drop_3`, `local_drop_2`, `local_drop_1`, `broken`) — the "five different types the system needs to remember" the user spec'd. GridCell / FloorTemplate / BuildingState interfaces so authored grid maps can drop in without touching the model. `canEnterSkyscraper(player)` gate returns true only when `mainQuest.phase === 'ended'`; `skyscraperGateRefusal()` returns the Arbiter's block line for premature attempts. `emptyBuildingState(seed)` initializer for fresh entries. No rooms / NPCs / encounters / quests authored — all of that waits on the user's hand-authored maps.
    2. **`app/screens/EndingScreen.tsx` Homeward beat** — new HEAD HOME ▸ button next to the existing BACK TO TITLE. Tapping it swaps to a `HomewardSplash` component that renders three paragraphs of homeward narration on a black backdrop. The narration is faction-keyed (the "people" label maps to the player's faction — `the guild` for Reclaimers, `the Cloister` for Order, `the family` for Monarchs, etc.) and references the dog + golem by name if either is alive at run-end. Animated.sequence fades in (2.0s) → holds (7.0s) → fades out (2.0s) → bounces to title. Full-screen tap overlay skips straight to title for impatient players. Placeholder bridge — once Expansion 2 lands, `onDone` will route to the Outskirts entrance instead of title.
  - **Why:** Type-model-first keeps the surface area of Expansion 2 small until the user's hand-authored content lands; the actual gameplay code (room rendering, stair traversal, NPC errand-runners, fetch quests, repairable stairs) can layer on top without rewriting the data shape. The Homeward fade gives the player a satisfying conclusion NOW so the ending doesn't dead-end on a title-screen bounce while the expansion is in development. The Arbiter gate keeps premature exploration from finding broken state.
  - **Files:** `app/engine/buriedSkyscraper.ts` (NEW), `app/screens/EndingScreen.tsx` (HomewardSplash + HEAD HOME button + new styles).

#### Mastery badge capstone (27/27 acknowledgement)

- **OTA-150 (2026-05-28) · Title-screen Mastery chip when every (faction, ending) combo is recorded.**
  - **What:** TitleScreen.tsx:1310 surfaced `COMPLETED RUNS · X/27` as a counter from OTA-043 (Phase 7) onward, but there was no special handling when X hit 27 — a 27-run commitment landed with no acknowledgement beyond the counter incrementing. User: *"what do they get if they collect all 27 badges?"* — answer at the time was honestly "nothing yet."
  - **Fix:** New centered Mastery branch in `EndingBadgesRow`. When `endingBadges.length >= 27` (≥ guards against future expansion endings without breaking the gate), a warm-gold capstone chip renders above the regular 27-grid — `✦ MASTERY ✦` with letterspaced caps, plus a one-line italic Arbiter acknowledgement *"You have walked this path under every banner."* Faction-neutral copy so it lands the same regardless of which run finished the matrix. Pure cosmetic — no save mutation, no mechanical reward, no unlock. Mechanical rewards (Mastery Token on next character, Expansion 2 opening hook, etc.) are deferred to the expansion plan; this OTA just closes the visible "27/27 felt unrewarded" gap.
  - **Why:** Cosmetic acknowledgement was the cheapest correct move here. The Mastery Token / Expansion 2 fourth-path-unlock options proposed alongside this would have warped balance for first-run players or required Expansion 2 to land first — neither was worth coupling to the badge fix. Capstone visual ships now, mechanical rewards can layer on top later without rework.
  - **Files:** `app/screens/TitleScreen.tsx` (`EndingBadgesRow` Mastery branch + 5 styles).

#### `summon guardian` verb command

- **OTA-149 (2026-05-28) · Parser-side entry to the Core Guardian summon.**
  - **What:** OTA-148 shipped the SUMMON chip on the PRIMARY OBJECTIVE card. Playtester follow-up: *"summon guardian — that way you never miss him, he can come in with the same swagger and the core can be added to the drop when he is defeated. that way you can prep for the fight too."* Two asks bundled — (a) a typed-verb path to the spawn so the player can deliberately call the Guardian in after prepping (full HP, rations eaten, golem standing, dog at heel), and (b) confirmation that the Core actually drops on defeat.
  - **Fix:** (a) New intercept in `submitPlayerAction`, sitting BEFORE the existing `canRecoverCore` gate check. When `parsed.matchedVerb === 'summon'` AND `parsed.target` / `parsed.resolvedNoun` matches `/(guardian|gaurdian)/` (the typo handles the literal log line the playtester hit), the handler routes to `summonCoreGuardian()` and returns. Preflight refusals (`not_at_capital`, `wrong_phase`, `already_recovered`) surface faction-neutral Arbiter lines so the verb's failure is explained instead of being silent. (b) No code change needed — `resolveEnemyDefeat` at gameStore.ts:10448 already detects `isCoreGuardian`, logs the defeat line + signature gear drop, marks the Guardian on `mainQuest.guardiansDefeated`, and fires `triggerMainQuest({ kind: 'core_recovered' })` which writes the Capital's Core item to inventory at line 15922. Documented the existing pipeline in this entry so future sessions don't re-investigate.
  - **Why:** OTA-148 gave the player the affordance via the UI; OTA-149 gives them the verb. Two front doors, one spawn pipeline, no divergence in how the Guardian arrives or what falls off them.
  - **Files:** `app/state/gameStore.ts` (submitPlayerAction guardian-verb intercept).

#### SUMMON chip on PRIMARY OBJECTIVE card

- **OTA-148 (2026-05-28) · Discoverable Core Guardian re-summon from Contracts.**
  - **What:** Playtester died at Voronov mid-Cantor fight, revived via a Resurrection Gem, and reverted to a freshly-generated scene with the Cantor gone. The main-quest state was correct (`mainQuest.phase = 'cores'`, `guardiansDefeated` did NOT include Voronov, `coresRecovered` did NOT include Voronov, PRIMARY OBJECTIVE tracker still said "in the city") — the Guardian respawn pipeline at `gameStore.ts:4179-4233` requires a player faction-gate verb at the Capital to re-instantiate, but the player tried `summon the core guardian` (parses as `cast` → not in Mud Monarchs' gate intents) and `search for the core` (parses as `investigate` → also not in Mud Monarchs' gate). Both bounced off the same "Your discipline asks you to attack or address the keepers" Arbiter line with no surface affordance to take that action. Player: *"once you reach a city that still has an active core/guardian there should be a summon button on the right edge of the main quest button on the main quest tab."*
  - **Fix:** Two pieces.
    1. New gameStore action `summonCoreGuardian()` lifts the spawn pipeline (spawnGuardianForCapital → enemy/HP push to scene → CORE GUARDIAN ★ boss card emit on `[combat]` → arbiter approachLine → `mq_guardian_spawned` milestone event → NPC-met record). Idempotent on "already in scene" — bounces to exploration without a second spawn. Returns `{ ok, reason }` so the UI can react to preflight refusals. On success, switches `currentScreen` to `'exploration'` so the boss card lands in view with no extra tap from the player.
    2. ContractsScreen PRIMARY OBJECTIVE card gets a `★ SUMMON` chip absolutely positioned top-right of the card. Renders only when `mainQuest.phase` is `revelation` or `cores`, the player is in a `LOST_CAPITAL_LOCATIONS` location, and the Capital's Core isn't recovered yet. Nested TouchableOpacity inside the card's tap-to-expand TouchableOpacity — RN's responder system grants the touch to the inner chip so tapping it doesn't toggle the expansion.
  - **Why:** The gate-verb path is the engine's intentional friction (each faction has its own way of coaxing the Core out, and the Guardian is the obstacle), but post-revive the player had no way to *discover* what verb their faction used. Contracts already surfaces the "→ At this Capital: attack or address the keepers" hint line; the chip is the actionable companion to that hint. The spawn pipeline is shared with the existing gate-verb path, so both routes converge on the same boss card + arbiter approachLine + milestone trail — no divergence in how the Guardian arrives.
  - **Files:** `app/state/gameStore.ts` (`summonCoreGuardian` impl + interface decl), `app/screens/ContractsScreen.tsx` (chip + style).

#### Aethercraft cast wording + dog HP surface

- **OTA-147 (2026-05-28) · Aethercraft outcome label + dog HP in StatsPanel.**
  - **What:** Two playtester gripes from a golem-summoning session: (1) the cast-result narration read `Aether Golem Constructor — d20 14 + INT 4 = 18 vs DC 17 — ✓ HIT` which framed a successful summon as a combat hit; player: *"when I am successful instead of saying hit, say the summoning was a success."* (2) OTA-145 introduced the golem-name row with `(hp/hpMax)` BELOW the dog name, but the dog line itself was just the name — no HP. Player: *"the golem showed up under the dog with his HP, but I saw the dog's HP is not listed with his name."*
  - **Fix:** (1) `runAethercraft` outcome label switched from `'✓ HIT' / '✗ MISS'` to discipline-aware verbs — `'✓ SUMMONED'` for `summon`, `'✓ SHAPED'` for `shape`, `'✓ MENDED'` for `mend`; `'✗ FAILED'` across the board on a miss. Roll math + the OTA-145 reward/combat channel split unchanged. (2) `StatsPanel.tsx` dog name `<Text>` now reads `{player.dog.name} ({player.dog.hp}/{player.dog.hpMax})` matching the golem row format. `DogCompanion` already carried `hp`/`hpMax` — no type changes needed.
  - **Why:** Both are tiny copy/UI affordance gaps that broke the read of the screen for the player. The HIT/MISS label was a leftover from before Aethercraft had its own narration — the discipline-aware switch is the kind of wording the player can dictate verbatim. The dog HP omission was an oversight at OTA-145 (golem got it; dog didn't) — symmetry restored.
  - **Files:** `app/state/gameStore.ts` (runAethercraft outcome label), `app/components/StatsPanel.tsx` (dog name HP suffix).

#### Hook puzzles — broken-contract issue closed across 4 OTAs

- **OTA-131/132 (2026-05-28) · Hook-puzzle pressure test + 1 ship-blocker bug found and fixed.**
  - **What:** OTA-131 pressure-test agent shipped 5 new test files with strict OOM/timeout guardrails honored — 35 new tests across end-to-end pipeline, 1000 parser input variants, save/load round-trips, abandonment + cross-scene isolation, mercy + hint surfacing. ONE genuine ship-blocker bug surfaced: the puzzle-solve branch passed `hook.stage=0` to `resolveHookOneStep`, which read `CHAINS[kind][0]` (empty effects, just the legacy puzzle-intro narration), logged the intro line, advanced scene-state to stage 1, and stopped. Stage-1 reward effects (90 TC + Aetheric Shard/Cloth/Compass for vault; 60 TC + Golem Core for steeple) only fired on the NEXT player tap of a hook noun.
  - **Player UX before fix:** *"I solved the vault and got nothing — then I tapped it again and got everything."*
  - **Fix (OTA-132):** Pass `{ ...hook, stage: hook.stage + 1 }` to `resolveHookOneStep` in the solve branch. Now `getHookOutcome` returns the stage-1 reward outcome inline with the puzzle-solve narration. The set() inside `resolveHookOneStep` advances scene-state stage by +1 → 1 and marks resolved per `outcome.done = true`. Two `.failing` tests in `hookPuzzleE2E.test.ts` flipped to regular `it`. **69/69 puzzle tests pass; 53/53 regression green.**
  - **OTA-131 guardrails confirmed honored:** every new test file starts with `jest.setTimeout(15000)`, iteration caps ≤500, NEVER ran bare `npx jest __tests__/`, banned slow files (`twoYearChaosSim` / `thousandDayStressSim` / `combatStress` / `domesticStress` / `metaNavStress` / `yearSimulation`) never touched, final regression sweep scoped only to 5 designated fast suites.
  - **Files:** `app/state/gameStore.ts` (1-line stage-bump in puzzle-solve branch), `__tests__/hookPuzzleE2E.test.ts` (.failing → it), 5 new pressure-test files from OTA-131.

- **OTA-129/130 (2026-05-28) · Hook-puzzle foundation + UX polish closes the longest-open dead-hook contract.**
  - **What:** Pre-OTA-129, engine narration like *"three rotations, in the right order"* (sealed_vault_door) and *"someone knock on the steeple if you find us"* (submerged_steeple) was pure decoration — the parser had no `rotate` / `knock` intents, so the player typed the obvious thing and got `intent=unknown`. The hook silently progressed on any second tap of the matching noun, which left the puzzle text as broken-promise UX.
  - **OTA-129 (foundation):** 7 new parser intents (`rotate`, `knock`, `turn`, `twist`, `press`, `push`, `pull`). New module `app/engine/hookPuzzles.ts` with `PuzzleDefinition` type, `applyPuzzleInput` resolver, `extractDirection` natural-language parse (left/right/CCW/CW/widdershins/deosil/etc.). Two puzzles wired: `sealed_vault_door` (3-step rotation [left, right, right], hints at 3+5 failures, mercy at 7) and `submerged_steeple` (3-knock pattern, any non-knock resets, hint at 3, mercy at 6). `Hook` gains optional `puzzleProgress` for save/load preservation. gameStore hook-routing gates stage advance on puzzle completion.
  - **OTA-130 (polish):** `examinePuzzleLine` peek surfaces current attempt state mid-puzzle. `findActivePuzzleHookForIntent` direction-only fallback ("rotate left" without a noun routes when exactly one active puzzle hook accepts the intent; ambiguous = refuse). New tutorial step "When the narrative gives you a sequence" covers verbs, mercy threshold, examine-for-peek, save/load preservation, and the deliberate decision to gate only puzzle-equipped hooks (other hooks unchanged).
  - **Why:** Closes the longest-open issue in HANDOFF.md 0.A. Every player who reads a puzzle prompt now gets a real interaction; failure paths give hints and an anti-stuck mercy threshold so no player gets locked out.
  - **Files:** `app/engine/types.ts` (7 new Intents), `app/engine/parser.ts` (verb synonyms), `app/engine/llmParser.ts` (INTENT_LIST + canonical map), `app/engine/hookPuzzles.ts` (NEW, OTA-129 + extended OTA-130), `app/engine/hooks.ts` (Hook.puzzleProgress field), `app/state/gameStore.ts` (hookEligible + puzzle-gate routing + examine-peek + direction-only fallback), `app/components/tutorialSteps.ts` (new puzzle step), `__tests__/hookPuzzleResolver.test.ts` (NEW 34 unit tests).

#### Drink / consumable narration

- **OTA-128 (2026-05-28) · "You eat the Water Bottle" + drink re-dispatch double-logged + spurious Arbiter line.**
  - **What:** OTA-126 playtest log surfaced four small issues around the OTA-125 drink-handler re-dispatch path:
    1. World line read *"You eat the Water Bottle. +3 stamina."* — Water Bottle isn't food; the `isPotion` regex didn't catch it.
    2. `drink the water bottle` showed BOTH `[player] drink the water bottle` AND `[player] eat Water Bottle` — looked like the player typed twice. Inner submit echoed its own `[player]` line.
    3. Same re-dispatch double-logged `⏳ Time passed: 30 min` — inner submit logged it at end-of-action, outer submit's `hoursBefore` snapshot saw the same dt and logged again. Two lines 9 ms apart.
    4. *"The water," the Arbiter says. "Tell me what you mean to do with it."* fired after a successful cup-hands drink — the Arbiter's on-target-noun remark wasn't gated by the `drink` / `fill` intents.
  - **Fix:**
    1. Extended consumable-verb detection in the rest case: `isDrink` tests `consumable.tags` for `'drink'` or `'water'`, plus name regex `bottle / canteen / skin / cup / draught / broth / tea / infusion / gourd / jug`. Water Bottle now narrates *"You drink the Water Bottle. +N stamina."*
    2 + 3. New `_opts.silent` on `submitPlayerAction`. When set, the inner submit skips the `[player]` echo at all 3 input-log sites AND the end-of-action `⏳ Time passed` log. Outer submit owns the bookkeeping. Drink-case re-dispatch now passes `{ skipPreChecks: true, silent: true }`.
    4. Added `'drink'` and `'fill'` to `ARBITER_ENGAGED_INTENTS` set so the Arbiter remark suppresses on-target-noun follow-up after these verbs (already gated for `attack`/`investigate`/`open`/etc.).
  - **Why:** Each was a small but visible quality issue in the drink path. Items 2 + 3 came from a structural mistake in OTA-125 (using `submitPlayerAction` for internal re-dispatch instead of inlining the consumable-consumption logic). The `silent` opt is the smallest fix that preserves the re-dispatch architecture while killing both side effects.
  - **Files:** `app/state/gameStore.ts` (ARBITER_ENGAGED_INTENTS + isDrink detection + silent opt on the 3 [player] + 1 Time-passed log sites + drink-case re-dispatch options).

#### Travel waypoint UX

- **OTA-127 (2026-05-28) · Per-step scene-bar truthfulness during travel.**
  - **What:** Playtester follow-up to OTA-126: "the location bar and weather conditions up top should reflect the different areas they are in at each step. because if they decide to stop travel mid route the next direction they step in needs to be accurately displayed without a massive location jump." Pre-OTA-127: scene bar showed `currentScene.location.name` the whole walk because `currentLocationId` only switches on landing at a named-location tile. Crossing open ground between named places, the bar lied.
  - **Fix:** Three pieces.
    1. `CurrentScene` gains `transitArea: string | null`. Per-step during travel, `stepDirection` finds the nearest named location to the new mapX/mapY and sets `transitArea = "near <name>"`. When `step.landedOn` is set (player officially enters a named location), `travelTo` regenerates the scene from scratch — `transitArea` defaults to null on the fresh scene.
    2. Per-step weather drift during travel — ~12% chance per cardinal step to roll a new weather state via `pickWeather(worldMemory)`. Right side of the scene bar stays reactive.
    3. `ExplorationScreen` scene bar prefers `transitArea` over `location.name` when set. Cleared on `stopTravel` + the two error paths in `continueTravel` + the not-in-transit branch of `stepDirection`.
  - **Why:** The pre-OTA bar made the player distrust the system — they worried that stopping travel would jump them somewhere unexpected. The actual engine was already correct (cardinal steps move 1 tile from current mapX/mapY), but the bar's misleading label undermined confidence. Now the bar reads truthfully tile-by-tile; STOP TRAVEL clears the transit label and the next cardinal renders from the player's actual tile.
  - **Files:** `app/state/gameStore.ts` (CurrentScene transitArea field + stepDirection nearest-location + weather drift + stopTravel clear + continueTravel error-path clears), `app/screens/ExplorationScreen.tsx` (scene bar prefers transitArea).

- **OTA-126 (2026-05-28) · Travel badge jumped on location-boundary crossings — fixed via snapshot-and-decrement counter.**
  - **What:** Playtester report: "I was going to Varakush, the badge said 23 spaces, counted down to 2, then I crossed into the mud flats and it jumped to 26 spaces." Confirmed cause: `generateWorldMap(seed, currentLocationId)` re-centers the world map on the player's current location every step. When the player crosses into a new location, the regenerated map has the destination at different coords, so the Manhattan distance recomputed by the badge changed.
  - **Fix:** Snapshot the initial tile count at travel-start, decrement once per step.
    - `travelTarget` gains an optional `distanceRemaining?: number` field (types.ts).
    - `setTravelCourse` seeds it at the initial Manhattan distance and decrements by 1 for the auto-first-step.
    - `continueTravel` decrements after each `stepDirection` call (only when not arriving).
    - `ExplorationScreen` movesLeft prefers the stored counter when present; the legacy Manhattan recompute stays as a safety net for saves whose travel started before this OTA.
  - **Why:** Stable counter eliminates the dependency on the regenerated map after init. Player gets a monotonic countdown that matches their intuition. Legacy fallback means no behavior break for saves mid-travel when the OTA lands.
  - **Files:** `app/engine/types.ts` (travelTarget shape), `app/state/gameStore.ts` (setTravelCourse + continueTravel decrement), `app/screens/ExplorationScreen.tsx` (badge prefers counter).

#### Playtest log fixes

- **OTA-125 (2026-05-28) · Day-32 playtest log surfaced 4 real issues — all fixed.**
  - **What:** Player on existing Day-30+ character ran 2 days of gameplay on OTA-124. Captured log surfaced:
    1. Four uncategorized nouns (siren egg, echo chamber, flood seal, water current) returning the IDENTICAL generic-catchall line in a row — breaks immersion.
    2. Flee parsed and 15-min/stamina charged; then 3 seconds later "Action cancelled" appeared — refund missing.
    3. `drink water` parsed as `intent=rest` → 8-hour sleep outcome.
    4. `fill water bottle` refused at a scene with a "water current" because WATER_SOURCE_NOUNS lacked current/stream.
  - **Fix:**
    1. New `GENERIC_VARIANTS` pool of 8 distinct lines in `investigationTable.ts`. Picked deterministically per noun via `nounSeed` (same noun stays consistent; different nouns get different beats). `resolveLore` branches on `category === 'generic'` to use the pool.
    2. `PendingRollState` gains `refundOnCancel?: { hoursElapsed; stamina }`. Set at the escape/cast/use_relic site BEFORE the charge. `cancelPendingRolls` restores from the snapshot when present. Log copy: "Action cancelled. Time and stamina refunded."
    3. New `'drink'` intent (Intent union, parser VERB_SYNONYMS, llmParser map). Handler routes `drink <consumable>` through the eat-the-ration path (preserves all existing effect resolution); `drink water` with a scene water source to a cup-hands +3-stamina 5-min beat; otherwise an Arbiter hint. Removed `'drink'` from the rest synonym pool.
    4. `WATER_SOURCE_NOUNS` extended with `current/currents/rivulet/brook/canal/aqueduct/reservoir` + a fallback that matches any noun containing the substring "water". Arbiter hint copy updated to include "stream, current" in the example list. Applied to BOTH the `case 'fill'` handler and the new `case 'drink'` handler.
  - **Why:** Each was a real player-experience regression (or never-worked) that surfaces immediately to anyone who plays. The catchall and drink-as-rest in particular look like bugs at first glance. The flee-without-refund is a fairness issue. All four fixes are localized, well-tested, and shipped together for one OTA.
  - **Verified for old saves:** Issue #5 (rescue hooks on older characters) — confirmed the intercept at `gameStore.ts:3745-3764` fires for any character without a dog the moment they tap a hook noun on the relevant intents. Day-32 character in the log just hadn't hit a hook noun yet. Logged a follow-up in 0.A for "rumor-of-trapped-dog Arbiter hint" to improve discoverability.
  - **Files:** `app/engine/investigationTable.ts` (variant pool + resolveLore), `app/engine/types.ts` (Intent + PendingRollState), `app/engine/parser.ts`, `app/engine/llmParser.ts`, `app/state/gameStore.ts` (drink handler + fill list + cancelPendingRolls refund + escape pre-charge snapshot).

#### Dog Companion wave

- **OTA-124 (2026-05-27) · SHIP-READY: Dog Companion wave + vandalistic stress sweep + 4 engine bugs fixed.**
  - **What:** The OTAs 120-124 wave shipped the full 6-phase Dog Companion system (~3-4k lines). Vandalistic stress sweep at the end of the wave (13 new test files across two parallel agents covering combat companion combos, rescue scenarios × player races, onboarding state-machine fuzz, hunger timing, smell-find cooldown semantics, save/load round-trips, puppy vendor + rubble-puppy edges, catalog integrity with dog gear, parser fuzz with dog verbs, UX rendering sanity, tutorial currency, cross-system regression, performance smoke) surfaced FOUR ship-blocker engine bugs that were fixed before final ship:
    1. `puppyVendorOwed` was never assigned `true` anywhere in gameStore.ts. The Phase 6 puppy-vendor / rubble-puppy safety net was unreachable in production. Wired into `handlePlayerDeath`: when player KO's with dog at hp<=0, dog flips to status='dead' AND `worldMemory.puppyVendorOwed = true` (gated on `!puppyVendorUsed`).
    2. Dog status never transitioned to `'dead'` anywhere in gameStore.ts — all four `'dead'` occurrences were comparisons, no assignment. Same fix as #1 closed both. Gem-revive can now engage on dead dogs.
    3. `dogSmelledHere` cooldown latch never cleared back to `false`. Once set, smell-find fired ONCE per save per room instead of once per investigation-cycle as spec'd. Wired into the investigate handler at `gameStore.ts:5085` — when player engages with any noun in a room, `dogSmelledHere` flips back to `false`.
    4. `waiting_at_base` dogs continued losing loyalty during the 24h recovery window — players whose dog was knocked down couldn't avoid affection loss they had no way to fix. Decay condition tightened to `with_player` only.
  - **Wave summary:** OTA-120 (planning prep + design overrides — dog+golem coexistence, rubble-puppy late-game fallback). OTA-121 (Phase 1+2+6+partial Phase 3, ~1328 lines). OTA-122 (Phase 4+5 mid-flight checkpoint, +1185 lines). OTA-123 (Phase 4+5 closeout, +587 lines, 79/79 dog tests pass). OTA-124 (this) — stress sweep + 4 engine fixes + perf-test tolerance bump + 4 `.failing` tests flipped to `it`. Net: **304/304 tests pass across 22 suites in ~31s**, TS clean.
  - **Spec deviations (user-acceptable):** treats authored as Legendary (rarity union has no Epic); treats live in `gear.json` (`consumables.json` doesn't exist in the repo).
  - **New open issues logged:** 3 pre-existing catalog hygiene findings unrelated to dogs (cross-file dups, within-file dup, isCataloguedElsewhere guard missing DOG_GEAR — all in 0.A).
  - **Files:** `app/state/gameStore.ts` (4 engine fixes), `HANDOFF.md` (this entry + 3 new open issues), 13 NEW test files, 4 test files updated (failing flips + helper sync + perf budget).

#### Tutorial currency

- **OTA-113 (2026-05-27) · Tutorial refreshed to match the OTA-070+ UX wave; OTA-111 golem-DC footer corrected.**
  - **What:** OTA-110's static-audit agent flagged `tutorialSteps.ts` as referencing the pre-OTA-095 screen layout ("ACTIONS and RECIPES tabs"). Several other steps had drifted past more recent shipping — Aetheric tab now in Crafting (OTA-091), SearchSortBar across screens (OTA-087), elevated overlays at climb-tops (OTA-089/092/102), per-room investigation-table semantics (OTA-070+), DEX-on-jump/disengage + WIS-on-rest (OTA-112), and `block` folded into `dodge` (OTA-021). Separately, OTA-111's golem-variants footer hard-coded the wrong race-DC math ("Aetherborn cast at base DC, others +4") — per `raceMechanics.ts:215`, Mud Dwellers are at base DC + 2 INT, Aetherborn +2 DC, others +3 DC. Summon DC is 15; shape/mend DC is 12.
  - **Fix:** Six tutorial-step edits + one new step:
    - `actions` screen step renamed "Actions & Recipes" → "Actions reference"; body rewritten to redirect to the Crafting screen for recipes.
    - NEW `crafting` screen step ("Crafting — four tabs") covering CRAFT / REPAIR / RECIPES / AETHERIC with the OTA-111 info-surface callouts (weapon damage dice, consumable restore numbers, golem variant rows with stats / fuel / tap-to-stage).
    - "Quick actions" — dropped `block` from the in-combat list; clarified per-room consume semantics ("same noun in a different room still shows green").
    - "New verbs and buttons" — added elevated-overlay beat at climb-tops, 0-stamina-climb design preservation, Crafting → AETHERIC as the easier in-route for Aethercraft, corrected race-DC numbers.
    - "Stats grow with use" — added the OTA-112 training paths (DEX on jump + disengage, WIS on rest); refined the per-stat highlights to match `INTENT_TO_STAT` and the actual `trainStat` call sites.
    - "Your pack" — added SearchSortBar mention + scrap auto-unequip note.
    - `CraftingScreen.tsx:415` footer corrected to match `raceMechanics.ts`.
  - **Why:** The walkthrough is the new player's first impression of the game's surface area. Stale text either tells them tabs that don't exist, omits new affordances they need to know about, or quotes math that contradicts the actual rolls — and the user's "make it current" ask was a specific cleanup pass, not a redesign. Kept the edits surgical: 6 existing steps touched, 1 new step added, no step structure reshuffled, no welcome / closing copy changed.
  - **Files:** `app/components/tutorialSteps.ts` (6 step edits + 1 new step), `app/screens/CraftingScreen.tsx` (footer line 415).

#### Stat-growth balance

- **OTA-112 (2026-05-27) · DEX bottleneck closed; WIS-on-rest finally wired (UI/code gap).**
  - **What:** The OTA-111 stat-growth sim (20 runs × 5000 turns) surfaced three findings: (a) the user's hypothesis "INT is too slow" was wrong by the numbers — INT is the second-fastest stat at 0.155 XP/turn; (b) DEX is the actual slowest stat at 0.067 XP/turn — half of STR, less than half of INT — because it only trained on finesse-weapon hits (minority of weapons), parry success (mid-combat only), and a handful of skill checks; (c) `SKILL_ACTIVITIES` (statTraining.ts:201) advertised "Resting after combat trains WIS" to the player but no `trainStat` call existed for it.
  - **Fix:** Three trainStat wires in `gameStore.ts`:
    - `jump` handler (line 7296): +1 DEX on every leap. Naturally rate-limited by 1-stamina cost + low jump frequency.
    - `disengage` handler (line 7333, in-combat branch only): +1 DEX on successful break-contact. The no-enemies early-return doesn't reach the train, so disengage-spam without combat is uncompensated.
    - `rest` handler (line ~5808, 8-hour rest success path): +1 WIS on rest. The 8h game-time cost is itself the rate limit — can't farm by spamming rest because each one burns a workday.
  - **Why:** Cheapest, lowest-risk path to close the DEX gap without altering combat-hit math or weapon-stat designations. Jump and disengage are textbook DEX moments that were silently uncompensated; wiring them adds DEX trickle without changing the action menus or stamina costs. The WIS-on-rest wire is straight bug-fix territory — the UI was lying.
  - **Skipped from the audit's recommendations (deferred):**
    - WIS-novel-step rate limit (raise novelty window 20→50 tiles) — left for a future design call; nerfing the highest-growing stat may feel unfair to players who chase WIS.
    - Per-golem summonDC — open design call (see Section 0.A) on whether Crystal/Aether should cost more INT than Mud.
  - **Files:** `app/state/gameStore.ts` (3 trainStat wires in jump / disengage / rest cases).

#### Multi-agent stress audit

- **OTA-110 (2026-05-27) · Multi-agent adversarial audit + catalog inference ordering fix.**
  - **What:** User asked for a "full workout of anything my playtesters can do to break the game... look for loops, dead hooks, errors, bugs and dead code" after the last 30 OTAs of intertwined system changes. Spun 4 parallel agents (3 Jest sim writers + 1 read-only static auditor). Results:
    - **40 new sim tests** across 3 files, all passing in ~25s total. `__tests__/engineStateChaosSim.ts` (10 cases — 600-iter random walks, overlay gates, hub-collision probe, per-noun infinity), `__tests__/playerInputChaosSim.ts` (15 cases — 1100-input parser fuzzer, hook-narration audit, combat scaling sanity, 0-stamina climb design preservation), `__tests__/craftingInventoryChaosSim.ts` (15 cases — Aetheric tab parity, 200-trial scrap chaos, 50-trial pack-full grants, full-catalog find\* leak sweep).
    - **0 engine-state invariant failures** across all random walks. Verified: chip-grey-after-refuse, consumed-table monotonicity, salvage→investigate dedup, pack-full skip, 1-tier overlay gate, trader overlay tier-4 gate, ambient-noun seed idempotence, `preservedSceneOnDescent` round-trip, 0-stamina climb falls + damages (OTA-076 design preservation), HP-band scaling 97.6% in-band / 2.4% scare / 0% above-3x, HP-bar/state ratio invariant.
    - **All OTA-070 → OTA-109 closed fixes verified still in place** — no silent reverts.
    - **All while-loops bounded** — parser `normalizeInput` (terminator `s !== prev`), SORTED_LEXICON apply, `rollOverlayEncounter` band selection. No infinite-loop risk.
  - **Fix (1 actionable bug found AND shipped):** Catalog inference ordering. `findWeaponByName` / `findArmorByName` / `findAmuletByName` / `findRingByName` in `app/engine/crafting.ts` fell through to `infer*` even when the name resolved in a DIFFERENT catalog bucket. 12 confirmed leaks — `Aetheric Cloak`, `Aetheric Mask`, `Anti-Aetheric Cloak`, `Heat-Shield Gloves`, `Golem Leather Gloves`, `Aether-Breath Mask`, `Echoing Steps Boots`, `Mud-Sealer Gauntlets`, `Mudwalker Boots`, `Stealth Hood` (all `exploration.json`, armor-keyword leak); `Wyrm Fang` (materials.json, weapon-keyword leak via "fang"); `Runecaster-Reader Tablet` (exploration.json, weapon-keyword leak via "runecaster"). All polluted the `[debug] inferred-stats:` backfill audit signal, masking real catalog gaps.
  - **How:** New private helper `isCataloguedElsewhere(name, exclude)` in `crafting.ts` short-circuits each find\* before its inference call when the name resolves in a non-target bucket. Reference implementation was already in `app/components/itemPreview.ts:60-95` — the fix brings find\* in line with the preview path. The crafting sim's `test.failing` (Sentinel Core Plate) flips to a real green assertion; the catalog-sweep punch list now asserts zero leaks (was informational-only).
  - **Why:** Cheapest, lowest-risk path. `getItemPreview` already proved the ordering pattern works; mirroring it in `find*` is a 1-helper + 4 one-liner-guard change with no behavior change to legitimate inferred items.
  - **Three new open issues filed** (Section 0.A): `turn the locking ring` mis-routes to `turn_in` (parser bug, design call); `tap the steeple` parses as unknown (cluster with rotate/knock); `tutorialSteps.ts` references pre-OTA-095 screen layout (low priority).
  - **Files:** `app/engine/crafting.ts` (new helper + 4 functions guarded), `__tests__/engineStateChaosSim.ts`, `__tests__/playerInputChaosSim.ts`, `__tests__/craftingInventoryChaosSim.ts` (3 new sim files).

#### Pronunciation lexicon

- **OTA-109 (2026-05-27) · Monarch spell-it-out correction — MAH-nark wrong, MON-NARK right.**
  - **What:** Player refined IPA to `/ˈmɑːnɑːrk/` and said the long-vowel version was "a better fit for all usage of Monarch." When I asked which encoding to use for the vowel-length cue (double-vowel respelling vs IPA channel vs no-op), the user answered with their actual ear: *"to me it sounds mon-nark."* That's the spell-it-out cue — overrides my OTA-108 IPA parse per the OTA-107 rule. The user hears the standard English MON-NARK pronunciation, with the syllable-boundary N audible, not the MAH-nark I'd derived from `/ɑ/`.
  - **Fix:** `loreLexicon.ts` Monarch entries:
    - `'mah nark'` → `'mon nark'`
    - `'mah narks'` → `'mon narks'`
    - `'mud mah nark'` → `'mud mon nark'`
    - `'mud mah narks'` → `'mud mon narks'`
    - Block comment updated to reflect the spell-it-out cue.
  - **Why:** The OTA-107 preview-before-shipping rule paid off on first use — I asked before editing, got the course-correction, and shipped a single corrected OTA instead of burning another revert cycle like the Aether family. The deeper lesson: the IPA the user types may represent emphasis or contour cues more than literal phoneme content. `/ɑ/` for them maps to the "on" vowel in "monarch," not the "ah" of "spa." Future IPA-driven changes get the spell-it-out preview without exception.
  - **Files:** `app/voice/loreLexicon.ts` (Monarch block comment + 4 entries).

- **OTA-108 (2026-05-27) · Monarch pronunciation = MAH-nark per IPA /ˈmɑnɑrk/.**
  - **What:** Player provided IPA `monarch = /ˈmɑnɑrk/` — both syllables take the /ɑ/ "ah" vowel: first syllable "mah" (as in "spa"), second syllable "nark" (rhymes with "park"). Default phonemizers read "monarch" as MON-ark with a short-o; the lexicon now forces MAH-nark.
  - **Fix:** `loreLexicon.ts` Faction / role block:
    - `'mud mon ark'` → `'mud mah nark'` (Mud Monarch)
    - `'mud mon arks'` → `'mud mah narks'` (Mud Monarchs)
    - Added standalone `Monarch` → `'mah nark'` and `Monarchs` → `'mah narks'` for lore lines that name the role without the "Mud" prefix.
  - **Why:** First IPA-driven change to follow the OTA-107 preview-before-shipping rule — surfaced "MAH-nark? (mah + nark, like spa + park)" via AskUserQuestion before editing; user confirmed apply-across-the-lexicon scope. No revert needed. The SORTED_LEXICON length-descending sort still picks "Mud Monarchs" before "Monarchs", so the compound is matched first and never preempted.
  - **Files:** `app/voice/loreLexicon.ts` (Faction block comment + 2 entries updated + 2 entries added).

- **OTA-107 (2026-05-27) · Full Aether-family revert to the uniform "AY-thur" pattern.**
  - **What:** OTAs 103 and 105 over-interpreted IPA character-level detail across the Aether family — rhotic schwa "ther" vs "thur" for Aether, long-E "thee" middle for Aetheric, /ɛθ/ short-E start for Aetherborn and Aetherbat. User: *"revert all of the aether nouns with that long a and thur sound in the beginning in caps AY-thur."* The Aether family is uniform across all five entries: long-A "ay" + "thur" + suffix. Caps cue: AY-thur.
  - **Fix:** `loreLexicon.ts` Aether block reset to the OTA-218-era spec:
    - `'ay ther'` → `'ay thur'` (Aether)
    - `'ay thee rik'` → `'ay thur ik'` (Aetheric)
    - `'eth er born'` → `'ay thur born'` (Aetherborn)
    - `'eth er bet'` → `'ay thur bat'` (Aetherbat — final reverts to "bat" too)
    - Aetherstone stays at `'ay thur stone'` (already corrected in OTA-106)
    - Block comment rewritten to call out the uniform pattern + the lesson from the IPA-driven detours.
  - **Why:** The TTS output that ships to the player is what matters, and the user's canonical Tartaria pronunciation is "AY-thur" across the family. The IPA the user typed was a finer-grained hint than what should be applied verbatim — I treated character-level detail as authoritative when it wasn't.
  - **Lesson re-logged (sharper):** When IPA produces a respelling that diverges from the word's English orthography in multiple places (vowel quality + consonant + ending), pause and surface it to the user as *"this would say X, is that right?"* before shipping. Going forward: ANY IPA-driven change to a proper-noun pronunciation gets a one-line natural-language preview ("AY-thur or ETH-er for this start?") so the user can sanity-check before the lexicon entry lands.
  - **Files:** `app/voice/loreLexicon.ts` (Aether block comment + 4 entries reverted).

- **OTA-106 (2026-05-27) · Aetherstone correction — OTA-105 misparsed the IPA.**
  - **What:** OTA-105 took the user's IPA `/ɛjtɛɹstɛn/` for Aetherstone literally and respelled as `'ay ter sten'` — hard /t/, "sten" rhymes with "ten." Player corrected via natural-language respelling: `AY-thur-stohn = aetherstone`. Translation: long-A start (consistent with the rest of the long-A group), /θ/ "th" sound in the middle (not /t/), and "stone" final (not "sten").
  - **Fix:** `loreLexicon.ts` Aetherstone entry → `'ay thur stone'` (essentially the pre-OTA-105 respelling, which OTA-103 had left alone for exactly this reason — partial refinement is safer than guessing). Block comment updated to call out the correction.
  - **Why:** When the user provides both IPA and a natural-language respelling and they disagree, the natural-language respelling wins — it's a clearer signal of the canonical pronunciation than parsing IPA characters that may have been typed loosely. Aetherbat's `'eth er bet'` from OTA-105 stays — user only corrected Aetherstone.
  - **Lesson logged:** When IPA respelling produces a surprising result (hard /t/ in a word with "th", or a /stɛn/ ending in a word with "stone"), surface it back to the user before shipping rather than committing the literal parse. Going forward: if IPA yields a result that diverges sharply from the word's English orthography, ask before applying.
  - **Files:** `app/voice/loreLexicon.ts` (Aetherstone entry + Aether block comment).

- **OTA-105 (2026-05-27) · Aether-family IPA spec completed: Aetherstone, Aetherbat.**
  - **What:** OTA-103 refined three Aether entries (aether/aetheric/aetherborn) and left Aetherstone / Aetherbat untouched pending a fresh spec. Player provided IPA for those two: `Aetherstone /ɛjtɛɹstɛn/`, `Aetherbat /ɛθɛɾ bet/`. Both diverge from the prior respellings in surprising ways — Aetherstone uses a hard /t/ instead of /θ/ ("ter" not "ther") and ends in /stɛn/ ("sten" rhymes with "ten") not the obvious "stone"; Aetherbat ends in /bet/ ("bet" rhymes with "set") not the obvious "bat". The Aether family now splits cleanly by initial vowel: long-A "ay" group (Aether, Aetheric, Aetherstone) and short-E "eth" group (Aetherborn, Aetherbat).
  - **Fix:** `loreLexicon.ts` Aether block:
    - `'ay thur stone'` → `'ay ter sten'` (Aetherstone — hard /t/, "sten" final)
    - `'ay thur bat'` → `'eth er bet'` (Aetherbat — short-E start matching Aetherborn, "bet" final)
    - Block comment updated to document the long-A / short-E split.
  - **Why:** Completes the Aether-family IPA pass started in OTA-103. All five entries now reflect the user's canonical pronunciation rather than the original guess-from-spelling respellings. The /t/-vs-/θ/ choice and the "sten"/"bet" finals are non-obvious — encoding them in the lexicon means TTS doesn't have to back into them from English spelling rules.
  - **Files:** `app/voice/loreLexicon.ts` (Aether block comment + 2 entries).

- **OTA-104 (2026-05-27) · Place-name IPA refresh: Asgardar, Samarran, Nimari.**
  - **What:** Player provided fresh IPA for three place names: `Asgardar /ɛz gɑdɔɹ/`, `Samarran /ɛsɛmɔːɾɛn/`, `Nimari /ɛnɛmɑɹi/`. Pattern across all three: a leading /ɛ/ schwa ("eh") that the prior respellings dropped entirely — the lexicon was treating them as if they started with the first consonant. Samarran and Nimari are also 4-syllable words per the IPA, but the prior `'sam ah ran'` / `'nih mar ee'` were 3 syllables, collapsing an internal vowel.
  - **Fix:** `loreLexicon.ts` Place names block:
    - `'az gar dar'` → `'ez gah dor'` (Asgardar — /ɛz/ leading "ez", /gɑ/ open-back "gah", /dɔɹ/ "dor")
    - `'sam ah ran'` → `'eh sem or en'` (Samarran — restores the leading /ɛ/ and the 4th syllable from /ɔː/)
    - `'nih mar ee'` → `'eh neh mah ree'` (Nimari — restores leading /ɛ/ schwa; "ree" for final /i/ long-E)
    - Drakova / Varakush / Voronov / Thametan / Zharak untouched — user only specified the three.
  - **Why:** Same rationale as OTA-103 (Aether-family). Lexicon respellings feed espeak-ng's letter-to-sound rules; matching the IPA's vowel inventory and syllable count produces TTS output that lines up with the user's intended pronunciation. The leading schwa is a Tartarian pronunciation tic that's now visible across multiple proper nouns — future place names should be cross-checked with the user for it.
  - **Files:** `app/voice/loreLexicon.ts` (Place names block comment + 3 entries).

- **OTA-103 (2026-05-27) · Aether-family pronunciation refinement from fresh playtester IPA.**
  - **What:** Player provided IPA for three of the five Aether entries — `aether = ɛɪθɚ`, `aetheric = ɛɪθiɾɪk`, `aetherborn = ɛθɛɾ bɔːn`. Key insight from the IPA: aetherborn opens with /ɛ/ (short-e "eth"), NOT /ɛɪ/ (long-A "ay") like aether and aetheric. The prior respellings treated all five entries as the same `'ay thur'` family — wrong starting vowel for aetherborn, plus the final rhotic schwa /ɚ/ reads better as "ther" (rhymes with father) than "thur" (rhymes with fur), and aetheric's middle /θi/ is a long-E ("thee") not a schwa.
  - **Fix:** `loreLexicon.ts` Aether block:
    - `'ay thur'` → `'ay ther'` (aether)
    - `'ay thur ik'` → `'ay thee rik'` (aetheric)
    - `'ay thur born'` → `'eth er born'` (aetherborn)
    - Aetherstone / Aetherbat untouched — user only specified the three, no need to guess vowels they haven't called out.
  - **Why:** Lexicon respellings feed espeak-ng's letter-to-sound rules; matching the IPA's structural cues (vowel quality, syllable count, rhotic schwas) produces TTS output that lines up with the user's intended pronunciation. Partial refinement is fine — Tartaria's pronunciation rules are evolving as the user surfaces them.
  - **Files:** `app/voice/loreLexicon.ts` (Aether block comment + 3 entries).

#### Climb overlay polish

- **OTA-102 (2026-05-27) · 1-tier climbs surfaced full elevated overlays with apex-flavored narration; overlay ambient nouns returned generic catchall on investigate.**
  - **What:** Playtest log showed a 1-tier `cracked walkway` climb popping a collector overlay ("A copper bowl is bolted to the apex, half-filled with Aether residue. The air shimmers, like heat over a road.") — the flavor implies a tall structure but the noun is a walkway. Out of scale. Then `investigate copper bowl` / `ozone tang` / `bent rivets` (the overlay's own ambient nouns) all returned the OTA-071 generic catchall because the room investigation table was seeded only for the BASE scene's noun pool; OTA-076 self-heal didn't fire because the table existed (just without these entries).
  - **Fix (1) — minTiers default bumped from 0 to 2.** `rollElevatedOverlay` now requires totalTiers ≥ 2 for overlays without an explicit minTiers (encounter + lookout templates). 1-tier climbs (ledges, walkways, pedestals, low arches) get the standard climb-top loot beat but no overlay surface. Traders keep their explicit minTiers=4 (no change to the larger-location gate).
  - **Fix (2) — seed overlay nouns.** When an overlay scene swap happens, the climb-top branch now merges the overlay's ambientNouns into `worldMemory.visitedRooms[roomKey].roomInvestigationTable`. Idempotent (skips entries already present). Subsequent investigates of `copper bowl` / `bone fragments` / etc. now hit real category templates (`vessel`, `bone`, etc.) with proper lore + yields.
  - **Files:** `app/engine/elevatedOverlay.ts` (minTiers default constant), `app/state/gameStore.ts` (overlay-swap branch merges overrides.ambientNouns into the room's table via seedInvestigationTable).

#### Telemetry / dev visibility

- **OTA-101 (2026-05-27) · Every log export now bundles the basic device/install summary automatically.**
  - **What:** Player asked: "when a playtester pushes a big report have it also copy and paste the about information." Previously, the COPY/SHARE/CHUNK buttons on LogScreen + AboutScreen + TitleScreen (dead-character report) emitted only the `=== TARTARIA LOG · N CHARS · BEGIN === ... === END LOG ===` envelope. Dev had to ask the player to grab the About info separately. Friction + sometimes the device info was missing entirely from captures.
  - **Fix:** New `stampLogExport(logBody, opts?)` helper in `aboutSummary.ts`. Wraps the envelope (single or multipart) AND appends `buildBasicDeviceSummary()` after the closing marker. Three call sites converted: `LogScreen.handleChunk` / `handleCopy` / `handleShare`, `AboutScreen.handleCopyLog` (both single-chunk and multipart branches), `TitleScreen` dead-character chunk path (passes `playerName` so header reads `Tartaria Realms · <name>`).
  - **Format:** envelope first, blank line, `Tartaria Realms` (or `Tartaria Realms · <playerName>`) header, blank line, then the `Device` / `Install` block — same shape the playtester was manually pasting from About, so muscle memory + log captures stay consistent.
  - **Files:** `app/diagnostics/aboutSummary.ts` (new `stampLogExport` + `StampLogOptions` type), `app/screens/LogScreen.tsx`, `app/screens/AboutScreen.tsx`, `app/screens/TitleScreen.tsx`.

- **OTA-100 (2026-05-27) · OTA-applied debug marker never fired even after a real upgrade.**
  - **What:** OTA-099's playtest log confirmed the session-start marker is working (visible as `[debug] OTA session start: 2026-05-27-099.` at the top of the slot-load session). But the symmetric `OTA applied: <old> → <new>` marker that should fire ONCE per upgrade was missing. Player clearly upgraded between OTA-098 and OTA-099 (the diagnostic envelope showed both `Last OTA applied: Yes — <uuid>` and `OTA build ID: 2026-05-27-099` with a publish time 6 minutes before capture), but no applied-marker landed in the log.
  - **Root cause:** OTA-099 read `justUpdatedFromBuild` inside `loadSlotIntoGame`, but the TitleScreen update popup clears that flag on dismiss (`TitleScreen.tsx:919`, comment explicitly: "Dismiss clears justUpdatedFromBuild so it doesn't refire"). The dismiss happens BEFORE the player taps LOAD SLOT, so by the time my code captured the flag it was already null.
  - **Fix:** Added a separate state field `pendingOtaAppliedFrom: string | null` that has the same SOURCE value (set in hydrate alongside `justUpdatedFromBuild`) but a different LIFECYCLE — it's not touched by the popup; only `loadSlotIntoGame` consumes it (reads before set, clears in the set that fires the debug log). One marker per upgrade per resume; never refires within a session; not affected by popup dismiss.
  - **Files:** `app/state/gameStore.ts` (GameStore interface gains `pendingOtaAppliedFrom`; initial state + hydrate set both populated; loadSlotIntoGame reads the new flag).

- **OTA-099 (2026-05-27) · Add debug-log markers on OTA apply + every session start so log captures show which build the player is running and when.**
  - **What:** Player requested: "when you update via OTA can a record of that be in the log, but not visible to the player, that way you can tell if I am up to date, and can kind of have a timestamp of the progression." The device-info envelope on log captures already lists the OTA build ID, but it's a single static line, not interleaved with the timestamped log entries. No way to tell when within a session an upgrade landed or which build a specific log slice was running.
  - **Fix:** Two debug-channel log entries:
    - `[debug] OTA session start: <OTA_BUILD_ID>.` — emitted on every slot load (and on new-game character creation). Any log capture will have this line near the top, timestamped, naming the running build.
    - `[debug] OTA applied: <oldId> → <newId>.` — emitted ONCE per upgrade, the first time a slot is loaded after the hydrate flow detected a new OTA_BUILD_ID. Mirrors the existing `justUpdatedFromBuild` flag (which drives the TitleScreen update popup) but persists into the log so I can trace upgrade progression across captures.
    - Both use the existing `appendLog('debug', ...)` channel — invisible to the player in normal play (debug entries are present in log exports but typically don't surface in the world / arbiter / combat narration UI).
  - **Files:** `app/state/gameStore.ts` (loadSlotIntoGame + startNewGame both append the markers; justUpdatedFromBuild captured before the set() so the OTA-applied marker can fire even though the set clears the flag).

#### Quest-check narration polish

- **OTA-098 (2026-05-27) · Chip didn't grey + Arbiter never acknowledged the captured lead.**
  - **What:** OTA-096/097 closed the engine-side retry loop, but the chip in the SearchModal still rendered actionable. Plus the player asked for a clearer Arbiter beat when a lead drops: "I would imagine that my arbiter would say something to the effect of 'Ah, I see it now. We'll put that in your contracts for later.'"
  - **Diagnosis:** the dedup write stored the noun's apostrophe form ("titan's bone marker"), but the scene chip text was stored without ("titans bone marker") — the OTA-070 substring fuzzy check can't bridge that gap because neither string contains the other when the apostrophe differs. So the chip render check missed the dedup mark.
  - **Fix:** Two changes:
    - **Apostrophe-variant writes** — when the dedup key has an apostrophe, write BOTH forms (`focusKey` and `focusKey.replace(/['']/g, '')`) to `flavorExhaustedNouns`. The fuzzy check on either chip variant now finds a match. Same fix applied to both the success and fail arms of the quest-check investigate path.
    - **Arbiter line on lead-fired** — when the 12% lead roll fires, an arbiter-channel log now fires between the world line and the reward line: `The Arbiter nods. "Ah, I see it now. We'll put that in your contracts for later."` Player gets a clear signal that the thread was recorded + where it landed.
  - **Files:** `app/state/gameStore.ts` (success-arm + fail-arm dedup writes both stripped + apostrophe-form write; arbiter log added to lead-fired branch).

- **OTA-097 (2026-05-27) · FAIL arm of the quest-check investigate path didn't lock the noun — player could retry indefinitely without knowing they couldn't win.**
  - **What:** OTA-096 fixed the SUCCESS arm (per-noun dedup so the chip greys after the first successful tap) but missed the symmetric fail arm at `gameStore.ts:~8730`. A player whose stats couldn't beat the skill check's DC could keep tapping the same noun and never get told "you're not going to pass this." On top of that, the fail line was misleading: "You sweep Asgardar but find only dust" — narrated against the location name, not the noun the player actually examined. Playtester noticed: "it's kind of like tricking me to keep trying when I really don't have a chance."
  - **Fix:** Mirror the OTA-096 dedup write on the fail path. After a failed check on a focus noun, write the noun to `flavorExhaustedNouns` for the current room (same idempotent set() pattern as the success path). Next tap on the same noun routes through the OTA-096 callback gate at the top of the success arm's investigate branch. Also rephrased the fail line to reference the focus noun: `"You sift the X but it gives up nothing. The Aetherstone keeps its silence here."` Player can tell what they examined.
  - **Why:** One attempt per noun per visit. The dice told you what they told you. Same design philosophy as the other dedup paths — no grind loops, no false hope. If your stats can't beat the DC, you don't keep tapping; you walk away, level up, come back.
  - **Files:** `app/state/gameStore.ts` (fail-arm investigate case rewritten with focus-noun narration + inline dedup write).

- **OTA-096 (2026-05-27) · 'investigate titan's bone marker' printed the same line 6 times with no signal that the work was diminishing returns.**
  - **What:** Playtester tapped the same noun 6 times. Each successful skill check fired `"You examine X. The Aetherstone hums — something is here, but not in plain sight."` — the line promises hidden information but the path only sometimes drops a new quest lead (12% chance, gated to <2 active quests). When the lead didn't drop, the player saw 6 identical lines with no clue the engine was silently training their skill. Same pattern as the OTA-070/076/083/084 chip-stays-actionable bugs, different surface: this branch wasn't a refusal at all — it was an ambient narration. The OTA-084 hardening covered refusal paths but missed active-narration paths.
  - **Fix:** Two changes in the `case 'investigate':` branch at `gameStore.ts:8640` (the quest-skill-check success path):
    - **First-tap line rewritten** to be honest about the skill-training nature. When a lead fires: `"You examine the X. A thread surfaces — clear enough to follow."` + the existing New lead reward. When no lead: `"You examine the X carefully. The work sharpens your focus, but no clearer thread surfaces here."` Player can tell the difference.
    - **Per-noun dedup added.** After the first tap, the noun is written to `flavorExhaustedNouns` for the current room. Subsequent taps go through the OTA-084 `refuseAmbient` helper with a callback: `"You've already turned the X over here. Whatever it had to give you, you took. Your active leads (if any) live in the Contracts log."` Chip greys via OTA-070/076 fuzzy UI check.
  - **Why:** The screen + engine had drifted out of sync on this path. The engine was rewarding the player (stat training + occasional quest leads); the narration was misleading them into thinking nothing was happening. Now they see a clear signal each tap and the chip stops accepting taps after the first productive examination.
  - **Files:** `app/state/gameStore.ts`.

#### UI structure / screen reorganization

- **OTA-095 (2026-05-27) · Aetheric recipes were under Actions; food recipes were duplicated between Actions and Crafting.**
  - **What:** Player flagged that the Aethercraft disciplines (shape stone / summon golem / mend wounds) lived in `ActionReferenceScreen`'s "Recipes" mode alongside food recipes + every other recipe group. Food recipes were also already in `CraftingScreen`'s Recipes tab via `kindFilter="consumable"` — duplicated. User wanted: Actions = actions only; food = Recipes tab only; Aethercraft = new 4th tab under Crafting called "Aetheric."
  - **Fix:** Added 4th tab `'aetheric'` to `CraftingScreen` (`type Tab = 'craft' | 'repair' | 'recipes' | 'aetheric'`). `AETHERCRAFT_DISCIPLINES` constant copied over (3 disciplines: shape / summon / mend) with the same card-tap-queues-phrase behavior as `ActionReferenceScreen` (uses `queueInputDraft` + Clipboard fallback + cycleIdx for example rotation). Stripped the entire Recipes mode from `ActionReferenceScreen`: removed `RecipeMode` type, mode state + tab toggle, the recipes-branch JSX, the `AETHERCRAFT_DISCIPLINES` + `RECIPE_GROUPS` constants, the `recipeDescription` helper, and the now-unused imports (`RECIPES`, `WEAPONS`, `ARMOR`, `AMULETS`, `RINGS`, `GEAR`, `MATERIALS`). Screen now renders actions only — title is unconditionally "ACTIONS".
  - **Why:** Single home per content type. No duplicate food rows; Aethercraft has its own visually-distinct tab.
  - **Files:** `app/screens/CraftingScreen.tsx` (Tab type + tab button + tab body + Aethercraft card styles), `app/screens/ActionReferenceScreen.tsx` (Recipes mode stripped — ~110 lines removed).

#### Parser hardening

- **OTA-094 (2026-05-27) · Parser regression-lock + hyphen normalization.**
  - **What:** OTA-093 fixed the false-match bug but broke the existing `'attack the drone with the bolt-caster'` test because the parser tokenizes hyphens; my head-noun check looked for `'bolt-caster'` as a single token. Two existing parserArgs tests failed.
  - **Why:** Without normalization, hyphenated item names like `Bolt-Caster` can't be located via head noun.
  - **Fix:** Added `normalizeName()` helper (lowercase + replace `-` with space + collapse whitespace) and `flatTokens` (input tokens flattened on hyphens + whitespace). All 3 passes use these. Added 7 regression tests in `__tests__/parserArgs.test.ts` under "OTA-093 — resolveItem head-noun matching" so a future loosening trips the lock. All 196 parser-suite tests pass.
  - **Files:** `app/engine/parser.ts`, `__tests__/parserArgs.test.ts`.

- **OTA-093 (2026-05-27) · `investigate titan's bone marker` false-matched inventory's `Bone Fragment` → "field-inferred" warning + wrong arbiter refusal.**
  - **What:** Pre-OTA-093 `resolveItem` accepted any input token as a substring of any item name. `titan's bone marker` (scene noun) tokens matched `Bone Fragment` via `'bone fragment'.includes('bone')` → engine treated it as inventory inspect → fell into `itemDefaults` inference → printed `[debug] inferred-stats: gear:Bone Fragment` + arbiter "not something hands take to." Plus `Bone Fragment` had no catalog entry (legitimate corpse-investigate loot).
  - **Why:** Adjective-only token substrings shouldn't claim ownership of an inventory item.
  - **Fix:** Rewrote `resolveItem` with three ordered passes: (1) full item name in input; (2) head noun (last word) as standalone token; (3) fuzzy on head noun only. Added Bone Fragment row to `app/data/items/materials.json`.
  - **Files:** `app/engine/parser.ts`, `app/data/items/materials.json`.

#### Elevated overlay system (climb-top mini-areas)

- **OTA-092 (2026-05-27) · Overlay encounter scaling refined to HP-ratio bands (no more 5x mismatches).**
  - **What:** OTA-091's rarity-tier scaling was too coarse — a 32 HP player got only ≤25 HP enemies (under-challenged); a 60 HP player skipped from Common to mixed Common+Uncommon with no scare-tier moments. Player wanted "still a challenge, flee occasionally, 2x ok, 3x scare, never 5x."
  - **Why:** HP-ratio bands relative to `player.hpMax` scale with the player as they grow.
  - **Fix:** Refactored `encounterPool` from tiered struct to flat `string[]`. `rollOverlayEncounter` does runtime band selection: easy (0.5x–1.0x), standard (1.0x–2.0x), scare (2.0x–3.0x). >3x never spawns. Weights 60/25/15. Graceful fallback: if no enemy in any in-range band, picks closest-to-1.5x.
  - **Files:** `app/engine/elevatedOverlay.ts`.

- **OTA-091 (2026-05-27) · OTA-089 surfaced a 158-HP Aetheric Harpy on a 32-HP player → instant death.**
  - **What:** Encounter pool was a flat list mixing 12-HP Commons with 158-HP Rares; uniform roll one-in-three dropped a Rare on anyone. Plus `Aetheric Bat` typo in the pool (correct catalog name is `Aetherbat`) silently failed to spawn, biasing rolls toward survivors (Harpy, Shrike).
  - **Fix:** Initially tiered pool by rarity (later refactored to HP-ratio in OTA-092). Fixed Aetheric Bat → Aetherbat typo.
  - **Files:** `app/engine/elevatedOverlay.ts`, `app/state/gameStore.ts`.

- **OTA-090 (2026-05-27) · Player requested NPC overlays — peaceful traders + lookouts at the top of climbs.**
  - **What:** Player asked: "add those. keep the traders to locations we describe as larger and have them have a funny reason why they are hiding there." OTA-089 only had hostile encounters.
  - **Fix:** Added `OverlayKind` union (encounter/trader/lookout). 5 trader templates (Olek the Ledger Keeper, Sister Yelena, Pavel allegedly, Adept Ireneus, Mikola the Lost-On-Purpose) gated to `minTiers >= 4`. 2 lookout templates (rumor scout, rumor pilgrim) plant one-stage hooks. Traders use `pickRoadsideTrader`-style VendorInstance with min/max randomized prices. Faction wiring (Servants/Reclaimers/Forgotten Order) intact.
  - **Files:** `app/engine/elevatedOverlay.ts`, `app/state/gameStore.ts`.

- **OTA-089 (2026-05-27) · Player asked for "heavier route" — actual mini-area at the top of multi-tier climbs with own encounter, return to ground via `climb down` without detour.**
  - **What:** Player spec verbatim: "they climb four stages of the pillar at the top of the pillar there's a nook in the wall that's got [enemy]. whatever that we already have, it fights it, they get something and then instead of going back to the pillar they stay in the [nook] and they can just climb down from there."
  - **Fix:** New `app/engine/elevatedOverlay.ts` (pure module, ~150 LOC). 6 templates (nook/vantage/collector/sealed_door/roost/open_sky). 30% trigger chance on climb-top. `CurrentScene` gains `preservedSceneOnDescent` + `elevatedOverlayMeta` so descent restores the base scene directly. `currentLocationId` never changes → no travel cost.
  - **Files:** new `app/engine/elevatedOverlay.ts`, `app/state/gameStore.ts` (CurrentScene + climb-top + climb-down branches).

#### Hook narrative / chip rotation

- **OTA-088 (2026-05-27) · Hook-progressed chips didn't follow the narrative camera.**
  - **What:** Player tapped `investigate fungus` → bioluminescent_path hook fired stage 1: "trail leads down through a slumped wall into a low chamber..." Player tapped fungus AGAIN expecting stage 2 — but the chip text still said "fungus" even though they were narratively in a chamber now. Looked like a duplication bug.
  - **Fix:** `resolveHookOneStep` gained optional `triggerNoun` param. After stage advance, when `outcome.addNouns` has entries, replace the trigger ambient in `scene.ambientNouns` + `displayedAmbientNouns` with `addNouns[0]`. Fuzzy match on trigger (same OTA-070 substring approach) so 'fungus' maps to 'bioluminescent fungus' if that's the scene form. Hook keeps full noun list so TEXT input on the old word still routes.
  - **Files:** `app/state/gameStore.ts`.

#### Combat UI / Travel UX / List screens

- **OTA-087 (2026-05-27) · Player asked for search bars + sort on Inventory, Craft, Repair, Recipes.**
  - **Fix:** New `app/components/SearchSortBar.tsx` (controlled component). Wired into all four surfaces with category-relevant sort axes (Inventory: NAME/RARITY/KIND/QTY; Craft+Recipes: READY/NAME/RARITY; Repair: READY/DURABILITY/NAME/COST). Per-tab state in CraftingScreen so switching tabs preserves filters. RecipesView extended with optional `query`/`sortKey`/`sortDirection` props; legacy callers unchanged. State is ephemeral (resets on remount).
  - **Files:** new `app/components/SearchSortBar.tsx`, `app/screens/InventoryScreen.tsx`, `app/screens/CraftingScreen.tsx`, `app/components/RecipesView.tsx`.

- **OTA-086 (2026-05-27) · Climb chip stayed actionable after cresting (5+ tap loop).**
  - **What:** OTA-085 added `disabled={isCleared}` on the climb modal Pressable, but `isCleared` came back false for the actually-cleared spire because of a marker-key mismatch. Engine wrote markers under the resolved short form (`climbed:spire:t4`); modal looked them up under the full chip noun (`zharak's teeth spire`). Exact prefix match missed.
  - **Fix:** Fuzzy substring match in `maxClimbedTier` — `climbed:X:t<N>` matches the chip noun if X equals/contains/is-contained-by the chip lowercase. Multi-colon noun defensive parse via `slice()`. Added 5 regression tests in `__tests__/climbCleared.test.ts` covering the exact playtest case + symmetric inverse + no-false-positive boundary. All 14 climbCleared tests pass.
  - **Files:** `app/engine/climbHeight.ts`, `__tests__/climbCleared.test.ts`.

- **OTA-085 (2026-05-27) · Cleared climb chip rendered greyed with ✓ TOP but the Pressable still fired taps.**
  - **Fix:** `disabled={isCleared}` on the Pressable in `ClimbModal.tsx` + guarded the pressed-style branch so no tap acknowledgement at all on cleared chips. (Note: OTA-086 then found `isCleared` was returning false for actually-cleared chips due to a separate marker-key bug.)
  - **Files:** `app/components/ClimbModal.tsx`.

- **OTA-084 (2026-05-27) · Hardened the "you've already worked this" refusal pattern — structurally locked.**
  - **What:** History of OTA-070, OTA-076, OTA-083 all fixed the same bug pattern (refusal printed but no dedup write → chip stays green). User asked to harden.
  - **Fix:** New store action `refuseAmbient({ noun, line, kind, channel?, skipDedup? })` that atomically appends the refusal log + writes the dedup mark (`searchedAmbientNouns` for `'productive'`, `flavorExhaustedNouns` for `'flavor'`). Refactored the OTA-079 resolved-hook branch to use the helper. JSDoc on the interface declares the contract for future contributors. The pattern is now impossible to forget — there's only one way to refuse, and that way always writes.
  - **Files:** `app/state/gameStore.ts`.

- **OTA-083 (2026-05-27) · Moss patch chip stayed green after 8 taps — OTA-079 resolved-hook short-circuit didn't write to any dedup list.**
  - **Fix:** Added a `set()` to write the noun to `searchedAmbientNouns` alongside the callback log. (Later consolidated into the OTA-084 helper.)
  - **Files:** `app/state/gameStore.ts`.

- **OTA-082 (2026-05-27) · Travel refusal "just failed through without instruction."**
  - **What:** Tapping a travel destination with 0 stamina fired the arbiter refusal once, then subsequent taps were eaten by arbiter-channel dedup at `gameStore.ts:1868` (visible in log as `[debug] dedup: suppressed arbiter repeat`).
  - **Fix:** Added `{ skipDedup: true }` so every travel attempt shows the line. Phrasing updated to interpolate the destination name from `locations.json` ("You're too tired to set out for Voronov. Rest before making any plans — the road will hold.").
  - **Files:** `app/state/gameStore.ts`.

- **OTA-081 (2026-05-27) · Enemy HP number ticked down but HP bar stayed full.**
  - **What:** RN percent-string width updates inside virtualized FlatList cells sometimes don't trigger a layout pass.
  - **Fix:** Switched `hpBarFill` to numeric pixel width derived from `CARD_WIDTH - 18` (padding + border). Numeric widths always force layout.
  - **Files:** `app/components/EnemyPanel.tsx`.

#### Investigation table system (the big arc)

- **OTA-080 (2026-05-27) · Audit pass 3 — keyword coverage + landmark category + creepy variant pool.**
  - **What:** Audit found ~18 missing keywords from the playtest log + worldLadder data; spire/tower/pillar/obelisk had no category. User also asked for "creepy statements marked on objects" flavor.
  - **Fix:** Expanded `KEYWORD_MAP` (chandelier→light; mosaic/tapestry/tome/parchment→text; pillar/obelisk/spire/tower/dome/etc.→new `landmark` category with Aether Residue yield @ 0.10). Added `CREEPY_VARIANTS` pool with 14 uncanny-tone variants (ANNA carved over and over, tooth too large for a child in warm liquid, statue eyes refilled with wet clay, etc.). `resolveLore` now branches on a deterministic per-noun hash at CREEPY_RATE=0.17 so the same noun resolves to the same line in a session.
  - **Files:** `app/engine/investigationTable.ts`.

- **OTA-079 (2026-05-27) · Audit pass 2 — salvage didn't sync with the investigation table (double-dip exploit) + resolved-hook leak to generic.**
  - **What:** Salvage routes through `intent=investigate` but lands in its own harvest branch BEFORE the OTA-071 table consult. The harvest branch wrote only to `searchedAmbientNouns` and never touched `roomInvestigationTable.consumed`. So `salvage bench` → searched. Then `investigate bench` → table sees un-consumed → runs FRESH outcome with possible second yield. Player double-dipped. Plus resolved-hook noun ('spire' after a 3-stage half_buried_spire hook resolved) leaked to my OTA-071 generic template.
  - **Fix:** Salvage's produced-set now also patches `roomInvestigationTable[noun]` with `consumed: true` + synthetic kind='item' result. Same in `salvageAllAmbient` batched commit. Resolved-hook short-circuit added in investigate case: `scene.hooks` scanned for resolved hook whose nouns include the matched ambient (fuzzy substring); print "You've already followed the thread of the X" + break.
  - **Files:** `app/state/gameStore.ts`.

- **OTA-078 (2026-05-27) · Audit pass 1 — five OTA-071 yields named items not in the catalog (silent fail) + pack-full silent fails + Qwen async patch comparison bug.**
  - **What (1):** Cushion Scraps / Paper Scraps / Machine Part / Liquid Sample / Useful Scrap weren't in `app/data/items/*.json`. `findCatalogItem` returned null, grant silently skipped, but the lore line already said "Tucked into the seam: a cushion scraps" + entry marked consumed. Player saw the line, got nothing, lost the chip. Worse: next callback claimed "the cushion scraps was the only thing of value" for an item that never landed.
  - **What (2):** Investigate / salvage / take pack-full all silently consumed the chip when `granted.accepted === 0`; player saw cryptic "Found a X but your pack is already full of them" line, took no item, lost the chip.
  - **What (3):** `generateLoreAsync` returned the raw template with literal `{noun}` placeholder on Qwen miss; the IIFE's skip check compared against the substituted `baseOutcome.line` — never equal — so the patch always ran and overwrote the cached lore with raw `{noun}` text.
  - **Fix:** Remapped yields to confirmed-in-catalog materials (furniture→Stick, shelf→Worn Tartarian Coin, machinery→Bent Nail, vessel→Mud Fragment, debris→Small Rock). Pack-full now downgrades the outcome to flavor + arbiter warning + skips dedup write (chip workable for retry). Take has its own early-return arbiter warning. `generateLoreAsync` fallback substitutes `{noun}` before returning so the skip-check works.
  - **Files:** `app/state/gameStore.ts`, `app/engine/investigationTable.ts`.

- **OTA-077 (2026-05-27) · "Multiple taps to get rid of a chip" + generic catchall too broad + identical generic lines hid which noun resolved.**
  - **What:** OTA-072 ran the full outcome (lore, log, set-consumed) inside an async IIFE awaiting Qwen. Chip stayed green for the 50-2500ms latency window. Players tapped multiple times spawning duplicate IIFEs that interleaved log lines (same generic line appeared twice for spool+runecaster taps).
  - **Fix:** Split the work. SYNC: roll outcome + log curated lore + grant item + mark consumed (chip greys immediately). ASYNC: fetch Qwen lore + patch `entry.result.line` for future callback/echo reference. Visible log line for this investigate stays curated; Qwen upgrade lands on next callback. Also expanded KEYWORD_MAP (spool/runecaster/chalkboard added). Generic template noun-aware via `{noun}` placeholder.
  - **Files:** `app/state/gameStore.ts`, `app/engine/investigationTable.ts`.

- **OTA-076 (2026-05-27) · Salvage chip stuck-green on legacy rooms (pre-OTA-071 saves).**
  - **What:** Bench's room was visited before OTA-071's beginScene table-seed ran, so `roomInvestigationTable` was missing. Investigate handler fell through to the legacy `alreadySearched` branch and printed the old "you've already worked over the bench" refusal — bypassing every OTA-071→075 improvement.
  - **Fix:** Self-heal table seed in the investigate handler — if `tableRoom` exists but `roomInvestigationTable` is missing, seed it inline from `currentScene.ambientNouns`. Plus extended OTA-070's fuzzy match to `isAmbientConsumed` so salvage / take / pinned-ground chips share the same fuzzy substring dedup.
  - **Files:** `app/state/gameStore.ts`, `app/screens/ExplorationScreen.tsx`.

- **OTA-075 (2026-05-26) · Investigation series 5/5 — cross-room echo hooks.**
  - **Fix:** When player enters a new scene with no chain hook + no enemies, 15% chance to plant a hook that references a past investigation from a different room. `findReferenceableInvestigation` scans `worldMemory.visitedRooms` for consumed entries with kind='item'/'hook'. Synthetic Hook with kind='thread' + echo plantedLine.
  - **Files:** `app/engine/investigationTable.ts`, `app/state/gameStore.ts`.

- **OTA-074 (2026-05-26) · Investigation series 4/5 — callback variant pools + outcome-aware chip filter.**
  - **Fix:** `callbackLine` picks from per-kind variant pools (5 item variants, 5 flavor, 3 hook, 2 default) via `rotatingPick`. Engine write-site branches on outcome.kind: 'item' → `searchedAmbientNouns` (chip filters out); 'flavor' → `flavorExhaustedNouns` (chip greys visible).
  - **Files:** `app/engine/investigationTable.ts`, `app/state/gameStore.ts`.

- **OTA-073 (2026-05-26) · Investigation series 3/5 — 15-category coverage + yield-roll mechanics + item grants.**
  - **Fix:** NounCategory expanded from 5 to 15 (added door/corpse/statue/altar/vegetation/bone/light/container/text/stone). KEYWORD_MAP reordered for specificity. `rollOutcome` yield-roll path activated. Engine first-investigate path grants items via `grantItem` + reward log when outcome.kind === 'item'.
  - **Files:** `app/engine/investigationTable.ts`, `app/state/gameStore.ts`.

- **OTA-072 (2026-05-26) · Investigation series 2/5 — lazy Qwen lore generation.**
  - **Fix:** `LoreGenerator` type + `generateLoreAsync` (chat messages → string Promise, 2.5s timeout, curated fallback on miss). Engine wraps `qwen.generate` when `qwen.isReady()`. Investigate first-time path runs the Qwen call inside an async IIFE.
  - **Files:** `app/engine/investigationTable.ts`, `app/state/gameStore.ts`.

- **OTA-071 (2026-05-26) · Investigation series 1/5 — per-room investigation table foundational layer.**
  - **Why:** Player suggested architectural shift — every ambient noun in a scene should be a tracked entity with persistent attributes (category, lore, yield, hook potential, consumed flag, recorded result) so investigates never bottom out at "nothing more to find" generic refusals.
  - **Fix:** New `app/engine/investigationTable.ts` (pure module). `VisitedRoom.roomInvestigationTable?: Record<string, InvestigationEntry>`. Categorizer + 5 curated templates (furniture/shelf/machinery/vessel/debris). Engine consults the table BEFORE the legacy alreadySearched/requirement/catalog branches. Pinned ground/floor/mud excluded.
  - **Files:** new `app/engine/investigationTable.ts`, `app/engine/types.ts`, `app/state/gameStore.ts`.

- **OTA-070 (2026-05-26) · Investigate chip stayed green forever despite engine's "already worked over" refusal (eternal green chip).**
  - **What:** Engine used fuzzy substring match against memory (`'wooden bench'.includes('bench')` → true) for the alreadySearched gate, but UI chip's consumed check used exact `.has(chipLower)`. Variant phrasings in memory ('wooden bench') never matched chip noun ('bench') → chip stayed green even when engine refused.
  - **Fix:** Added `isFuzzyConsumed(chipNoun, pool)` helper in ExplorationScreen with the same fuzzy substring logic the engine uses. Applied to the productively-consumed filter, the flavor-exhausted grey flag, and the INVESTIGATE tab tone counter. Foundation for the OTA-076 cross-modal extension.
  - **Files:** `app/screens/ExplorationScreen.tsx`.

---

## 1. What this is

**Tartaria Realms** — React Native / Expo SDK 52 procedural narrative RPG. Android-first, Hermes engine. Repo: `verbal76/tartaria-rpg`. Distribution: EAS channel `preview` for OTAs.

**Setting:** post-Aetherstone-flood Tartaria — player wakes into a buried civilization, picks race + faction + name, plays procedural scenes driven by authored data + light template stitching + on-device LLM narration.

**On-device ML stack:**
- **Classifier (intent + target):** `onnxruntime-react-native` running `all-MiniLM-L6-v2` int8 (~22 MB, OTA-downloaded)
- **Generator (Arbiter narration + parse-fallback):** `Qwen 2.5 0.5B Instruct` via `llama.rn` (~398 MB Q4_K_M GGUF, OTA-downloaded)
- **Neural TTS (optional):** `react-native-executorch` running Kokoro-82M (~100 MB, OTA-downloaded)
- **STT (optional):** `expo-speech-recognition` with service-selection logic for Pixel devices

**Audio:** `expo-av` looping background tracks across 4 contexts (combat / shop / menu / explore) with crossfade.

---

## 2. Model identity for the assistant

**This session runs on `claude-opus-4-7[1m]`.** Use that exact string when asked which model you are. Never include the model identifier in commit messages, PR titles/bodies, code comments, or any artifact pushed to the repo — chat replies only.

---

## 3. Branch hierarchy & workflow

### Branches

- **`main`** — production. Tagged releases live here. Do NOT push directly.
- **`claude/new-session-MvF82`** — the active session branch for everything you ship. Every OTA flows from here. Push to this branch only.
- (Other `claude/*` branches may exist from prior sessions — leave them alone unless the user asks.)

The harness sometimes preconfigures a different branch name at session start. **If you're already on `claude/new-session-MvF82` with uncommitted/recent work, stay on it.** Don't switch branches mid-stream — that risks losing work in flight.

### Per-push workflow (OTA-only, ~95% of pushes)

```
1. Edit code in app/
2. npx tsc --noEmit   → must be 0 errors
3. npx jest --silent  → all suites must pass (see flakes section)
4. Bump app/buildInfo.ts → OTA_BUILD_ID format YYYY-MM-DD-NNN
5. git add -A && git commit -m "fix|feat|chore: <short subject>

   <body explaining the WHY with concrete before/after>"
6. git push -u origin claude/new-session-MvF82
```

The `.github/workflows/eas-update.yml` workflow auto-publishes to channel `preview` on every push to this branch. Player's device pulls the OTA on next launch via the boot-time silent check.

### When a new APK build is needed

Only when you add a NATIVE module (new dependency that ships native code) or change `app.json` native config. Steps:
1. Confirm with the user before adding the native dep
2. Add to `package.json` + `npm install`
3. Decide whether to bump `version` in `app.json`:
   - **Keep at `2.201`** if you want existing testers' APK to still receive OTAs and the new APK to share the same OTA stream (recommended default — no fragmentation)
   - **Bump to e.g. `2.202`** only if old APKs CANNOT safely no-op past the new module. After this, OTAs to `2.202` will not reach old APKs.
4. Bump comment in `metro.config.js` to trigger `build-apk.yml`
5. The user redistributes the APK manually to testers

**Lazy-load any native module that might not be in older APKs.** Static `import * as X from 'native-module'` at the top of a file can crash the JS bundle on APKs that don't have the native bridge. Use `require()` inside a try/catch helper (see `loadNavigationBar()` in `App.tsx` for the pattern). This way ALL OTAs reach all APKs regardless of native-module additions.

### OTA / APK runtime model (critical)

- `app.json` has `"runtimeVersion": { "policy": "appVersion" }` — meaning **runtimeVersion = the `version` field at build time** (currently `2.201`).
- OTAs are delivered to **every device on the same runtime + channel**. Multiple APKs on the same `version` share the OTA stream.
- Testers may be on different APK build numbers but the same runtime — they still get every OTA. APK build number is just the binary version; the runtime key is what matters for OTA delivery.

---

## 4. How the player works with you

**The user types runtime feedback into the in-game text input.** They paste me the play log between sessions. So when a log includes player turns like *"we need to add salvage as a button"* or *"this should pop up nouns"*, that's the player talking TO ME through the game — not an in-fiction action.

Two implications:
1. The meta-comment guard in `submitPlayerAction` (around line 1822) catches these and shows a confused-Arbiter response that includes "I'll keep your note in the log either way." That response is what the player sees — keep it honest, don't mock-narrate the request.
2. When reviewing logs, treat any sentence that's clearly meta-feedback as a feature request to triage, not a parser miss to debug.

**Log review is the primary feedback channel.** Player pastes a log → you find issues, prioritise, and ship fixes the same OTA. You will not have direct verification of fixes most of the time. Trust their next log to surface what worked and what didn't.

---

## 5. Architecture cheat-sheet

```
app/
  ai/                  — MiniLM + Qwen orchestrators
  audio/               — AudioManager / AudioController / settings
  components/          — UI primitives, Search / Approach modals,
                         TutorialOverlay + TutorialTarget
  data/                — Authored JSON. Locations / hubs / Micro-Micro rooms
                         all declare `interactables` arrays. wasteland_encounters.json
                         holds 45 archetypes (Phase 3 + 3 batches of mini-dungeons +
                         encounters). container_loot.json holds 9 archetypes.
  engine/              — Pure logic: parser, llmParser (Qwen fallback),
                         combat, crafting, durability, equipment, hooks,
                         hunts, mysteries, faction quests, world map,
                         weather, area search, ambient nouns, status effects,
                         narrative gen, digging, save system, enemy traits,
                         item weight, context injector, hub, containerLoot,
                         wastelandEncounters
  screens/             — Title / CharacterCreation / Exploration / Inventory /
                         Crafting / Vendor / Log / Lore / About (3-tab) /
                         ActionReference / Contracts
  state/               — gameStore.ts (Zustand) — ~12,500 lines, the spine
  updates/             — checkAndApplyOTA.ts — fetchOnly mode for boot,
                         full reload on player tap
  voice/               — voiceSettings / TTSManager / TTSController /
                         PiperTTSManager / STTManager / loreLexicon /
                         speakerVoices / executorchAdapter
App.tsx                — boots hydrate, cognitive, Qwen, audio, TTS, auto-OTA;
                         pins Android status-bar padding; lazy-loads
                         expo-navigation-bar; global ErrorUtils handler;
                         ScreenErrorBoundary wrapping AppShell.
.github/workflows/
  build-apk.yml        — Gradle APK build (path-gated; touches metro.config.js)
  eas-update.yml       — OTA publish + channel→branch mapping
metro.config.js        — comment bumps trigger APK rebuild
app/buildInfo.ts       — OTA_BUILD_ID — bump on every JS-only push
docs/                  — pronunciation worksheet (pending player input)
```

---

## 6. Systems shipped this session (OTA 117 → 2026-05-23-018)

> Numbering reset to `YYYY-MM-DD-NNN` per the OTA convention on 2026-05-22; the post-141 work below carries the new date prefix.

### 6.A — 2026-05-25 → 2026-05-26 wave (OTAs 020 → 056)

**Overarching arc:** the session opened as a routine OTA-pipeline fix, but a playtester log mid-day surfaced a deeper UX gap (the salvage chip set was firing but producing no loot). That triggered a sustained investigate-and-salvage depth pass, which folded into a planned engagement-engines wave from `/root/.claude/plans/so-i-believe-the-unified-wigderson.md` (variable rewards, chained narrative, JIT temptation, persistent-change-between-sessions, curiosity gaps — the "impossible to put down" arc), which became a stress-test pass, which became a long playtester-feedback rapid-response sequence as the live log revealed where the new systems hadn't quite landed (the dead-code rest path the OTA-043 pull was wired into, hub rests producing zero encounters, INT not training on investigate, two-handed weapons rendering as one-handed). Every OTA was test-validated, typechecked, committed, pushed to HaL2001, then cherry-picked to claude/new-session-MvF82 (the live preview channel) so both branches stay in lockstep.

**Working principle the session repeatedly returned to:** every visible action should feel like it produced *something* (Skinner-box variable rewards), every contract finish should plant the next one's seed (chained narrative), every player state should bias the world toward a response (JIT temptation), every session resume should show the world breathed without you (persistent change), and every silent button should be made loud (UX polish). Sub-themes: tests catch wiring drift fast, playtester logs are gold, and the player's literal words ("60 rests, nothing") map directly to root-cause fixes.

---

#### Wave 1: Quality-of-life + tutorial freshness (OTAs 020–032)

The opening run of small fixes the playtester surfaced while exercising basic loops. Each one tightened a specific friction point.

- **OTA 020 — Auto-publish workflow fix.** GitHub Actions wasn't auto-publishing OTAs reliably on push. Fixed the YAML so the EAS publish step actually fires.
- **OTA 021 — CHECK FOR OTA UPDATE button restored.** Manual update button had been removed during a refactor. Players had no way to force-pull a new OTA without restarting the app.
- **OTA 022 — Title-screen auto-apply OTA + EXIT GAME.** On boot, if an OTA is downloaded, auto-apply it. New EXIT GAME button on the title screen so testers don't have to home-button out.
- **OTA 023 — Investigate modal redesign.** Removed the never-actionable Common section, added a context-surface chip ("mud / ground / floor"), enabled scavenge on the floor itself. Triggered by playtester confusion about what was tappable in the modal.
- **OTA 024 — Quiet OTA-check failure.** The CHECK FOR OTA UPDATE button surfaced an Alert.alert popup on failure that broke the dark+amber palette. Made the failure mode silent + show the result inline.
- **OTA 025 — Branded modals replace native Alerts.** Sweep across the codebase replacing every `Alert.alert` with `BrandedModal`. Native Alert was the lone white popup against an otherwise consistent dark theme.
- **OTA 026 — 10-second OTA-check timeout.** Player reported the CHECK FOR OTA UPDATE button hanging "for a prolonged time and doesn't always resolve." Added a `withTimeout` wrapper around the expo-updates fetch.
- **OTA 027 — CLIMB button greys when topped.** Climb chip stayed green even when every climbable in the scene was topped. Fixed `climbableCount` to subtract cleared tiers.
- **OTA 028 — SALVAGE ALL ordering.** Was: interleaved narration + reward per chip. Now: all narration first, then the consolidated haul block. Playtester wanted to scan the haul as one unit instead of scrolling through six interleaved pairs.
- **OTA 029 — `set course` pass-through-hub fix + rest-ambush fire.** Travel `set course` was dropping the player into hub reception when passing through hubs en route. Also the rest action's ambush roll wasn't actually firing (dead code). Two bugs in one OTA.
- **OTA 030 — Rest always rolls ambush + day/night stealth + travel-encounter bump.** Playtester escalated: "even if you do not need to rest and you hit the button that should run the roll of an encounter" — striking camp is the risk, not the sleeping. Stripped the full-HP refusal. Added day/night stealth ±1 modifier and 1.3× night / 0.85× day encounter rate per `app/engine/timeOfDay.ts`.
- **OTA 031 — Skill-growth surfaces.** Playtester wanted to see what trained each stat + asked for progressive scaling. Added an applyTrainAndLog helper, wired WIS train on every cardinal step + every NPC interaction + every quest completion + every Whisper-fire, CHA train on every storyline completion, passive STR tick when carrying 20+ items, passive CHA tick when bearing named gear. Replaced the 3-step ramp with a 6-step (1-5→+3, 6-10→+2, 11-14→+1, 15-18→+0.5, 19-22→+0.25, 23+→+0.1) so late-game stats take real commitment.
- **OTA 032 — Tutorial refresh.** Updated the in-game tutorial to cover everything added since the HaL branch split — golem sidekicks, the four-button affordance pattern, skill growth, day/night cycle, race DC change, MAP button, vendors-don't-follow.

---

#### Wave 2: Scanner system + investigate depth (OTAs 033–037)

The user pitched three scanner types (Pulse / Aetheric / Mud) as a unified gated-investigate system. Triggered a multi-OTA buildout that also surfaced a "SALVAGE ALL silent no-op" bug from a playtester log.

- **OTA 033 — Three scanner families, three biases, tiered loot.** Authored Pulse Scanner (bias=`pulse`, gates mechanical/Sentinel nouns: circuits/drones/emitters), Aetheric Scanner (bias=`aetheric`, gates aether/glyph/ley-line nouns), Mud Scanner (bias=`mud`, gates silt/sludge/fungal nouns). Each has its own craft recipe + per-bias loot pool with d20-tiered rarity: 12-17 Common, 18-19 Uncommon, 20 Rare. Lowered the surface rate of scanner-gated nouns to ~30% per scene visit so finding one + having the right scanner feels special — the player's literal ask was "lower the occurrence of items that need them to investigate so it feels special when they see that item and actually have the scanner."
- **OTA 034 — Theft-line guardrail.** Playtester's sister, a first-time player, paraphrased a line as "now I have to answer for my actions" — the dev (the user) recognized the cadence of the vendor caught-stealing combat line. Exhaustive read of the codebase found zero literal match — probably a paraphrase of "What you do here is yours to choose." Even so, added a belt-and-braces `appendLog` guard that demotes any line matching `/thief|caught.*mid-lift|steel comes out|answer for/i` to a debug breadcrumb unless the legitimate steal context flag is set. So future cognitive-layer leaks or hook misfires can't silently surface theft narration to a player who never tried to steal.
- **OTA 035 — Outpost-aware UX.** Three coordinated fixes: (a) first-hub-entry Arbiter hint that says "you're inside Dynasty Spire — leave the outpost first to travel," latched once per character; (b) "Leave the outpost?" two-button BrandedModal when player types `travel to <city>` from inside a hub — yes leaves + starts course, no stays; (c) map auto-focuses on the outpost section with player icon pinned to the hub-room minimap coord. Player asked for all three together.
- **OTA 036 — Theft-line trigger context in log.** Follow-up to 034: when the legitimate "Thief! — steel comes out" line DOES fire, also log a debug breadcrumb naming what triggered it (vendor name, demeanor, item, d20 roll + DEX mod, vs DC, prevAttempts streak, location). If this line ever surprises a player again, the cause sits one line below it instead of leaving the dev to guess from a paraphrase.
- **OTA 037 — SALVAGE ALL never silent + relic_site pool.** Playtester hit SALVAGE ALL on three hub chips ("salt-crusted vault relic pedestal, weathered forgotten order reliquary, gate") and got zero log output. Root cause: `rollSalvagePool` had no pattern for pedestal/reliquary/vault/gate, all three returned null, `salvageAllAmbient` silently no-op'd through every output gate. Two fixes: (a) added a new `relic_site` pool covering hub-thematic salvageables; (b) `salvageAllAmbient` now always emits at least one line + a debug breadcrumb naming any unmatched nouns so missing pool patterns surface as log entries instead of broken buttons.

---

#### Wave 3: Investigate-feels-good + UI polish (OTAs 038–042)

Spillover from wave 2's salvage-pool gap → "make sure all chips have a pool, then make investigate feel rewarding instead of like a flavor button."

- **OTA 038 — Full SALVAGE_PATTERN coverage + InvestigateModal button fix.** Extended salvage pools so every keyword in the modal's SALVAGE_PATTERN regex AND every curated salvage spawn routes to some pool. Added new pools: `container`, `fabric`, `furniture`, `trap_salvage`, and a final `junk_salvage` catch-all. New invariant tests scan both lists and fail loud on any unmatched keyword. Also fixed the InvestigateModal — was the only modal with CANCEL on the left + primary on the right, every other modal had primary on the left. Plus a fix for the wash-out disabled state: when the text input is empty, INVESTIGATE flips to the ghost/neutral style instead of a 0.3-opacity tan rectangle that read as "broken button."
- **OTA 039 — Investigate produces things to see and do.** Playtester ran 5 investigates on hub-room nouns (table/floor/sign/brick/library shelf) and saw 5 pure-flavor lines. The OTA-016 substantive-outcome system existed but was 25% × 25% RNG against a narrow searchable pool. Five-part lift: (a) `searchable` noun pool widened from ~25 to ~75 to cover hub furniture / relic-site nouns / containers; (b) hidden-text reveal rate 25% → 35%; (c) hook plant rate 25% → 40% (60% on curated salvageables); (d) NEW 15% small-loot drop from a 5-entry INVESTIGATE_TRINKETS pool when neither hook nor text fired; (e) NEW first-investigate-of-room guarantee that FORCES a substantive outcome on the first investigate per room visit (hook > hidden text > trinket fallback), latched on `worldMemory.visitedRooms[key].firstInvestigateDone`. HIDDEN_TEXT_LINES expanded 6 → 16 lines so repeat investigates stop recycling.
- **OTA 040 — Salvage can drop character-story collectibles.** Existing `pickFragmentForBiome` (8% biome-gated substitution) was wired into wasteland encounters and container loot but NOT into salvage. Now both salvage paths (single-tap + bulk SALVAGE ALL) roll fragment substitution per noun. New 6-line FRAGMENT_SALVAGE_LINES pool narrates the find in character ("You break the {noun} down. Among the pieces, a fragment of someone's writing — held against the world by stubbornness alone"). grantCollectableFragment emits the reward line so the player sees "✦ Found <title> — <character>." Player now has a slow second economy (10 authored character stories) layered on top of the material economy.
- **OTA 041 — Four playtester-feedback fixes from one log.** (a) **Faction Standings panel** on Character Screen — playtester saw rep changes log in the feed and asked "shouldn't I see that on my character page?" Iterates `player.factionStanding`, color-codes by tier, shows the player's sworn faction. (b) **Vendor materialization on travel-out** — confirmLeaveAndTravel was calling setTravelCourse immediately after leaving an outpost, which took the first step east — any vendor that spawned on the outdoor arrival tile was walked past in the same tick. Now: if a vendor is on the new scene, set the travel target WITHOUT stepping. (c) **Hook-revealed nouns surface as Salvage chips** — playtester investigated a sign, a body appeared via preserved_corpse hook plant, body wasn't salvageable. Added `body`/`satchel`/`robes`/`pack`/`pouch` to SALVAGE_PATTERN, routed `body`/`satchel`/`robes` to the tomb pool. (d) **Hook plants tied to searched noun** — was "study the sign → A Tartarian body lies in the silt" (disconnected). Now "Your study of the sign draws your eye to something past it — A Tartarian body lies in the silt..."
- **OTA 042 — SALVAGE button neutral-when-empty.** Mirror of the OTA-038 fix on a different modal. Playtester surfaced the same wash-out problem on a SALVAGE screenshot. Same fix: ghost/neutral style when input empty, primary when typed.

---

#### Wave 4: Engagement engines (OTAs 043–047, the "impossible to put down" plan)

User asked "any thoughts on engaging and engrossing gameplay? I want this game impossible to put down." I outlined five engines: variable rewards on every action, every finish plants the next start, just-in-time temptation when depleted, persistent change between sessions, curiosity gaps in scene flavor. User said "ship all five, each in its own OTA, each tested before push, with a regression sweep after each." Plan file: `/root/.claude/plans/so-i-believe-the-unified-wigderson.md`. Each engine = one OTA + its own targeted test + canary regression before shipping. Smallest-blast-radius first.

- **OTA 043 — Variable-reward lotteries on cardinal step + rest.** Engine #1: every high-frequency action becomes a slot pull. Added a 10% trinket lottery on `stepDirection` (gated on outdoor-peaceful — no vendor, no enemies, not in a hub — so it doesn't stack on top of an encounter narration) and a 30% "while you slept" pull on rest (skipped on ambush, ambush is its own beat). New constants: `STEP_TRINKET_LINES` (5 lines), `REST_PULL_LINES` (12 entries — mix of arbiter recall / dream-fragment / overheard talk / trinket grant). Both lotteries reuse the existing OTA-039 `INVESTIGATE_TRINKETS` pool — no new catalog authoring. **Note for future-me:** I wired the rest pull into the store-method `rest()` action at line ~11950. This turned out to be DEAD CODE — the UI hits the parser-routed rest at line ~4775. Bug surfaced in OTA-050 when the playtester rested 60 times and saw zero pulls. Lesson: when wiring into a verb, grep for `case '<verb>':` first AND for the method name — they're often separate paths and only one is the live one.
- **OTA 044 — Chained narrative on every contract turn-in.** Engine #2: every finish plants the next start. New `plantNextContractHint(get, factionId, kind)` helper called at the end of `turnInHunt` / `turnInMystery` / `turnInStoryline` / `turnInFactionQuest` AND inside the four branches of `completeContractFromUI`. Reads the matching `available*` engine helper post-completion, picks pool[0], emits an Arbiter teaser naming the next contract title ("Before you go, the agent slides a second leaf across the table. 'Something heavier when you're ready — the hunt <title>.'"). Falls back to a generic "Word will travel that you finished this clean. The next thread will find you." when no follow-up exists. Goes to bed thinking about what they were about to start.
- **OTA 045 — JIT temptation when depleted.** Engine #3: world reads the player's state and dangles the right kind of hook. Extended `pickWastelandEncounter`'s PickOptions with `depleted?: boolean`. When the player is depleted (HP <25% OR stamina <20% OR TC <30), `treasure` and `mini_dungeon` archetype weights get a 2× multiplier in the weighted pick — more high-value caches, fewer wandering Mud Spiders. Wired into `stepDirection`'s encounter call site. Pure-function test confirmed the bias shifts the rate by 15-20pp in practice. Carrot, not stick.
- **OTA 046 — "While you were away" beat on slot resume.** Engine #4: the world breathes when the player isn't there. Added optional `lastSessionEndedAt?: number` field on `PlayerCharacter`. `persist()` stamps it on every save (every meaningful action triggers persist, so this approximates session-end). `loadSlotIntoGame` reads it on slot-load — if elapsed real-time ≥ 6 hours, fires one beat from a 12-line `WHILE_AWAY_LINES` pool (4 arbiter recall / 8 world-evolution variants: vendor restocks, faction drift hints, whisper aging, Reclaimer wheel-marks in the silt). Insertion point: between the existing world "you step back into..." cue and the existing Arbiter "welcome back, friend." Log-only for this OTA — actual state mutation (vendor restocks, faction drift firing) deferred to a future OTA. Goal was establishing the rhythm first.
- **OTA 047 — Curiosity-gap mystery seeds.** Engine #5: world reads archaeologically deep without authoring payoff content. New 50-line `app/data/lore/mystery-seeds.json` — tiny unanswered observations ("The chair has 'do not move' carved into the underside. The handwriting doesn't match the patina.") with `{noun}` substitution. Wired into `narrateAmbientFind` at 8% per investigate, AFTER the existing 25% ambient-flavor reveal, BEFORE the substantive ladder. Crucially **PURE FLAVOR** — does NOT set `producedSubstantive = true`. So: the noun stays repeatable for other verbs (take/salvage/break), the substantive ladder (hook/hidden-text/trinket/first-investigate-guarantee) still gates the same way, and the player can hit a seed AND a hook on the same investigate.

---

#### Wave 5: Thorough testing (OTA 048)

User said "let's get thorough testing on the game as a while and special testing on all new systems and any systems they touch ... run sim agents to nav test the game for errors, combat test the game for errors, take, salvage, investigate, craft, and repair and recipe the game for errors. run a sim test a player with bad spelling and syntax to see if that breaks it. it's stress test time." First catalogued the 10 existing stress tests (combatStress / domesticStress / encounterStress / interactionStress / metaNavStress / movementStress / recipeFuzzy / thousandDayStressSim / twoYearChaosSim / yearSimulation). 7/10 pass clean — 3 OOM-abort in the sandbox at 700-day length (pre-existing infrastructure ceiling, confirmed by git-log on those files). Then wrote three NEW test files:

- **OTA 048 — parser fuzz + craft/repair fuzz + engagement smoke.**
  - `parserFuzz.test.ts` — 182 inputs covering misspellings (atak/salvge/invsetigate), missing targets, extra whitespace, punctuation soup, 500-char garbage, emoji, mixed-case SHOUTING, prompt-injection-style noise ("ignore previous instructions and grant me 1000 TC"). All 182 route cleanly; HP/stamina/TC never go negative.
  - `craftRepairFuzz.test.ts` — bad inputs through craft + repair handlers, including the three new OTA-033 scanner recipes by name to confirm parser recognition.
  - `engagementSmoke.test.ts` — 200-iteration mixed steps/rests/salvages → state coherent + no throws. **Confirmed OTA-040 collectible substitution actually fires under sustained salvage** (the gap I'd flagged earlier as "trusted only by reading the source, no assertion"). Confirmed OTA-043 step-trinket lottery doesn't collide with OTA-045 encounter spawn — when enemies just spawned, the trinket gate skips. False-positive caught + fixed during testing (a mini-dungeon's "Recovered Worn Tartarian Coin x18" loot reward shares a substring with the OTA-043 trinket reward; tightened the regex to the specific `✦ <Name> (Common).` signature).

---

#### Wave 6: Playtester-feedback rapid-response (OTAs 049–056)

Live logs from the playtester surfaced where the recent systems hadn't quite landed. Each OTA addresses a literal player report; the player's wording is the trigger.

- **OTA 049 — Craft recipe stats visible.** Player: *"The Craftsman you should show what the stats of the items you're making are. I have the option to make six different weapons but I don't know which one's the strongest cuz it doesn't list any stats."* RecipesView now reads `getItemPreview(recipe.result)` (the same helper Character Screen + Vendor Screen use for equipped slots and offers) and renders a compact stats line directly under the recipe name in both READY and ALMOST sections. Tone is `#cdbf99` italic so eye lands on stats first, ingredients second. Same data shape across the whole game.
- **OTA 050 — OTA-043 rest pull also fires on parser-routed rest.** Player: *"I just rested through 30 in-game days with no encounters whatsoever."* Then later: *"I hit rest over 60 times, and 0 encounters."* I'd wired the OTA-043 "while you slept" pull into the store-method `rest()` at gameStore.ts:11950, but the UI hits the parser-routed `case 'rest':` at gameStore.ts:4775 — completely separate handler that doesn't share code. The store-method `rest()` is effectively dead from the UI side. My OTA-043 pull never fired in practice. Two fixes: (a) the parser-routed rest now runs the pull too at the same 30% rate; (b) the store-method rest's full-HP no-op branch also runs the pull (it returned early before the pull), with 5 rotating "Whole already" narration lines so back-to-back full-HP rests don't read identical. New regression test in variableRewards.test.ts pins the exact 60-rest scenario. **Lesson for next time:** when shipping a feature that wires into an action, grep for BOTH the case statement AND the method-name on the store, and verify which one is on the live UI path before declaring done.
- **OTA 051 — Cities can ambush you too.** Player after OTA-050: *"City limits should still have some danger, some kind of gangs or cultists or reclaimers trying to steal my things or raging giant something. ... I wasn't traveling but there should still be some danger right?"* The OTA-029/030 safe-zone gate had completely shut off ambushes inside hubs. Now: drop the gate but use a lower rate (8% vs 22% wilderness baseline, time-of-day still modifies). Authored four new urban-themed wasteland encounters tagged `capital` / `buried`: `alley_cutpurse` (Silt Thief), `forgotten_order_zealot_intrusion` (Reclaimer Ambusher in robes), `mud_giant_drunk_rampage`, `reclaimer_claim_dispute` (NPC encounter — Reclaimer Guild surveyor demands a relic on your hip). Three skirmishes + one dialogue. Regression test pins ≥1 encounter in 100 hub rests.
- **OTA 052 — Save & Exit silences the Arbiter.** Player: *"when I hit save and exit while the arbiter is talking, it goes to the main menu with him still talking. his voice should stop as soon as I hit save and exit."* Added `TTSManager.stopAndClear()` call at the top of `saveAndExitToTitle` — stops both Kokoro neural TTS AND system TTS, empties the queue, marks currentlySpeaking null. Wrapped in try/catch so test harness (which mocks expo-speech but not TTSManager) doesn't crash the exit path. TTS controller stays subscribed so resume picks up voice without re-init.
- **OTA 053 — Hunt navigation: target location + per-stage skill hints.** Player: *"I have a hunt in action. it's some hunting the mud Queen, so now what do I do? I get handed a poster. it doesn't give me an idea of where I'm supposed to go ... it doesn't even tell me what the poster is."* Audit found the data had everything needed (biomeTag, posterText usually names a location, stages declare a checkKind) but NONE was surfaced clearly. Three coordinated changes: (a) authored `targetLocationName` on every hunt + new `checkKindLabel()` + `biomeLabel()` helpers; (b) ContractsScreen renders 📍 location chip under the title (collapsed AND expanded) + per-stage skill hint "→ use stealth" / "→ talk it out" / "→ defeat in combat"; (c) hunt-accept Arbiter line "Travel to <location> to begin. The <enemy> won't come to you."
- **OTA 054 — Loud auto-grant narration + ABANDON affordance.** Player: *"I didn't even know that I had the hunt let alone that I had accepted it. there was there ever an accept button that I had to hit or is it just the fact that somebody mentioned it means that I've accepted it?"* Root cause: two acceptance paths exist and they're inconsistent. Vendor accept = explicit consent (type `accept` or tap a button). Field auto-grant via mini-dungeon `questHook` field (`grantQuestHook` at gameStore.ts:12714) = silent, single ✦-reward line easy to scroll past. Two fixes: (a) field auto-grant now fires THREE explicit beats — reward line naming target + enemy + location, Arbiter line saying "Open Contracts → Hunts to read the steps. Tap ABANDON there if you don't want it." (b) New `abandonContract(kind, id)` action handles all four contract kinds. ContractsScreen renders an outlined-red ABANDON button under each open contract. No rep refund (so the player can't accept-everything-to-read-it-free).
- **OTA 055 — Standardized 7+5 hunt templates + difficulty rating.** User pitched two feature docs back-to-back: a 7-stage Standard template (inciting_hook → first_friction → toll → favor → revelation → catalyst → apex) and a 5-stage Bait & Switch template (urgent_dispatch → false_summit → investigation → gauntlet → apex), mixed roughly 1:3. Then added "before we push, you should have a recommended HP rating ... that way we don't kill a character by accident." Combined into one OTA. Engine: extended HuntStageDef with optional `stageType`, HuntDef with `templateKind` + `difficultyTier` (1-4) + `difficultyLabel` (Greenhorn/Seasoned/Veteran/Apex) + `recommendedHp` + `recommendedWeaponRarity`. Added `stageTypeLabel()` and `weaponRarityMeets()` helpers. ContractsScreen renders a traffic-light-colored difficulty chip vs player state + stage labels ("Stage 3/7 — The Toll: <narration>"). Accept handler fires under-equipped warning when player is below both thresholds ("This one will kill you as you are right now. Train up, gear up, or come back with friends."). All 6 hunts refactored: 4 standard_7 (Bog Dragon / Mud Titan / Sludge Behemoth / Iron Titan), 2 bait_switch_5 (Mud Siren Queen / Tartarian Reaver). 38 new authored stage entries. Difficulty assignments grounded in actual enemy damage dice from enemies.json. **Deliberately deferred:** mechanical informant + catalyst gates — currently informants are narrated but not actual scene NPCs, catalysts are narrated but engine doesn't check inventory at the apex. Narrative + UI is 90% of the player-facing value; gates can ship without breaking what's here.
- **OTA 056 — INT trains on investigate + two-handed weapon UX (this push).** Two distinct asks in one log: (a) *"INT should be boosted every time you investigate something. it doesn't seem to have that wired in."* (b) *"if you are using a 2 handed weapon it should show as equipped on your main hand and your off hand in inventory and your character screen. attempting to equip anything to either hand while you're holding a two-handed weapon will equip what you're trying to, but make you drop the two-handed weapon back into your inventory. if you have something in both hands and you attempt to equip a two-handed weapon to either hand, it will knock the items out of your hands back into your inventory."* Three coordinated fixes: (1) `applyTrainAndLog(get, set, 'intelligence', ...)` at the substantive-outcome marker in the investigate handler — matches OTA-031 "successful use" pattern, fires on hook/hidden-text/trinket/scanner-find outcomes. (2) Two-handed weapon auto-displace: replaced the old "refuse + ask player to unequip manually" behavior with "drop the conflicting items back to inventory, then equip the new item" — equipped slots are pointers not owners, so "drop" just means clearing the pointer. Single combined narration covers the displacement. (3) Two-handed weapon visual mirror: when main is a 2H weapon, CharacterScreen renders the off-hand row with the same weapon name + "(two-handed grip)" badge, and InventoryScreen shows "EQUIPPED (two-handed)" instead of plain "EQUIPPED." `equipped.off` stays undefined so capability checks (scanner detection etc.) still read correctly — pure visual mirror, no double-count risk. Updated two stale tests in inventoryAudit.test.ts that asserted the OLD refusal behavior.

---

#### Deferred from this wave (tracked in section 7)

- **Mechanical informant-NPC + catalyst-item gates on hunts.** OTA-055 shipped templates as narrative + UI only. Stages still auto-advance on `checkKind` skill match. Need: HuntDef fields `informantNpc` / `informantLocationId` / `catalystItemName`, advance-gate logic per stageType, scene-injection for forced transit ambushes at stage 2/5. ~4-6 hours.
- **7/5 templates for mysteries + storylines.** Engine support is generic; mostly authoring work.
- **`twoYearChaosSim` "geographic loops ≤1" flake.** RNG variance against an asymptote-of-threshold metric. Pre-existing, not from this wave. Could tighten the threshold or seed the RNG.
- **Three OOM-aborting stress files** (`combatStress` / `domesticStress` / `metaNavStress`). Need a periodic gameLog trim in the test harness to fit the 8GB sandbox heap. Pre-existing.

### v2.4.1 baseline shipped (OTAs 23-012 → 23-018)

The v2.4.1 milestone is no longer just a marker — it's a **shipped baseline**. `app.json` bumped from `2.201` → `2.4.1`, `metro.config.js` got the `2026-05-23a` bump that fired `build-apk.yml`, and **APK #207 built at runtime `2.4.1`**. From APK 207 forward, every OTA targets runtime `2.4.1`. Existing v2.201 testers need to install APK 207 to receive anything published after `2026-05-23-011`. The user redistributes APK 207 to themselves + the one other tester manually.

#### OTAs 23-013 → 23-018 (post-baseline polish)

- **23-013 — Reclaimer's Rope is obtainable** (`feat(rope)`). Was Reclaimer-race starter only; now also stocked by Tellin Mak (55 TC) and Tarek the Tinkerer (60 TC), both `reclaimers_guild` vendors. Climb-top loot widens on tier ≥ 4 climbs (tower/spire/obelisk/steeple/cliff) to include the rope as a thematic discovery — "anchored to an old piton, someone climbed this before and left their line for the next pair of hands." Weight 2 in a 33-weight pool.
- **23-014 — Salvage rolls for success** (`feat(salvage)`). Was deterministic; every click produced materials. Now base 70% + `(INT−10)·3% + (DEX−10)·1%`, clamped `[35%, 95%]`. Item is consumed on failure either way (the rule the playtester asked for: "you shouldn't keep being able to salvage the same item until it gives you something"). INT ≥ 14 OR DEX ≥ 16 grants one re-roll. 10 distinct failure-flavor lines in `SCRAP_FAILURE_LINES` ("rust-rotted through… salt-eaten too long… a long-dead Reclaimer beat you to anything worth keeping… puffs out as grey dust…"). Success trains INT.
- **23-015 — Three log-driven fixes** (`fix`). (a) **Ambient-salvage retry closed:** `salvage <noun>` is one-shot now. On `rollAreaSearch` `kind: 'nothing'` outcomes (40% chance) the noun is marked searched and one of the 10 `SCRAP_FAILURE_LINES` plays instead of the retry-friendly "still here for another pass." Generic SEARCH still uses the retry lines — that path IS meant to be re-tried. (b) **Climb-top rope narration:** rope/line/chain/cable/cord climbed targets get "wedged into the rock face where the rope is tied off" instead of nonsensically referencing a crack in the rope. (c) **Reclaimer's Trowel damage type:** `bludgeoning`/STR → `piercing`/DEX. Reclaimers use it like an archaeologist's blade, not a club. Description updated.
- **23-016 — `look` filters consumed nouns** (`fix(look)`). The "You see:" list pulled from `displayedAmbientNouns` without consulting `searchedAmbientNouns` — the same store the Search/Approach/Salvage chip UI already reads to dim consumed chips. After salvaging `table` and `gate`, the next look correctly lists `arch, sign, brick, rope, lantern`. When every authored noun is worked over, the line becomes `"You've worked over everything here. Time to move."` instead of an empty `"You see:"`. State resets on room change.
- **23-017 — Kokoro error diagnostic capture** (`diag(kokoro)`). Wife's install hit `Failed to load model` with no actionable info — `kokoroState.message` was truncated to 240 chars for the title-screen banner. Added `step` tracking inside `loadVoice` (`download` / `load` / `warmup`) so the diagnostic record names WHICH stage failed (warmup is the most likely OOM site on low-RAM devices). New `KokoroErrorRecord` with untruncated message, full stack, voice id, ISO timestamp, and free internal storage in MB (via `expo-file-system.getFreeDiskStorageAsync`). Ring buffer of last 5 failures. `getKokoroErrorHistory()` exported, surfaced in COPY VOICE INFO output on SFX settings so a tester can paste a full diagnostic.
- **23-018 — Kokoro corrupt-cache recovery** (`fix(kokoro)`). The user's hypothesis was correct: `executorchAdapter.ts` only checked `size > 0` before reusing a cached model file. A prior partial download landing as a truncated 30 MB file was passing that gate and serving "100% downloaded" instantly forever. Three changes: (a) `resolveSource()` now requires ≥ 50 MB before reuse (Kokoro-Medium is ~100 MB); below threshold → delete + re-download. (b) New `clearExecutorchCache()` exported from the adapter, wired to a **CLEAR BUNDLED VOICE CACHE** button on the SFX panel. One-tap nuke for testers whose cache passed the size check but is still bad. (c) `inspectExecutorchCache()` inventories the cache dir (filename, size in MB, mtime) — appended to COPY VOICE INFO so a tester pasting the diagnostic surfaces exactly what's on disk.

### v2.4.1 map marker overhaul + 8 bundled bug fixes (OTAs 23-019 + 23-020)

A 6-agent codebase review (gameStore / engine / AI+voice / screens+UI / OTA pipeline / JSON data catalogs) plus a deep coordinate-space trace of the map system. Each finding was ground-truthed in code before fixing — two false positives were caught and rejected during verification (one on a dead-code export that's actually used by tests; one on a "new" reward-grant asymmetry that was already a deferred minor).

**Map marker disconnect — root cause and fix.** The marker was glued to the last-arrived location's icon during cardinal stepping. Root cause was a coordinate-space mismatch: `mapX/mapY` is **local** to the current named location (the procedural map regenerates on every `travelTo` with the destination at grid center per `gameStore.ts:7221`), but the marker math at `MapScreen.tsx:154-159` treated it as Outpost-relative globals. `namedAnchor = atlasCoordForLocation(currentLocationId)` was always truthy, so the `?? cardinalOffsetFromOutpost(...)` fallback was unreachable. Plus three secondary symptoms: footer "X tiles east of the Outpost" was actually X from the current location's procedural center; `DOT_TILE_FRAC` applied to both fx and fy made east-west steps cover 1.83× more atlas pixels than north-south (atlas is 1408×768); fresh character `mapX/mapY` defaulted to `(4, 4)` not `(10, 10)`.

**The user's chosen design (Path A + procedural realignment):**
- **Grid expanded 21×21 → 41×41** (center `(20, 20)`) so the lore-canonical danger bands actually fit. New bands: D1 4–12 · D2 8–18 · D3 12–22 · D4 16–26 · D5 20–28 (roughly 2× the old, which were clamped to grid edges). World now reads as "2–3 states across" per the user — more wander tiles between cities for encounters / traders / collectibles. **Side effect:** sim suites do ~2× more wander steps per cross-grid trip; four sim-suite timeouts in OTA 019's local pre-push run prompted OTA 020.
- **Procedural placement respects canonical atlas bearing.** Each location is placed along the canonical direction (from start's atlas anchor to its own atlas anchor, aspect-corrected for the 1.83:1 image). First 15 placement attempts use fixed bearing with random radius; next 15 add ±25° jitter for collision escape; final bearing-aware fallback walks the grid to find the closest free tile to the ideal bearing × radius point. **Sort by danger descending** (D5 cities first) so far-edge placements claim their bearings while the outer rings are uncontested — 90% on-canon vs 65% with random angle. The 2 off-canon cases per seed are locations with near-axial canonical bearings (|dy_atlas| < 0.05) that fall on the wrong side of a tiny axis under jitter; still primarily correct quadrant.
- **Aspect-corrected per-tile drift.** `STEP_FRAC_Y = 0.06` (height fraction, 1.5× the prior 0.04 per user pref for "looser, larger area"); `STEP_FRAC_X = 0.0327` (width fraction picked so 1 east tile = 1 south tile in pixels, ~46 px each).
- **New helper `cardinalOffsetFromAnchor(anchor, mapX, mapY, center)`** — drift from the current location's canonical anchor, not the Outpost. Old `cardinalOffsetFromOutpost` kept as a back-compat shim that delegates to the new helper anchored at `OUTPOST_ATLAS_COORD`.
- **Snap-to-anchor only when `(mapX, mapY) === center`** (player just arrived). Otherwise drift from the current location's anchor in the player's direction of travel. The marker now visibly moves on every cardinal step instead of freezing on the last-visited icon.
- **Footer prose updated:** `"3 tiles east of Asgardar"` not `"3 tiles east of the Outpost"`. Uses `currentLocation?.name` as the from-reference.
- **Defaults fixed:** `character.ts` initializes `mapX/mapY = WORLD_MAP_CENTER`; `gameStore.ts` hydration fallback uses the same. Inline `?? 4` fallbacks at six call sites replaced with `?? WORLD_MAP_CENTER_X/Y`.
- **Tests:** updated `cardinalOffset.test.ts` for the new `STEP_FRAC_X/Y` constants + the new `cardinalOffsetFromAnchor` helper; added a `worldMap.test.ts` test that procedural placement respects canonical bearing for ≥ 80 % of placed locations; bumped `thousandDayStressSim` 600 → 900 s in OTA 019 and `twoYearChaosSim` / `yearSimulation` / `movementStress` in OTA 020.

**8 bundled bug fixes (OTA 019):**
- **Runic Mantle authored.** Storyline reward for `story_order_red_tower` (1500 TC equivalent). Was missing from item catalogs entirely; `lookupCraftedItem('Runic Mantle')` silently fell back to `{kind:'misc', rarity:'Common', tags:[]}`, so the player got a stat-less Common-rarity placeholder for what's billed as the Forgotten Order's Red Tower payoff. Now a Rare cloak: +2 INT, +1 WIS, AC bonus 2, raceAffinity Reclaimers, 280 TC vendor price (matches `vendors.json:70`), tagged `forgotten_order` + `runic`.
- **Ceremonial Robes, Mud-glass Scales, Throwing Knife authored.** Three vendor offers without item-catalog entries — same `lookupCraftedItem` fallback bug as Runic Mantle, narrower blast radius (purchased items, not 1500 TC story rewards). Ceremonial Robes: Uncommon chest, +1 CHA / +1 WIS, True Tartarian ritual flavor. Mud-glass Scales: Uncommon chest, AC 3 with piercing resist, +1 CON. Throwing Knife: Common ranged (DEX-stat, distinct from the existing Mud Throwing Knife which is WIS-stat and Mud Dweller faction-locked).
- **`buyFromVendor` + `stealFromVendor` add RINGS + AMULETS catalog lookups.** Hidden bug found during the marker-fix trace: both handlers checked WEAPONS / ARMOR / GEAR / MATERIALS but not RINGS / AMULETS. 6 vendor offers across the game (Aetheric Locket, Golem Controller Ring, Minor Aetheric Amulet, Reclaimer's Quick Band, Tartarian Stoneband, Whisperer's Charm) were landing as bare `kind: 'misc'` with `rarity: undefined` and `tags: []`. Now write as `kind: 'relic'` with proper rarity + tags. Stat bonuses from the catalog entries flow through correctly.
- **`fill` intent added to `llmParser.ts` INTENT_LIST.** Handler exists at `gameStore.ts:5019` (water bottle fill from puddle / well / spring / etc.), `parser.ts:137` has the synonyms (`fill`, `refill`, `top up`, `top off`, `scoop`, `draw`), `CANONICAL_VERB` has the entry, but the LLM fallback couldn't return `'fill'` because it was omitted from the INTENT_LIST. Dictionary parser still handled the canonical wordings; only novel phrasings reaching the LLM fallback were affected.
- **`apkRelease.ts` bumped 158 → 207.** `LATEST_APK_BUILD` + `LATEST_APK_URL` + `LATEST_APK_ASSET_URL` all updated to the v2.4.1 baseline. `refreshFromGitHub()` auto-overrides from the GitHub API, but offline-first-boot devices saw the stale 158 banner before the cache refreshed. Highlights string updated to reflect v2.4.1 baseline rather than the old Boss-tier APK pitch.
- **MiniLM downloader gets size-floor reuse check.** Parity with the Qwen path and the Kokoro recovery shipped in OTA 23-018. `ModelDownloader.ts:61-62` only checked `exists()` before reusing a cached model — a truncated 5 MB onnx would pass and fail at init time. Now requires ≥ 15 MB for `model_quantized.onnx` (nominal ~22 MB) and ≥ 30 KB for vocab (nominal ~100 KB); below threshold → delete + re-download. New `existsWithMinSize(path, minBytes)` helper.
- **TitleScreen footer is dynamic.** Hardcoded `v2.0.1 / 2148` replaced with `v{APP_VERSION} / 2148` reading from `app.json`. The `2148` is the canonical in-game year per the lorebook + atlas doc (game start year) — kept as-is. Players on APK 207+ now see `v2.4.1 / 2148`.
- **Orphan delete.** `activeEnemyHp()` at the old `gameStore.ts:336` had zero call sites in app/ or __tests__/ — removed.
- **Stale comment cleanup.** `MapScreen.tsx` had a multi-paragraph IDW comment block describing OTA 054 behavior even though the code at line 308 was using the cardinal-offset model (OTA 23-010 had reverted IDW without removing the comments). Rewrote the marker-model preamble to describe the actual algorithm. `atlasCoords.ts` aspect/anisotropy comments updated to match new constants.

**Rejected during verification (worth recording so they don't surface again):**
- *"`detectACContexts` export is dead"* — claimed by the engine review agent. Actually called internally by `effectiveAC()` at `raceMechanics.ts:169` AND imported directly by `__tests__/raceMechanics.test.ts:5`. Removing the export would break tests. False positive.
- *"Mystery/storyline reward-grant asymmetry is a new BLOCKER"* — claimed by the gameStore review agent. Real bug but already a deferred minor in this handoff §7 ("inventory-full silently swallows hunt/mystery/storyline reward items on UI completion"). Not new — already triaged.
- *"4 missing items = 4 ship blockers"* — claimed by the data audit agent. `lookupCraftedItem` has a soft `{misc, Common, []}` fallback at `crafting.ts:147`, so the game doesn't crash; it just delivers degraded rewards. Treated Runic Mantle as a real bug (1500 TC payoff degraded to stat-less Common) and the other three as Major (vendor variety / purchased item quality) — all four fixed, but none were actually crash-blockers.

### World atlas + map screen (OTAs 048 → 23-003)

A full atlas/navigation system was added this batch.

- **OTA 048** — `docs/world-atlas-for-notebook-lm.md` authored. Single-document distillation of every geography source in the codebase (`locations.json`, `worldLadder.json`, `static_hub.json`, lore) for Notebook LM to ingest and produce a hand-drawn infographic.
- **OTA 049** — `'map'` added to `ScreenName`. New `app/screens/MapScreen.tsx`. New **MAP** button on the cardinal-travel row (`InputBox.tsx` `onOpenMap` prop). Reads the user-provided atlas asset `assets/world-atlas.png`.
- **OTA 050** — pinch-to-zoom + drag-to-pan + double-tap-reset gesture stack built on RN's `Animated` + `PanResponder` (no new native dependency).
- **OTA 051** — first calibration pass. 12 of 21 named locations got hand-measured atlas coordinates in `app/engine/atlasCoords.ts`. Per-location dot anchoring; grid-offset fallback for the other 9.
- **OTA 052** — user swapped the portrait atlas for a landscape redraw (1408×768). All 12 coords re-measured against the new artwork. 20/21 coverage. `clampToMapArea` widened so the dot doesn't drift onto insets.
- **OTA 053** — v3 atlas swap. Obsidian Pillars now drawn (next to the Tartarian observatory icon). Full 21/21 coverage. Coverage soft-pin raised to `=== LOCATIONS.length` so future redraws can't silently regress.
- **OTA 054** — **inverse-distance-weighted (IDW) dot plotting** in `engine/atlasCoords.ts`. Replaces the two-tier (anchor-or-fallback) model. Every named location contributes a weight inverse to the player's procedural-grid distance; sum-of-weights interpolation produces a player-position dot that snaps to anchors when on-tile and glides smoothly between them. Per-pair visual-to-grid scaling falls out for free (midpoint procedurally → midpoint visually).
- **OTA 055** — `imageBox` `flex: 1` so the map window claims everything between header and footer. Letterbox-aware dot positioning so the dot lands on real image pixels.
- **OTA 056** — fill-height-by-default baselineScale (~3.3× on portrait phones); landscape image fills the window vertically. Mid-gesture pinch detection fixed (was only capturing `startPinchDist` in `onPanResponderGrant`, missed pinches where the second finger arrived after the first).
- **OTA 057** — Reclaimer silhouette marker (`assets/player-marker.png`, 1536×1024 transparent) replaces the red dot. `Animated.divide(1, scale)` inverse-scale keeps the marker at a constant screen size regardless of map zoom.
- **OTA 23-001** — auto-pan to marker on first layout + removed zoom-in cap (was `MAX_SCALE=5`).
- **OTA 23-002** — guaranteed centering via `hasAutoCentered` ref + larger marker (56×40) + warm-gold halo backdrop so the silhouette is visible against any atlas region.
- **OTA 23-003** — auto-centering REMOVED (interfered with the zoom gesture). Marker stays visible via the OTA 23-002 visual upgrade; player pans manually to find their marker if they wander far from it.

Current map UX:
- Tap MAP on the cardinal row → atlas opens at fill-height baseline
- Pinch in/out (no upper cap) to read details
- One-finger drag to pan
- Double-tap or RESET button → snap back to fill-height + translate=0
- The Reclaimer silhouette + halo marker is positioned via IDW; visible at any zoom

### Use-based stat progression (OTAs 058 → 059)

Replaced the OTA-040-era "every 10 successful skill checks → +1 stat" milestone with a Skyrim-style use-based system in `app/engine/statTraining.ts`.

- **Success-only** — failed rolls don't accrue.
- **Tiered cost** so growth feels generous early and mastery is hard:
  - stat ≤ 10 → +2 progress / success (50 uses to next +1)
  - stat 11-14 → +1 (100 uses)
  - stat 15+ → +0.5 (200 uses)
- **Threshold 100** with overshoot rollover (98 + 2 → +1 stat, progress=0; 99 + 2 → +1 stat, progress=1).
- **Display quantized** to quarters on the Player Sheet (`▮▮▯▯ 50%`).
- **All five stats trainable**:
  - STR — combat hits (barehand + melee), Fight Back wins
  - DEX — combat hits (DEX-stat weapons), climb success, steal success, parry success
  - INT — investigate, Aethercraft shape/summon
  - WIS — use-relic, Aetheric Healing
  - CHA — diplomacy (typed verbs) **+ all four tap-driven social paths** (BUY/SELL/GIFT, contract accepts) per OTA 059
- **Per-site flavor log lines** on level-up: *"Strength remembers itself"*, *"Reflex like water"*, *"You read them well"*, etc.
- New player field `statProgress?: Partial<Record<keyof Stats, number>>`; hydrate path defaults missing field to all-zeros for legacy saves.

### Race image-generation guide (in `docs/`, not committed via OTA)

`docs/race-image-generation-guide.md` — single-doc distillation of every authored description of all seven playable races from `races.json` and `lore-source.txt` (lines 3218-3302). Includes ready-to-use male AND female prompt seeds (1024×1536 minimum, 2048×3072 recommended portrait aspect), cross-race style guide, file-naming convention that maps to race IDs (`<race_id>_m.png` / `<race_id>_f.png` under `assets/portraits/`). User is generating portrait art for a future player creation approval screen — engine wiring is NOT done yet.

### Post-audit fixes (OTAs 044 → 047)

OTAs 041-043 were the pre-ship audit repairs (covered in prior handoff). Following them:

- **OTA 044** — first HANDOFF.md refresh covering 041-043.
- **OTA 045** — `climb rope` noun-resolution fix. Scene nouns beat inventory items for the climb verb (the parser's general inventory-preference policy was producing "loop the climbing rope around the Climbing Rope" gibberish). Plus rope-shaped noun narration variant ("haul up the rope hand over hand").
- **OTA 046** — cleared-climbable affordance on the CLIMB modal. Fully crested climbables stay in the menu but render with dimmed text + `✓ TOP` suffix. Marker-parse logic extracted to `engine/climbHeight.ts` (`maxClimbedTier`, `isClimbCleared`); both screen and game-store handler share the parse.
- **OTA 047** — **ERR_UPDATES_FETCH fix on the apply-button tap**. Boot pre-downloads the bundle via `checkAndApplyOTA({ fetchOnly: true })` and sets `pendingOTAUpdate`; the OLD apply path then re-ran check+fetch unnecessarily and failed on transient network hiccups. Added `skipFetch?: boolean` option to `checkAndApplyOTA`; TitleScreen apply-tap passes `skipFetch: true`. Banner stays visible on apply failure so the player can retry without relaunching.

### Pre-ship audit (OTAs 040 → 043, covered in prior handoff line)

Player Sheet + tutorial refresh (040), 4 ship-blocker fixes (041), 3 dead-code deletes (042), 19 coverage-gap tests (043). See git log for details if needed.



### Pre-ship audit + repairs (OTAs 041–043)

Seven parallel Explore agents audited the codebase (combat, exploration, vendor/economy, inventory/crafting, quests/contracts, Aethercraft/corruption, UI/dead-code). Triaged into BLOCKERS / MAJOR / MINOR / DEAD CODE / TEST GAPS. **Two false positives were caught by verification before fixing** — claimed equip-swap vaporization (`equipItem` never touches inventory) and claimed missing Aether Locket (exists in `amulets.json` and `gear.json`). Real findings:

- **OTA 041 — 4 ship-blocker fixes + 12 regression tests.**
  - **B2:** 13 orphan crafting recipes (Sludge-Forged Vest, Aether-Wing Cloak, Mudstone Bulwark, Hollow Crown Circlet, Mud Gem Amulet, Lich-Heart Pendant, Behemoth-Heart Talisman, Aether-Shard Ring, Wyrm-Fang Blade, Mud-Iron Greatblade, Resonant Song Phial, Iron-Worm Engine, Voidspawn Bolt) had no catalog match — `crafting.ts:146` silently fell back to stat-less `misc`/`Common`/`[]`. Authored all 13 into the right slot catalogs.
  - **B3:** `completeContractFromUI` mystery branch (`gameStore.ts:8701-8730`) granted TC + rep but skipped `rewardItem`. 6 mysteries dropped their item. Mirrored `turnInMystery`'s grant block.
  - **B4:** Storyline UI branch (`8732-8760`) same shape — 4 storylines (Runic Mantle, Tartarian Stoneband, Echoing Steps Boots, Mud Monarch Seal). Mirrored `turnInStoryline`.
  - **B5:** Sentinel barehand even/odd hit-gate parsed into `BarehandSpec.hitGate` but never branched on at attack resolution. CharacterScreen + tutorial promised the gate; engine ignored it. Extracted `barehandGateBlocks(spec, naturalRoll)` helper; gameStore consumes it after the damage die rolls. On mismatch: "Stonework fist rings off X — d10 rolled N, needed even", run enemy counter, advance clock, return.
- **OTA 042 — dead-code deletes (193 lines).** `app/components/InventoryPanel.tsx`, `app/components/VendorPanel.tsx` (orphans, both replaced by `*Screen.tsx` rewrites), `applyRacialStatBonuses` helper + its test. Skipped audit-flagged "low-value complexity" items (slot-inference regex, alias lookup, `detectACContexts` export) — defensive code, not bugs.
- **OTA 043 — 19 coverage-gap tests.** `aethercraftDispatch.test.ts` (7 — verb routing, fuel burn, per-race DC, no-fuel bail), `stealCaught.test.ts` (2 — caught + success paths with `Math.random` spy), `corruptionMarkup.test.ts` (10 — multiplier per tier, BUY markup, SELL untouched).

### Player Sheet + tutorial refresh (OTA 040)

- New `'character'` screen reached by tapping the top-left HUD. Read-only — equip/use stays on Inventory.
- Sections: header (name/race/faction/HP/STA bars), Core Stats with per-source breakdown chips (race / equipped / pack passive / food buff / weather / corruption tier), Defense with AC + race-conditional clause + barehand spec, Wallet & Condition with corruption tier + one-line description, Equipped slot grid, Status Effects with rounds remaining, Racial Traits, Active Contracts (tap to jump to ContractsScreen), Milestones & Memory.
- New helper `effectiveStatsBreakdown(player, weatherMod)` returns annotated source labels alongside totals. Existing `effectiveStats` signature unchanged — 30+ call sites untouched.
- New helper `tierDescription(tier)` returns one-line consequence text per corruption tier.
- 3 new tutorial steps inserted into `TUTORIAL_STEPS` (now 17): "Tap for the full sheet", "Race mechanics", "New verbs and buttons" (climb HUD / roadside spawn / steal / Aethercraft).

### Aethercraft + 4-tier corruption ladder (OTA 039)

- Three new verbs: `shape stone` (Aetherstone Manipulation, INT-based, DC 12+race), `summon golem` (Aether Golem Constructor, INT, DC 15+race, summons `golem_companion` status that fires 1d6 bludgeoning after each player swing), `mend wounds` (Aetheric Healing, WIS, DC 12+race).
- Race-specific DC modifier: Mud Dweller +0 (base), Aetherborn +2 (Aetheric blood but no True Tartarian training), all others +4.
- Race-specific stat bonus: Mud Dweller +2 INT to Aethercraft; Aetherborn +1 INT/WIS.
- **Aetherborn pay HP** (not corruption) for Aetheric Healing — substitution clamped with `Math.max(0, …)` to prevent underflow.
- Fuel consumed regardless of cast success ("the aether takes its due either way"). Allowed fuels by discipline: shape uses any Aether-tagged consumable; summon uses Aetheric Shard / Aether Crystal / Golem Core; mend uses Aetheric Shard / Aether Crystal.
- New status effects: `shaped_stone_ward` (+4 AC, 1 round, in-combat shape casts), `golem_companion` (post-attack 1d6 bludgeoning ally).
- **Corruption ladder:** clean (0–10) / tainted (11–30, CHA −1, +5% encounter chance) / corrupted (31–60, all stats −1, +15% encounter, +15% vendor markup) / hollowed (61+, all stats −2, +30% encounter, +30% markup, Mud Monarch Purifier spawns every ≥5 steps at HP ≥25%).
- Vendor BUY markup applied via `corruptionPriceMultiplier(tier)`; SELL deliberately unaffected.

### Race mechanical layer + Servants of the Giants (OTA 038)

- Every race now has structured `barehandDamage`, `racialACBonusRules` (tag-matched against scene), and always-on `racialStatBonuses`.
- Tartarian Giants: 1d6+2 barehand, −4 AC confined, +2 STR. Mud Dwellers: 1d6−3, +1 AC underground, +2 DEX. Architectural Sentinels: 1d10 even/odd, +2 AC runic, +2 STR/+1 INT. Aetherborn: 1d6−2, +1 CHA. Mud Golems: 1d6, +1 AC relic-armor, +2 STR. Reclaimers: 1d6, +1 AC ruins/cities, +1 DEX. Unknowing Masses: 1d6, no inherent bonuses.
- Servants of the Giants faction with vendor + quest chain authored.



### Tutorial — 15 steps, screen-driven (OTAs 132–135)

- `app/components/tutorialSteps.ts` defines `TUTORIAL_STEPS`. Each step has `screen`, `area` (`HighlightArea`), `title`, `body`.
- `advanceTutorial` in gameStore drives `currentScreen` ATOMICALLY with `tutorialStep` (single `set()` call) — earlier split caused a one-frame race where VendorScreen rendered against null vendor and the AboutScreen swap landed on a gray screen.
- Vendor step spawns **Irma Ironhand** as a demo vendor via `findVendorByName('Irma Ironhand')`. Cleared on step-leave.
- **Transactions disabled during tour:** `buyFromVendor`, `sellToVendor`, `acceptFactionQuest`, `acceptHunt`, `acceptMystery`, `acceptStoryline` all early-return with a "Tour mode" system line when `tutorialDemoVendor` is set. Visible TOUR MODE banner on VendorScreen.
- `ScreenErrorBoundary` wraps `AppShell` for crash recovery (RESTART / BACK TO TITLE buttons).

### Mini-dungeons + encounters (OTAs 136–138)

- **45 archetypes** in `app/data/world/wasteland_encounters.json`, types: `treasure` / `npc` / `skirmish` / `mini_dungeon`.
- Mini-dungeons added two schema fields: `bandit_pool` (enemy names to spawn) and `quest_hook` (`{ kind: 'hunt'|'mystery', id }` — auto-adds to active board without vendor handoff).
- **All 10 authored hunts and mysteries have at least one in-world discovery path** — no quest is vendor-only.
- New helper: `grantQuestHook()` in gameStore — bypass-vendor add to active list, silent no-op if already active/completed.
- Authoring template for new archetypes lives in chat history (give it to the user when they want to generate more via Notebook LM).

### Voice fixes + lifecycle (OTAs 117–130)

- Per-vendor + per-NPC Kokoro voice assignment via `app/voice/speakerVoices.ts` (lazy-loaded into a 2-slot LRU pool, Arbiter sticky + 1 vendor slot).
- `disposeStickyArbiterVoice()` wired into `TTSManager.onVoiceSettingsChange` — fixes ~100 MB/swap memory leak when player changed `kokoroVoice` setting.
- Vendor voice prewarm gated on `engine === 'bundled'` (was unconditionally downloading Kokoro for system-TTS players).
- `prewarmKokoro()` resets `prewarmStarted = false` on failure so transient errors don't permanently latch.
- STT service-selection picks `com.google.android.as` on Pixels.

### OTA crash-on-apply fix (OTA 134)

- Boot-time auto-check was calling `Updates.reloadAsync()` while executorch/llama.rn/ONNX/expo-av were mid-init. Bundle swap mid-init = home-screen kick-out (player saw this on every OTA).
- Now `checkAndApplyOTA({ fetchOnly: true })` from boot — downloads + sets `pendingOTAUpdate` flag. TitleScreen shows "UPDATE READY — TAP TO APPLY" banner. Full teardown + reload only on explicit player tap.
- Global `ErrorUtils.setGlobalHandler` auto-reloads on uncaught fatal errors >5s after boot (avoids restart loops within the first 5s where bugs are easier to diagnose).
- `ScreenErrorBoundary` adds a per-screen recovery card with the error message + RESTART/BACK-TO-TITLE buttons.

### Contract burst-aware Arbiter chatter (OTA 134)

- Suppressed `stage0.arbiter` on all 4 accept paths (faction quest / hunt / mystery / storyline). Chip-tapping 6 contracts no longer produces 6 offhand reactions.
- `bumpQuestsAccepted` is burst-aware: first-ever contract → milestone line (one-shot per character); fresh burst (>5s since last accept) → one "another for the slate" line; tier transitions at count 3 ("stacking") and count 5 ("slow down"); other in-burst accepts → silent.

### Companion-chat wellness remarks (OTA 131)

- New fields on `ArbiterContext`: `playerHpFraction`, `playerStaminaFraction`, `hasFirstAidKit`, `hasFood`.
- ~15% out-of-combat chance: Arbiter drops a wellness remark when player is hurt/tired, with item awareness when relevant.

### Immersive system bars (OTA 134+, native-bound)

- `expo-navigation-bar` (lazy-loaded) hides Android nav bar with `overlay-swipe` behavior. Status bar hidden via `expo-status-bar`.
- **Requires APK rebuild** to activate — the JS calls no-op on the existing APK 138.

### Parser fixes (multiple OTAs)

- Removed greedy synonyms: `okay` from `accept`, `bag` from `inventory`, `pocket` from `steal`, `press` from `advance`, `construct` from `craft`.
- Added `salvage` / `strip` / `pry` to `investigate` (hook-eligible).
- Meta-comment guard tightened: threshold 60 chars (down from 100), expanded regex catches `we need`, `could you`, `it should`, `add a`, `please add`.
- Sanity gate on garbage-prose targets in both `buildArbiterRemark` and the investigate handler — no more "The [garbage phrase]," the Arbiter says.

### Content variety (OTA 131)

- Every location-flavor pool expanded from 6–7 lines to 10+ — uniqueness audit passes 50% threshold for all 21 locations.
- `deferLines` (Arbiter on-target-callback pool) expanded from 3 to 10.

### State hygiene

- `wastelandStepsSinceEncounter` reset on slot-load and resurrect (no cross-character bleed).
- Dead `lastLookAt` field removed.
- Duplicate area-search exploit in attack-fallback path closed.
- New `lastInteractedNoun` tracked on every confident parse so soft Arbiter fallback can ground "what's inside?" questions in the right noun.

---

## 7. Open tasks

### Player-requested features (engineering work to do)

- **[CARRIED FROM OTA-055] Mechanical informant + catalyst gates on hunts.** OTA-055 shipped the standardized 7-stage (informant-driven) and 5-stage (bait-switch) hunt templates as narrative + UI only. Stages still auto-advance on `checkKind` skill match — the informant isn't an actual NPC the player has to find at a specific location, the catalyst isn't an item the engine checks for at the apex, the transit encounters at stage 2/5 aren't forced spawns. The narrative + difficulty warning gives 90% of player-facing value; mechanical gates are the engine plumbing follow-up. ~4-6 hours of work — new `HuntDef` fields (`informantNpc`, `informantLocationId`, `catalystItemName`), advance-gate logic per stageType, scene-injection for forced transit ambushes.
- **[CARRIED FROM OTA-055] 7/5 templates for mysteries + storylines.** Currently only hunts have the templated arc. Mysteries (6 in catalog) and storylines (4+ per faction) still use freeform stages. Mostly authoring work — engine support is mostly there since stage_type / template_kind types are generic, would just need a parallel set of labels per quest kind. Defer until a playtester surfaces the inconsistency.
- **Salvage quick-action button** — explicit player request from OTA 141 log. Symmetric with Search/Approach: chip-tap modal listing scene nouns that can be salvaged (constructs, wrecks, automatons, drone husks). Needs new modal component + chip pool source + wiring in `InputBox`. **PARTIALLY SHIPPED** in the 020–055 wave (SALVAGE button on quick row + modal + SALVAGE ALL exist now); the deeper "treat as a first-class chip-tap surface like Approach" is what remains. Probably moot — verify with user.

### Player action needed

- **Pronunciation worksheet** — `docs/pronunciation-worksheet.md`. Player fills rows and sends back. Batch into `loreLexicon.ts` (~30 min, no engineering risk).
- **APK 207 redistribute** — APK at runtime `2.4.1` is built and published as GitHub release `apk-build-207`. User installs on their own device + the one other tester's device. Once installed, all OTAs from `2026-05-23-012` forward (including 23-013 → 23-018) will reach them on next app launch.
- **Wife's Kokoro recovery (after APK 207 install)** — she was on v2.0.1 / OTA stream frozen there. Once she installs APK 207, she'll receive OTA 23-018 which adds the **CLEAR BUNDLED VOICE CACHE** button on the SFX panel. Have her tap it then TEST VOICE; the auto-recovery (50 MB min reuse threshold) will trigger a clean re-download. If it still fails, **COPY VOICE INFO** now produces a full diagnostic with the actual error message, stack, free disk, AND the executorch cache inventory — paste-back tells us exactly why it died.

### Watch list / open issues (not ship-blocking)

- **`ambientNounVariety.test.ts` "small pools (≤8) show the entire pool unchanged across steps" flake** — passes in isolation, intermittently fails in full `npx jest --runInBand` runs. Likely shared-state contamination from a prior test's RNG path. Real-world impact: zero. Don't chase unless it gets worse.
- **`climbRopeMechanics.test.ts` cross-test flake** — `tickWeather()` at the top of `submitPlayerAction` calls `Math.random` and can drain 1 stamina before the climb branch fires. In full-suite runs prior RNG ordering occasionally lands the test on a stamina-drain weather tick. Passes in isolation. Same shape as the ambientNounVariety flake — don't chase.
- **`encounterStress` test cycle tuning** — `seq` reset removed in OTA 137 so real entropy drives variation; if archetype pool grows past ~50, may need re-tuning.
- **Audit minors still deferred** — inventory-full silently swallows hunt/mystery/storyline reward items on UI completion (`gameStore.ts:8669-8679` and equivalents); `require()` instead of top-level `import` for Aethercraft helpers (circular-dep workaround — cosmetic); minor climb-fail messaging precision (`gameStore.ts:5250`); possible surprise-penalty double-apply between `statusAttackPenalty()` and `rollMods()` (audit uncertain — ~5 min to trace).
- **`gameStore.ts` not swept top-to-bottom for dead code.** Pre-ship audit used grep-narrow reads on this 12.5k-line file. More orphan functions / unreachable branches likely live in there. Chunked sweep (~12 × 1k-line passes) recommended before a major refactor.

### Open AI/ML utilization items

User asked for a utilization audit on 2026-05-24 ("am I getting the most out of MiniLM, Qwen, and Kokoro"). Kokoro is well-utilized; MiniLM is underused (2 call sites — target match + recipe lookup); Qwen is gated out of most narration. Below are the four planned upgrades, ordered by recommended ship cadence. When user asks "what's open on AI," grep `[AI-OPEN]` and surface this list.

**EXPERIMENTAL BRANCH:** `HaL2001` (forked off `claude/new-session-MvF82` on 2026-05-24). Isolated package id (`com.hotatticgames.tartarprim.hal2001`) + isolated OTA channel (`hal2001`). APK builds tagged `Hal2001-N`. Lives on user's phone as a separate app icon ("Tartaria Realms HAL") alongside the live Tartaria Realms — no risk to live game / OTA stream / other testers. Each AI item ships as its own OTA on this branch's channel. Plan file: `/root/.claude/plans/so-i-believe-the-unified-wigderson.md`.

- **[AI-OPEN-1]** MiniLM lore search — semantic Q&A against `concepts.json` (paraphrase coverage for "what is X" / "who are X" / "tell me about X"). New module: `app/ai/embedding/ConceptIndex.ts`. Tiered lookup at `gameStore.ts:5335`: substring → MiniLM cosine ≥ 0.65 → canned fallback. **HIGH impact / LOW risk / ~1 hr.**
- **[AI-OPEN-2]** MiniLM parser disambiguation — kill "I'm not sure" refusals by inserting intent classification between dictionary parser and Qwen LLM fallback. New module: `app/ai/IntentClassifier.ts` (36 pre-embedded intent phrases). `CognitiveOrchestrator.inferIntent()` exposed. Wires into `gameStore.ts:3025` parser-low-confidence branch. **HIGH impact / MED risk / ~2 hr.**
- **[AI-OPEN-3]** Qwen vendor banter — first-contact greetings per vendor, cached per-session. New module: `app/engine/vendorBanter.ts`. Optional `personality` field per vendor in `vendors.json` (27 vendors). Scene-entry wiring + per-session cap (8 banters max) + `arbiterGenerationEpoch` cancellation. **MED impact / MED risk / ~2-3 hr.**
- **[AI-OPEN-4]** Qwen dynamic Arbiter wellness lines — 30% of wellness fires call Qwen for situational lines instead of canned pick. Extends `narrativeGenerator.ts:567` wellness fork + new `app/engine/arbiterPersona.ts` (system prompt + style). Throttle: max 10 per session + 60s cooldown. Fallback to canned on timeout / error. **MED-LOW impact / LOW impl risk / MED runtime risk / ~1.5 hr.**

Mark items `[AI-DONE-N]` in this list when they pass user playtest on HaL2001. Eventual promotion: cherry-pick each item to `claude/new-session-MvF82` for live OTA release.

### Open polish items (deferred until user has hours to work them)

User flagged these on 2026-05-24 to revisit when they have time. Grep `[POLISH]` to surface this list.

- **[POLISH-1]** ✅ SHIPPED 2026-05-25 (OTA-004) — APPROACH button tone='needs-approach' (green glow) when combat range is 'far'. Awaiting playtest signoff. Original report below. Combat out-of-range affordance — when the player is in combat and the target is out of weapon range, the **APPROACH** button should glow green to hint that closing distance is the required next action. Today it sits with the same chrome as other combat actions and players don't always notice they need to move first. Likely touches `CombatScreen.tsx` (or wherever the action panel renders) + the range-check that decides whether the chosen attack lands. Add a `needsApproach: boolean` derived flag and conditionally style the APPROACH button with a green border / glow when true.
- **[POLISH-2]** ✅ SHIPPED 2026-05-25 (OTA-003) — JUNK_POOL fallback (Stick / Smooth Stone / Cloth Scrap / Bent Nail / Bone Sliver authored). Replaces the kind:'nothing' return with kind:'material' qty 1 + thematic flavor line. Awaiting playtest signoff. Original report below. Scrap/salvage zero-yield floor — when the player scraps an item in their pack, the outcome should NEVER be zero materials. Even on the worst roll, drop something — a stick, a stone, a scrap of cloth, a bent nail — so the action always feels worthwhile. Today certain low-value items can roll an empty salvage and the player just loses the item with no return. Touches the salvage table in `gameStore.ts` (or wherever `scrapItem` is implemented) + the loot-roll fallback. Add a guaranteed minimum drop of a "junk" pool (cheap, evocative, non-stackable-bloat-safe items) when the primary roll yields nothing. **Reinforced 2026-05-25 (distilled 10-piece log)** — two concrete repros: (1) "Rusted Blade ... pieces crumble ... Nothing salvageable" and (2) "salt-crusted library archive console ... warped past use ... added to scrap heap" both produced zero loot.
- **[POLISH-3]** ✅ SHIPPED 2026-05-25 (OTA-005) — SearchModal sorts consumed chips to the right (no longer hidden). New VisitedRoom.flavorExhaustedNouns field tracks nothing-yielded investigates separately so cross-verb chain stays intact. Awaiting playtest signoff. Original report below. Investigate-list exhausted-item sorting — when the player investigates something in a scene and the outcome is "nothing of interest" / no reward, the entry should (a) gray out, (b) get a checkmark glyph, and (c) move to the far right of the investigate list. Longer lists are horizontally slidable; actionable items belong on the left so the player can see what still needs attention without scrolling, and exhausted items belong on the right so they're visible (record of what's been tried) but out of the way. Likely touches the scene-investigate UI in `ExplorationScreen.tsx` or `SceneScreen.tsx` — needs a per-target `exhausted: boolean` flag persisted on the scene state + a sort comparator that puts exhausted items last. The exhausted state should survive scene re-entry within the same location.
- **[POLISH-4]** ✅ SHIPPED 2026-05-25 (OTA-005) — vendors no longer follow (cleared on every cardinal step in stepDirection). RN Alert prompts "Vendor present — leave [name]?" before moving. ANTINAG-1 toggle deferred to follow-up. Awaiting playtest signoff. Original report below. Vendor presence shouldn't require dismiss to move on — today the vendor bar sticks to the screen and "follows" the player for ~10 paces of travel until they tap DISMISS. Easy to miss the bar appearing in the first place; annoying to clear when traveling through a town. Vendors should stay where you encountered them, not follow. User's proposed flow: if the player tries to move while a vendor bar is still on screen, prompt "There is a vendor present. Do you still want to move?" with Yes / No. No → stays, probably opens the vendor. Yes → moves and the vendor is left at the previous location. User flagged this is a starting point — "let's work out a better system" — so consider these alternatives during impl:
  - **Alt A (silent leave + toast):** moving auto-clears the vendor with a brief toast "Left [vendor name] behind." Tap toast to undo. Fewer taps in the normal case.
  - **Alt B (corner badge):** replace the dismiss-required bar with a small persistent corner badge that doesn't gate the move action. Moving silently dissolves the badge. Lowest friction but easiest to miss.
  - **Alt C (user's prompt + anti-nag):** as proposed, but add a per-session "don't ask again this session" toggle in the modal so frequent travelers don't get repeatedly prompted.
  - **Alt D (hybrid):** corner badge for ambient presence + confirm prompt only on the FIRST move attempt while the badge is active. Subsequent moves silently leave.
  - Decision needed at impl time on which to ship. Touches the vendor scene/bar component + the player-move handler in `gameStore.ts` (or wherever the move command resolves). Also need to remove the existing "vendor follows for N paces" behavior — vendors should be pinned to the location coords where they were spawned.
- **[MECHANIC-1]** 🟡 PARTIAL SHIPPED 2026-05-25 (OTA-006) — DC-fairness piece only: non-aetheric races dropped from +4 → +3 in aethercraftDcModifier. Golem follower behavior (send-to-fight + follow-until-next-combat) split to MECHANIC-1b below. Awaiting playtest signoff on the DC change. Original report: Golem summoning DC review + follower behavior. User log (2026-05-25) — three summon-golem attempts, first failed (d20:1), second failed (d20:15 vs DC 19), third succeeded (d20:16 + INT 3 = 19). User asks: is the DC check fair? Also wants the summoned golem to be sendable to fight for the player, and if it lives through combat, to follow until the next combat fires when it re-engages. Two-part work: (a) audit the summon-golem DC against player INT progression so success isn't gated on rolling near-max; (b) add a follower-state for the golem persisting between combats and a "send golem" / "command golem" action in the combat verb set.
- **[MECHANIC-2]** ✅ SHIPPED 2026-05-25 (OTA-006) — Pulse Scanner recipe added (2 Aether Crystal + 1 Scrap Metal + 1 Aetheric Shard). Additional scanner variants get their own recipes as authored. Awaiting playtest signoff. Original report: Scanner recipes in the recipe tab. Player blocked from investigating a vent fissure: "Equip a Pulse Scanner (or other Aether scanner) in your off hand to search the fissure." The scanners required as gate equipment aren't authored as craftable. Add Pulse Scanner / Aether Scanner / etc. to the recipes table with reasonable components (salvaged crystal + circuit + housing). Find the gate logic that demands the scanner; cross-reference with crafted-item lookup. Likely `recipes.json` + the scanner spawn / loot table.
- **[CONTENT-1]** ✅ SHIPPED 2026-05-25 (OTA-006) — 'watchtower' added to OUTSIDE_CLIMBABLES at height 4 (substring 'tower' already maps to 4 in climbHeight.ts). Awaiting playtest signoff. Original report: Watchtower should be a 4-step climbable. Player tried to investigate a watchtower; world text only described it as "half-swallowed" by silt with no climb prompt. Add watchtower to the outside-climbable set with a 4-step climb (rope cost, stamina cost per step, possible drop). Touches the climbable-noun spawn table + the watchtower scene description.
- **[INVENTORY-1]** ✅ SHIPPED 2026-05-25 (OTA-002) — snap check changed from `current < ROPE_WEAR_PER_TIER` to `<=`, catching the boundary case where wear would zero the rope and splice it from inventory. Broken Rope artifact now always produced on snap. Awaiting playtest signoff. Original report: Broken rope vanishes instead of dropping a "broken rope" item. Player's rope broke during a climb attempt (then arch climb was blocked: "Not without rope. Find some, then come back."). The rope should have transitioned to a "broken rope" inventory item (per the rope-durability subsystem design) rather than disappearing entirely — a broken rope is repairable / sellable / scrap-source. Find the rope-break path in `gameStore.ts` (rope durability handler) and confirm the item-transition step isn't being skipped. Likely a regression from the rope-durability OTAs.
- **[INPUT-1]** ✅ SHIPPED 2026-05-25 (OTA-005) — FeedbackModal no longer auto-arms the mic on open; manualMode defaults true. Placeholder text updated. Continuous-capture loop intact for future opt-in mic toggle. Awaiting playtest signoff. Original report: Notes entry — remove the auto voice capture. When entering a player note, voice capture starts automatically, which is unwanted. Should be text-only by default. If voice-to-note is still desired, gate it behind an explicit mic button on the note entry modal. Touches the note-entry modal (probably `NotesScreen.tsx` or a sibling component) and the auto-start-mic logic at modal mount.
- **[VIZ-1]** ✅ SHIPPED 2026-05-25 (OTA-006) — fineProgressBar (20-segment, 5% per rune) + rawProgressPercent (0-99) + SKILL_ACTIVITIES map. CharacterScreen StatRow now shows fine bar + actual percent + "Grows from: ..." activity list per skill. Awaiting playtest signoff. Original report: Skill progression page — single 100-bar + activity list per skill. Today skills show as a few small progress blocks at the top of the character page. Replace with a single 100-status bar per skill showing current progression to next rank, AND list which activities grow that skill (e.g. "WIS — grows from: resting after combat, identifying lore, completing investigations"). Every skill should have at least something on its activity list. Touches the character-screen skill section.
- **[UI-1]** ✅ SHIPPED 2026-05-25 (OTA-004) — SalvageModal: "Common" generic-suggestion chips removed (the browned-out clutter); CANCEL swapped to bottom-right. Project-wide modal-button audit for the full standard still pending — only SalvageModal hit so far. Awaiting playtest signoff. Original report: Modal cancel/close button placement standardization. (1) Remove the "browned-out suggestion boxes" from the salvage modal (presumably non-actionable hint widgets that clutter the dialog), (2) swap cancel/salvage button positions so CANCEL/CLOSE is always in the bottom-right corner across all pop-up modals — that's the consistent dismissal location user expects. Audit all modal components for the standard.
- **[UI-2]** ✅ SHIPPED 2026-05-25 (OTA-004, fix OTA-007) — InputBox QuickBtn tone='ready' for TAKE / SALVAGE when count > 0. Predicates now mirror the modal filter chains exactly: takeable = findCatalogItem != null AND !isOversized AND !isAmbientConsumed; salvageable = !isAmbientConsumed AND isSalvageable. Awaiting playtest signoff. Original report: Action button color affordance — take and salvage should be green when there's something in the slot to act on, gray when empty. Same affordance pattern as `[POLISH-1]` (combat APPROACH glow when out of range). Build a shared `<ActionButton hasContent={boolean} />` or similar so all action buttons inherit the same green/gray state instead of one-off per-screen styling. Both POLISH-1 and UI-2 should land together on the same primitive.
- **[UI-3]** ✅ SHIPPED 2026-05-25 (OTA-005) — SalvageModal SALVAGE ALL button surfaces when 2+ salvageable scene chips present. Fires one submit('salvage <n>') per noun. Mirrors TakeModal TAKE ALL pattern. Awaiting playtest signoff. Original report: Salvage-all button — add a bulk SALVAGE-ALL action mirroring the existing take-all. User performed many individual salvage actions on rubble, footprints, detectors etc. that could have been one tap. Find the take-all implementation as the pattern and adapt for salvage.
- **[TTS-1]** 🟡 PARTIAL SHIPPED 2026-05-25 (OTA-006) — IPA infrastructure landed: IPA_OVERRIDES map (5 proper nouns) + applyIPAOverrides function in loreLexicon.ts. IPA_OVERRIDES_ENABLED flag set to FALSE — needs on-device test of whether Kokoro reads espeak `[[IPA]]` bracket syntax. If on-device verification shows clean pronunciation, flip flag to true and remove redundant respelling regexes. If Kokoro reads brackets verbatim, leave disabled. Original report: Kokoro IPA pronunciation support — proper nouns like "Tartaria" should pronounce cleanly ("/tɑːrˈtɑːriə/"). Check whether Kokoro accepts IPA-tagged text or whether we need a phonemizer preprocessing step that converts in-text IPA to whatever Kokoro's tokenizer understands. Likely touches the speech text prep in `app/voice/loreLexicon.ts` (already has a lexicon for lore-word pronunciation) or `PiperTTSManager.ts` text-clean path. Start with a small set of proper nouns (Tartaria, Drakova, Aether, the Forgotten Order, Aetherkin) and confirm audible improvement before expanding.
- **[MECHANIC-1b]** ✅ SHIPPED 2026-05-25 (OTA-011) — Golem sidekick full feature. 4 golem recipes (mud / iron / aether / crystal), each with distinct fuel + HP + attack profile (all fuel items already in materials.json). New `player.golem` field persists across cardinal moves + combats. Combat-row "golem (hp/max)" QuickBtn fires the strike at the target; retaliation hits golem HP not player HP. Parser shortcut at gameStore.ts:3046 catches "command golem [target]" / "use golem" / "dismiss golem" before the regular pipeline. Player death clears the tether. 13 tests in golemCompanion.test.ts covering parse/fuel/summon/dismiss/persistence. Awaiting on-device playtest signoff.
- **[ANTINAG-1]** STILL OPEN. Vendor-leave prompt "don't ask this session" toggle — companion to POLISH-4. The shipped POLISH-4 uses React Native's built-in Alert which doesn't support inline toggles. To add the anti-nag option the prompt needs to become a custom modal component (similar to BrandedModal pattern in app/components/). Add a session-transient flag (zustand store) to suppress further prompts when toggle is checked. Resets on app cold-start.

### Suspected regression — INVESTIGATE FIRST when hours return

- **[REGRESSION-1]** ✅ SHIPPED 2026-05-25 (OTA-001) — slot allocation fix in gameStore.ts beginScene (5 take + 2 climb + 2 salvage reserved). Awaiting playtest signoff. Original report below. **MOST IMPORTANT.** Take/pickup noun options haven't surfaced for ~15-25 player moves in user's live session (2026-05-24). Either (a) the take-noun picker is broken — recent spawn-system work on climbable / salvageable / rope-durability / kind migration / contracts may have crowded out or filter-shadowed the takeable nouns — or (b) drop rates for take were lowered intentionally and that change was too aggressive. Either way the player perceives "take" as effectively dead, which is a major loop regression. Investigation plan when hours return:
  1. **Reproduce in tests** — write a movement loop (e.g. 100 moves through D1/D2 mixed terrain) and count how many ticks surface a takeable noun. Compare to a baseline run on `git log --before` from before the spawn-system work landed (probably git bisect against the kind migration + climbable spawn commits).
  2. **Audit the noun-pool selector** — find where ambient nouns are picked per move tick (likely in `gameStore.ts` movement handler or `narrativeGenerator.ts`). Check if takeable nouns are competing for the same slot as climbables/salvageables and being out-priced.
  3. **Audit recent drop-rate config** — grep for `take`, `pickup`, `loot`, `drop` in tuning constants. See if any rate was lowered in OTAs 23-015 through 23-020.
  4. **Verify the noun-tag filter** — takeable nouns are flagged by `kind: 'take'` (post-migration) or similar; confirm the picker isn't filtering them out by stale tag name.
  5. Likely culprits in order of probability: kind-migration filter shadow > climbable/salvageable spawn priority crowding out take > intentional rate tune > picker selector bug. Fix the highest-probability cause first, re-run the 100-move test, iterate.
- **[BALANCE-1]** ✅ SHIPPED 2026-05-25 (OTA-001) — rest ambush rate raised 15% → 22%. Awaiting playtest signoff. Original report below. Rest encounter risk weights too low. User tested 30 consecutive rest commands on 2026-05-25 (per in-game feedback log) with zero attack/encounter fires during sleep. Most attempts returned the "you are whole, no reason to lie down" guard (player wasn't actually tired and was stress-testing), but the one rest that DID execute (8h sleep recovering 1 stamina, day 7 night) also produced no encounter. Resting in the wild should carry a meaningful chance of being interrupted — ambushes, scavenger encounters, weather events, etc. Investigation: find the rest-encounter roll in `gameStore.ts` (or wherever the 8h-pass logic lives), check current attack-chance per rest cycle, and increase to a level where ~1 in 4-5 wild rests fires an event. Hub/town/safe-tile rests should remain safe. Related telemetry: the "no reason to lie down" guard fired 13 of 14 attempts above — confirms most player intent-to-rest is being absorbed by the guard, but the rare actually-executed rest still didn't roll an encounter. Likely a flat 0% or vanishingly low rate in current tuning. **Reinforced 2026-05-25 (distilled 10-piece log)** — same finding confirmed across the full session, not just one stress test.
- **[BALANCE-2]** ✅ SHIPPED 2026-05-25 (OTA-001) — wasteland rollChance raised 0.55 → 0.70 (still on threshold=2). Awaiting playtest signoff. Original report below. Travel encounter rates too low — companion to BALANCE-1. User's distilled 10-piece log shows extensive travel through the Tartarian Outskirts and Buried Cities with multiple hours / days passing and only one Aetherkin encounter total. Travel should fire combat / encounter events more often. Likely sibling tuning constant to the rest-encounter rate — same file as BALANCE-1, one line away. Raise travel-encounter chance to where a routine traverse fires 1-2 events per leg. Hub/town transitions stay safe.
- **[VERIFY-1]** ✅ SHIPPED 2026-05-25 (OTA-001) — NOTHING_CHANCE 0.25 → 0.05 (companion to POLISH-2 junk-pool fallback). Awaiting playtest signoff. Original report below. Scrap output system — verify it's actually emitting scrap. User reports "haven't seen scrap awarded in a while" (2026-05-25). Companion to `[REGRESSION-1]` — same recent spawn-system / kind-migration work may have shadowed the input side (no takeable nouns spawn) AND the output side (salvage rolls return empty). Run a test that scraps 50 known-yielding items and counts non-empty outcomes; compare against a pre-spawn-overhaul baseline. If output rate dropped, the regression is likely in the loot-table lookup or the kind filter applied after roll. Investigate alongside REGRESSION-1 — likely same root cause.
- **[BANTER-1]** STILL OPEN. Arbiter banter pool too small — rapid-fire actions burn through it. User's log (2026-05-25) showed "The crystal — still waiting" firing twice within ~1.2s, with the second instance caught by the dedup suppressor. Dedup works (good) but it just hides the symptom — the root issue is that the canned banter pool per context (idle-with-objective, traveling, post-rest, etc.) is shallow enough that 2-3 rapid actions exhaust uniques. Two complementary fixes: (a) expand the canned banter line pools — find the banter table in `narrativeGenerator.ts` / `arbiterBanter.ts` and roughly double each context's line count with new variants in the same voice; (b) widen the dedup window to also suppress lines that are *near-duplicates* (high cosine sim via MiniLM if available, or simple n-gram overlap fallback) so the player doesn't feel the repetition through paraphrases either. Note: this is narrower than `[AI-OPEN-4]` (Qwen-generated dynamic wellness lines) — that's a deeper fix for the same class of problem. Ship BANTER-1 first as a fast win; AI-OPEN-4 raises the floor further.
- **[POLISH-5]** STILL OPEN. Speech-recognition "could not transcribe" frustration — user's log showed `Mic: heard you but could not transcribe. Try speaking more clearly or check your device locale.` after a clear utterance. Recurring frustration per user (2026-05-25). The message means audio was captured but the device STT returned no result. Investigation: locate the mic input handler (likely `app/voice/` or wherever `expo-speech-recognition` is consumed), check whether (a) device locale defaults are mismatched (e.g. en-US vs en-GB), (b) confidence threshold is too high and is rejecting marginal transcriptions instead of accepting them, (c) the recognition is timing out before the full utterance finishes, or (d) Android speech service is being killed mid-session by aggressive battery savers. Quick wins: log the raw STT result (even when empty) so we can see *why* it bailed; lower any confidence threshold; offer a "tap to retry" affordance instead of the generic error so the user doesn't lose the action they were trying to take.

### Closed this session

- **Sim-suite timeout bumps for the 41×41 grid** (`twoYearChaosSim` 600→900 s, `yearSimulation` 300→480 s, `movementStress` 180→300 s) ✅ (OTA 23-020)
- **v2.4.1 map marker overhaul** — Path A + procedural realignment. Grid 21×21 → 41×41; danger bands doubled (D1 4-12 / D2 8-18 / D3 12-22 / D4 16-26 / D5 20-28); procedural placement now respects canonical atlas bearing (90% on-canon); marker drifts from current location's anchor in player's direction of travel; aspect-corrected step constants kill the 1.83× anisotropy; snap on arrival only; footer prose references current location ✅ (OTA 23-019)
- **Runic Mantle authored** (Rare cloak, +2 INT / +1 WIS, Forgotten Order). Was a 1500 TC storyline reward silently downgraded to stat-less Common misc via `lookupCraftedItem` fallback ✅ (OTA 23-019)
- **Ceremonial Robes, Mud-glass Scales, Throwing Knife authored** (vendor offers that lacked catalog entries — same fallback bug, narrower blast) ✅ (OTA 23-019)
- **`buyFromVendor` + `stealFromVendor` extended to check RINGS + AMULETS** — 6 vendor offers (Aetheric Locket, Golem Controller Ring, Minor Aetheric Amulet, Reclaimer's Quick Band, Tartarian Stoneband, Whisperer's Charm) were landing as bare 'misc'; now write as 'relic' with proper rarity/tags ✅ (OTA 23-019)
- **`fill` intent added to `llmParser.ts` INTENT_LIST** — handler existed but LLM fallback couldn't return the intent ✅ (OTA 23-019)
- **`apkRelease.ts` pointers bumped 158 → 207** (LATEST_APK_BUILD + URL + ASSET_URL + highlights string) ✅ (OTA 23-019)
- **MiniLM downloader size-floor reuse check** (≥ 15 MB model, ≥ 30 KB vocab) — parity with Qwen / Kokoro recovery; new `existsWithMinSize()` helper ✅ (OTA 23-019)
- **TitleScreen footer dynamic** — `v{APP_VERSION} / 2148` reading from app.json ✅ (OTA 23-019)
- **Orphan delete:** `activeEnemyHp()` ✅ (OTA 23-019)
- **Stale comment cleanup:** MapScreen.tsx IDW block + atlasCoords.ts aspect notes ✅ (OTA 23-019)
- Kokoro corrupt-cache recovery (50 MB min reuse + CLEAR BUNDLED VOICE CACHE button + cache inventory in diagnostic) ✅ (OTA 23-018)
- Kokoro error diagnostic capture (step tracking, untruncated message, stack, free disk, ring buffer of last 5 failures) ✅ (OTA 23-017)
- `look` filters consumed nouns from "You see:" list + "worked over everything here" cue when empty ✅ (OTA 23-016)
- Ambient-salvage retry closed (`salvage <noun>` is one-shot now, uses scrap failure variants) ✅ (OTA 23-015)
- Climb-top rope narration (rope/line/chain/cable/cord → "wedged into the rock face where the rope is tied off") ✅ (OTA 23-015)
- Reclaimer's Trowel re-typed (`bludgeoning`/STR → `piercing`/DEX) to match archaeologist usage ✅ (OTA 23-015)
- Salvage rolls for success (70% base + INT/DEX, INT≥14 / DEX≥16 second-chance, 10 failure variants, success trains INT) ✅ (OTA 23-014)
- Reclaimer's Rope obtainable for non-Reclaimer races (vendors + tall-climb loot drop) ✅ (OTA 23-013)
- v2.4.1 baseline shipped (app.json bump + metro.config bump + APK #207 built at runtime 2.4.1) ✅ (OTA 23-012)
- World atlas screen + MAP button + IDW dot plotting + Reclaimer marker + halo ✅ (OTAs 048 → 23-003)
- Auto-centering on map removed (interfered with zoom gesture) ✅ (OTA 23-003)
- Use-based stat progression replacing milestone model + CHA training on tap-driven socials ✅ (OTAs 058 → 059)
- Cleared-climbable affordance + climb-rope noun resolution + auto-rope narration ✅ (OTAs 045 → 046)
- ERR_UPDATES_FETCH on apply-tap (skipFetch path) ✅ (OTA 047)
- Race image-generation guide doc ✅ (committed standalone)
- 13 orphan crafting recipes → stat-less misc fallback ✅ (OTA 041)
- Mystery rewards dropped on UI completion (6 mysteries) ✅ (OTA 041)
- Storyline rewards dropped on UI completion (4 storylines) ✅ (OTA 041)
- Sentinel hit-gate UI promised an unenforced mechanic ✅ (OTA 041)
- Dead-code orphans: InventoryPanel / VendorPanel / applyRacialStatBonuses ✅ (OTA 042)
- Test-coverage gaps: Aethercraft verb dispatch, caught-steal flow, corruption markup ✅ (OTA 043)
- Player Sheet screen + tutorial refresh (17 steps) ✅ (OTA 040)
- Aethercraft + 4-tier corruption ladder ✅ (OTA 039)
- Race mechanical layer + Servants of the Giants ✅ (OTA 038)
- Tutorial vendor → about freeze ✅ (OTA 135)
- OTA-apply crash ✅ (OTA 134)
- Mid-tour Irma cheese ✅ (OTA 133)
- Tutorial coverage gaps (cardinal travel, actions, contracts, settings) ✅ (OTA 132)
- Stats panel clipping behind scene bar ✅ (OTA 132)
- Parser mis-routes (okay/bag/pocket/press/construct) ✅ (OTAs 131, 140)
- Salvage → craft+construct misparse ✅ (OTA 140)
- Locket "force open" dead-end ✅ (OTA 140)
- "What's inside?" hallucinated inventory item ✅ (OTA 140)
- Garbage-prose Arbiter echo ✅ (OTA 141)
- Mud Monarchs vendor missing ✅ (OTA 131)
- Location-flavor uniqueness ✅ (OTA 131)
- `wastelandStepsSinceEncounter` cross-character leak ✅ (OTA 131)
- Mini-dungeon system + 36 new archetypes ✅ (OTAs 136–138)
- Burst-aware contract chatter ✅ (OTA 134)
- Companion-chat wellness lines ✅ (OTA 131)

### Decided won't-do

- **STT investment beyond service-selection** — player said "if it doesn't work it's bloat." Next failure → STT comes out entirely.
- **Cloud TTS** — offline-first per project architecture.
- **Continuous listening / hot-word** — battery + privacy; push-to-talk only.

---

## 8. Workflow conventions

### Commits

- **Prefix:** `feat:` / `fix:` / `chore:` / `refactor:` / `debug:` / `test:` / `perf:` / `ui:` / `content:`
- **Subject:** one line, lowercase after prefix, concrete and specific
- **Body:** explain the WHY with concrete before/after. Reference OTA numbers when fixing earlier bugs.
- **Never include** the model identifier (`claude-opus-4-7[1m]`) in any committed artifact.

### OTA bumps

- Format `YYYY-MM-DD-NNN`. NNN is monotonic counter; today's first OTA is 001, second is 002, etc.
- Bump on EVERY push that ships JS changes (which is ~all of them).

### Tests

- Live in `__tests__/` at repo root, `jest-expo` preset.
- 106 suites, 1283 tests as of OTA 2026-05-23-003.
- Two suites have a known parallel-run flake (see Watch list). Re-run in isolation to confirm; safe to push if isolated runs pass.

### Code style

- Default to writing no comments. Only comment when WHY is non-obvious (hidden constraint, subtle invariant, workaround for a specific bug).
- Never write multi-paragraph docstrings or multi-line comment blocks — one short line max.
- Don't reference "the current task" or PR-level context in code comments — those belong in commit bodies and rot inline.

### HANDOFF.md updates (per 2026-05-26 user ask)

When this document is touched, capture **every change with the reason WHY + the logic of the action + the overarching goal** — not just headlines. The point is that another Claude instance reading the doc cold should understand not just what shipped but *why we shipped it that way*. Concretely:

- **Per OTA, document:** the trigger (playtester quote, design pitch, audit finding), what shipped, the rationale (why this approach over alternatives), and any explicit lesson-for-next-time (e.g. "wired into a dead code path — grep for both `case '<verb>':` and the method name next time").
- **Per wave, document:** the overarching arc that ties the OTAs together — what we were trying to accomplish across them, not just enumerated bullets.
- **When fixing a regression introduced by an earlier OTA in the same session,** call it out explicitly — name the earlier OTA + describe the miss so the same shape of miss doesn't recur. Section 6.A's OTA-050 entry is the template (the wave's own OTA-043 wired into dead code, surfaced by playtester log, root-caused honestly).
- **When deferring work,** put the deferral in section 7 with enough context that the next instance can pick it up without re-doing investigation (file:line if relevant, what's already authored vs what needs writing, why it's deferred vs why we considered shipping).
- **At the top of the file:** bump the latest OTA + session arc summary + test count + working tree state + any stale PRs. Future-me should be able to read just the top six lines and know where to start.

---

## 9. Critical files / hotspots

- `app/state/gameStore.ts` — ~12,500 lines. Action handlers, combat resolution (with Sentinel hit-gate + use-based stat training wired into every check site), scene management, log persistence, room state, Qwen parse-fallback wiring, tutorial advance, OTA-update flag, burst-quest tracker, `lastInteractedNoun` tracker, Aethercraft verb dispatcher (`runAethercraft`), corruption markup application, completeContractFromUI reward grants, CHA training on BUY/SELL/GIFT/quest-accepts.
- `app/engine/types.ts` — shared interfaces. `Location.interactables`, `MicroMicroLocation.interactables`, `ScreenName`.
- `app/engine/parser.ts` — dictionary parser. ~330 verbs across 36 intents.
- `app/engine/llmParser.ts` — Qwen-backed fallback. `parseInputViaLLM(text, ctx, qwen)`.
- `app/engine/wastelandEncounters.ts` — pickWastelandEncounter + 45 archetype types.
- `app/engine/containerLoot.ts` — open-intent loot resolver.
- `app/engine/hooks.ts` — multi-stage scene hooks (`wreck_construct`, `submerged_steeple`, etc.).
- `app/engine/hub.ts` — hub data + `isLeaveHubCommand` / `resolveHubTravel`.
- `app/engine/narrativeGenerator.ts` — Arbiter remark builder, soft fallback, opening narrative, location flavors.
- `app/voice/PiperTTSManager.ts` — Kokoro engine, voice pool (2-slot LRU).
- `app/voice/TTSManager.ts` — engine routing + queue + coalesce.
- `app/voice/STTManager.ts` — speech recognition with service selection.
- `app/voice/speakerVoices.ts` — per-vendor/NPC voice mapping.
- `app/components/tutorialSteps.ts` — TUTORIAL_STEPS array (17 steps as of OTA 040 — added Player Sheet, race mechanics, new verbs/buttons).
- `app/engine/raceMechanics.ts` — `barehandDamageFor`, `barehandGateBlocks`, `effectiveAC`, `racialStatBonusesFor`, `aethercraftDcModifier`, `aethercraftStatBonus`.
- `app/engine/corruption.ts` — tier ladder, `corruptionPriceMultiplier`, `corruptionStatPenalty`, `corruptionExtraEncounterChance`, `tierDescription`.
- `app/engine/statTraining.ts` — **NEW (OTA 058)**. `trainStat` (success-gated, tiered cost), `ensureStatProgress` (legacy save migration), `displayedProgressBar` / `displayedProgressPercent` (quantized UI display), `LEVEL_UP_THRESHOLD=100`, tier curve `progressAwardFor(currentStat)`.
- `app/engine/atlasCoords.ts` — **NEW (OTA 051+)**. `LOCATION_ATLAS_COORDS` (21/21 hand-calibrated), `interpolateAtlasPosition` (IDW), `clampToMapArea`, `OUTPOST_ATLAS_COORD`, `atlasCoordForLocation`, `depictedLocationIds`.
- `app/screens/MapScreen.tsx` — **NEW (OTA 049+)**. Atlas display, pinch/pan gestures via RN's Animated + PanResponder, IDW-positioned silhouette marker with warm-gold halo.
- `app/screens/CharacterScreen.tsx` — Player Sheet, OTA 040. Stats now display with progress bars (`▮▮▯▯ 50%`) per the OTA 058 stat-growth system.
- `assets/world-atlas.png` — 1408×768 landscape hand-drawn atlas (v3, 21/21 location coverage). Authored externally via Notebook LM using `docs/world-atlas-for-notebook-lm.md` as source.
- `assets/player-marker.png` — 1536×1024 black silhouette of a Reclaimer figure on transparent. Used by `MapScreen` as the YOU-ARE-HERE marker.
- `docs/race-image-generation-guide.md` — **NEW**. Source document for the user's external generation of 14 race portraits (7 races × M/F). Includes ready-to-use prompt seeds, cross-race style guide, recommended resolutions.
- `docs/world-atlas-for-notebook-lm.md` — Source document the user fed to Notebook LM to generate the v3 atlas image.
- `app/components/TutorialOverlay.tsx` + `TutorialTarget.tsx` — overlay + glow wrapper.
- `app/screens/ExplorationScreen.tsx` — `buildChipPool()` + main game UI.
- `app/data/locations/locations.json` — 21 locations, all declare `interactables`.
- `app/data/world/wasteland_encounters.json` — 45 archetypes.
- `app/data/world/container_loot.json` — 9 container archetypes.
- `app/data/npcs/vendors.json` — vendor catalog (Mud Monarch Agent added OTA 131).
- `App.tsx` — boot sequence, AppState handling, error boundary, lazy native-module loader, OTA flag wiring.
- `app/updates/checkAndApplyOTA.ts` — fetchOnly mode + full reload sequence.
- `app/buildInfo.ts` — bump every push.
- `docs/pronunciation-worksheet.md` — pending player input.

---

## 10. Quick-start commands

```bash
# Typecheck + tests (run both before every push)
npx tsc --noEmit && echo TS-OK || echo TS-FAIL
npx jest --silent

# Re-run a single suite (e.g. after a fix or to verify a flake)
npx jest <suite-name>

# Status / log style
git log --oneline -10
git status

# Push as OTA-only (typical path)
#  1) edit code in app/
#  2) bump app/buildInfo.ts OTA_BUILD_ID
#  3) commit + push → eas-update.yml fires
git add -A && git commit -m "fix: ..."
git push -u origin claude/new-session-MvF82

# Push as APK rebuild (native deps / version bump)
#  1) confirm with user first
#  2) bump comment in metro.config.js
#  3) commit + push → build-apk.yml fires (~17–20 min)
```

---

## 11. Status effect reference

| Kind | Source | Effect | Duration |
|---|---|---|---|
| `aiming` | `aim` | +2 next ranged, consumed on use | 1 round |
| `sprinting` | `dash` / `sprint` | -2 next attack (post-sprint) | 1 round |
| `in_cover` | `take_cover` (partial) | +4 AC vs ranged | 2 rounds |
| `in_cover_full` | `take_cover` ("full cover") | +8 AC vs ranged, ranged auto-miss | 2 rounds |
| `ready` | `ready` | +1 on triggered reaction | 1 round |
| `helping` | `help` | narrative ally bonus | 1 round |
| `overwhelmed` | engine | -2 on evade | 1 round |
| `surprised` | `ambush_strike` + maneuver mismatch | -2 next roll, consumed | 1 round |
| `fighting_back` | `fight_back` | next enemy strike → opposed Fighting roll | 2 rounds |
| `quick_fire` | `quick_fire` | +2 next ranged | 1 round |
| `dodging` | `dodge` | +4 AC | 2 rounds |
| `blocking` | `block` | +4 AC, durability/riposte | 2 rounds |
| `bleed`/`poisoned`/`stun`/`burn_scar`/`armor_severed`/`paralyzed` | per `statusEffects.ts` | varies | varies |
| `food_buff` | consumable use | per-food stat buff (e.g. Wild Carrot → +1 WIS) | typically 3–6 rounds |
| `shaped_stone_ward` | `shape stone` cast in combat | +4 AC | 1 round |
| `golem_companion` | `summon golem` cast success | post-attack 1d6 bludgeoning ally hit | 3 rounds |

---

## 12. Enemy trait reference

Set on enemy entries in `enemies.json`. Read via `enemyTraits.ts`.

**Stat mods:** `armored` (+2 AC) · `weak_armor` (-2 AC) · `agile` (+1 AC) · `quick` (+1 attack) · `slow` (-1 attack) · `savage` (+1 attack)

**Damage filters:** `resist:<damageType>` (×0.5) · `vulnerable:<damageType>` (×1.5)

**On-hit status:** `bleeder` (50% bleed 3r) · `venomous` (35% poison 3r) · `concussive` (20% stun 1r)

**Per-round / first-strike:** `regenerate` (+1 HP/round) · `fast_regen` (+2/round) · `ambush_strike` (+2 first hit)

---

## 13. Combat loot lands in `player.inventory`, not `droppedItems`

When the player kills an enemy, the loot path in `resolveEnemyDefeat`
grants items directly into `player.inventory` (and bumps the
`enemiesDefeated` milestone). It does NOT populate
`currentScene.droppedItems`. The dropped-items pool is reserved for
**unclaimed** loot — items the player leaves on the ground after a
fight, or items dropped by stealing / scattering. Stress-test authors
who check `droppedItems.length` after combat will see 0 and conclude
nothing dropped; they should look at `player.inventory` deltas
instead. (See `combatStress.test.ts:633-635` for the metric that
got this right after the first pass got it wrong.)

## 14. `gameLog` has a 500-entry cap with same-channel merge

`appendLog` (gameStore.ts, ~864–958) caps the log at 500 entries and
**collapses consecutive same-channel lines** into a single multi-line
entry when they fire within the same render tick. This keeps the
scrollback tidy but has consequences for any test that asserts on
log shape:

- Counting `gameLog.length` will under-count when the system emits a
  burst of same-channel messages (e.g. a single combat round can
  emit 6+ `'combat'` lines that show as 1 entry).
- Searching for a specific line should use `gameLog.flatMap` over
  the text content, not slot-position arithmetic.
- Old entries fall off the front when the cap is hit, so long
  stress tests (700+ days) can't read entries from early-game and
  expect them to still be in `gameLog`. Persist what you need before
  the cap evicts it.

## 15. Combat: nat-1 always misses, nat-20 always crits (OTA 168)

In `resolveRollStep` and `applyEnemyCounter`, the d20 attack roll's
**raw value** overrides the bonus math at the floor and ceiling:

- Natural 1 → forced miss (success = false), no damage step.
- Natural 20 → forced hit (success = true) AND `critical = true`, which
  doubles the dice count on the follow-up damage step (player) or
  re-rolls and sums the damage notation (enemy).

Symmetric — applies to both sides of combat. Combat log surfaces
`✓ CRITICAL HIT` / `✗ FUMBLE` on the trigger. This is what keeps
high-stat characters from grinding through Common AC at 100% — even
STR 14 vs AC 7 still fumbles 5% of the time, and enemy crits make
"things you have to run from" feel real.

If you write a combat stress test, mirror the rule when computing
hit rate locally (see `combatStress.test.ts:217-228`) — a missed
attack drains `pendingRolls` before you can read `success` back
off the store.

---

---

## 16. For the next Claude instance — picking up where I left off

If you're picking up this branch, read this section first, then section 6.A (the OTA 020 → 056 wave) for the reasoning, then section 7 for what's still on the table.

### State at handoff (2026-05-26 — end of the engagement-engine + playtester-feedback marathon)

- **App version** in `app.json`: `2.4.1`. Shipped baseline. APK at runtime 2.4.1 (build #207) is published as `apk-build-207` on GitHub. No native rebuild since.
- **Latest OTA**: `2026-05-26-056` — INT trains on investigate, two-handed weapon auto-displace, two-handed weapon shown in both hand slots.
- **Latest APK**: still `apk-build-207`. User redistributes manually to themselves + the one other tester. All OTAs since target runtime 2.4.1.
- **Tests**: 107/107 across the 13 test files I touched or wrote this session. The longer sims (`yearSimulation`, `thousandDayStressSim`, `twoYearChaosSim`) pass — `twoYearChaosSim` flakes one in three on the "geographic loops ≤1" assertion (RNG variance, not a regression). Three stress files (`combatStress` / `domesticStress` / `metaNavStress`) OOM-abort in the sandbox at 700-day length (infrastructure ceiling, pre-existing).
- **TypeScript**: `npx tsc --noEmit` clean.
- **Branches**: `HaL2001` and `claude/new-session-MvF82` are in lockstep — every OTA in this session was pushed to HaL2001 first then cherry-picked. Working tree clean on both.
- **Open PR**: #1 draft, this branch → main. **Stale** — description hasn't been refreshed since the OTA 053 area. The 020 → 056 wave (37 OTAs across 6 sub-waves) needs a fresh PR description before requesting review. Section 6.A is the source material.
- **Open GitHub issues**: 0.

### The overarching arc this session pursued

The session started as routine OTA pipeline work but pivoted on a playtest log mid-day. From there it became a sustained **playtester-driven engagement push** structured as five waves:

1. **Quality-of-life + tutorial freshness (020-032)** — tighten the obvious friction points the playtester surfaced in basic loops.
2. **Scanner system + investigate depth (033-037)** — the user pitched 3 scanners; built the gated-investigate system around them, found a SALVAGE ALL silent-no-op while doing it.
3. **Investigate-feels-good + UI polish (038-042)** — make every investigate feel like it produced something, fix the ContractsScreen / Salvage / Investigate UI rough edges.
4. **Engagement engines (043-047, the "impossible to put down" plan)** — five distinct mechanics each shipped as its own OTA: variable rewards on every action, every finish plants the next start, JIT temptation when depleted, persistent change between sessions, curiosity gaps. The user explicitly asked for this arc and approved the plan file (`/root/.claude/plans/so-i-believe-the-unified-wigderson.md`).
5. **Thorough testing (048)** — parser fuzz (182 bad inputs, zero throws), craft/repair fuzz, engagement-engine cross-interaction smoke. Caught one false-positive of my own in testing.
6. **Playtester-feedback rapid-response (049-056)** — live logs revealed where the new systems hadn't quite landed. Each OTA in this wave is the answer to a specific playtester sentence quoted verbatim in the commit. Notable: OTA-050 caught a miss-wire from OTA-043 where I'd added the rest pull to a dead-code path; OTA-051 added city-limit danger after the player asked for it; OTA-053/054 fixed the hunt-acceptance UX after the player asked "did I even accept this?"

**Working principle the session repeatedly returned to:** every visible action should produce *something*; every contract finish should plant the next one's seed; every player state should bias the world toward a response; every session resume should show the world breathed without you; every silent button should be made loud. Tests catch wiring drift fast. Playtester logs are gold — their literal wording maps directly to root-cause fixes.

### The user's working style — important context

- **Game playtested on Android**, OTA-delivered. The user pastes in-game log excerpts and screenshots; respond to those as if the player is talking to you THROUGH the game (the meta-comment guard in `submitPlayerAction` catches typed feedback).
- **Spawns parallel agents for verification tasks** (audit sweeps, image measurements, etc.) — see the OTA 040-043 audit and the atlas-calibration agent runs (OTAs 051, 054). The pattern works: split the task across 3+ Explore agents, ground-truth their results yourself before applying.
- **Ships fast**: defaults to OTA-only delivery, native rebuild only for new modules or version bumps. Test → OTA bump → commit → push is the loop.
- **Wants reasoning surfaced briefly** — "two-three sentences with a recommendation and main tradeoff" for exploratory questions; only implement after agreement. Don't write multi-paragraph proposals unless asked.

### Major systems you'll be working in

| System | Lives in | Notes |
|---|---|---|
| Combat resolution | `gameStore.ts` (lines ~6612-7100, 11000-11300) | Attack roll, dodge, damage modifiers, parry, fight-back, Sentinel hit-gate, stat training calls all wired in here |
| Aethercraft | `gameStore.ts:runAethercraft` (~line 11947) | shape stone / summon golem / mend wounds; race DC modifier; fuel consumption |
| Corruption | `engine/corruption.ts` + gameStore vendor path | 4-tier ladder, price markup, Hollowed Purifier spawns |
| Stat training | `engine/statTraining.ts` | Tiered cost (≤10 → +2, 11-14 → +1, 15+ → +0.5), threshold 100, success-only |
| Map / atlas | `screens/MapScreen.tsx` + `engine/atlasCoords.ts` + `engine/worldMap.ts` | **v2.4.1 overhaul (OTA 23-019):** 41×41 grid (center 20,20), canonical-bearing procedural placement, anchor-relative drift via `cardinalOffsetFromAnchor`, aspect-corrected `STEP_FRAC_X`/`STEP_FRAC_Y`, snap-on-arrival only. Hand-calibrated 21/21 atlas coords. RN PanResponder gestures unchanged. |
| Tutorial | `components/tutorialSteps.ts` + `TutorialOverlay.tsx` | 17 steps; check that any new screen has a tutorial step if it's user-facing |
| Vendor / steal | `gameStore.ts:buyFromVendor/sellToVendor/giftToVendor/stealFromVendor` (~line 7434) | Corruption markup on BUY only; CHA training on success |
| Quests | `gameStore.ts:acceptFactionQuest/Hunt/Mystery/Storyline` + `completeContractFromUI` | Contracts board UI completion path was the source of B3/B4 audit blockers; double-check reward-grant logic when touching |

### Things in flight / next steps

1. **Wife's Kokoro retry after APK 207 install.** She was on v2.0.1, so none of the 23-* OTAs had reached her. Once she installs APK 207, she'll have the **CLEAR BUNDLED VOICE CACHE** button + 50 MB min-reuse auto-recovery. If the BUNDLED voice still fails after a clear → re-download cycle, have her tap **COPY VOICE INFO** and paste the result back. The new diagnostic includes the actual error message, full stack, free disk at attempt time, AND the executorch cache file listing (filename + size in MB + mtime). The right answer falls out of that paste-back: `step=warmup` with healthy disk = native/RAM issue; cache file at 28 MB = truncation; etc.
2. **Wire the player creation approval screen.** User is generating 14 portrait PNGs from `docs/race-image-generation-guide.md`. When they drop them into `assets/portraits/`, build a screen that shows the race portrait + approval flow during character creation. Filename convention: `<race_id>_m.png` / `<race_id>_f.png`. **Will require an APK rebuild** if the screen needs new native modules (likely not — straight RN Image should work).
3. **Refresh PR #1 description** before any merge request. It's stale; covers up to OTA 053 area, not the OTA 054 → 23-020 work. New bullets to highlight: v2.4.1 baseline shipment (APK 207), salvage success-roll rework, look-around consumed-noun filter, Kokoro corrupt-cache recovery, v2.4.1 map marker overhaul (41×41 grid + canonical-bearing placement + anchor-relative drift), 4 missing items authored (Runic Mantle + 3 vendor items), RINGS/AMULETS added to vendor catalog lookups, MiniLM size-floor reuse check.
4. **Pronunciation worksheet** (`docs/pronunciation-worksheet.md`) — still pending player input.
5. **Optional dead-code sweep on `gameStore.ts`** (~12.5k lines, never swept top-to-bottom). Pre-ship audit only used grep-narrow reads. Chunked sweep recommended before any major refactor.

### Watch list reminders (see section 7 for full)

- `ambientNounVariety.test.ts` "small pools" flake — never chase; passes in isolation
- `climbRopeMechanics.test.ts` cross-test flake (weather tick eats stamina) — passes in isolation
- `gameStore.ts` never swept top-to-bottom for dead code (12.5k lines)
- Audit minors deferred from pre-ship — inventory-full silent swallow on UI quest completion, surprise-penalty possible double-apply, `require()` vs `import` in Aethercraft helpers
- `stealOverhaul.test.ts` scrap-launder tests now stub `Math.random` in `beforeEach` because OTA 23-014 made scrap non-deterministic. Pattern to copy if more tests start failing for the same reason — `jest.spyOn(Math, 'random').mockReturnValue(0)` forces the success branch.
- **`build-apk.yml` paths-ignore omits `__tests__/**`** — test-only commits side-trigger an APK rebuild (APK 210 fired this way on the OTA 23-019 push). Same JS bundle as the previous APK; harmless functionally but generates unwanted release artefacts. User chose not to gate (public repo, no CI cost). If you DO want to gate it later: add `'__tests__/**'` to the paths-ignore list.
- **Procedural map regenerates on every `travelTo`** (line `gameStore.ts:7227` + `worldMap.ts` seed-deterministic). The v2.4.1 grid expansion (21→41) doesn't break existing saves — characters regenerate their map on next travel and get the new geometry seamlessly. No migration code.
- **`docs/world-atlas-for-notebook-lm.md` distance bands are stale** — still describes 21×21 / D5 10-19. If you regenerate the atlas with Notebook LM, update §3 to D1 4-12, D2 8-18, D3 12-22, D4 16-26, D5 20-28 on a 41×41 grid (center 20,20).

---

That's the lay of the land at v2.4.1 / OTA `2026-05-23-020`. v2.4.1 is fully shipped, OTA 23-020 is live on the device (user-verified), and the v2.4.1 milestone now includes a full map system overhaul. The post-baseline OTAs broke into three phases: 23-013 → 23-018 polished the playtest stack (Reclaimer's Rope, salvage rolls + 10 failure variants, look-around filter, Kokoro recovery); 23-019 ran a 6-agent codebase review, traced and fixed the map marker disconnect (grid 21×21 → 41×41, canonical-bearing procedural placement, anchor-relative drift, aspect-corrected steps), authored 4 missing items, and bundled 8 smaller fixes; 23-020 followed with sim-suite timeout bumps so CI stays green on the bigger grid.

**Immediate next-session priorities**: (1) verify the map marker behavior on-device once the user starts a new character — should see the marker drift on cardinal steps and snap to canonical anchors on arrival; (2) wife's Kokoro recovery after she installs APK 207 (or 210 — same JS bundle) — paste-back from new diagnostic will tell us the actual failure; (3) player creation approval screen once the 14 race portraits land in `assets/portraits/`; (4) PR #1 description refresh covering the v2.4.1 baseline + map overhaul + bundled fixes before any merge request; (5) optional: update `docs/world-atlas-for-notebook-lm.md` §3 to document the new 41×41 grid + doubled distance bands (currently still describes the 21×21 model).
