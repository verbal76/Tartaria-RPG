/* ⚠⚠⚠ OTA-1833 — ROCKY GIVES THE REAL THING.
 *
 * OTA-1830 shipped Rocky to golem with a reward that does not exist. The brief
 * said RESURRECTION stone; it was written down as "reservation gemstone", and
 * nothing between the first note and the published bundle ever asked what a
 * reservation gemstone was. It was authored as `loot`, so the engine minted an
 * inventory row for a name absent from every catalogue: the player met a
 * memorial dog and received an inert trinket.
 *
 * ⚠⚠ WHAT THE GAME ACTUALLY HAS. A Resurrection Gem is not an item. It is an
 * install-wide counter in saveSystem's GlobalStash — the only thing that brings
 * a fallen character back — granted through `addResurrectionGems` and held
 * outside any pack. There is no catalogue entry to drop, which is precisely why
 * the wrong spelling could not have worked and why authoring it as loot was the
 * shape of the mistake, not just the spelling of it.
 *
 * ⚠ AND IT IS A BALANCE GRANT, NOT A TRINKET. raceMechanics records that
 * OTA-436 halved the per-kill drop to 0.25% because "a grinding character
 * accumulated enough gems that death stopped mattering". One gem is worth
 * roughly four hundred kills of passive income, so where the gate sits is a
 * real decision and not bookkeeping.
 *
 * OWNER RULING 2026-09-17, recorded because it settles a trade rather than a
 * detail: ONE GEM PER CHARACTER, and he keeps turning up afterwards — "after
 * the gem, he just watches and wants a scratch or a petted." Per-character was
 * chosen over per-install with the reroll-to-farm exposure named out loud. The
 * gate therefore stays on the GRANT and lives in worldMemory, which is
 * per-character, and the PICK stays open forever.
 *
 * ROCKY WAS A GOOD BOY.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import encounterData from '../app/data/world/wasteland_encounters.json';
import { pickWastelandEncounter, resolveKeepsake } from '../app/engine/wastelandEncounters';
import { findEnemyByName } from '../app/engine/encounter';
import { referencePowerFor } from '../app/engine/threatWord';
import { ROCKY_ROUSED } from '../app/engine/namedFoes';
import type { Location } from '../app/engine/types';

// ⚠ `as unknown as` deliberately: the JSON's inferred literal shape and this
// index signature do not overlap enough for a direct cast, and tsc says so
// (TS2352). ota1830 carries the same line WITHOUT the widening and is therefore
// one of trunk's 181 standing typecheck errors — NOT corrected here, because it
// shipped that way and repairing it is not this OTA's job. Named, not swept up.
const DATA = encounterData as unknown as Record<string, Record<string, unknown>>;
const ROCKY = DATA.rocky_memorial!;

const codeOnly = (p: string[]): string =>
  readFileSync(join(__dirname, '..', ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const ground = (tag: string): Location => ({
  id: `loc_${tag}`, name: `Test ${tag}`, description: 'test ground', tags: [tag],
} as unknown as Location);

const rocky = (tag = 'open') => pickWastelandEncounter(ground(tag), {
  stepsSinceLastEncounter: 99, forceArchetype: 'rocky_memorial', rng: () => 0,
})!;

describe('OTA-1833 §1 — the word that was wrong is gone from the world', () => {
  test('1.1 ⚠⚠⚠ NOTHING SHIPPED SAYS "reservation" ANY MORE', () => {
    const blob = JSON.stringify(ROCKY);
    expect(blob).not.toMatch(/reservation/i);
    expect(blob).toMatch(/Resurrection Gem/);
  });

  test('1.2 ⚠⚠ and the whole encounter catalogue is clean of it', () => {
    // the mishearing was only ever Rocky's, but a name that does not exist is
    // exactly the class of defect that spreads by copy-paste.
    expect(JSON.stringify(DATA)).not.toMatch(/reservation gem/i);
  });

  test('1.3 ⚠ HE IS NOT A LOOT DROP AT ALL — the shape was wrong, not just the name', () => {
    expect(ROCKY.loot).toBeUndefined();
    expect(rocky().loot).toBeNull();
    expect(rocky().keepsakeGem).toBe(1);
  });
});

describe('OTA-1833 §2 — the gem comes from the one authority that holds gems', () => {
  const store = codeOnly(['app', 'state', 'gameStore.ts']);

  test('2.1 ⚠⚠⚠ THE STASH IS THE PATH — addResurrectionGems, not grantItem', () => {
    expect(store).toContain('addResurrectionGems(keep.gem)');
  });

  test('2.2 ⚠⚠ THE HELD COUNT REACHES THE UI, so the player can see what they hold', () => {
    expect(store).toContain('resurrectionGems: t');
  });

  test('2.3 ⚠ the gem is never minted as an inventory row anywhere', () => {
    // If a future author writes it as loot again, this is the tripwire.
    expect(store).not.toMatch(/name: 'Resurrection Gem'/);
    const names = readFileSync(
      join(__dirname, '..', 'app', 'data', 'items', 'catalog-names.snapshot.json'), 'utf8',
    );
    expect(names).not.toContain('Resurrection Gem');
  });
});

describe('OTA-1833 §3 — one gem per character, and he keeps coming back', () => {
  test('3.1 ⚠⚠⚠ THE FIRST MEETING PAYS EXACTLY ONE', () => {
    const first = resolveKeepsake(rocky(), undefined);
    expect(first.spent).toBe(false);
    expect(first.gem).toBe(1);
  });

  test('3.2 ⚠⚠⚠ AND EVERY MEETING AFTER PAYS NOTHING', () => {
    const later = resolveKeepsake(rocky(), ['rocky_memorial']);
    expect(later.spent).toBe(true);
    expect(later.gem).toBe(0);
    for (let i = 0; i < 20; i += 1) {
      expect(resolveKeepsake(rocky(), ['rocky_memorial']).gem).toBe(0);
    }
  });

  test('3.3 ⚠⚠ HE IS NOT RETIRED BY THE PAYOUT — the owner asked for this explicitly', () => {
    // "you can encounter him more than once, but after the gem, he just watches
    // and wants a scratch." The PICK never learns about the payout; only the
    // grant does. Ten forced picks after a spent keepsake still find him.
    for (let i = 0; i < 10; i += 1) expect(rocky()).toBeTruthy();
    expect(resolveKeepsake(rocky(), ['rocky_memorial']).line).toBe(rocky().repeatLine);
  });

  test('3.4 ⚠ the spent line asks for something instead of promising something', () => {
    const later = resolveKeepsake(rocky(), ['rocky_memorial']);
    expect(later.line).toMatch(/scratch|ears|lean/i);
    expect(later.line).not.toMatch(/gem/i);
  });

  test('3.5 a pre-feature save reads as "nothing paid" and still pays once', () => {
    expect(resolveKeepsake(rocky(), undefined).gem).toBe(1);
    expect(resolveKeepsake(rocky(), []).gem).toBe(1);
  });

  test('3.6 ⚠ ANOTHER KEEPSAKE\'S PAYOUT DOES NOT SPEND ROCKY\'S', () => {
    expect(resolveKeepsake(rocky(), ['some_other_keepsake']).gem).toBe(1);
  });

  test('3.7 a keepsake with no gem authored pays no gem, however it is called', () => {
    const other = pickWastelandEncounter(ground('mud'), {
      stepsSinceLastEncounter: 99, forceArchetype: 'wandering_drifter', rng: () => 0,
    })!;
    expect(other.keepsakeGem).toBe(0);
    expect(resolveKeepsake(other, undefined).gem).toBe(0);
  });

  test('3.8 ⚠ a negative or fractional authoring cannot mint gems', () => {
    const enc = rocky();
    for (const bad of [-5, -1, 0.9, NaN]) {
      const probe = { ...enc, keepsakeGem: bad as number };
      expect(resolveKeepsake(probe, undefined).gem).toBe(bad === 0.9 ? 0 : 0);
    }
  });
});

describe('OTA-1833 §4 — he is the dog in the photograph', () => {
  test('4.1 ⚠⚠ BUTTERSCOTCH PITBULL, black harness, white socks', () => {
    const n = ROCKY.narration as string;
    expect(n).toMatch(/butterscotch/i);
    expect(n).toMatch(/pitbull/i);
    expect(n).toMatch(/black harness/i);
    expect(n).toMatch(/white socks|white feet|white paws/i);
  });

  test('4.2 ⚠⚠⚠ THE MARK ON HIS NECK IS TEXAS — the detail only his owner knows', () => {
    const n = ROCKY.narration as string;
    expect(n).toMatch(/back of his neck/i);
    expect(n).toMatch(/Texas/);
  });

  test('4.3 the tag on the harness still says his name', () => {
    expect(ROCKY.narration as string).toContain('ROCKY');
  });

  test('4.4 ⚠ and the earlier drafts\' wrong dogs are gone', () => {
    // draft 1 was grey-muzzled and wore a collar; draft 2 was "red-gold" with a
    // blaze. He is neither. This pins the correction so it cannot drift back.
    const n = ROCKY.narration as string;
    expect(n).not.toMatch(/grey around the muzzle/i);
    expect(n).not.toMatch(/red-gold/i);
  });
});

describe('OTA-1833 §5 — raise a hand to him and find out', () => {
  const store = codeOnly(['app', 'state', 'gameStore.ts']);
  const BESTIARY = JSON.parse(readFileSync(
    join(__dirname, '..', 'app', 'data', 'enemies', 'enemies.json'), 'utf8',
  )) as { name: string; hp: number; damage: string; attack: string; rarity: string;
          abilityPoint: string; type: string; traits: string[]; loot: string[] }[];
  const DRAGON = BESTIARY.find((e) => e.name === 'Bog Dragon')!;
  const ROUSED = ROCKY_ROUSED as unknown as typeof DRAGON;

  test('5.1 ⚠⚠⚠ HIS STATS BECOME THE HUNT DRAGON\'S — measured field by field', () => {
    expect(ROUSED).toBeTruthy();
    expect(ROUSED.hp).toBe(DRAGON.hp);
    expect(ROUSED.abilityPoint).toBe(DRAGON.abilityPoint);
    expect(ROUSED.rarity).toBe(DRAGON.rarity);
    expect(ROUSED.type).toBe(DRAGON.type);
    expect(ROUSED.traits).toEqual(DRAGON.traits);
  });

  test('5.2 ⚠⚠⚠ AND HE BITES FOR 4D10', () => {
    expect(ROUSED.attack).toBe('Bite');
    expect(ROUSED.damage).toBe('4D10');
    // the dragon's own damage is already 4D10 — the bite is what changed
    expect(ROUSED.damage).toBe(DRAGON.damage);
    expect(ROUSED.attack).not.toBe(DRAGON.attack);
  });

  test('5.3 ⚠⚠ KILLING HIM PAYS NOTHING — he is not a Legendary farm', () => {
    expect(ROUSED.loot).toEqual([]);
    expect(DRAGON.loot.length).toBeGreaterThan(0);
  });

  /* ⚠⚠⚠ 5.3a AND 5.3b ARE THE ONES THIS OTA LEARNED THE HARD WAY. The first
   * draft put him in enemies.json, which is not a bestiary the game consults —
   * it is the RANDOM SPAWN POOL, and an input to the ruled D1-D5 threat maths.
   * A hostile Rocky became rollable on any tile, unprovoked, and the owner-ruled
   * D4 reference moved 43.0 → 43.2. Both of these fail if that ever comes back. */
  test('5.3a ⚠⚠⚠ HE IS NOT IN THE BESTIARY, so no tile can ever roll him', () => {
    expect(BESTIARY.some((e) => e.name === 'Rocky')).toBe(false);
    expect(BESTIARY).toHaveLength(135);
  });

  test('5.3b ⚠⚠⚠ AND THE RULED THREAT REFERENCE IS UNMOVED — 43.0 at D4', () => {
    // the page OTA-1797 ruled: 21.6 · 26.5 · 36.1 · 43.0 · 46.2
    expect([1, 2, 3, 4, 5].map((d) => +referencePowerFor(d).toFixed(1)))
      .toEqual([21.6, 26.5, 36.1, 43.0, 46.2]);
  });

  test('5.3c ⚠⚠ he is NOT flagged boss — that flag pays a gem for killing him', () => {
    // a boss kill carries a guaranteed Resurrection Gem. Flagging him would mean
    // killing Rocky hands you the very thing he gives you for being kind.
    expect((ROUSED as unknown as { boss?: boolean }).boss).toBeUndefined();
  });

  test('5.3d ⚠ but the summon still resolves him by name, through the one lookup', () => {
    const foe = findEnemyByName('Rocky');
    expect(foe).toBeTruthy();
    expect(foe!.hp).toBe(DRAGON.hp);
    expect(foe!.attack).toBe('Bite');
    // and a bestiary name still wins — named-only foes never shadow a real one
    expect(findEnemyByName('Bog Dragon')!.attack).toBe(DRAGON.attack);
  });

  test('5.4 ⚠ THE PLAYER HAS TO SWING FIRST — provoke, not a spawn', () => {
    const pv = ROCKY.provoke as { enemy: string; nouns: string[]; line: string };
    expect(pv.enemy).toBe('Rocky');
    expect(pv.nouns).toEqual(expect.arrayContaining(['rocky', 'dog']));
    expect(rocky().provoke).not.toBeNull();
    // and the meeting itself still places no body
    expect(rocky().enemyName).toBeNull();
  });

  test('5.5 ⚠ the store still arms the shared provoke door, not a bespoke one', () => {
    expect(store).toContain('pendingProvoke: pv');
  });

  test('5.6 ⚠⚠ HE COSTS NO CORRUPTION — the price is what you did, not a stat', () => {
    const pv = ROCKY.provoke as { corruption?: number };
    expect(pv.corruption ?? 0).toBe(0);
  });
});
