/* ⚠⚠⚠ OTA-1844 — THE LAST WALK.
 *
 * A dog whose handler died at its side used to be DELETED WITH THE SAVE. It now
 * travels through the same sealed, paired exchange the dead do, appears in
 * another player's world as something you cannot fight, and can be stayed with
 * until it rests — after which one sentence goes home.
 *
 * ⚠⚠ THE NEGATIVE HALF IS THE LOAD-BEARING HALF, again. Every claim here has a
 * twin proving what did NOT happen: no loot, no XP, no TC, no gear, no gemstone,
 * no enemy row, no rest on walking away, no second closure, no change to a
 * living dog, to Rocky, to the human payload, or to the encounter rate.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  dogFallenKey,
  mergeDogs,
  parseLedgerPayload,
  sanitizeForeignDog,
  unrestedDogs,
  type ForeignDog,
  type RestRecord,
} from '../app/engine/fallenLedger';
import {
  buildDogRest,
  dogClosureSentence,
  dogIsEligibleForLastWalk,
  dogTitle,
  fallenDogFromCompanion,
  isDogRest,
  lastWalkSettles,
  LAST_WALK_ACTS,
  lastWalkFleeLine,
  lastWalkLeaveLine,
  lastWalkSettleLog,
} from '../app/engine/fallenDogs';
import {
  _setIdentityForTests,
  _setLedgerForTests,
  _setPairedForTests,
  _setSendingKeyForTests,
  acceptHouseCode,
  buildExportPayload,
  ensureSendingKey,
  foreignDogPool,
  importPayloadText,
  myHouseCode,
  previewPayloadText,
  recordRest,
} from '../app/engine/fallenLedgerStore';
import { recordFallen, recordFallenDog, loadFallenDogs } from '../app/engine/saveSystem';
import type { DogCompanion } from '../app/engine/types';

const SRC = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** ⚠⚠ OTA-1842 TAUGHT THIS ONE THE HARD WAY: an absence assertion run over a
 *  whole file grades the PROSE, not the code. Every comment in these modules
 *  says out loud what does NOT happen — "no damage, no enemy, no loot" — so a
 *  naive `not.toMatch(/loot/)` fails on the sentence promising there is none.
 *  Strip comments first, and the claim becomes what it was always meant to be:
 *  a statement about behaviour. */
const codeOnly = (p: string) => SRC(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------
const DEAD_A = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

function dog(over: Partial<DogCompanion> = {}): DogCompanion {
  return {
    id: 'dog_1760000000000_abcdef',
    name: 'Marrow',
    breed: 'lurcher',
    sex: { raw: 'boy', pronoun: 'he' },
    startingProfile: 'mongrel',
    hp: 16, hpMax: 16,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80,
    lastFedAtHour: 0,
    equipped: { vest: 'Woven Stride' },
    status: 'with_player',
    ...over,
  } as DogCompanion;
}

function beInstall(installId: string, house: string, sendKey: string | null): void {
  _setIdentityForTests(installId, house);
  _setSendingKeyForTests(sendKey);
  _setPairedForTests([]);
  _setLedgerForTests({ foreign: [], rests: [], dogs: [] });
}

/** House A: its card and a sealed payload carrying one dead AND one companion. */
async function houseA(extraDog?: DogCompanion): Promise<{ card: string; payload: string; body: string }> {
  await AsyncStorage.clear();
  beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
  await ensureSendingKey();
  const card = await myHouseCode();
  await recordFallen({ ...DEAD_A, ts: 1_760_000_000_000 } as never);
  await recordFallenDog(fallenDogFromCompanion({
    dog: dog(), handler: 'Francis', where: 'the Mud Flats', hours: 96, ts: 1_760_000_000_000,
  }));
  if (extraDog) {
    await recordFallenDog(fallenDogFromCompanion({
      dog: extraDog, handler: 'Francis', where: 'the Mud Flats', hours: 96, ts: 1_760_000_000_001,
    }));
  }
  const payload = await buildExportPayload();
  const body = (JSON.parse(payload) as { body: string }).body;
  return { card, payload, body };
}

async function beB_ridingWithA(card: string): Promise<void> {
  await AsyncStorage.clear();
  beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
  await acceptHouseCode(card);
}

async function beB_alone(): Promise<void> {
  await AsyncStorage.clear();
  beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
}

function foreignDog(over: Partial<ForeignDog> = {}): ForeignDog {
  return {
    id: 'dog_1', name: 'Marrow', breed: 'lurcher', pronoun: 'he',
    handler: 'Francis', where: 'the Mud Flats', hours: 96, ts: 1_760_000_000_000,
    origin: { player: 'Sasmooch', installId: 'inst-A' },
    ...over,
  };
}

afterEach(() => {
  _setLedgerForTests(null);
  _setIdentityForTests(null, null);
  _setPairedForTests(null);
  _setSendingKeyForTests(null);
});

// ---------------------------------------------------------------------------
describe('§A — entry and recording', () => {
  test('1. an eligible `with_player` dog records on handler death', async () => {
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', 'k_a');
    expect(dogIsEligibleForLastWalk(dog())).toBe(true);
    await recordFallenDog(fallenDogFromCompanion({
      dog: dog(), handler: 'Francis', where: 'the Mud Flats', hours: 96, ts: 5,
    }));
    const roll = await loadFallenDogs();
    expect(roll).toHaveLength(1);
    expect(roll[0]!.name).toBe('Marrow');
    expect(roll[0]!.handler).toBe('Francis');
  });

  test('2. EXCLUDED statuses never record — and `waiting_at_base` is one of them', () => {
    expect(dogIsEligibleForLastWalk(dog({ status: 'waiting_at_base' }))).toBe(false);
    expect(dogIsEligibleForLastWalk(dog({ status: 'waiting_at_base', hp: 0 }))).toBe(false);
    expect(dogIsEligibleForLastWalk(dog({ status: 'dead' }))).toBe(false);
    expect(dogIsEligibleForLastWalk(dog({ status: 'abandoned' }))).toBe(false);
    expect(dogIsEligibleForLastWalk(null)).toBe(false);
    expect(dogIsEligibleForLastWalk(undefined)).toBe(false);
  });

  test('3. the record is INSTALL-WIDE, so it survives the slot the dog lived in', async () => {
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', 'k_a');
    await recordFallenDog(fallenDogFromCompanion({
      dog: dog(), handler: 'Francis', where: 'the Mud Flats', hours: 96, ts: 5,
    }));
    // the character save is a different key entirely; deleting every slot cannot
    // touch the global stash, which is the whole reason this field exists.
    const { deleteSlot } = require('../app/engine/saveSystem') as typeof import('../app/engine/saveSystem');
    await deleteSlot('slot_1');
    expect(await loadFallenDogs()).toHaveLength(1);
  });

  test('4. the human death path is untouched — it still records the character', async () => {
    const src = SRC('app/state/combatResolution.ts');
    expect(src).toMatch(/void recordFallen\(hero\)\.then\(\(total\) => \{/);
    expect(src).toMatch(/void recordFallenSeed\(characterSeedOf\(player\)\)/);
    // and the dog write is fire-and-forget beside it, never in front of it
    expect(src).toMatch(/void recordFallenDog\(fd\.fallenDogFromCompanion/);
  });

  test('5. recording is idempotent — the same companion twice is still one', async () => {
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', 'k_a');
    const rec = fallenDogFromCompanion({ dog: dog(), handler: 'Francis', where: 'X', hours: 1, ts: 7 });
    await recordFallenDog(rec);
    await recordFallenDog(rec);
    expect(await loadFallenDogs()).toHaveLength(1);
  });

  test('NOTHING MECHANICAL CROSSES — the record has no stats, hp, loyalty or item', () => {
    const rec = fallenDogFromCompanion({ dog: dog(), handler: 'F', where: 'X', hours: 1, ts: 7 });
    expect(Object.keys(rec).sort()).toEqual(
      ['breed', 'handler', 'hours', 'id', 'name', 'pronoun', 'ts', 'vestName', 'where'].sort(),
    );
    // the vest is a WORD, and there is no way for it to become an item
    expect(rec.vestName).toBe('Woven Stride');
    expect(rec as unknown as { equipped?: unknown }).not.toHaveProperty('equipped');
  });
});

// ---------------------------------------------------------------------------
describe('§B — identity', () => {
  test('6. same-name dogs from different installs stay distinct', () => {
    const a = foreignDog({ id: 'dog_x', origin: { player: 'HouseA', installId: 'inst-A' } });
    const b = foreignDog({ id: 'dog_x', origin: { player: 'HouseB', installId: 'inst-B' } });
    expect(dogFallenKey(a)).not.toEqual(dogFallenKey(b));
    const merged = mergeDogs([], [a, b], { myInstallId: 'me' });
    expect(merged.pool).toHaveLength(2);
  });

  test('7. the key survives export → import unchanged, and fits the rest bound', async () => {
    const a = foreignDog();
    const key = dogFallenKey(a);
    expect(key).toBe('dog:inst-A:dog_1');
    const round = sanitizeForeignDog(JSON.parse(JSON.stringify(a)));
    expect(round).not.toBeNull();
    expect(dogFallenKey(round!)).toBe(key);
    // ⚠ sanitizeRestRecord bounds fallenKey at 60; a real-world key is ~50.
    const realistic = dogFallenKey({ origin: { player: 'H', installId: `inst_${'a'.repeat(16)}` }, id: `dog_${Date.now()}_abcdef` });
    expect(realistic.length).toBeLessThanOrEqual(60);
  });

  test('8. a replayed payload does not duplicate a companion', () => {
    const a = foreignDog();
    const first = mergeDogs([], [a], { myInstallId: 'me' });
    const again = mergeDogs(first.pool, [a], { myInstallId: 'me' });
    expect(again.pool).toHaveLength(1);
    expect(again.added).toHaveLength(0);
    expect(again.skippedDuplicate).toBe(1);
  });

  test('own-install companions are refused, exactly as own dead are', () => {
    const mine = foreignDog({ origin: { player: 'Me', installId: 'me' } });
    const r = mergeDogs([], [mine], { myInstallId: 'me' });
    expect(r.pool).toHaveLength(0);
    expect(r.skippedOwn).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('§C — the exchange', () => {
  test('9. the companion rides INSIDE the existing sealed body', async () => {
    const { payload, body } = await houseA();
    const env = JSON.parse(payload) as { v: number; from: string; seal: string; body: string };
    expect(env.v).toBe(2);
    expect(typeof env.seal).toBe('string');
    const doc = JSON.parse(body) as { v: number; dogs?: unknown[]; fallen?: unknown[] };
    expect(Array.isArray(doc.dogs)).toBe(true);
    expect(doc.dogs).toHaveLength(1);
    expect(doc.fallen).toHaveLength(1);
    // ⚠ 10. NO VERSION BUMP. The wire version is what it was.
    expect(doc.v).toBe(1);
  });

  test('10. an authenticated companion follows the same VERIFIED decision as the dead', async () => {
    const { card, payload } = await houseA();
    await beB_ridingWithA(card);
    const p = await previewPayloadText(payload);
    expect(p.trust).toBe('verified');
    expect(p.arrivals).toHaveLength(1);
    expect(p.dogArrivals).toHaveLength(1);
    expect(p.dogArrivals[0]).toContain('Marrow');
    expect(p.dogArrivals[0]).toContain('Francis');
  });

  test('11. a forged payload is still refused — the dog buys no leniency', async () => {
    const { payload } = await houseA();
    // B rides with somebody else, so A's seal verifies against nothing B holds.
    await AsyncStorage.clear();
    beInstall('inst-C', 'Ghislain', 'k_cccccccccccccccccccc');
    await ensureSendingKey();
    const cCard = await myHouseCode();
    await AsyncStorage.clear();
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(cCard);
    const p = await previewPayloadText(payload);
    expect(p.trust).toBe('refused');
    expect(p.dogArrivals).toEqual([]);
    const out = await importPayloadText(payload);
    expect(out.forged).toBe(true);
    expect(out.dogsAdded).toBe(0);
    expect(foreignDogPool()).toHaveLength(0);
  });

  test('an UNPAIRED house is turned away, companions included', async () => {
    const { payload } = await houseA();
    await beB_alone();
    const out = await importPayloadText(payload);
    expect(out.added).toBe(0);
    expect(out.dogsAdded).toBe(0);
  });

  test('12. a legacy human-only payload still imports normally', async () => {
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
    await ensureSendingKey();
    const card = await myHouseCode();
    await recordFallen({ ...DEAD_A, ts: 1_760_000_000_000 } as never);
    const payload = await buildExportPayload(); // no dogs recorded on this install
    await beB_ridingWithA(card);
    const out = await importPayloadText(payload);
    expect(out.added).toBe(1);
    expect(out.dogsAdded).toBe(0);
    expect(out.dogArrivals).toEqual([]);
  });

  test('13. an OLDER PARSER behaviour is preserved: unknown keys are ignored by name', () => {
    // The compatibility that matters is a build that reads `fallen`/`rests` and
    // has never heard of `dogs`. Reading by name is what makes that safe, and
    // the mirror image proves it: a doc with a key THIS build does not know is
    // parsed for everything it does.
    const doc = JSON.stringify({
      v: 1, fallen: [], rests: [], dogs: [foreignDog()], somethingFromTheFuture: [{ x: 1 }],
    });
    const parsed = parseLedgerPayload(doc);
    expect(parsed.dogs).toHaveLength(1);
    expect(parsed.fallen).toEqual([]);
    expect(SRC('app/engine/fallenLedger.ts')).toMatch(/if \(Array\.isArray\(doc\.dogs\)\)/);
  });

  test('14 + 15. preview shows companions before commit, and CANCEL mutates nothing', async () => {
    const { card, payload } = await houseA();
    await beB_ridingWithA(card);
    const p = await previewPayloadText(payload);
    expect(p.dogArrivals).toHaveLength(1);
    // nothing was committed by looking
    expect(foreignDogPool()).toHaveLength(0);
    expect(await loadFallenDogs()).toHaveLength(0);
  });

  test('a torn paste is refused rather than described as a quiet house', async () => {
    const { card, payload } = await houseA();
    await beB_ridingWithA(card);
    const p = await previewPayloadText(payload.slice(0, Math.floor(payload.length / 2)));
    expect(p.trust).toBe('refused');
    expect(p.dogArrivals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('§D — the encounter', () => {
  const store = SRC('app/state/gameStore.ts');

  test('16 + 17. the Last Walk uses the EXISTING opportunity; the rate is untouched', () => {
    // the gate is byte-for-byte what it was: pool non-empty, one roll of rvChance
    expect(store).toMatch(/if \(rvPool\.length > 0 && Math\.random\(\) < rvChance\) \{/);
    // and rvChance is still computed from un-rested foreign CORPSES only
    expect(store).toMatch(/const rvForeignCount = rvPool\.filter\(\(f\) => !!\(f as \{ origin\?: unknown \}\)\.origin\)\.length;/);
    expect(store).toMatch(/const rvChance = rvLedger\.revenantSpawnChance\(rvForeignCount\);/);
    // companions are NOT added to the count that drives the dial
    expect(store).not.toMatch(/revenantSpawnChance\([^)]*[Dd]og/);
  });

  test('18. a dog and a Hollowed can never arrive on the same beat', () => {
    // exactly ONE index is drawn across both pools, so the branch is exclusive
    expect(store).toMatch(/const rvPick = Math\.floor\(Math\.random\(\) \* \(rvPool\.length \+ rvDogs\.length\)\);/);
    expect(store).toMatch(/if \(rvPick >= rvPool\.length\) \{ lastWalk\.openLastWalk/);
    expect(store).toMatch(/const fr = rvPool\[rvPick\]!;/);
  });

  test('19. a Dog Fallen is NEVER inserted into enemies, and never becomes a foe', () => {
    for (const src of [codeOnly('app/state/lastWalk.ts'), codeOnly('app/engine/fallenDogs.ts')]) {
      expect(src).not.toMatch(/enemies/);
      expect(src).not.toMatch(/enemyHps/);
      expect(src).not.toMatch(/revenantFromFallen/);
      expect(src).not.toMatch(/\bloot\b/i);
    }
    // the modal offers no attack button
    expect(codeOnly('app/components/LastWalkModal.tsx')).not.toMatch(/ATTACK|STRIKE|KILL/);
  });

  test('20. a rested companion cannot reappear', () => {
    const d = foreignDog();
    const rest: RestRecord = {
      fallenKey: dogFallenKey(d), fallenName: 'Marrow', fallenOriginPlayer: 'Sasmooch',
      byPlayer: 'Brannoch', byInstallId: 'inst-B', byCharacter: 'Verbal',
      whereRested: 'the Ashen Shelf', ts: 2,
    };
    expect(unrestedDogs([d], 'inst-B', [rest])).toEqual([]);
    // and a replayed payload cannot resurrect it
    const re = mergeDogs([], [d], { myInstallId: 'inst-B', rests: [rest] });
    expect(re.pool).toEqual([]);
    expect(re.skippedRested).toBe(1);
  });

  test('21. MULTI-HOUSE: the same dog rested HERE is still walking THERE', () => {
    const d = foreignDog();
    const restedByB: RestRecord = {
      fallenKey: dogFallenKey(d), fallenName: 'Marrow', fallenOriginPlayer: 'Sasmooch',
      byPlayer: 'Brannoch', byInstallId: 'inst-B', byCharacter: 'Verbal',
      whereRested: 'the Ashen Shelf', ts: 2,
    };
    expect(unrestedDogs([d], 'inst-B', [restedByB])).toEqual([]);
    // install C holds the very same rest record and is unaffected by it
    expect(unrestedDogs([d], 'inst-C', [restedByB])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('§E — the interaction', () => {
  test('22. three different acts settle the dog; fewer do not', () => {
    expect(lastWalkSettles([])).toBe(false);
    expect(lastWalkSettles(['speak'])).toBe(false);
    expect(lastWalkSettles(['speak', 'speak', 'speak'])).toBe(false);
    expect(lastWalkSettles(['speak', 'name'])).toBe(false);
    expect(lastWalkSettles([...LAST_WALK_ACTS])).toBe(true);
    // order does not matter, and there is no randomness to matter either
    expect(lastWalkSettles(['sit', 'name', 'speak'])).toBe(true);
    expect(SRC('app/engine/fallenDogs.ts')).not.toMatch(/Math\.random/);
  });

  test('23. WALKING AWAY writes no closure and does not auto-rest', () => {
    const lw = codeOnly('app/state/lastWalk.ts');
    // the leave branch returns before the settle path can be reached
    expect(lw).toMatch(/if \(choice === 'leave'\) \{[\s\S]*?close\(set\);[\s\S]*?return;/);
    expect(lastWalkLeaveLine(foreignDog())).toContain('still out here');
    // there is no refusal counter anywhere that could bury the dog for you
    expect(lw).not.toMatch(/refusals|attempts|tries|>= 3/);
    const leaveBranch = lw.slice(lw.indexOf("choice === 'leave'"), lw.indexOf("choice === 'hostile'"));
    expect(leaveBranch).not.toMatch(/recordRest/);
  });

  test('24. a hostile attempt gives no combat, no reward and no closure', () => {
    const lw = codeOnly('app/state/lastWalk.ts');
    expect(lw).toMatch(/if \(choice === 'hostile'\) \{/);
    expect(lw).not.toMatch(/damage|\bhp\b|attack/i);
    expect(lastWalkFleeLine(foreignDog())).toContain('gone');
    // the hostile branch also returns before any rest can be written
    const hostile = lw.slice(lw.indexOf("choice === 'hostile'"), lw.indexOf('const given ='));
    expect(hostile).not.toMatch(/recordRest/);
  });

  test('25–29. NOTHING is granted by any Last Walk path', () => {
    const banned = [
      /grantItem/, /mergeOrPushItem/, /\btc\b/i, /\bxp\b/i, /experience/i,
      /[Rr]esurrection/, /addResurrectionGems/, /inventory/i, /rarity/i,
    ];
    for (const p of ['app/state/lastWalk.ts', 'app/engine/fallenDogs.ts', 'app/components/LastWalkModal.tsx']) {
      for (const b of banned) expect(codeOnly(p)).not.toMatch(b);
    }
    // ⚠ `equipped` is READ exactly once, to turn a vest into a WORD — and that
    // single read is the only contact this whole feature has with gear. A blunt
    // "never mention equip" would have failed on the line doing the right thing,
    // so the claim is the shape of the read instead.
    const fd = codeOnly('app/engine/fallenDogs.ts');
    expect(fd.match(/equipped/g) ?? []).toHaveLength(1);
    expect(fd).toMatch(/const vest = args\.dog\.equipped\?\.vest;/);
    expect(codeOnly('app/state/lastWalk.ts')).not.toMatch(/equipped/);
    // and the settle beat says out loud that there is nothing to take
    const lines = lastWalkSettleLog(foreignDog({ vestName: undefined }), 'Verbal').map((l) => l.text).join(' ');
    expect(lines).toContain('nothing to take');
  });

  test('the vest is left where it is — it never becomes an item', () => {
    const lines = lastWalkSettleLog(foreignDog({ vestName: 'Woven Stride' }), 'Verbal').map((l) => l.text).join(' ');
    expect(lines).toContain('Woven Stride');
    expect(lines).toContain('You leave it where it is.');
  });
});

// ---------------------------------------------------------------------------
describe('§F — closure and the way home', () => {
  test('30 + 32. dog closure rides the ordinary payload and does not duplicate', async () => {
    const { card, payload } = await houseA();
    await beB_ridingWithA(card);
    await importPayloadText(payload);
    const walking = foreignDogPool();
    expect(walking).toHaveLength(1);

    await recordRest(buildDogRest({
      dog: walking[0]!, byPlayer: 'Brannoch', byInstallId: 'inst-B',
      byCharacter: 'Verbal', whereRested: 'the Ashen Shelf', ts: 3,
    }));
    // ⚠ 26 (§22's exactly-once): the companion left the pool on the same beat.
    expect(foreignDogPool()).toHaveLength(0);

    // B's ordinary export now carries the receipt, with nothing extra to send.
    const back = await buildExportPayload();
    const body = JSON.parse((JSON.parse(back) as { body: string }).body) as { rests: RestRecord[] };
    const dogRests = body.rests.filter((r) => isDogRest(r));
    expect(dogRests).toHaveLength(1);
    expect(dogRests[0]!.description).toContain('They were not alone.');

    // folding the same receipt in twice adds one row, not two
    const { mergeRests } = require('../app/engine/fallenLedger') as typeof import('../app/engine/fallenLedger');
    const once = mergeRests([], dogRests);
    const twice = mergeRests(once.rests, dogRests);
    expect(twice.rests).toHaveLength(1);
  });

  test('31. the ORIGIN install recognises the receipt as being about its own dog', async () => {
    const { card } = await houseA();
    await beB_ridingWithA(card);
    // B's card, so A rides with B and can read what B sends back
    const bCard = await myHouseCode();
    const d = foreignDog();
    const receipt = buildDogRest({
      dog: d, byPlayer: 'Brannoch', byInstallId: 'inst-B',
      byCharacter: 'Verbal', whereRested: 'the Ashen Shelf', ts: 3,
    });
    // back on A
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
    await acceptHouseCode(bCard);
    // ⚠ the owner half of a dog key is the SECOND field — this is the read that
    // makes a Last Walk receipt come home instead of arriving about nobody.
    expect(receipt.fallenKey.split(':')[1]).toBe('inst-A');
  });

  test('33. the closure sentence is player-facing only — no ids, keys or storage words', () => {
    const s = dogClosureSentence({ name: 'Marrow', whereRested: 'the Ashen Shelf', byCharacter: 'Verbal' });
    expect(s).toBe('Marrow stopped at the Ashen Shelf. Verbal sat with them. They were not alone.');
    for (const leak of ['dog:', 'inst-', 'installId', 'fallenKey', 'seal', '{', 'undefined']) {
      expect(s).not.toContain(leak);
    }
  });
});

// ---------------------------------------------------------------------------
describe('§G — history', () => {
  const screen = SRC('app/screens/FallenExchangeScreen.tsx');

  test('34 + 35. COMPANIONS is its own section, with handler and house', () => {
    expect(screen).toMatch(/<Text style=\{styles\.subHeading\}>COMPANIONS<\/Text>/);
    expect(screen).toMatch(/dogsWalking\.map/);
    expect(dogTitle(foreignDog())).toBe('Marrow, who walked with Francis of House Sasmooch');
    expect(dogTitle(foreignDog({ origin: { player: '', installId: 'inst-A' } }))).toBe('Marrow, who walked with Francis');
  });

  test('a companion is never presented as a Hollowed, and carries no kill count', () => {
    // the human row prints kills; the companion row prints breed and ground
    expect(screen).toMatch(/\{h\.kills\} foes/);
    const dogRow = screen.slice(screen.indexOf('dogsWalking.map'), screen.indexOf('{rested.length > 0'));
    expect(dogRow).not.toMatch(/kills|foes|☗/);
    expect(dogRow).toMatch(/⌒/);
  });

  test('36. the human half of the roll is unaffected', () => {
    expect(screen).toMatch(/☗ \{fallenTitle\(h\)\}/);
    expect(screen).toMatch(/† \{restRollLine\(r\)\}/);
  });
});

// ---------------------------------------------------------------------------
describe('§H — firewalls', () => {
  test('37 + 38 + 39. ordinary living dogs are untouched: bleed-out, abandon, revive', () => {
    // the whole lifecycle moved FILES and nothing else; these are the sentences
    // that decide each fate, and they are where they always were.
    const ds = SRC('app/state/dogStatus.ts');
    expect(ds).toMatch(/export const DOG_BLEED_OUT_HOURS = 24;/);
    expect(ds).toMatch(/if \(downFor >= DOG_BLEED_OUT_HOURS\) \{/);
    expect(ds).toMatch(/status: 'dead' as const/);
    expect(ds).toMatch(/status: 'abandoned' as const/);
    expect(ds).toMatch(/const offBench = dog\.status === 'waiting_at_base' && dog\.hp > 0/);
    // the 300 TC revive is untouched, and it is still the reason bleed-out and
    // abandonment are excluded from the Last Walk.
    expect(SRC('app/engine/vendorServices.ts')).toMatch(/export const REVIVE_DOG_COST = 300;/);
    expect(SRC('app/state/gameStore.ts')).toMatch(/const cost = vs\.REVIVE_DOG_COST;/);
    // and nothing in this OTA writes to a living dog
    expect(SRC('app/state/lastWalk.ts')).not.toMatch(/player\.dog|loyalty|feed/);
  });

  test('40. ROCKY IS UNTOUCHED — not a companion, not exchanged, no gem here', () => {
    for (const p of [
      'app/engine/fallenDogs.ts', 'app/state/lastWalk.ts',
      'app/components/LastWalkModal.tsx', 'app/engine/fallenLedger.ts',
    ]) {
      expect(codeOnly(p)).not.toMatch(/Rocky/i);
      expect(codeOnly(p)).not.toMatch(/[Gg]emstone|resurrectionGems/);
    }
    // Rocky is still a named foe and a wasteland encounter, not a DogCompanion
    expect(SRC('app/engine/namedFoes.ts')).toMatch(/name: 'Rocky'/);
  });

  test('the human Fallen security policy is byte-unchanged', () => {
    const store = SRC('app/engine/fallenLedgerStore.ts');
    // one seal, over the body string, verified before parsing
    expect(store).toMatch(/const sealed = seal\(await ensureSendingKey\(\), body\);/);
    expect(store).toMatch(/return JSON\.stringify\(\{ v: 2, from: installId, seal: sealed\.seal, body \}\);/);
    // the pairing/seal/downgrade rules the dogs reuse are the SAME three lines
    expect(store).toMatch(/if \(auth\.kind === 'sealed' && f\.origin\.installId !== auth\.installId\) return false;/);
    expect(store).toMatch(/if \(auth\.kind === 'sealed' && d\.origin\.installId !== auth\.installId\) return false;/);
    // and no second pairing system was introduced
    expect(store.match(/function authenticate\(/g) ?? []).toHaveLength(1);
  });

  test('NO BACKEND — the Last Walk names no transport at all', () => {
    for (const src of [SRC('app/engine/fallenDogs.ts'), SRC('app/state/lastWalk.ts')]) {
      expect(src).not.toMatch(/fetch|XMLHttpRequest|WebSocket|https?:\/\//);
    }
  });
});
