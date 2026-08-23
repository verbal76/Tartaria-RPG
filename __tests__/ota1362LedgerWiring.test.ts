// ⚠⚠ OTA-1362 — THE SHARED ROLL OF THE FALLEN: the wiring.
//
// GOLEM LINE ONLY. The validator + merge rules are locked in
// ota1362FallenLedger; this suite covers everything that connects them to the
// running game — identity, disk, the exchange, the spawner pool, the escalating
// roll, and the defeat path that writes a rest instead of mutating a record it
// does not own.
//
// ⚠ THE CENTREPIECE IS THE TWO-PHONE ROUND TRIP. Everything else here is a
// component check; the round trip is the feature. One install exports its dead,
// a second imports them, the corpse rises in the second world carrying its
// house, the second world puts it down, and the receipt travels home. If that
// passes, the owner and one other player can run this on two golem APKs.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ensureInstallId,
  cachedInstallId,
  setHouseName,
  loadHouseName,
  buildExportPayload,
  importPayloadText,
  recordRest,
  loadLedger,
  foreignPool,
  myHouseCode,
  acceptHouseCode,
  revokeHouse,
  loadPaired,
  _setLedgerForTests,
  _setIdentityForTests,
  _setPairedForTests,
} from '../app/engine/fallenLedgerStore';
import {
  fallenKey,
  fallenTitle,
  revenantSpawnChance,
  makeHouseCode,
  parseHouseCode,
  REVENANT_BASE_CHANCE,
  REVENANT_CHANCE_CEILING,
  type ForeignFallen,
} from '../app/engine/fallenLedger';
import { revenantPool, _setFallenCacheForTests, revenantFromFallen } from '../app/engine/fallenRevenants';
import { recordFallen } from '../app/engine/saveSystem';
import { blockAt } from '../test-utils/srcBlock';

jest.setTimeout(60_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

/** Put the module set into a known install's shoes: its own identity, its own
 *  empty ledger, and — the part that matters — its OWN roll of the dead. The
 *  first draft of this helper left the global stash shared, so "phone B" was
 *  exporting phone A's corpses as its own and the round trip proved less than
 *  it looked. Identity and ledger ride injected caches, so clearing storage
 *  isolates the stash without disturbing either. */
async function asPhone(installId: string, house: string, paired: string[] = []): Promise<void> {
  await AsyncStorage.clear();
  _setIdentityForTests(installId, house);
  _setLedgerForTests({ foreign: [], rests: [] });
  // ⚠ Houses this phone has ACCEPTED. Empty means it rides alone, and no dead
  // may cross into it however well-formed their payload is.
  _setPairedForTests(paired.map((id) => ({ player: `house_${id}`, installId: id, addedTs: 1 })));
}

const DEAD = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

describe('OTA-1362 — identity and the house', () => {
  it('⚠ an install id is minted once and never drifts', async () => {
    _setIdentityForTests(null, null);
    const a = await ensureInstallId();
    const b = await ensureInstallId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
    expect(cachedInstallId()).toBe(a);
  });

  it('⚠ a house name is bounded and scrubbed before it can ride out with a corpse', async () => {
    _setIdentityForTests('inst-x', null);
    await setHouseName('  Sas\u0000mooch  ');
    expect(await loadHouseName()).toBe('Sas mooch');
    await setHouseName('H'.repeat(200));
    expect((await loadHouseName()).length).toBeLessThanOrEqual(32);
  });
});

describe('OTA-1362 — the exchange', () => {
  it('⚠⚠ THE TWO-PHONE ROUND TRIP: dead go out, rise abroad, and the receipt comes home', async () => {
    // ── Phone A: a character dies, and A sends its dead out ─────────────────
    await asPhone('inst-A', 'Sasmooch');
    await recordFallen({ ...DEAD, ts: 1_760_000_000_000 } as never);
    const payloadFromA = await buildExportPayload();
    expect(payloadFromA).toContain('Francis');
    expect(payloadFromA).toContain('Sasmooch');
    expect(payloadFromA).toContain('inst-A');

    // ── Phone B: has accepted A's house card, and only then takes them in ───
    await asPhone('inst-B', 'Verbal', ['inst-A']);
    const inbound = await importPayloadText(payloadFromA);
    expect(inbound.added).toBe(1);
    expect(inbound.rejected).toBe(0);
    // ⚠ The lineage is what travelling adds — B's roll names A's house.
    expect(inbound.arrivals[0]).toBe('Francis child of Sasmooch');

    // The corpse is live in B's world and reachable by the spawner.
    const pool = foreignPool();
    expect(pool).toHaveLength(1);
    const corpse = pool[0]!;
    expect(fallenTitle(corpse)).toBe('Francis child of Sasmooch');
    // And it builds a real fight, through the untouched existing machinery.
    const foe = revenantFromFallen(corpse, 120);
    expect(foe.name).toBe('Hollowed Francis');
    expect(foe.boss).toBe(true);

    // ── B puts it down: an append-only rest, never a mutation of A's record ──
    await recordRest({
      fallenKey: fallenKey(corpse),
      fallenName: corpse.name,
      fallenOriginPlayer: corpse.origin.player,
      byPlayer: 'Verbal', byInstallId: 'inst-B', byCharacter: 'Halla',
      whereRested: 'the Sunken Verge', ts: Date.now(),
      description: 'It went down in the shallows mid-word and did not get up.',
    });
    // It leaves B's pool at once — a rested Hollowed must not rise again.
    expect(foreignPool()).toHaveLength(0);
    const bLedger = await loadLedger();
    expect(bLedger.rests).toHaveLength(1);

    // ── The receipt travels home on B's next export ─────────────────────────
    const payloadFromB = await buildExportPayload();
    expect(payloadFromB).toContain('the Sunken Verge');

    // ── Phone A reads how its own child finally ended ───────────────────────
    await asPhone('inst-A', 'Sasmooch', ['inst-B']);
    const back = await importPayloadText(payloadFromB);
    expect(back.rests).toBe(1);
    // B sent a receipt, not an army: it had no dead of its own this run.
    expect(back.added).toBe(0);
    const aLedger = await loadLedger();
    expect(aLedger.rests[0]!.byCharacter).toBe('Halla');
    expect(aLedger.rests[0]!.description).toContain('shallows');
  });

  it("⚠⚠ your own dead never come home as enemies — and TWO layers say so", async () => {
    // In a five-house ring a payload finds its way back to the house that wrote
    // it. Since the handshake landed, the GATE stops it first: you do not ride
    // with yourself, so your own records are not wanted. The merge's own-dead
    // rule sits underneath as the second layer, and this proves it still bites
    // when the gate is forced open — which is what defence in depth means.
    await asPhone('inst-A', 'Sasmooch');
    await recordFallen({ ...DEAD, ts: 1_760_000_900_000 } as never);
    const mine = await buildExportPayload();

    // Layer 1 — the gate.
    const gated = await importPayloadText(mine);
    expect(gated.added).toBe(0);
    expect(gated.unpaired).toBeGreaterThan(0);
    expect(foreignPool()).toHaveLength(0);

    // Layer 2 — force the gate open by pairing this house with ITSELF (which
    // acceptHouseCode refuses outright), and the merge still turns them back.
    _setPairedForTests([{ player: 'Sasmooch', installId: 'inst-A', addedTs: 1 }]);
    const merged = await importPayloadText(mine);
    expect(merged.added).toBe(0);
    expect(merged.skippedOwn).toBeGreaterThan(0);
    expect(foreignPool()).toHaveLength(0);
  });

  it('⚠ importing the same payload twice changes nothing the second time', async () => {
    await asPhone('inst-A', 'Sasmooch');
    await recordFallen({ ...DEAD, name: 'Wren', ts: 1_760_000_500_000 } as never);
    const payload = await buildExportPayload();
    await asPhone('inst-C', 'Third', ['inst-A']);
    const first = await importPayloadText(payload);
    const second = await importPayloadText(payload);
    expect(first.added).toBeGreaterThan(0);
    expect(second.added).toBe(0);
    expect(second.skippedDuplicate).toBeGreaterThan(0);
  });

  it('⚠⚠ a hostile or torn paste costs the paste, never the ledger', async () => {
    await asPhone('inst-D', 'Fourth');
    const before = (await loadLedger()).foreign.length;
    for (const junk of ['', 'not json at all', '{"fallen":[{"name"', '{"fallen":[{"name":"X"}]}']) {
      const out = await importPayloadText(junk);
      expect(out.added).toBe(0);
    }
    expect((await loadLedger()).foreign).toHaveLength(before);
  });
});

describe('OTA-1362 — the spawner join', () => {
  afterEach(() => { _setFallenCacheForTests(null); });

  it('⚠⚠ the pool the spawner draws from is LOCAL dead plus IMPORTED dead', async () => {
    await asPhone('inst-B', 'Verbal');
    _setFallenCacheForTests([
      { ...DEAD, name: 'MyOwn', ts: 1 } as never,
      { ...DEAD, name: 'AlreadyRested', ts: 2, avengedTs: 5 } as never,
    ]);
    const foreign: ForeignFallen = {
      ...DEAD, name: 'Theirs', ts: 1_760_000_000_000,
      origin: { player: 'Sasmooch', installId: 'inst-A' },
    } as ForeignFallen;
    _setLedgerForTests({ foreign: [foreign], rests: [] });

    const names = revenantPool().map((f) => f.name);
    expect(names).toContain('MyOwn');
    expect(names).toContain('Theirs');
    // An avenged local corpse stays out, exactly as before this OTA.
    expect(names).not.toContain('AlreadyRested');
  });

  it('⚠ a ledger that fails to load costs the extra pool and nothing else', () => {
    _setFallenCacheForTests([{ ...DEAD, name: 'MyOwn', ts: 1 } as never]);
    _setLedgerForTests({ foreign: [], rests: [] });
    expect(revenantPool().map((f) => f.name)).toEqual(['MyOwn']);
  });

  it("⚠⚠ THE DIFFICULTY DIAL: the roll climbs with the pool, and it has a ceiling", () => {
    // Owner: "it makes the game harder as the fallen start to populate the
    // world." A flat rate against a bigger pool is variety, not danger.
    expect(revenantSpawnChance(0)).toBeCloseTo(REVENANT_BASE_CHANCE);
    expect(revenantSpawnChance(4)).toBeGreaterThan(revenantSpawnChance(0));
    expect(revenantSpawnChance(40)).toBe(REVENANT_CHANCE_CEILING);
    // Never runaway, never negative, never NaN.
    expect(revenantSpawnChance(10_000)).toBe(REVENANT_CHANCE_CEILING);
    expect(revenantSpawnChance(-5)).toBeCloseTo(REVENANT_BASE_CHANCE);
    expect(Number.isFinite(revenantSpawnChance(Number.NaN))).toBe(true);
  });
});

describe('OTA-1362 — the store wiring, locked at the source', () => {
  const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('⚠⚠ the spawn site draws the joined pool and rolls the scaled chance', () => {
    expect(STORE).toContain('const rvPool = rev.revenantPool();');
    expect(STORE).toContain('rvLedger.revenantSpawnChance(rvForeignCount)');
    expect(STORE).toContain('Math.random() < rvChance');
    // The flat roll is gone FROM THIS SITE — 0.04 is a common enough constant
    // elsewhere in the store that a file-wide assertion would catch strangers.
    const at = STORE.indexOf('const rvPool = rev.revenantPool();');
    expect(at).toBeGreaterThan(-1);
    expect(blockAt(STORE, 'const rvPool = rev.revenantPool();')).not.toContain('Math.random() < 0.04');
  });

  it("⚠⚠ a foreign corpse gets a REST RECORD; a local one is still marked avenged", () => {
    // Mutating another house's record would break the union that lets two
    // phones merge without a referee — and it is not ours to edit.
    const i = STORE.indexOf('WHOSE ROLL DOES THIS DEATH GO ON?');
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 4000);
    expect(block).toContain('storeMod.recordRest({');
    expect(block).toContain('fallenKey: ledgerMod.fallenKey(');
    expect(block).toContain('description: closing.world');
    // The local path survives untouched inside the same branch.
    expect(block).toContain("rev998.markAvenged(fr.ts, get().player?.name ?? 'a wanderer');");
  });

  it('⚠ the codex surfaces both new rolls and the exchange', () => {
    const ui = readFileSync(join(__dirname, '..', 'app', 'components', 'LoreCodexBody.tsx'), 'utf8');
    expect(ui).toContain('THE HOLLOWED');
    expect(ui).toContain('PUT TO REST');
    expect(ui).toContain('SEND MY DEAD');
    expect(ui).toContain('TAKE IN THEIRS');
    expect(ui).toContain('fallenTitle(h)');
    expect(ui).toContain('restRollLine(r)');
  });
});

describe('OTA-1362 — the handshake', () => {
  it('⚠⚠ THE REQUEST: a house card round-trips, and a mangled one is REFUSED', async () => {
    await asPhone('inst-A', 'Sasmooch');
    const code = await myHouseCode();
    expect(code).toContain('TAR2.');
    const parsed = parseHouseCode(code);
    // The card now carries this house's sending key too (TAR2) — see the seal
    // suite for what that key is for.
    expect(parsed?.player).toBe('Sasmooch');
    expect(parsed?.installId).toBe('inst-A');
    expect(parsed?.key).toBeTruthy();
    // ⚠ A card that lost characters in a chat window must not pair you with a
    // broken id — the checksum makes truncation a refusal, not a silent bad pair.
    expect(parseHouseCode(code.slice(0, code.length - 3))).toBeNull();
    expect(parseHouseCode(`TAR1.${encodeURIComponent('Sasmooch|inst-TAMPERED')}.deadbeef`)).toBeNull();
    expect(parseHouseCode('hey check out this game')).toBeNull();
    expect(parseHouseCode(null)).toBeNull();
    // It survives being pasted inside a sentence, which is how it will arrive.
    const inSentence = parseHouseCode(`ride with me: ${code} — see you out there`);
    expect(inSentence?.player).toBe('Sasmooch');
    expect(inSentence?.installId).toBe('inst-A');
    expect(inSentence?.key).toBe(parsed?.key);
  });

  it('⚠ a house with no name still makes a usable card', () => {
    const code = makeHouseCode('', 'inst-Z');
    expect(parseHouseCode(code)?.installId).toBe('inst-Z');
  });

  it('⚠⚠ THE ACCEPT is the authorization, and it is idempotent', async () => {
    await asPhone('inst-B', 'Verbal');
    const theirCard = makeHouseCode('Sasmooch', 'inst-A');
    const first = await acceptHouseCode(theirCard);
    expect(first.ok).toBe(true);
    expect(first.ok && first.already).toBe(false);
    const again = await acceptHouseCode(theirCard);
    expect(again.ok && again.already).toBe(true);
    expect(await loadPaired()).toHaveLength(1);
  });

  it('⚠ you cannot ride with yourself, and junk is not a house card', async () => {
    await asPhone('inst-B', 'Verbal');
    const mine = await myHouseCode();
    const self = await acceptHouseCode(mine);
    expect(self.ok).toBe(false);
    expect(!self.ok && self.reason).toBe('self');
    const junk = await acceptHouseCode('not a card');
    expect(!junk.ok && junk.reason).toBe('unreadable');
    expect(await loadPaired()).toHaveLength(0);
  });

  it("⚠⚠ THE GATE: an unpaired house's dead are turned away even though they are valid", async () => {
    // Before the handshake existed, anything that parsed got in — "who am I
    // playing with" was answered by whoever pasted. Validation says a payload is
    // SAFE; pairing says it is WANTED, and they are different questions.
    await asPhone('inst-A', 'Sasmooch');
    await recordFallen({ ...DEAD, ts: 1_760_001_000_000 } as never);
    const payload = await buildExportPayload();

    await asPhone('inst-B', 'Verbal'); // rides alone
    const refused = await importPayloadText(payload);
    expect(refused.added).toBe(0);
    expect(refused.unpaired).toBeGreaterThan(0);
    expect(refused.rejected).toBe(0); // sanitised fine — simply not wanted
    expect(foreignPool()).toHaveLength(0);

    // Accept them, and the SAME payload lands.
    await acceptHouseCode(makeHouseCode('Sasmooch', 'inst-A'));
    const welcomed = await importPayloadText(payload);
    expect(welcomed.added).toBe(1);
    expect(welcomed.unpaired).toBe(0);
    expect(foreignPool()).toHaveLength(1);
  });

  it('⚠⚠ CUTTING OFF stops what comes next and keeps what you already agreed to', async () => {
    await asPhone('inst-A', 'Sasmooch');
    await recordFallen({ ...DEAD, name: 'First', ts: 1_760_002_000_000 } as never);
    const firstPayload = await buildExportPayload();
    await recordFallen({ ...DEAD, name: 'Second', ts: 1_760_003_000_000 } as never);
    const laterPayload = await buildExportPayload();

    await asPhone('inst-B', 'Verbal', ['inst-A']);
    await importPayloadText(firstPayload);
    expect(foreignPool()).toHaveLength(1);

    await revokeHouse('inst-A');
    const after = await importPayloadText(laterPayload);
    expect(after.added).toBe(0);
    expect(after.unpaired).toBeGreaterThan(0);
    // ⚠ The corpse already standing in your wastes stays — you agreed to it, and
    // a Hollowed mid-errand does not evaporate because two houses fell out.
    expect(foreignPool()).toHaveLength(1);
  });

  it('⚠ the codex carries the request and accept controls, and names who you ride with', () => {
    const ui = readFileSync(join(__dirname, '..', 'app', 'components', 'LoreCodexBody.tsx'), 'utf8');
    // ⚠ The mailbox ships as a COMING SOON note, not a field — an address that
    // silently never works is worse than none offered.
    expect(ui).toContain('THE MAILBOX  ·  COMING SOON');
    expect(ui).not.toContain('DELIVER NOW');
    expect(ui).toContain('SEND REQUEST');
    expect(ui).toContain('ACCEPT REQUEST');
    expect(ui).toContain('CUT OFF');
    expect(ui).toContain('YOU RIDE ALONE');
    expect(ui).toContain('void acceptRequest();');
    expect(ui).toContain('void sendRequest();');
  });
});
