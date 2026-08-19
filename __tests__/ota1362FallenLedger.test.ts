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

    // ⚠ OTA-1366 — coatings and fused stats now CROSS (the owner's call: the
    // player's own upgrade work is most of what makes an inferred weapon
    // theirs). What must never cross is unchanged, and the things that do cross
    // are clamped to the game's own ceilings — asserted just below.
    for (const banned of ['golemCore', 'stolen', 'selfCrafted',
                          'reservedForQuest', 'materializing']) {
      expect(Object.prototype.hasOwnProperty.call(piece, banned)).toBe(false);
    }
    // The hostile 99d99 fused weapon comes through as a legal one, or not at all.
    // The hostile 99d99 fused weapon is refused outright — the Crucible's own
    // standard die set is the gate, so an invented roll never becomes a legal one.
    const fused = (piece as { uniqueStats?: { damageDice?: string; acBonus?: number } }).uniqueStats;
    expect(fused?.damageDice).toBeUndefined();
    expect(fused?.acBonus ?? 0).toBeLessThanOrEqual(6);
    // The 9d9 poison coating matches no vial in the game, so it does not land.
    expect((piece as { coating?: unknown }).coating).toBeUndefined();
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

// ⚠⚠ OTA-1366 — THE UPGRADES TRAVEL, AND ARRIVE LEGAL.
//
// Owner: *"most of the dead will have inferred weapons. since lost inferred
// weapons are better stats than lore weapons it seems and can be upgraded as
// well. we want them to carry these effects over."*
//
// The base stats never needed sending — weapon inference is a pure function of
// the NAME, so the receiving phone infers the identical weapon from the
// identical string. What was being thrown away was the work done AFTERWARDS:
// coatings, the second slot, worked-in resists, a Crucible fusion. Those cross
// now, and every ceiling is the game's own: fusion tops out at 2d8 / acBonus 6,
// catalog armour at acBonus 5, coatings in play are 1d4 and 2d6, ADDED_RESIST_CAP
// is 3 (+1 upgraded). A foreign piece can never beat one you could forge.
describe('OTA-1366 — a dead player\'s upgrade work crosses, clamped', () => {
  const upgraded = {
    name: 'Whisper Marrow', kind: 'weapon', rarity: 'Rare', slot: 'main',
    tags: ['weapon'],
    coating: { kind: 'poison', dice: '1d6', label: 'Envenomed' },
    coating2: { kind: 'cold', dice: '1d4', label: 'Frosted' },
    coatingSlots: 2,
    instanceStats: { statBonuses: [{ stat: 'stealth', amount: 2 }] },
  };

  it("⚠⚠ THE OWNER'S ASK: a coated, upgraded weapon keeps its work", () => {
    const p = sanitizeForeignGearPiece(upgraded)!;
    expect(p).not.toBeNull();
    const piece = p as unknown as {
      coating?: { kind: string; dice: string; label: string };
      coating2?: { kind: string };
      coatingSlots?: number;
      instanceStats?: { statBonuses?: { stat: string; amount: number }[] };
    };
    expect(piece.coating?.kind).toBe('poison');
    expect(piece.coating?.dice).toBe('1d6');
    expect(piece.coating?.label).toBe('Envenomed');
    // The Crucible's second slot survives with it.
    expect(piece.coating2?.kind).toBe('cold');
    expect(piece.coatingSlots).toBe(2);
    // And the stealth roll that made it worth carrying.
    expect(piece.instanceStats?.statBonuses?.[0]).toEqual({ stat: 'stealth', amount: 2 });
  });

  it('⚠⚠ a cheat coating is REFUSED, not trimmed into a legal one', () => {
    // Trimming would hand the cheater a working coating for free. The vials
    // that exist top out at 1d6, so 2d8 is not "close enough" — it is invented.
    const p = sanitizeForeignGearPiece({
      ...upgraded,
      coating: { kind: 'poison', dice: '99d99', label: 'X'.repeat(200) },
      coating2: { kind: 'antimatter', dice: '1d4', label: 'Fake' },
    })!;
    const piece = p as unknown as { coating?: unknown; coating2?: unknown; coatingSlots?: number };
    expect(piece.coating).toBeUndefined();
    expect(piece.coating2).toBeUndefined();
    expect(piece.coatingSlots).toBeUndefined();
    // A coating stronger than any real vial is refused too, not rounded down.
    const q = sanitizeForeignGearPiece({ ...upgraded, coating: { kind: 'poison', dice: '2d8', label: 'Overcooked' } })!;
    expect((q as unknown as { coating?: unknown }).coating).toBeUndefined();
  });

  it("⚠⚠ THE OWNER'S POINT: a real 2d10 Crucible weapon is NOT nerfed on import", () => {
    // "fuse crucible weapons and armor are very important aspect of the game,
    // and nerfing them on import kind of defeats the purpose." The first cut
    // capped fused dice at 2d8 and would have downgraded this silently.
    const p = sanitizeForeignGearPiece({
      name: 'Marrowsong Cleaver', kind: 'weapon', rarity: 'Legendary', slot: 'main',
      uniqueStats: {
        kind: 'weapon', rarity: 'Legendary', durability: { current: 30, max: 30 },
        damageDice: '2d10', damageType: 'slashing', scalesWith: 'strength',
        resistance: 'aetheric', special: 'It sings on the backswing.',
      },
    })!;
    const fused = (p as unknown as { uniqueStats?: Record<string, unknown> }).uniqueStats!;
    expect(fused.damageDice).toBe('2d10');
    expect(fused.rarity).toBe('Legendary');
    expect(fused.damageType).toBe('slashing');
    expect(fused.scalesWith).toBe('strength');
    expect(fused.special).toContain('backswing');
    expect((fused.durability as { max: number }).max).toBe(30);
  });

  it('⚠⚠ ...but dice the Crucible itself refuses are refused here too', () => {
    // 2d7 and 1d9 are not in the standard set, and 3d10 exceeds the count.
    // Rejecting the fused block leaves an ordinary piece, never a super one.
    for (const bad of ['2d7', '1d9', '3d10', '2d20', '9d9']) {
      const p = sanitizeForeignGearPiece({
        name: 'Forgery', kind: 'weapon', slot: 'main',
        uniqueStats: { kind: 'weapon', rarity: 'Legendary', durability: { current: 30, max: 30 }, damageDice: bad, damageType: 'slashing', scalesWith: 'strength' },
      })!;
      const fused = (p as unknown as { uniqueStats?: { damageDice?: string } }).uniqueStats;
      expect(fused?.damageDice).toBeUndefined();
    }
  });

  it('⚠ worked-in armour resists cross, capped at the upgraded cap', () => {
    const p = sanitizeForeignGearPiece({
      name: 'Mud-Warden Vest', kind: 'armor', slot: 'chest',
      addedResists: ['burn', 'cold', 'poison', 'aetheric', 'electrical', 'nonsense', 'burn'],
    })!;
    const piece = p as unknown as { addedResists?: string[]; resistCapBonus?: number };
    // ADDED_RESIST_CAP is 3, +1 with the Crucible upgrade — never six.
    expect(piece.addedResists!.length).toBeLessThanOrEqual(4);
    expect(piece.addedResists).not.toContain('nonsense');
    // No duplicates smuggled in to eat the cap twice.
    expect(new Set(piece.addedResists).size).toBe(piece.addedResists!.length);
  });

  it('⚠ a per-instance armour roll is capped at what the game itself grants', () => {
    const p = sanitizeForeignGearPiece({
      name: 'Plated Vest', kind: 'armor', slot: 'chest',
      instanceStats: { acBonus: 9999, statBonuses: [{ stat: 'strength', amount: 99 }] },
    })!;
    const st = (p as unknown as { instanceStats?: { acBonus?: number; statBonuses?: { amount: number }[] } }).instanceStats!;
    expect(st.acBonus).toBe(6);
    expect(st.statBonuses![0]!.amount).toBeLessThanOrEqual(5);
  });
});

// ⚠⚠ OTA-1366 — THE CLONE. Owner: *"what I want is the exact same in every
// detail dead I send someone to have everything exactly as it was when they
// died, same gear, same stats, same coatings, everything I want a clone sent."*
//
// ⚠ THE HOLLOWED WAS NEVER A CLONE, and not because of the file format. It
// hard-coded `abilityPoint: 'Strength 6'`, took its damage from KILL COUNT, and
// sized its HP off the LIVING player. The dead character's own strength, hpMax
// and AC were never recorded at all — so no transport could have carried them.
// The snapshot is what turns a name-with-a-kit into a person.
describe('OTA-1366 — the clone crosses whole', () => {
  const SNAP = {
    stats: { strength: 18, dexterity: 14, intelligence: 9, wisdom: 11, charisma: 7, stealth: 4 },
    hpMax: 240, ac: 17, raceId: 'aetherborn', factionId: 'eternal_dynasty',
  };

  it("⚠⚠ THE OWNER'S ASK: stats, health and AC arrive exactly as they died", () => {
    const f = sanitizeForeignFallen(goodFallen({ snapshot: SNAP }), NOW)!;
    expect(f.snapshot).toEqual(SNAP);
  });

  it('⚠⚠ and the Hollowed FIGHTS as they did — not as a kill-count formula', () => {
    const f = sanitizeForeignFallen(goodFallen({
      snapshot: SNAP,
      kills: 3, // a low kill count must NOT shrink a strong character's clone
      gear: [{
        name: 'Marrowsong Cleaver', kind: 'weapon', rarity: 'Legendary', slot: 'main', tags: ['weapon'],
        uniqueStats: { kind: 'weapon', rarity: 'Legendary', durability: { current: 30, max: 30 }, damageDice: '2d10', damageType: 'slashing', scalesWith: 'strength' },
      }],
    }), NOW)!;
    // The living player is frail; the clone does NOT scale down to meet them.
    const foe = revenantFromFallen(f, 60);
    expect(foe.hp).toBe(240);
    // Their real blade's dice, not the 2d6 a 3-kill record would have given.
    expect(foe.damage).toBe('2d10');
    // Their strongest attribute, not a hard-coded Strength 6.
    expect(foe.abilityPoint).toBe('Strength 18');
  });

  it('⚠ a record with no snapshot still builds the old way — nothing regresses', () => {
    const f = sanitizeForeignFallen(goodFallen({ kills: 200 }), NOW)!;
    expect(f.snapshot).toBeUndefined();
    const foe = revenantFromFallen(f, 100);
    expect(foe.hp).toBeGreaterThan(0);
    expect(foe.abilityPoint).toBe('Strength 6');
  });

  it('⚠ a forged god-clone is bounded — a hard fight, never an immortal one', () => {
    const f = sanitizeForeignFallen(goodFallen({
      snapshot: { stats: { strength: 9_999_999, dexterity: -5, intelligence: 0, wisdom: 0, charisma: 0, stealth: 0 }, hpMax: 9_999_999, ac: 9_999_999 },
    }), NOW)!;
    expect(f.snapshot!.hpMax).toBeLessThanOrEqual(5_000);
    expect(f.snapshot!.stats.strength).toBeLessThanOrEqual(200);
    expect(f.snapshot!.stats.dexterity).toBe(0);
    expect(f.snapshot!.ac).toBeLessThanOrEqual(60);
  });

  it('⚠⚠ the FULL kit crosses — ten slots, so rings and an amulet are not dropped', () => {
    const kit = ['main', 'off', 'chest', 'head', 'legs', 'feet', 'amulet', 'ring', 'ring2', 'ring3']
      .map((slot, i) => ({ name: `Piece ${i}`, kind: slot === 'main' || slot === 'off' ? 'weapon' : 'armor', slot, tags: [] }));
    const f = sanitizeForeignFallen(goodFallen({ gear: kit }), NOW)!;
    expect(f.gear).toHaveLength(10);
    expect(f.gear!.map((g) => g.slot)).toContain('ring3');
    expect(f.gear!.map((g) => g.slot)).toContain('amulet');
  });
});
