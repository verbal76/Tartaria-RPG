/* ⚠⚠⚠ OTA-1830 — ROCKY.
 *
 * A memorial. He is not a quest, not a companion, and not a fight: a good dog
 * who wanders Tartaria, finds you, sniffs you over and leaves you a single
 * Resurrection Gem — and then keeps finding you, with nothing left to give but
 * himself.
 *
 * ⚠⚠⚠ THIS HEADER USED TO SAY "reservation gemstone". That was a mishearing of
 * RESURRECTION that survived every review in this file and reached a published
 * build, where it granted an inert misc row that no catalogue contains. The
 * owner caught it on his own phone. OTA-1833 is the correction; the tests below
 * were amended rather than replaced, so the wrong claim stays legible next to
 * the right one.
 *
 * ⚠⚠ THE AUTHORITY, and why it is this one. Rocky rides the EXISTING
 * data-driven wasteland-encounter system (`app/data/world/wasteland_encounters
 * .json` → `pickWastelandEncounter`), whose own header says "adding a new
 * encounter type is a JSON edit — engine stays generic." The other candidate,
 * `wanderers.ts`, is a PEOPLE system: temperament, parley, INTIMIDATE, faction
 * standing, goods to shake loose. Putting a dog in it would have dragged all of
 * that behind him. An `npc`-type archetype spawns no enemy, starts no combat and
 * blocks nothing — which is the whole brief.
 *
 * ⚠ THE ANTI-FARM SPLIT IS THE DESIGN. `once_per_save_loot` gates the GRANT,
 * never the PICK. Gating the pick would have retired Rocky after one meeting;
 * gating the grant lets him keep finding you for the rest of the run with
 * nothing left to give but himself.
 *
 * ROCKY WAS A GOOD BOY.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import encounterData from '../app/data/world/wasteland_encounters.json';
import {
  pickWastelandEncounter, keepsakeAlreadyPaid, resolveKeepsake, recordKeepsakePaid,
} from '../app/engine/wastelandEncounters';
import type { Location } from '../app/engine/types';

const DATA = encounterData as Record<string, Record<string, unknown>>;
const ROCKY = DATA.rocky_memorial!;

/** Source with comments stripped, so a pin reads CODE and never prose. */
const codeOnly = (p: string[]): string =>
  readFileSync(join(__dirname, '..', ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

/** A location wearing one of Rocky's matcher tags. */
const groundFor = (tag: string): Location => ({
  id: `loc_${tag}`,
  name: `Test ${tag}`,
  description: 'test ground',
  tags: [tag],
} as unknown as Location);

/** Force the picker to hand back Rocky, the way a directional find does. */
const rockyEncounter = (tag = 'open') =>
  pickWastelandEncounter(groundFor(tag), {
    stepsSinceLastEncounter: 99,
    forceArchetype: 'rocky_memorial',
    rng: () => 0,
  });

describe('OTA-1830 §1 — Rocky exists, and he is a dog, not a fight', () => {
  test('1.1 he is authored in the shared encounter data', () => {
    expect(ROCKY).toBeTruthy();
    expect(ROCKY.type).toBe('npc');
  });

  test('1.2 ⚠ HE NEVER STARTS IT: no enemy pool, no bandits, no quest hook', () => {
    /* ⚠⚠ OTA-1833 NARROWED THIS CLAIM, and the narrowing is the point. It used
     * to assert `provoke` was undefined too — i.e. that Rocky could not fight
     * under any circumstance. The owner's ruling is sharper than that: he is
     * not a fight you can walk into, but he is also not something you may hit.
     * Raise a hand and he defends himself. So the claim that survives is the
     * one that actually matters — NOTHING ABOUT HIM CAN OPEN A FIGHT. No pool
     * to draw a foe from, no bandits riding along, no hook. Only the player can
     * start it, and §5 of ota1833 pins what happens when they do. */
    expect(ROCKY.enemyPool).toBeUndefined();
    expect(ROCKY.bandit_pool).toBeUndefined();
    expect(ROCKY.quest_hook).toBeUndefined();
  });

  test('1.3 …and meeting him spawns nothing — the scene stays empty', () => {
    const enc = rockyEncounter();
    expect(enc).toBeTruthy();
    expect(enc!.type).toBe('npc');
    // no body is placed by the meeting itself; provoke is armed, not fired
    expect(enc!.enemyName).toBeNull();
    expect(enc!.questHook).toBeNull();
  });

  test('1.4 ⚠ HE WANDERS — eligible on several biomes, not pinned to one tile', () => {
    const matchers = ROCKY.matchers as string[];
    expect(matchers.length).toBeGreaterThanOrEqual(4);
    for (const tag of matchers) {
      expect(rockyEncounter(tag)).toBeTruthy();
    }
  });

  test('1.5 he is rare — well below the common archetype weight', () => {
    const weights = Object.values(DATA)
      .filter((v) => v && typeof v === 'object' && 'type' in v)
      .map((v) => v.weight as number);
    const median = weights.slice().sort((a, b) => a - b)[Math.floor(weights.length / 2)]!;
    expect(ROCKY.weight as number).toBeLessThanOrEqual(median);
    expect(ROCKY.weight as number).toBeGreaterThan(0);
  });
});

describe('OTA-1830 §2 — the meeting, and exactly one gemstone', () => {
  /* ⚠⚠⚠ OTA-1833 CORRECTED THIS SECTION. It used to assert a "Reservation
   * Gemstone" — a mishearing of RESURRECTION that reached a live build. No such
   * item exists in the catalogue, so what shipped handed the player an inert
   * misc row. The real thing is a Resurrection Gem: an install-wide counter in
   * saveSystem's GlobalStash, the one currency that cheats death, and not an
   * inventory item at all. These tests now read the thing the game has. */
  test('2.1 ⚠ he is NAMED, and the beat is the sniff then the gift', () => {
    const line = (ROCKY.npc_lines as string[])[0]!;
    expect(line).toContain('Rocky');
    expect(line).toMatch(/sniff/i);
    expect(line).toMatch(/resurrection gem/i);
    expect(line).not.toMatch(/reservation/i);
    expect(ROCKY.narration as string).toContain('ROCKY');
  });

  test('2.1a ⚠⚠ HE IS THE DOG IN THE PHOTOGRAPH — butterscotch pitbull, black harness', () => {
    // ⚠ the full description is pinned in ota1833 §4, including the Texas mark.
    const n = ROCKY.narration as string;
    expect(n).toMatch(/butterscotch/i);
    expect(n).toMatch(/pitbull/i);
    expect(n).toMatch(/black harness/i);
    expect(n).not.toMatch(/grey around the muzzle/i);
  });

  test('2.2 ⚠ EXACTLY ONE Resurrection Gem, and NO loot row at all', () => {
    expect(ROCKY.keepsake_gem).toBe(1);
    // ⚠ a gem is not a pack item. Authoring one as loot is what shipped broken.
    expect(ROCKY.loot).toBeUndefined();
  });

  test('2.3 …and the resolved encounter carries exactly one, on any die', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const enc = pickWastelandEncounter(groundFor('open'), {
        stepsSinceLastEncounter: 99,
        forceArchetype: 'rocky_memorial',
        rng: () => r,
      });
      expect(enc!.keepsakeGem).toBe(1);
      expect(enc!.loot).toBeNull();
    }
  });

  test('2.4 the encounter stays SMALL — one line, no cutscene', () => {
    expect((ROCKY.npc_lines as string[]).length).toBe(1);
    expect(ROCKY.lore_note).toBeUndefined();
  });
});

describe('OTA-1830 §3 — the gemstone cannot be farmed', () => {
  test('3.1 ⚠ THE ANTI-FARM FLAG is set on the archetype', () => {
    expect(ROCKY.once_per_save_loot).toBe(true);
    expect(rockyEncounter()!.oncePerSaveLoot).toBe(true);
  });

  test('3.2 ⚠ …and it gates the GRANT, not the PICK — he still comes back', () => {
    /* The picker knows nothing about what has been paid; it has no parameter
     * for it. That is the proof that a spent gemstone cannot retire Rocky:
     * the same call keeps returning him, and only the caller withholds loot. */
    for (let i = 0; i < 5; i += 1) expect(rockyEncounter()).toBeTruthy();
  });

  /* ⚠⚠ THESE FOUR ARE THE LOAD-BEARING ONES. Everything above proves the DATA;
   * this proves the RULE that withholds the second gemstone. */
  test('3.2a ⚠ the first meeting pays: nothing recorded yet → not already paid', () => {
    const enc = rockyEncounter()!;
    expect(keepsakeAlreadyPaid(enc, undefined)).toBe(false);
    expect(keepsakeAlreadyPaid(enc, [])).toBe(false);
  });

  test('3.2b ⚠ THE FARM IS CLOSED: once recorded, every later meeting withholds', () => {
    const enc = rockyEncounter()!;
    const paid = ['rocky_memorial'];
    for (let i = 0; i < 10; i += 1) expect(keepsakeAlreadyPaid(enc, paid)).toBe(true);
  });

  test('3.2c a pre-feature save reads as "nothing paid" and still pays once', () => {
    // undefined is what an older character carries; it must not throw or block
    expect(keepsakeAlreadyPaid(rockyEncounter()!, undefined)).toBe(false);
  });

  test('3.2d ⚠ the rule is SCOPED — another archetype\'s payout does not spend Rocky\'s', () => {
    expect(keepsakeAlreadyPaid(rockyEncounter()!, ['some_other_keepsake'])).toBe(false);
    // and an ordinary encounter is never withheld, whatever has been paid
    const other = pickWastelandEncounter(groundFor('mud'), {
      stepsSinceLastEncounter: 99, forceArchetype: 'wandering_drifter', rng: () => 0,
    })!;
    expect(keepsakeAlreadyPaid(other, ['rocky_memorial', 'wandering_drifter'])).toBe(false);
  });

  test('3.2e ⚠ THE CALLER\'S OWN ENTRY POINT: resolveKeepsake picks the right line', () => {
    const enc = rockyEncounter()!;
    const first = resolveKeepsake(enc, undefined);
    expect(first.spent).toBe(false);
    expect(first.line).toBe(enc.npcLine);
    expect(first.line).toMatch(/resurrection gem/i);
    const later = resolveKeepsake(enc, ['rocky_memorial']);
    expect(later.spent).toBe(true);
    expect(later.line).toBe(enc.repeatLine);
    expect(later.line).not.toMatch(/resurrection gem/i);
  });

  test('3.2f recording a payout is idempotent — he is listed once, not once per meeting', () => {
    let paid = recordKeepsakePaid(undefined, 'rocky_memorial');
    for (let i = 0; i < 5; i += 1) paid = recordKeepsakePaid(paid, 'rocky_memorial');
    expect(paid.filter((id) => id === 'rocky_memorial')).toHaveLength(1);
  });

  test('3.2g ⚠ UNRELATED SAVE STATE IS UNTOUCHED — other paid ids survive', () => {
    const paid = recordKeepsakePaid(['some_other_keepsake'], 'rocky_memorial');
    expect(paid).toContain('some_other_keepsake');
    expect(paid).toContain('rocky_memorial');
    expect(paid).toHaveLength(2);
  });

  test('3.3 ⚠ AFTER THE GEM HE STILL COMES, AND JUST WANTS A SCRATCH', () => {
    // Owner ruling 2026-09-17: "after the gem, he just watches and wants a
    // scratch or a petted." So the repeat line must promise nothing and ask
    // for something — it is the whole reason the gate is on the grant.
    const repeat = ROCKY.repeat_line as string;
    expect(repeat).toContain('Rocky');
    expect(repeat).not.toMatch(/gem|reservation/i);
    expect(repeat).toMatch(/scratch|ears|lean/i);
    expect(rockyEncounter()!.repeatLine).toBe(repeat);
  });
});

describe('OTA-1830 §4 — nothing else in the world moved', () => {
  test('4.1 every other archetype is untouched by the new fields', () => {
    const others = Object.entries(DATA)
      .filter(([k, v]) => k !== 'rocky_memorial' && v && typeof v === 'object' && 'type' in v);
    expect(others.length).toBeGreaterThan(40);
    for (const [, v] of others) {
      expect(v.once_per_save_loot).toBeUndefined();
      expect(v.repeat_line).toBeUndefined();
      expect(v.keepsake_gem).toBeUndefined();
    }
  });

  test('4.2 ⚠ the flags DEFAULT OFF, so no existing encounter changed behaviour', () => {
    const other = pickWastelandEncounter(groundFor('mud'), {
      stepsSinceLastEncounter: 99,
      forceArchetype: 'wandering_drifter',
      rng: () => 0,
    });
    expect(other).toBeTruthy();
    expect(other!.oncePerSaveLoot).toBe(false);
    expect(other!.repeatLine).toBeNull();
    expect(other!.keepsakeGem).toBe(0);
  });

  test('4.3 Rocky did not displace anybody — the roster only grew', () => {
    const count = Object.values(DATA).filter((v) => v && typeof v === 'object' && 'type' in v).length;
    expect(count).toBeGreaterThanOrEqual(51);
  });
});

describe('OTA-1830 §5 — the rule is WIRED, not merely written', () => {
  /* ⚠⚠⚠ THE HOLE THIS SECTION EXISTS TO CLOSE. Everything above proves the data
   * and the pure rule. None of it proves the STORE CALLS the rule — and if the
   * store did not, all twenty-two tests above would still be green while Rocky
   * handed out a gemstone every single meeting, forever. That is the exact shape
   * of hole OTA-1828's negative control caught in its own suite (a style nobody
   * applied still passed), so it gets pinned here rather than assumed.
   *
   * ⚠⚠ THESE READ CODE, NOT PROSE. codeOnly strips comments first, so a
   * reworded explanation cannot break them and a deleted call cannot hide
   * behind one — the failure mode check:quotedpins exists to ban.
   */
  const store = codeOnly(['app', 'state', 'gameStore.ts']);

  test('5.1 ⚠ THE DECISION IS ASKED FOR — the store resolves the keepsake against what is paid', () => {
    expect(store).toContain('resolveKeepsake(enc, get().worldMemory.onceLootPaid)');
  });

  test('5.2 ⚠⚠ THE GRANT IS GATED — a spent keepsake withholds the payout', () => {
    expect(store).toContain('!keep.spent');
  });

  test('5.2a ⚠⚠⚠ OTA-1833 — THE GEM IS ACTUALLY GRANTED, through the one real path', () => {
    // ⚠ OTA-1850 — the one real path is now `gemsAfterGrant` against the
    // character's own balance, because gems belong to the character who earned
    // them. The claim is the same one it always was: a keepsake that only
    // logged a line would read as generous and change nothing.
    expect(store).toContain('gemsAfterGrant(get().player, keep.gem)');
    expect(store).toContain('resurrectionGems: t');
  });

  test('5.3 ⚠⚠ AND THE PAYOUT IS RECORDED, so the second meeting knows', () => {
    expect(store).toContain('recordKeepsakePaid(st.worldMemory.onceLootPaid, enc.archetypeId)');
  });

  test('5.4 ⚠ THE LINE THE PLAYER READS comes from the same decision, not from the raw archetype', () => {
    // If the store logged enc.npcLine directly, a spent Rocky would still say
    // he is handing over a gemstone while handing over nothing.
    expect(store).toContain('keep.line');
  });

  test('5.5 ⚠⚠⚠ THE PAYOUT IS NEVER BURNED BEFORE IT LANDS — both keepsake paths', () => {
    /* ⚠⚠ OTA-1833 SPLIT THIS TEST, because there are now two payout paths and
     * they fail in different ways. It used to assume one, and correctly went
     * red the moment a second appeared.
     *
     *  LOOT path  — the risk is a FULL PACK. grantItem can refuse, so the
     *               record must sit inside the accepted branch or arriving with
     *               no room spends the keepsake and hands over nothing.
     *  GEM path   — the risk WAS a FAILED STASH WRITE. Gems cannot be refused
     *               for room, but `addResurrectionGems` was async and could
     *               lose its write, so the record had to sit INSIDE the `.then`
     *               and not beside the call. Recorded-but-not-banked cost the
     *               player their one gem permanently, and silently.
     *
     * ⚠⚠⚠ OTA-1850 CLOSED THE GEM HAZARD BY SHAPE, so this half of the test
     * gets STRICTER rather than looser. The gem is character-bound now: it is
     * a field on the same record that carries `worldMemory`, so the balance and
     * the paid-mark are assigned in ONE `set` and written by ONE `persist()`.
     * There is no async gap to sit on the right side of — and therefore no
     * ordering to get wrong. Asking for a `.then` here would now be asking for
     * the weaker arrangement back. Instead the test asks for the thing that
     * makes the hazard impossible: the gem count and the paid record must be in
     * the SAME state update, with nothing closing it between them. */
    const records = [...store.matchAll(/recordKeepsakePaid\(st\.worldMemory\.onceLootPaid/g)].map((m) => m.index!);
    expect(records).toHaveLength(2);

    // the GEM record shares one `set` with the gem it guards
    const gemCall = store.indexOf('gemsAfterGrant(get().player, keep.gem)');
    expect(gemCall).toBeGreaterThan(-1);
    const gemRecord = records.find((i) => i > gemCall && i < gemCall + 400);
    expect(gemRecord).toBeDefined();
    const between = store.slice(gemCall, gemRecord!);
    // the balance lands in the same object literal as the record …
    expect(between).toContain('resurrectionGems: t');
    // … and that update is never resolved asynchronously, which is the point
    expect(between).not.toContain('.then(');
    expect(between).not.toContain('await ');

    // the LOOT record still sits inside the accepted-grant branch
    const at = records[records.length - 1]!;
    const accepted = store.lastIndexOf('grantResult.accepted > 0', at);
    expect(accepted).toBeGreaterThan(-1);
    // nothing closes the branch between the guard and the record
    expect(store.slice(accepted, at)).not.toContain('}\n');
  });

  test('5.6 the persistence flag is the narrow one, on worldMemory, and optional for old saves', () => {
    const types = codeOnly(['app', 'engine', 'types.ts']);
    expect(types).toContain('onceLootPaid?: string[]');
  });
});
