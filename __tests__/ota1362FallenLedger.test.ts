// ⚠⚠ OTA-1362 — THE SHARED ROLL OF THE FALLEN: validator + merge rules.
//
// GOLEM LINE ONLY, by the owner's instruction — this ships nowhere else until
// he and one other player have run it on two golem APKs.
//
// The owner's design: a few players share their dead. Your fallen walk in their
// wastes as Hollowed revenants, theirs in yours, the pool grows and the world
// gets heavier; putting one down writes it to a separate roll naming the player
// it came from. The gameplay half already exists (`fallenRevenants.ts`). This
// suite covers the part that decides what a record from ANOTHER PHONE is
// allowed to be.
//
// ⚠⚠ THE THREAT IS NOT A VIRUS — IT IS ITEM INJECTION.
// Owner asked for "a hash check to check for viruses". There's no virus vector:
// the payload is JSON that only becomes a FallenHero, never code. But a hash
// proves bytes arrived intact and a signature proves who sent them — neither
// says the data is SANE, because whoever writes a hostile record writes its
// hash too. The live hole is `reconstructFallenPiece`, which spreads a gear
// object wholesale into a real InventoryItem: a hand-edited record can carry a
// `golemCore`, a Legendary rarity, or a `quest` tag that wedges the piece into
// the save as undroppable — and reclaiming the revenant's weapon makes it
// permanent. The last test here walks that exact attack end to end.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  sanitizeForeignFallen,
  sanitizeForeignGearPiece,
  sanitizeRestRecord,
  parseLedgerPayload,
  mergeFallen,
  mergeRests,
  unrestedFallen,
  fallenKey,
  restKey,
  fallenTitle,
  restRollLine,
  isRestedHere,
  FOREIGN_FALLEN_CAP,
  MAX_CLOCK_SKEW_MS,
  type ForeignFallen,
  type RestRecord,
} from '../app/engine/fallenLedger';
import {
  reconstructFallenPiece,
  revenantFromFallen,
  revenantIntroBeats,
  revenantDefeatLines,
  revenantName,
} from '../app/engine/fallenRevenants';
import { isAetherkin } from '../app/engine/aetherkin';
import { isRevenant } from '../app/engine/fallenRevenants';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CONCEPTS = require('../app/data/lore/concepts.json') as { concepts: { id: string; keywords: string[]; title: string; answer: string }[] };

const NOW = 1_760_000_000_000;
const THEM = { player: 'Sasmooch', installId: 'install-them' };
const ME = 'install-me';

/** A well-formed foreign record, as an honest sender would write it. */
function goodFallen(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Francis',
    raceName: 'Aetherborn',
    epitaph: 'The mud took the last of the light.',
    locationName: 'Mud Flats',
    kills: 42,
    corruption: 'Tainted',
    hours: 96,
    ts: NOW - 60_000,
    origin: { ...THEM },
    gear: [{ name: "Reclaimer's Cord", kind: 'weapon', rarity: 'Rare', tags: ['weapon'], slot: 'main' }],
    ...over,
  };
}

describe('OTA-1362 — the shared roll of the fallen: the door', () => {
  it('⚠ a well-formed record from another phone is admitted intact', () => {
    const f = sanitizeForeignFallen(goodFallen(), NOW);
    expect(f).not.toBeNull();
    expect(f!.name).toBe('Francis');
    expect(f!.kills).toBe(42);
    expect(f!.origin.installId).toBe('install-them');
    expect(f!.gear?.[0]?.name).toBe("Reclaimer's Cord");
  });

  it('⚠ a record with no origin, no name, or no usable timestamp is refused', () => {
    expect(sanitizeForeignFallen(goodFallen({ origin: undefined }), NOW)).toBeNull();
    expect(sanitizeForeignFallen(goodFallen({ origin: { player: 'x' } }), NOW)).toBeNull();
    expect(sanitizeForeignFallen(goodFallen({ name: '' }), NOW)).toBeNull();
    expect(sanitizeForeignFallen(goodFallen({ ts: 0 }), NOW)).toBeNull();
    expect(sanitizeForeignFallen(goodFallen({ ts: 'soon' }), NOW)).toBeNull();
    expect(sanitizeForeignFallen(null, NOW)).toBeNull();
    expect(sanitizeForeignFallen('a string', NOW)).toBeNull();
    expect(sanitizeForeignFallen([goodFallen()], NOW)).toBeNull();
  });

  it('⚠⚠ a corpse dated in the future is refused — it would never age out', () => {
    // The cheapest forgery there is: a record that always sorts newest and so
    // survives every eviction pass, squatting in the pool forever.
    expect(sanitizeForeignFallen(goodFallen({ ts: NOW + MAX_CLOCK_SKEW_MS + 60_000 }), NOW)).toBeNull();
    // Ordinary clock skew between two phones is fine.
    expect(sanitizeForeignFallen(goodFallen({ ts: NOW + 60_000 }), NOW)).not.toBeNull();
  });

  it('⚠⚠ absurd numbers are CLAMPED, not trusted — the revenant stays a fight, not a wall', () => {
    const f = sanitizeForeignFallen(goodFallen({ kills: 9_999_999, hours: -5 }), NOW)!;
    expect(f.kills).toBeLessThanOrEqual(500);
    expect(f.hours).toBe(0);
    // NaN / Infinity / non-numbers fall back rather than poisoning arithmetic.
    const g = sanitizeForeignFallen(goodFallen({ kills: Number.POSITIVE_INFINITY, hours: 'lots' }), NOW)!;
    expect(Number.isFinite(g.kills)).toBe(true);
    expect(Number.isFinite(g.hours)).toBe(true);
  });

  it('⚠ oversized and control-character strings are bounded and scrubbed', () => {
    const f = sanitizeForeignFallen(goodFallen({
      name: 'X'.repeat(500),
      epitaph: 'line one \u001B[31mred\nline two',
    }), NOW)!;
    expect(f.name.length).toBeLessThanOrEqual(32);
    expect(f.epitaph).not.toMatch(/[\u0000-\u001F\u007F]/);
    expect(f.epitaph.length).toBeLessThanOrEqual(240);
  });

  it('⚠⚠ the sender may NOT declare its own corpse already avenged', () => {
    // Rest state is derived from THIS world's rest records. If the wire could
    // assert it, a sender could quietly retire their own dead out of your pool.
    const f = sanitizeForeignFallen(goodFallen({ avengedBy: 'nobody', avengedTs: NOW }), NOW)!;
    expect(f.avengedBy).toBeUndefined();
    expect(f.avengedTs).toBeUndefined();
  });
});

describe('OTA-1362 — the gear allowlist', () => {
  it('⚠⚠ THE ATTACK: a golemCore, fused stats, and a quest lock are all stripped', () => {
    const hostile = {
      name: 'Godblade of Free Levels',
      kind: 'weapon',
      rarity: 'Legendary',
      slot: 'main',
      tags: ['weapon', 'quest', 'contract'],
      // Half a trained golem, minted from a text file.
      golemCore: { power: 999, resilience: 999, bonusHp: 999 },
      // One-of-a-kind fusion stats a foreign kit has no business forging.
      uniqueStats: { kind: 'weapon', rarity: 'Legendary', durability: { current: 99, max: 99 }, damageDice: '99d99' },
      // Local bookkeeping that misbehaves when it arrives pre-set.
      stolen: true,
      selfCrafted: true,
      reservedForQuest: true,
      materializing: true,
      coating: { kind: 'poison', dice: '9d9' },
      coatingSlots: 9,
      instanceStats: { acBonus: 9999, statBonuses: [{ stat: 'strength', amount: 99 }, { stat: 'luck', amount: 5 }] },
    };
    const piece = sanitizeForeignGearPiece(hostile)!;
    expect(piece).not.toBeNull();

    // Identity survives.
    expect(piece.name).toBe('Godblade of Free Levels');
    expect(piece.kind).toBe('weapon');

    // Every injected field is GONE — checked on the object itself, so a field
    // that is merely undefined-but-present still fails this.
    for (const banned of ['golemCore', 'uniqueStats', 'stolen', 'selfCrafted',
                          'reservedForQuest', 'materializing', 'coating', 'coatingSlots']) {
      expect(Object.prototype.hasOwnProperty.call(piece, banned)).toBe(false);
    }
    // The quest LOCK tags are stripped; the honest tag stays.
    expect(piece.tags).toContain('weapon');
    expect(piece.tags).not.toContain('quest');
    expect(piece.tags).not.toContain('contract');
    // instanceStats survives but clamped, and an invented stat is dropped.
    expect(piece.instanceStats?.acBonus).toBeLessThanOrEqual(20);
    const stats = piece.instanceStats?.statBonuses ?? [];
    expect(stats.every((s) => s.amount <= 5)).toBe(true);
    expect(stats.some((s) => s.stat === 'luck')).toBe(false);
  });

  it('⚠ an unusable piece is dropped, and dropping it costs only that piece', () => {
    expect(sanitizeForeignGearPiece({ kind: 'weapon' })).toBeNull();          // no name
    expect(sanitizeForeignGearPiece({ name: 'Thing', kind: 'wmd' })).toBeNull(); // bogus kind
    expect(sanitizeForeignGearPiece(null)).toBeNull();
    const f = sanitizeForeignFallen(goodFallen({
      gear: [{ name: 'Good Blade', kind: 'weapon', slot: 'main' }, { name: 'No Kind' }, 'garbage'],
    }), NOW)!;
    expect(f.gear).toHaveLength(1);
    expect(f.gear![0]!.name).toBe('Good Blade');
  });

  it('⚠ an unknown rarity falls back to Common rather than being believed', () => {
    const p = sanitizeForeignGearPiece({ name: 'Blade', kind: 'weapon', rarity: 'Mythic++' })!;
    expect(p.rarity).toBe('Common');
  });

  it('⚠⚠ END TO END: the hostile piece is inert by the time the game rebuilds it', () => {
    // This is the real path — sanitize at the door, then the EXISTING
    // reconstructFallenPiece turns it into live inventory. If the door works,
    // the spread inside that function has nothing dangerous left to spread.
    const piece = sanitizeForeignGearPiece({
      name: 'Godblade', kind: 'weapon', rarity: 'Legendary', slot: 'main',
      golemCore: { power: 999, resilience: 999, bonusHp: 999 },
      tags: ['quest'],
    })!;
    const item = reconstructFallenPiece(piece, 'itm-1');
    expect(item.name).toBe('Godblade');
    expect(Object.prototype.hasOwnProperty.call(item, 'golemCore')).toBe(false);
    expect(item.tags).not.toContain('quest');
    expect(item.quantity).toBe(1);
  });
});

describe('OTA-1362 — the merge rules', () => {
  const mk = (installId: string, ts: number, name = 'Dead'): ForeignFallen =>
    sanitizeForeignFallen(goodFallen({ name, ts, origin: { player: 'P', installId } }), NOW)!;

  it("⚠⚠ THE OWNER'S RULE: already-existing records are deduped by key", () => {
    const a = mk('them', NOW - 1000);
    const r = mergeFallen([a], [a, a], { myInstallId: ME });
    expect(r.pool).toHaveLength(1);
    expect(r.skippedDuplicate).toBe(2);
    expect(r.added).toHaveLength(0);
  });

  it("⚠⚠ THE OWNER'S RULE: already-killed fallen are dropped on the way in", () => {
    const a = mk('them', NOW - 1000);
    const rest: RestRecord = sanitizeRestRecord({
      fallenKey: fallenKey(a), fallenName: a.name, fallenOriginPlayer: 'P',
      byPlayer: 'Me', byInstallId: ME, byCharacter: 'Halla',
      whereRested: 'Mud Flats', ts: NOW - 500,
    }, NOW)!;
    const r = mergeFallen([], [a], { myInstallId: ME, rests: [rest] });
    expect(r.pool).toHaveLength(0);
    expect(r.skippedRested).toBe(1);
  });

  it('⚠⚠ ...but rest is PER WORLD — another player killing it does not clear yours', () => {
    // This is what keeps the pool heavy: five people's dead are not retired by
    // whoever reaches them first. Everyone faces every corpse themselves.
    const a = mk('them', NOW - 1000);
    const theirKill: RestRecord = sanitizeRestRecord({
      fallenKey: fallenKey(a), fallenName: a.name, fallenOriginPlayer: 'P',
      byPlayer: 'Someone Else', byInstallId: 'install-third', byCharacter: 'Rook',
      whereRested: 'Elsewhere', ts: NOW - 400,
    }, NOW)!;
    const r = mergeFallen([], [a], { myInstallId: ME, rests: [theirKill] });
    expect(r.pool).toHaveLength(1);
    expect(r.skippedRested).toBe(0);
    expect(isRestedHere(fallenKey(a), ME, [theirKill])).toBe(false);
  });

  it('⚠ our own dead never come home', () => {
    const mine = mk(ME, NOW - 1000, 'My Own Francis');
    const theirs = mk('them', NOW - 900);
    const r = mergeFallen([], [mine, theirs], { myInstallId: ME });
    expect(r.pool).toHaveLength(1);
    expect(r.pool[0]!.origin.installId).toBe('them');
    expect(r.skippedOwn).toBe(1);
  });

  it('⚠⚠ the pool is capped, and eviction takes the OLDEST corpses first', () => {
    const pool: ForeignFallen[] = [];
    for (let i = 0; i < FOREIGN_FALLEN_CAP + 5; i += 1) pool.push(mk(`them-${i}`, NOW - 1_000_000 + i * 1000));
    const r = mergeFallen([], pool, { myInstallId: ME });
    expect(r.pool).toHaveLength(FOREIGN_FALLEN_CAP);
    expect(r.evicted).toBe(5);
    // The survivors are the newest — sorted ascending, the oldest are gone.
    const oldest = Math.min(...r.pool.map((f) => f.ts));
    expect(oldest).toBeGreaterThan(NOW - 1_000_000 + 4 * 1000);
    // A record evicted by the same merge that admitted it is not reported as added.
    expect(r.added.length).toBe(FOREIGN_FALLEN_CAP);
  });

  it('⚠ a malformed record in the batch costs only that record', () => {
    const good = mk('them', NOW - 1000);
    const r = mergeFallen([], [good, { ts: 1 } as unknown as ForeignFallen], { myInstallId: ME });
    expect(r.pool).toHaveLength(1);
    expect(r.rejected).toBe(1);
  });

  it('⚠ the spawner draws only from what this world has not yet put down', () => {
    const a = mk('them', NOW - 2000, 'A');
    const b = mk('them2', NOW - 1000, 'B');
    const rest = sanitizeRestRecord({
      fallenKey: fallenKey(a), fallenName: 'A', fallenOriginPlayer: 'P',
      byPlayer: 'Me', byInstallId: ME, byCharacter: 'Halla', whereRested: 'X', ts: NOW,
    }, NOW)!;
    const live = unrestedFallen([a, b], ME, [rest]);
    expect(live.map((f) => f.name)).toEqual(['B']);
  });
});

describe('OTA-1362 — rest records and the wire envelope', () => {
  it('⚠ rest records union by corpse AND killer, so every world keeps its own trophy', () => {
    const base = {
      fallenKey: 'them:1', fallenName: 'Francis', fallenOriginPlayer: 'Sas',
      byPlayer: 'Me', byInstallId: ME, byCharacter: 'Halla', whereRested: 'Mud Flats', ts: NOW,
    };
    const mine = sanitizeRestRecord(base, NOW)!;
    const theirs = sanitizeRestRecord({ ...base, byPlayer: 'Third', byInstallId: 'install-third' }, NOW)!;
    expect(restKey(mine)).not.toBe(restKey(theirs));
    const r = mergeRests([mine], [mine, theirs], 50);
    expect(r.rests).toHaveLength(2);
    expect(r.skippedDuplicate).toBe(1);
  });

  it('⚠ a rest record without a corpse key or a killer is refused', () => {
    expect(sanitizeRestRecord({ byInstallId: ME, ts: NOW }, NOW)).toBeNull();
    expect(sanitizeRestRecord({ fallenKey: 'k', ts: NOW }, NOW)).toBeNull();
    expect(sanitizeRestRecord({ fallenKey: 'k', byInstallId: ME, ts: 0 }, NOW)).toBeNull();
  });

  it('⚠⚠ a torn or hostile payload yields an empty batch, never a throw', () => {
    // The transport will hand this whatever the network gave it. A truncated
    // download must cost the sync, not the process.
    expect(() => parseLedgerPayload('{"fallen":[{"name"', NOW)).not.toThrow();
    expect(parseLedgerPayload('{"fallen":[{"name"', NOW)).toEqual({ fallen: [], rests: [] });
    expect(parseLedgerPayload('null', NOW)).toEqual({ fallen: [], rests: [] });
    expect(parseLedgerPayload(undefined, NOW)).toEqual({ fallen: [], rests: [] });
    expect(parseLedgerPayload({ fallen: 'not an array', rests: 7 }, NOW)).toEqual({ fallen: [], rests: [] });
  });

  it('⚠ a real payload round-trips through JSON, keeping only what survives the door', () => {
    const wire = JSON.stringify({
      fallen: [goodFallen(), goodFallen({ name: '' }), { junk: true }],
      rests: [{
        fallenKey: 'them:1', fallenName: 'Francis', fallenOriginPlayer: 'Sas',
        byPlayer: 'Me', byInstallId: ME, byCharacter: 'Halla', whereRested: 'Mud Flats', ts: NOW,
        description: 'It went down in the shallows and did not get up.',
      }, { nonsense: 1 }],
    });
    const out = parseLedgerPayload(wire, NOW);
    expect(out.fallen).toHaveLength(1);
    expect(out.rests).toHaveLength(1);
    expect(out.rests[0]!.description).toContain('shallows');
  });
});

describe('OTA-1362 — the lineage name', () => {
  it("⚠⚠ THE OWNER'S CALL: a corpse that travelled carries its house", () => {
    const f = sanitizeForeignFallen(goodFallen(), NOW)!;
    expect(fallenTitle(f)).toBe('Francis child of Sasmooch');
  });

  it('⚠ your own dead keep their bare name — the lineage is what travelling adds', () => {
    expect(fallenTitle({ name: 'Francis' })).toBe('Francis');
    expect(fallenTitle({ name: 'Francis', origin: { player: '', installId: 'x' } })).toBe('Francis');
  });

  it('⚠ the trophy line reads off a rest record alone, long after the corpse is gone', () => {
    const r = sanitizeRestRecord({
      fallenKey: 'them:1', fallenName: 'Francis', fallenOriginPlayer: 'Sasmooch',
      byPlayer: 'Me', byInstallId: ME, byCharacter: 'Halla', whereRested: 'the Mud Flats', ts: NOW,
    }, NOW)!;
    expect(restRollLine(r)).toBe('Francis child of Sasmooch — put to rest by Halla at the Mud Flats.');
  });
});

// ⚠⚠ THE LORE. Owner: *"these fallen are a form of warrior class aetherkin that
// need lore. they are not able to rest because the reason you went down was too
// strong to let go of. your task still lingers on their lips and minds."*
//
// It slots into canon by INVERSION. The codex already says Aetherkin are
// "trapped in an ethereal peace" — the stone closed over them and the work
// stopped. The Hollowed are the ones no stone ever closed over, because a
// purpose still burning cannot be encased. They were never received.
//
// ⚠ AND IT EXPLAINS A RULE THAT WAS ONLY EVER MECHANICAL: killing one costs no
// reverence standing. The faiths revere the SLEEPERS — the kin the Aether took
// in. A Hollowed is the opposite, so release is the only thing owed. The
// exemption keys on the TRAIT (ota991 proves a spoofed name can't break it), so
// the lore was free to name them Aetherkin outright without touching the wiring.
describe('OTA-1362 — the lore of the Hollowed', () => {
  const entry = () => CONCEPTS.concepts.find((c) => c.id === 'hollowed');

  it('⚠⚠ the codex carries the Hollowed as warrior-class Aetherkin', () => {
    const e = entry();
    expect(e).toBeDefined();
    expect(e!.title).toContain('Aetherkin');
    expect(e!.answer.toLowerCase()).toContain('warrior class');
  });

  it("⚠⚠ it names the OWNER'S reason: the task too strong to set down", () => {
    const a = entry()!.answer.toLowerCase();
    // Why there is no rest: the purpose outlasted the body.
    expect(a).toContain('too heavy to set down');
    expect(a).toContain('no stone ever formed');
    // Still on their lips and in their minds — verbatim intent.
    expect(a).toContain('on their lips');
  });

  it('⚠⚠ it explains the reverence exemption instead of contradicting it', () => {
    const a = entry()!.answer.toLowerCase();
    expect(a).toContain('sleeper');
    expect(a).toContain('release');
    // And the mechanism still holds: an ordinary Hollowed is not an Aetherkin
    // to the penalty system, but IS trait-marked as a revenant.
    const foe = revenantFromFallen(
      { name: 'Francis', raceName: 'Aetherborn', epitaph: 'x', locationName: 'the Flats',
        kills: 30, corruption: 'Clear', hours: 20, ts: NOW } as never,
      120,
    );
    expect(isRevenant(foe)).toBe(true);
    expect(isAetherkin(foe)).toBe(false);
    expect(revenantName({ name: 'Francis' })).toBe('Hollowed Francis');
  });

  it('⚠ the base Aetherkin entry points at them, so the codex reads as one world', () => {
    const base = CONCEPTS.concepts.find((c) => c.id === 'aetherkin')!;
    expect(base.answer.toLowerCase()).toContain('hollowed');
  });

  it("⚠⚠ the fight's own prose carries the lingering task, not just the codex", () => {
    const f = { name: 'Francis', raceName: 'Aetherborn', epitaph: 'They went down mid-oath.',
                locationName: 'the Mud Flats', kills: 30, corruption: 'Clear', hours: 20, ts: NOW } as never;
    const beats = revenantIntroBeats(f, false);
    expect(beats.identity.toLowerCase()).toContain('never taken in');
    expect(beats.identity.toLowerCase()).toContain('on its lips');
    expect(beats.character.toLowerCase()).toContain('mercy');
    // The enemy's own flavor says why no stone closed over it.
    expect(revenantFromFallen(f, 120).flavor?.toLowerCase() ?? '').toContain('no stone ever closed');
    // And the close finally gives them what the Hollowed never had.
    const close = revenantDefeatLines(f, 'Halla');
    expect(close.world.toLowerCase()).toContain('rest');
    expect(close.world.toLowerCase()).toContain('received at last');
  });
});
