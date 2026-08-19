// ⚠⚠ OTA-1360 — THE MAILBOX, THE SEAL IN ANGER, AND THE GEAR FAUCET.
//
// GOLEM LINE ONLY. The last three pieces the owner asked for after reviewing the
// handshake: automatic delivery, authenticity, and the gear decision I had been
// leaving open.
//
// ⚠ The mailbox tests never touch the network. `fetch` is stubbed, because what
// needs proving is the POLICY: off unless configured, refuses a junk address,
// respects its own floor between runs, swallows every failure whole, and — the
// one that matters — hands what it fetched to the SAME door a pasted payload
// uses. A transport that skipped the validator or the pairing gate would undo
// both in one line.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildExportPayload,
  importPayloadText,
  acceptHouseCode,
  myHouseCode,
  foreignPool,
  unwrapEnvelope,
  _setLedgerForTests,
  _setIdentityForTests,
  _setPairedForTests,
  _setSendingKeyForTests,
} from '../app/engine/fallenLedgerStore';
import { makeHouseCode, parseHouseCode, FOREIGN_RECLAIM_WEAPON_ONLY } from '../app/engine/fallenLedger';
import { revenantFromFallen, isForeignFallen, _setFallenCacheForTests } from '../app/engine/fallenRevenants';
import { recordFallen } from '../app/engine/saveSystem';
import {
  syncNow,
  maybeAutoSync,
  setMailboxConfig,
  loadMailboxConfig,
  _setMailboxForTests,
  _setMailboxEnabledForTests,
  MAILBOX_ENABLED,
  SYNC_MIN_INTERVAL_MS,
} from '../app/engine/fallenMailbox';

jest.setTimeout(60_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const DEAD = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

async function asPhone(installId: string, house: string, key: string, paired: { installId: string; key?: string }[] = []): Promise<void> {
  await AsyncStorage.clear();
  _setIdentityForTests(installId, house);
  _setSendingKeyForTests(key);
  _setLedgerForTests({ foreign: [], rests: [] });
  _setPairedForTests(paired.map((p) => ({ player: `house_${p.installId}`, installId: p.installId, addedTs: 1, ...(p.key ? { key: p.key } : {}) })));
  _setMailboxForTests({ url: '', token: '', auto: false });
}

describe('OTA-1360 — the seal, in anger', () => {
  it('⚠⚠ a house card now carries the sending key, and still parses the old shape', async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    const card = await myHouseCode();
    expect(card).toContain('TAR2.');
    expect(parseHouseCode(card)).toEqual({ player: 'Sasmooch', installId: 'inst-A', key: 'key-A' });
    // A card written before seals existed still pairs — unsealed, not rejected.
    const old = makeHouseCode('Older', 'inst-Old');
    expect(old).toContain('TAR1.');
    expect(parseHouseCode(old)).toEqual({ player: 'Older', installId: 'inst-Old' });
    // A house name containing the separator does not lose its id or key.
    const odd = makeHouseCode('House|of|Bars', 'inst-B', 'key-B');
    expect(parseHouseCode(odd)).toEqual({ player: 'House|of|Bars', installId: 'inst-B', key: 'key-B' });
  });

  it("⚠⚠ a sealed payload from a paired house lands; the SAME payload tampered does not", async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    await recordFallen({ ...DEAD, ts: 1_760_100_000_000 } as never);
    const sealed = await buildExportPayload();

    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A', key: 'key-A' }]);
    const ok = await importPayloadText(sealed);
    expect(ok.added).toBe(1);
    expect(ok.forged).toBe(false);

    // The tamper the seal exists to catch: a corpse edited in flight.
    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A', key: 'key-A' }]);
    const tampered = sealed.replace('"kills\\":42', '"kills\\":499');
    const bad = await importPayloadText(tampered);
    expect(bad.added).toBe(0);
    expect(bad.forged).toBe(true);
    expect(foreignPool()).toHaveLength(0);
  });

  it('⚠⚠ a stranger who KNOWS a paired house id still cannot write as them', async () => {
    // The mailbox threat model: anyone who can drop a file in the box can claim
    // to be anyone. Without the key, the claim is worthless.
    await asPhone('inst-EVIL', 'Impostor', 'key-EVIL');
    await recordFallen({ ...DEAD, name: 'Gift Horse', ts: 1_760_200_000_000 } as never);
    const forgedPayload = (await buildExportPayload()).replace(/inst-EVIL/g, 'inst-A');

    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A', key: 'key-A' }]);
    const out = await importPayloadText(forgedPayload);
    expect(out.forged).toBe(true);
    expect(out.added).toBe(0);
  });

  it('⚠ a house that gave us a key cannot later downgrade to unsealed', async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    await recordFallen({ ...DEAD, ts: 1_760_300_000_000 } as never);
    const sealed = await buildExportPayload();
    const bare = unwrapEnvelope(sealed); // the inner ledger, seal stripped

    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A', key: 'key-A' }]);
    const out = await importPayloadText(bare);
    expect(out.added).toBe(0);
    expect(out.unpaired).toBeGreaterThan(0);
  });

  it('⚠ a pre-seal pairing still works, and says so', async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    await recordFallen({ ...DEAD, ts: 1_760_400_000_000 } as never);
    const bare = unwrapEnvelope(await buildExportPayload());

    // Paired with NO key on file — the old TAR1 case.
    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A' }]);
    const out = await importPayloadText(bare);
    expect(out.added).toBe(1);
    expect(out.unsealed).toBe(1);
  });

  it('⚠⚠ accepting a card stores the key, so the next payload verifies', async () => {
    await asPhone('inst-B', 'Verbal', 'key-B');
    const theirCard = makeHouseCode('Sasmooch', 'inst-A', 'key-A');
    const res = await acceptHouseCode(theirCard);
    expect(res.ok).toBe(true);
    expect(res.ok && res.house.key).toBe('key-A');
  });
});

describe('OTA-1360 — the gear faucet', () => {
  afterEach(() => { _setFallenCacheForTests(null); });

  it("⚠⚠ THE DECISION: a foreign corpse yields its WEAPON only; your own is untouched", () => {
    // Armour is where the volume lives — four slots per corpse times five
    // houses — and it arrives from saves this player does not control. The
    // weapon is the point of the whole beat and you can only swing one.
    expect(FOREIGN_RECLAIM_WEAPON_ONLY).toBe(true);
    const mine = { ...DEAD, ts: 1 } as never;
    const theirs = { ...DEAD, ts: 2, origin: { player: 'Sasmooch', installId: 'inst-A' } } as never;
    expect(isForeignFallen(mine)).toBe(false);
    expect(isForeignFallen(theirs)).toBe(true);

    const ownFoe = revenantFromFallen(mine, 120);
    const foreignFoe = revenantFromFallen(theirs, 120);
    // Your own dead: the armour drop pool is intact, exactly as before.
    expect(ownFoe.loot.length).toBeGreaterThan(0);
    // Theirs: no armour rolls at all.
    expect(foreignFoe.loot).toHaveLength(0);
    // ⚠ But the fight is the same fight, and the RARITY is untouched — degrading
    // a foreign Legendary would lie about what that character actually carried.
    expect(foreignFoe.rarity).toBe('Legendary');
    expect(foreignFoe.boss).toBe(true);
    expect(foreignFoe.hp).toBe(ownFoe.hp);
  });
});

describe('OTA-1360 — the mailbox', () => {
  const realFetch = global.fetch;
  // ⚠ Shipped dark (MAILBOX_ENABLED = false) until it has somewhere to live.
  // The machinery is complete, so the suite lifts the flag to exercise it and
  // drops it again — and the first test below pins the shipped state itself.
  beforeEach(() => { _setMailboxEnabledForTests(true); });
  afterEach(() => { global.fetch = realFetch; _setMailboxForTests(null); _setMailboxEnabledForTests(null); });

  it('⚠⚠ SHIPPED DARK: with the flag as it ships, nothing is contacted at all', async () => {
    // An address field that silently never works is worse than no field. Until
    // the box exists, the whole path is inert — not merely unconfigured.
    expect(MAILBOX_ENABLED).toBe(false);
    _setMailboxEnabledForTests(null);
    await asPhone('inst-A', 'Sasmooch', 'key-A', [{ installId: 'inst-B', key: 'key-B' }]);
    _setMailboxForTests({ url: 'https://box.example/fallen', token: 't', auto: true });
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    const out = await syncNow({ force: true });
    expect(out.ran).toBe(false);
    expect(out.reason).toBe('coming-soon');
    maybeAutoSync();
    expect(spy).not.toHaveBeenCalled();
  });

  it('⚠⚠ OFF until an address is set — a build that never opted in sends nothing', async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A', [{ installId: 'inst-B', key: 'key-B' }]);
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    const out = await syncNow({ force: true });
    expect(out.ran).toBe(false);
    expect(out.reason).toBe('off');
    expect(spy).not.toHaveBeenCalled();
  });

  it('⚠ a junk address is refused as a refusal, not sent as a mystery request', async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    _setMailboxForTests({ url: 'not a url', token: '', auto: true });
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    const out = await syncNow({ force: true });
    expect(out.ran).toBe(false);
    expect(out.reason).toBe('bad-url');
    expect(spy).not.toHaveBeenCalled();
  });

  it('⚠⚠ ONE ROUND: it leaves our dead in the box and reads every house we ride with', async () => {
    // Build a real sealed payload from house A first.
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    await recordFallen({ ...DEAD, ts: 1_760_500_000_000 } as never);
    const fromA = await buildExportPayload();

    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A', key: 'key-A' }]);
    _setMailboxForTests({ url: 'https://box.example/fallen', token: 'tok', auto: true });

    const calls: { url: string; method: string }[] = [];
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' });
      if ((init?.method ?? 'GET') === 'PUT') return { ok: true, text: async () => '' } as unknown as Response;
      return { ok: true, text: async () => fromA } as unknown as Response;
    }) as unknown as typeof fetch;

    const out = await syncNow({ force: true });
    expect(out.ran).toBe(true);
    expect(out.pushed).toBe(true);
    expect(out.pulled).toBe(1);
    // Our own box is written; the paired house's is read.
    expect(calls.some((c) => c.method === 'PUT' && c.url.includes('inst-B'))).toBe(true);
    expect(calls.some((c) => c.method === 'GET' && c.url.includes('inst-A'))).toBe(true);
    // ⚠⚠ AND IT WENT THROUGH THE SAME DOOR: sealed, paired, validated, merged.
    expect(out.imported[0]!.added).toBe(1);
    expect(foreignPool()).toHaveLength(1);
  });

  it('⚠⚠ the mailbox gets NO shortcuts: an unpaired house it fetches is still refused', async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    await recordFallen({ ...DEAD, ts: 1_760_600_000_000 } as never);
    const fromA = await buildExportPayload();

    // B rides alone but is somehow pointed at A's box.
    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-C', key: 'key-C' }]);
    _setMailboxForTests({ url: 'https://box.example/fallen', token: '', auto: true });
    global.fetch = (async (_u: string, init?: RequestInit) =>
      ((init?.method ?? 'GET') === 'PUT'
        ? { ok: true, text: async () => '' }
        : { ok: true, text: async () => fromA })) as unknown as typeof fetch;

    const out = await syncNow({ force: true });
    expect(out.ran).toBe(true);
    // Fetched, then turned away — the transport does not get to bypass pairing.
    expect(out.imported.every((i) => i.added === 0)).toBe(true);
    expect(foreignPool()).toHaveLength(0);
  });

  it('⚠⚠ every failure is swallowed whole — the game never learns this ran', async () => {
    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A', key: 'key-A' }]);
    _setMailboxForTests({ url: 'https://box.example/fallen', token: '', auto: true });
    for (const mode of ['throw', 'notOk', 'garbage'] as const) {
      global.fetch = (async () => {
        if (mode === 'throw') throw new Error('no signal');
        if (mode === 'notOk') return { ok: false, text: async () => '' } as unknown as Response;
        return { ok: true, text: async () => 'not a ledger at all' } as unknown as Response;
      }) as unknown as typeof fetch;
      _setMailboxForTests({ url: 'https://box.example/fallen', token: '', auto: true });
      await expect(syncNow({ force: true })).resolves.toBeDefined();
      expect(foreignPool()).toHaveLength(0);
    }
  });

  it('⚠ the heartbeat keeps its own floor and declines quietly', async () => {
    await asPhone('inst-B', 'Verbal', 'key-B', [{ installId: 'inst-A', key: 'key-A' }]);
    const spy = jest.fn(async () => ({ ok: true, text: async () => '' } as unknown as Response));
    global.fetch = spy as unknown as typeof fetch;

    // Auto off → never runs, however often it is nudged.
    _setMailboxForTests({ url: 'https://box.example/fallen', token: '', auto: false });
    maybeAutoSync(); maybeAutoSync();
    expect(spy).not.toHaveBeenCalled();

    // Auto on but inside the floor → declines.
    _setMailboxForTests({ url: 'https://box.example/fallen', token: '', auto: true }, Date.now());
    maybeAutoSync();
    expect(spy).not.toHaveBeenCalled();

    // A forced run is not blocked by the floor.
    const out = await syncNow({ force: true });
    expect(out.ran).toBe(true);
    expect(SYNC_MIN_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('⚠ config persists and is bounded', async () => {
    await asPhone('inst-A', 'Sasmooch', 'key-A');
    _setMailboxForTests(null);
    await setMailboxConfig({ url: `https://box.example/${'x'.repeat(500)}`, token: 't'.repeat(400), auto: true });
    const cfg = await loadMailboxConfig();
    expect(cfg.url.length).toBeLessThanOrEqual(300);
    expect(cfg.token.length).toBeLessThanOrEqual(200);
    expect(cfg.auto).toBe(true);
  });
});
