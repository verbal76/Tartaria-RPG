/* ⚠⚠⚠ OTA-1830 — ROCKY.
 *
 * A memorial. He is not a quest, not a companion, and not a fight: a good dog
 * who wanders Tartaria, finds you once, sniffs you over and leaves you a single
 * reservation gemstone.
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

  test('1.2 ⚠ NON-HOSTILE: no enemy pool, no bandits, no provoke, no quest hook', () => {
    expect(ROCKY.enemyPool).toBeUndefined();
    expect(ROCKY.bandit_pool).toBeUndefined();
    expect(ROCKY.provoke).toBeUndefined();
    expect(ROCKY.quest_hook).toBeUndefined();
  });

  test('1.3 …and the resolved encounter spawns nothing that can fight', () => {
    const enc = rockyEncounter();
    expect(enc).toBeTruthy();
    expect(enc!.type).toBe('npc');
    expect(enc!.enemyName).toBeNull();
    expect(enc!.provoke).toBeNull();
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
  test('2.1 ⚠ he is NAMED, and the beat is the sniff then the gift', () => {
    const line = (ROCKY.npc_lines as string[])[0]!;
    expect(line).toContain('Rocky');
    expect(line).toMatch(/sniff/i);
    expect(line).toMatch(/reservation gemstone/i);
    expect(ROCKY.narration as string).toContain('ROCKY');
  });

  test('2.2 ⚠ EXACTLY ONE reservation gemstone — min and max are both 1', () => {
    const loot = ROCKY.loot as { name: string; min: number; max: number; kind: string }[];
    expect(loot).toHaveLength(1);
    expect(loot[0]!.name).toBe('Reservation Gemstone');
    expect(loot[0]!.min).toBe(1);
    expect(loot[0]!.max).toBe(1);
    expect(loot[0]!.kind).toBe('misc');
  });

  test('2.3 …and the resolved encounter rolls exactly one, on any die', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const enc = pickWastelandEncounter(groundFor('open'), {
        stepsSinceLastEncounter: 99,
        forceArchetype: 'rocky_memorial',
        rng: () => r,
      });
      expect(enc!.loot).toEqual(
        expect.objectContaining({ name: 'Reservation Gemstone', quantity: 1 }),
      );
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
    expect(first.line).toMatch(/gemstone/i);
    const later = resolveKeepsake(enc, ['rocky_memorial']);
    expect(later.spent).toBe(true);
    expect(later.line).toBe(enc.repeatLine);
    expect(later.line).not.toMatch(/gemstone/i);
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

  test('3.3 a repeat meeting has a warm, reward-free line to fall back on', () => {
    const repeat = ROCKY.repeat_line as string;
    expect(repeat).toContain('Rocky');
    expect(repeat).not.toMatch(/gemstone/i);
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

  test('5.2 ⚠⚠ THE GRANT IS GATED — a spent keepsake withholds the loot', () => {
    expect(store).toContain('!keep.spent');
  });

  test('5.3 ⚠⚠ AND THE PAYOUT IS RECORDED, so the second meeting knows', () => {
    expect(store).toContain('recordKeepsakePaid(st.worldMemory.onceLootPaid, enc.archetypeId)');
  });

  test('5.4 ⚠ THE LINE THE PLAYER READS comes from the same decision, not from the raw archetype', () => {
    // If the store logged enc.npcLine directly, a spent Rocky would still say
    // he is handing over a gemstone while handing over nothing.
    expect(store).toContain('keep.line');
  });

  test('5.5 ⚠⚠⚠ A FULL PACK MUST NOT BURN THE ONE CHANCE — the record is written only on an accepted grant', () => {
    // The record must sit inside the accepted-grant branch. If it were written
    // on any attempt, arriving with no room would spend Rocky's gemstone and
    // the player would never receive it.
    const at = store.indexOf('recordKeepsakePaid(st.worldMemory.onceLootPaid');
    expect(at).toBeGreaterThan(-1);
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
