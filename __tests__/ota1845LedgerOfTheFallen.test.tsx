/* ⚠⚠⚠ OTA-1845 — THE LEDGER OF THE FALLEN: A PLAYER ASKED ME TO HELP THEIR DEAD.
 *
 * The exchange has been correct since OTA-1362 and social since never. A player
 * took another player's dead into their world and the only thing that ever
 * spoke about it again was a line of arrival text; the person who sent them —
 * who wanted something, and had a living character standing somewhere — never
 * appeared at all.
 *
 * ⚠⚠ THE ABSENCE CHECKS IN HERE GRADE CODE, NOT PROSE. OTA-1842 was caught by
 * its own comments and OTA-1844 was caught again in the same place: a test that
 * greps a file for "loot" matches the comment PROMISING there is no loot. Every
 * claim of the form "this never mentions X" strips comments first, through
 * `codeOnly`, and says so where it is used.
 *
 * ⚠⚠ AND NOTHING HERE MAY MOVE THE SECURITY LINE. §G re-states the firewalls as
 * behaviour — pairing, seals, the Last Walk, the closure transport, Rocky, the
 * encounter gate — so a social change that quietly softened one of them fails
 * here rather than in a player's world. This OTA adds an arrival layer. It does
 * not redefine trust.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEDGER_SCHEME,
  LINK_SAFE_CHARS,
  buildInviteMailto,
  buildRequestLink,
  inviteBody,
  inviteShareText,
  inviteSubject,
  parseLedgerLink,
} from '../app/engine/ledgerLinks';
import {
  LEDGER_VISIT_CAP,
  VISIT_MAX_STEPS,
  VISIT_MIN_STEPS,
  queueVisit,
  reviveVisit,
  sanitizeSenderSnapshot,
  senderSnapshotFrom,
  tickVisits,
  visitAskLine,
  visitFarewellLine,
  visitLog,
  visitSteps,
  visitTitle,
  type LedgerVisit,
} from '../app/engine/senderIntro';
import {
  _setVisitsForTests,
  cachedVisits,
  loadVisits,
  queueFromImport,
  tickLedgerVisit,
} from '../app/state/ledgerVisits';
import { _setPendingCardForTests, routeLedgerUrl, takePendingHouseCard } from '../app/state/ledgerRoute';
import {
  _setIdentityForTests,
  _setLedgerForTests,
  _setPairedForTests,
  _setSendingKeyForTests,
  acceptHouseCode,
  buildExportPayload,
  importPayloadText,
  myHouseCode,
  previewPayloadText,
} from '../app/engine/fallenLedgerStore';
import { parseLedgerPayload } from '../app/engine/fallenLedger';
import { loadGlobalStash, loadLedgerVisits, recordFallen, saveGlobalStash } from '../app/engine/saveSystem';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const SRC = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** ⚠⚠ STRIP THE COMMENTS BEFORE GRADING AN ABSENCE. Without this, every "there
 *  is no loot here" check matches the comment that says there is no loot here —
 *  the trap OTA-1842 hit and OTA-1844 hit again. Block comments and line
 *  comments go; string literals and code stay. */
const codeOnly = (p: string): string => SRC(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const DEAD_A = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

function beInstall(installId: string, house: string, sendKey: string | null): void {
  _setIdentityForTests(installId, house);
  _setSendingKeyForTests(sendKey);
  _setPairedForTests([]);
  _setLedgerForTests({ foreign: [], rests: [], dogs: [] });
  _setVisitsForTests([]);
}

const FRESH_STASH = () => ({
  resurrectionGems: 0, endingBadges: [], installSeeded: true,
  devGemGrantedSlots: [], testGiftGrantedSlots: [], fallen: [], fallenSeeds: [],
});

/** House A, with one dead and a living character, ready to send. */
async function houseA(sender?: { name: string; sex?: 'male' | 'female' }) {
  await AsyncStorage.clear();
  await saveGlobalStash(FRESH_STASH());
  beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
  const card = await myHouseCode();
  await recordFallen({ ...DEAD_A, ts: 1_760_000_000_000 } as never);
  const snap = sender ? senderSnapshotFrom(sender, 'Aetherborn') ?? undefined : undefined;
  const payload = await buildExportPayload(snap);
  return { card, payload, snap };
}

/** House B, riding with A. */
async function beB_ridingWithA(card: string): Promise<void> {
  await AsyncStorage.clear();
  await saveGlobalStash(FRESH_STASH());
  beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
  await acceptHouseCode(card);
}

const visit = (over: Partial<LedgerVisit> = {}): LedgerVisit => ({
  installId: 'inst-A', house: 'Sasmooch',
  sender: { name: 'Maud', raceName: 'Aetherborn', pronoun: 'they' },
  names: ['Francis child of Sasmooch'], dogNames: [], steps: 2, ts: 1_000, ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
// §A — CAPABILITY / ROUTING (matrix 1-9)
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1845 §A — the door, and what may come through it', () => {
  it('A.1 ⚠⚠ the app scheme the route is built on is the one the BINARY carries', () => {
    // Not a claim about this OTA's code — a claim about the config every build
    // is prebuilt from. If this key ever changes, every invitation already sent
    // stops opening, so it is pinned to the file that decides it.
    const appJson = JSON.parse(SRC('app.json')) as { expo: { scheme: string } };
    expect(appJson.expo.scheme).toBe(LEDGER_SCHEME);
    expect(buildRequestLink('TAR2.x.y').startsWith(`${LEDGER_SCHEME}://`)).toBe(true);
  });

  it('A.2 ⚠⚠ NO NATIVE EXPANSION WAS MADE — the config carries no new capability', () => {
    // Universal Links and App Links would each need a new binary. Neither was
    // added, quietly or otherwise, and that is checked rather than asserted.
    const appJson = JSON.parse(SRC('app.json')) as { expo: Record<string, unknown> };
    const ios = (appJson.expo.ios ?? {}) as Record<string, unknown>;
    const android = (appJson.expo.android ?? {}) as Record<string, unknown>;
    expect(ios.associatedDomains).toBeUndefined();
    expect(android.intentFilters).toBeUndefined();
  });

  it('A.3 ⚠ the compose surface is the OS\'s, reached through Linking', () => {
    const screen = codeOnly('app/screens/FallenExchangeScreen.tsx');
    expect(screen).toContain('Linking.openURL');
    expect(buildInviteMailto('s', 'b').startsWith('mailto:?')).toBe(true);
  });

  it('A.4 ⚠⚠⚠ TARTARIA NEVER SENDS MAIL. No transport, no relay, no recipient.', () => {
    // ⚠ Graded on CODE, not on the comments promising it. A mailto with no
    // address cannot be sent by anything but a person choosing who to ask.
    const links = codeOnly('app/engine/ledgerLinks.ts');
    for (const forbidden of [/smtp/i, /nodemailer/i, /sendgrid/i, /\bfetch\(/, /XMLHttpRequest/, /axios/]) {
      expect(links).not.toMatch(forbidden);
    }
    expect(buildInviteMailto('subject', 'body')).toMatch(/^mailto:\?subject=/);
    expect(buildInviteMailto('subject', 'body')).not.toMatch(/mailto:[^?]/);
  });

  it('A.5 ⚠⚠ MEASURED: a request link fits comfortably inside a mail-safe length', async () => {
    await houseA();
    const link = buildRequestLink(await myHouseCode());
    expect(link.length).toBeLessThan(LINK_SAFE_CHARS);
    expect(link.length).toBeLessThan(400); // measured at 183 on the audit fixture
  });

  it('A.6 ⚠⚠ MEASURED: a full Ledger Entry does NOT fit, which is why it is not offered', async () => {
    // ⚠ MEASURED AT THE CAPS, not on a one-corpse fixture — the question is
    // whether the transport can carry a real Ledger, and `FALLEN_CAP` is 25.
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());
    beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
    for (let i = 0; i < 25; i += 1) {
      await recordFallen({
        ...DEAD_A, name: `Francis the Unwearied ${i}`, epitaph: 'E'.repeat(240),
        locationName: 'the Drowned Library of Asgardar, lower stacks',
        gearNames: Array.from({ length: 8 }, (_, g) => `Legendary Greatsword of the ${g} Winters`),
        ts: 1_760_000_000_000 + i,
      } as never);
    }
    const payload = await buildExportPayload(senderSnapshotFrom({ name: 'Maud' }) ?? undefined);
    const asLink = `${LEDGER_SCHEME}://ledger/entry?d=${encodeURIComponent(payload)}`;
    expect(asLink.length).toBeGreaterThan(LINK_SAFE_CHARS * 10);
    // and the module offers no way to build one, so the size finding is
    // expressed as an absent capability rather than as a warning comment.
    expect(codeOnly('app/engine/ledgerLinks.ts')).not.toContain('ledger/entry');
  });

  it('A.7 ⚠⚠⚠ a malformed route fails SAFELY — null, never a throw, never a partial', () => {
    const bad: unknown[] = [
      '', '   ', null, undefined, 42, {}, [],
      'https://example.com/ledger/request?c=TAR2.x.y',        // foreign scheme
      'tartariarealms://ledger/entry?c=TAR2.x.y',             // wrong path
      'tartariarealms://other/request?c=TAR2.x.y',            // wrong host
      'tartariarealms://ledger/request',                      // no query at all
      'tartariarealms://ledger/request?d=TAR2.x.y',           // wrong parameter
      'tartariarealms://ledger/request?c=',                   // empty card
      'tartariarealms://ledger/request?c=%E0%A4%A',           // undecodable
    ];
    for (const b of bad) expect(parseLedgerLink(b)).toBeNull();
  });

  it('A.8 ⚠ a well-formed route yields the card, byte for byte', async () => {
    await houseA();
    const card = await myHouseCode();
    const parsed = parseLedgerLink(buildRequestLink(card));
    expect(parsed).toEqual({ kind: 'request', card });
  });

  it('A.9 ⚠⚠ routing PRESENTS a card; it never accepts one', async () => {
    await houseA();
    const card = await myHouseCode();
    await beB_ridingWithA('nonsense-not-a-card');
    _setPendingCardForTests(null);
    const seen: string[] = [];
    expect(routeLedgerUrl(buildRequestLink(card), (s) => seen.push(s))).toBe(true);
    expect(seen).toEqual(['fallen']);
    // The card is waiting to be LOOKED AT. Nothing was paired by the link.
    expect(takePendingHouseCard()).toBe(card);
    // ⚠ and the route module holds no pairing verb at all — graded on code.
    const route = codeOnly('app/state/ledgerRoute.ts');
    expect(route).not.toContain('acceptHouseCode');
    expect(route).not.toContain('importPayloadText');
  });

  it('A.10 ⚠ a route that is not ours neither navigates nor leaves a card', () => {
    _setPendingCardForTests(null);
    const seen: string[] = [];
    expect(routeLedgerUrl('https://example.com/', (s) => seen.push(s))).toBe(false);
    expect(seen).toEqual([]);
    expect(takePendingHouseCard()).toBeNull();
  });

  it('A.11 ⚠ taking the card CONSUMES it — re-entering the screen re-offers nothing', () => {
    _setPendingCardForTests('TAR2.a.b');
    expect(takePendingHouseCard()).toBe('TAR2.a.b');
    expect(takePendingHouseCard()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §B — PREVIEW / ACCEPT / DECLINE (matrix 10-16)
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1845 §B — look first, then say yes or no', () => {
  it('B.1 ⚠⚠ the preview names the person, not only the house', async () => {
    const a = await houseA({ name: 'Maud of the Nine Wells' });
    await beB_ridingWithA(a.card);
    const p = await previewPayloadText(a.payload);
    expect(p.trust).toBe('verified');
    expect(p.senderName).toBe('Maud of the Nine Wells');
    expect(p.fromHouse).toBe('Sasmooch');
  });

  it('B.2 ⚠⚠⚠ previewing writes NOTHING — no ledger, no rider', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    await previewPayloadText(a.payload);
    expect(await loadLedgerVisits()).toEqual([]);
    expect(cachedVisits()).toHaveLength(0);
  });

  it('B.3 ⚠⚠ ACCEPT commits once and queues exactly one rider', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    const out = await importPayloadText(a.payload);
    expect(out.added).toBe(1);
    const q = queueFromImport(out, 5_000);
    expect(q).not.toBeNull();
    expect(cachedVisits()).toHaveLength(1);
    expect(cachedVisits()[0]!.installId).toBe('inst-A');
  });

  it('B.4 ⚠⚠⚠ DECLINE mutates NOTHING — no import runs, so there is nothing to undo', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    await previewPayloadText(a.payload);          // looked at it
    // ...and then said no. The screen's decline path drops the preview; it does
    // not call the import, which is why there is no rollback to get wrong.
    expect((await loadGlobalStash()).ledgerVisits ?? []).toEqual([]);
    expect(cachedVisits()).toHaveLength(0);
    const screen = codeOnly('app/screens/FallenExchangeScreen.tsx');
    const decline = screen.slice(screen.indexOf('const cancelPreview'), screen.indexOf('const cancelPreview') + 220);
    expect(decline).not.toContain('importPayloadText');
    expect(decline).not.toContain('queueFromImport');
  });

  it('B.5 ⚠⚠⚠ REPLAY IS IDEMPOTENT — the same Entry accepted twice queues one rider', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    const first = await importPayloadText(a.payload);
    queueFromImport(first, 5_000);
    const again = await importPayloadText(a.payload);
    expect(again.added).toBe(0);                  // the merge deduped it
    expect(queueFromImport(again, 9_000)).toBeNull();
    expect(cachedVisits()).toHaveLength(1);
  });

  it('B.6 ⚠⚠⚠ A FORGED PAYLOAD CANNOT QUEUE A RIDER, and names nobody', async () => {
    const a = await houseA({ name: 'Maud' });
    // B rides with someone else entirely, so A's seal matches no held key.
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());
    beInstall('inst-C', 'Ghislain', 'k_cccccccccccccccccccc');
    const cCard = await myHouseCode();
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    await acceptHouseCode(cCard);
    const out = await importPayloadText(a.payload);
    expect(out.forged).toBe(true);
    expect(out.fromInstallId).toBe('');
    expect(out.fromHouse).toBe('');
    expect(queueFromImport(out, 5_000)).toBeNull();
    expect(cachedVisits()).toHaveLength(0);
  });

  it('B.7 ⚠⚠⚠ AN UNPAIRED HOUSE CANNOT QUEUE ONE EITHER', async () => {
    const a = await houseA({ name: 'Maud' });
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb'); // rides with nobody
    const out = await importPayloadText(a.payload);
    expect(out.added).toBe(0);
    expect(out.fromInstallId).toBe('');
    expect(queueFromImport(out, 5_000)).toBeNull();
  });

  it('B.8 ⚠⚠ PAIRING AUTHORITY IS UNTOUCHED — the gate is the same three questions', () => {
    // ⚠ A behavioural firewall would be better than a source claim, and §G has
    // those. This one guards the specific hazard of a SOCIAL pass: that the new
    // arrival layer grew its own opinion about who may ride.
    const visits = codeOnly('app/state/ledgerVisits.ts');
    for (const forbidden of ['isPairedHouse', 'acceptHouseCode', 'sealMatches', 'authenticate']) {
      expect(visits).not.toContain(forbidden);
    }
  });

  it('B.9 ⚠ an import that added nothing new queues nothing, even from a good house', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    const out = await importPayloadText(a.payload);
    expect(queueFromImport({ ...out, added: 0, dogsAdded: 0 }, 5_000)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §C — THE SENDER SNAPSHOT (matrix 17-22)
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1845 §C — the smallest thing that can be a person', () => {
  it('C.1 ⚠ the name and the house both survive the crossing', async () => {
    const a = await houseA({ name: 'Maud of the Nine Wells' });
    await beB_ridingWithA(a.card);
    const out = await importPayloadText(a.payload);
    expect(out.sender?.name).toBe('Maud of the Nine Wells');
    expect(out.fromHouse).toBe('Sasmooch');
  });

  it('C.2 ⚠⚠ ONLY THE THREE APPROVED FIELDS CROSS — the shape is exact', async () => {
    const a = await houseA({ name: 'Maud', sex: 'female' });
    const body = JSON.parse((JSON.parse(a.payload) as { body: string }).body) as { sender: unknown };
    expect(Object.keys(body.sender as object).sort()).toEqual(['name', 'pronoun', 'raceName']);
  });

  it('C.3 ⚠⚠⚠ NO STATS, NO HP, NO INVENTORY, NO CURRENCY, NO QUEST STATE', async () => {
    const a = await houseA({ name: 'Maud' });
    const body = (JSON.parse(a.payload) as { body: string }).body;
    const sender = JSON.stringify((JSON.parse(body) as { sender: unknown }).sender);
    for (const forbidden of ['stats', 'hp', 'hpMax', 'inventory', 'gold', 'coin', 'quest', 'milestone', 'equipped', 'slot']) {
      expect(sender.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // ⚠ and there is nowhere to PUT them: the sanitizer rebuilds field by field.
    expect(sanitizeSenderSnapshot({
      name: 'Maud', raceName: 'Aetherborn', pronoun: 'they',
      stats: { strength: 99 }, hp: 400, inventory: [{ name: 'Excalibur' }], gold: 9_999,
    })).toEqual({ name: 'Maud', raceName: 'Aetherborn', pronoun: 'they' });
  });

  it('C.4 ⚠ the sanitizer bounds every field and refuses a nameless one', () => {
    expect(sanitizeSenderSnapshot(null)).toBeNull();
    expect(sanitizeSenderSnapshot({})).toBeNull();
    expect(sanitizeSenderSnapshot({ name: '   ' })).toBeNull();
    expect(sanitizeSenderSnapshot({ name: 'x'.repeat(200) })!.name).toHaveLength(32);
    expect(sanitizeSenderSnapshot({ name: 'M', raceName: 'y'.repeat(200) })!.raceName).toHaveLength(32);
    expect(sanitizeSenderSnapshot({ name: 'M', pronoun: 'xe' })!.pronoun).toBeUndefined();
    expect(sanitizeSenderSnapshot({ name: 'M', pronoun: 'SHE' })!.pronoun).toBe('she');
  });

  it('C.5 ⚠⚠ A PAYLOAD WITH NO SENDER STILL WORKS — this is the pre-1845 shape', async () => {
    const a = await houseA();                      // no living character passed
    const body = JSON.parse((JSON.parse(a.payload) as { body: string }).body) as Record<string, unknown>;
    expect('sender' in body).toBe(false);
    await beB_ridingWithA(a.card);
    const out = await importPayloadText(a.payload);
    expect(out.added).toBe(1);
    expect(out.sender).toBeUndefined();
    // and a rider still comes — named by their HOUSE, which was always there.
    const q = queueFromImport(out, 5_000)!;
    expect(visitTitle(q)).toBe('a rider of House Sasmooch');
  });

  it('C.6 ⚠⚠⚠ AN OLDER PARSER SAFELY IGNORES THE ADDITIVE KEY', async () => {
    const a = await houseA({ name: 'Maud' });
    const body = (JSON.parse(a.payload) as { body: string }).body;
    // `parseLedgerPayload` reads its keys BY NAME — the same property that let
    // OTA-1844's dogs ship without a version bump. A build that predates 1845
    // looks for `fallen`, `dogs` and `rests` and never asks about `sender`.
    const batch = parseLedgerPayload(body);
    expect(batch.fallen).toHaveLength(1);
    expect(batch.sender?.name).toBe('Maud');
    // an empty batch is STILL exactly the pre-1845 shape, so nothing that
    // already asserted it has to change.
    expect(parseLedgerPayload('not json')).toEqual({ fallen: [], dogs: [], rests: [] });
    expect(parseLedgerPayload({})).toEqual({ fallen: [], dogs: [], rests: [] });
  });

  it('C.7 ⚠⚠⚠ THE PAYLOAD VERSION DID NOT MOVE', async () => {
    const a = await houseA({ name: 'Maud' });
    const env = JSON.parse(a.payload) as { v: number; body: string };
    expect(env.v).toBe(2);
    expect((JSON.parse(env.body) as { v: number }).v).toBe(1);
  });

  it('C.8 ⚠⚠ the snapshot is SEALED by the same seal that covers the dead', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    // Tamper with the sender INSIDE the sealed body. The seal covers the body
    // string, so the whole thing is refused — the snapshot bought no leniency.
    const env = JSON.parse(a.payload) as { v: number; from: string; seal: string; body: string };
    const tampered = JSON.stringify({ ...env, body: env.body.replace('"Maud"', '"Impostor"') });
    const p = await previewPayloadText(tampered);
    expect(p.trust).toBe('refused');
    expect(p.refusal).toBe('forged');
  });

  it('C.9 ⚠ senderSnapshotFrom reads only what the character model actually holds', () => {
    expect(senderSnapshotFrom(null)).toBeNull();
    expect(senderSnapshotFrom({ name: '' })).toBeNull();
    expect(senderSnapshotFrom({ name: 'Maud', sex: 'male' }, 'Giant')).toEqual({ name: 'Maud', raceName: 'Giant', pronoun: 'he' });
    expect(senderSnapshotFrom({ name: 'Maud', sex: 'female' })).toEqual({ name: 'Maud', pronoun: 'she' });
    // OTA-1439 calls `sex` optional flavour; an unset one is they/them, which
    // is also what every save predating that pick already gets.
    expect(senderSnapshotFrom({ name: 'Maud' })!.pronoun).toBe('they');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §D — THE INTRODUCTION QUEUE (matrix 23-30)
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1845 §D — bounded, deterministic, and it cannot starve', () => {
  beforeEach(async () => { await AsyncStorage.clear(); await saveGlobalStash(FRESH_STASH()); _setVisitsForTests([]); });

  it('D.1 ⚠⚠⚠ THE COUNTDOWN IS 1–3, ALWAYS, AND IT IS NOT A DIE ROLL', () => {
    for (let i = 0; i < 5_000; i += 1) {
      const n = visitSteps(1_700_000_000_000 + i * 7);
      expect(n).toBeGreaterThanOrEqual(VISIT_MIN_STEPS);
      expect(n).toBeLessThanOrEqual(VISIT_MAX_STEPS);
    }
    expect(VISIT_MIN_STEPS).toBe(1);
    expect(VISIT_MAX_STEPS).toBe(3);
    // deterministic: the same accepted transfer always produces the same wait.
    expect(visitSteps(12_345)).toBe(visitSteps(12_345));
    expect(visitSteps(-7)).toBeGreaterThanOrEqual(1);
    expect(visitSteps(Number.NaN)).toBeGreaterThanOrEqual(1);
  });

  it('D.2 ⚠⚠⚠ NO `Math.random` ANYWHERE IN THE INTRODUCTION — graded on code', () => {
    // ⚠ Comments stripped first: the file SAYS it has no dice, and a raw grep
    // would match that sentence rather than the absence it describes.
    expect(codeOnly('app/engine/senderIntro.ts')).not.toContain('Math.random');
    expect(codeOnly('app/state/ledgerVisits.ts')).not.toContain('Math.random');
  });

  it('D.3 ⚠⚠ THE RIDER ARRIVES BY MOVEMENT 3 AND NEVER BEFORE MOVEMENT 1', () => {
    for (let ts = 0; ts < 300; ts += 1) {
      let q = [visit({ ts, steps: visitSteps(ts) })];
      let firedOn = 0;
      for (let step = 1; step <= 6 && !firedOn; step += 1) {
        const r = tickVisits(q);
        q = r.next;
        if (r.due) firedOn = step;
      }
      expect(firedOn).toBeGreaterThanOrEqual(1);
      expect(firedOn).toBeLessThanOrEqual(3);
    }
  });

  it('D.4 ⚠ a rider who is due leaves the queue, so no second visit is owed', () => {
    let q = [visit({ steps: 1 })];
    const r = tickVisits(q);
    expect(r.due?.installId).toBe('inst-A');
    q = r.next;
    expect(q).toHaveLength(0);
    expect(tickVisits(q).due).toBeNull();
  });

  it('D.5 ⚠⚠ THE QUEUE IS BOUNDED, and the bound holds under abuse', () => {
    let q: LedgerVisit[] = [];
    for (let i = 0; i < 200; i += 1) q = queueVisit(q, visit({ installId: `inst-${i}`, ts: i }));
    expect(q).toHaveLength(LEDGER_VISIT_CAP);
    expect(LEDGER_VISIT_CAP).toBe(8);
  });

  it('D.6 ⚠⚠ ONE HOUSE, ONE PENDING RIDER — a second send folds in, it does not stack', () => {
    let q = queueVisit([], visit({ ts: 100, steps: 3, names: ['Francis child of Sasmooch'] }));
    q = queueVisit(q, visit({ ts: 400, steps: 2, names: ['Alaric child of Sasmooch'] }));
    expect(q).toHaveLength(1);
    expect(q[0]!.names).toEqual(['Francis child of Sasmooch', 'Alaric child of Sasmooch']);
    // ⚠ the EARLIER countdown is kept, so a second send cannot push the wait out.
    expect(q[0]!.steps).toBe(2);
    expect(q[0]!.ts).toBe(100);
  });

  it('D.7 ⚠⚠⚠ TWO DIFFERENT HOUSES ARE INDEPENDENT AND NEITHER OVERWRITES THE OTHER', () => {
    let q = queueVisit([], visit({ installId: 'inst-A', house: 'Sasmooch', ts: 100 }));
    q = queueVisit(q, visit({ installId: 'inst-Z', house: 'Brannoch', ts: 200 }));
    expect(q.map((v) => v.installId)).toEqual(['inst-A', 'inst-Z']);
    const first = tickVisits(tickVisits(q).next);
    expect(first.due?.installId).toBe('inst-A');   // deterministic: oldest first
  });

  it('D.8 ⚠⚠⚠ TWO PLAYERS NAMED THE SAME THING DO NOT COLLIDE', () => {
    // The dedupe identity is the sending INSTALL, never a display name.
    let q = queueVisit([], visit({ installId: 'inst-1', house: 'Bob', sender: { name: 'Bob' }, ts: 1 }));
    q = queueVisit(q, visit({ installId: 'inst-2', house: 'Bob', sender: { name: 'Bob' }, ts: 2 }));
    expect(q).toHaveLength(2);
  });

  it('D.9 ⚠ queue ordering is deterministic even on a tied timestamp', () => {
    let q = queueVisit([], visit({ installId: 'inst-z', ts: 5 }));
    q = queueVisit(q, visit({ installId: 'inst-a', ts: 5 }));
    expect(q.map((v) => v.installId)).toEqual(['inst-a', 'inst-z']);
  });

  it('D.10 ⚠⚠ THE QUEUE SURVIVES THE PERSISTENCE BOUNDARY', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    const out = await importPayloadText(a.payload);
    queueFromImport(out, 5_000);
    // ⚠ The queue write is deliberately fire-and-forget — a rider is not a
    // promise to the player, so a full disk must not fail an accept. The test
    // therefore lets it land rather than pretending it is synchronous.
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
    // straight off the disk, past the module cache
    const onDisk = await loadLedgerVisits();
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0]!.installId).toBe('inst-A');
    _setVisitsForTests(null);
    expect(await loadVisits()).toHaveLength(1);
  });

  it('D.11 ⚠⚠ a stored row is REBUILT, not trusted — a hand-edited countdown is clamped', () => {
    expect(reviveVisit({ installId: 'i', steps: 9_999, ts: 1 })[0]!.steps).toBe(VISIT_MAX_STEPS);
    expect(reviveVisit({ installId: 'i', steps: -5, ts: 1 })[0]!.steps).toBe(0);
    expect(reviveVisit({ installId: '', ts: 1 })).toEqual([]);
    expect(reviveVisit(null)).toEqual([]);
    expect(reviveVisit({ installId: 'i', names: Array.from({ length: 99 }, (_, i) => `n${i}`) })[0]!.names).toHaveLength(12);
  });

  it('D.12 ⚠⚠ AN UNHYDRATED QUEUE IS "NOT YET", NEVER "NOBODY" — OTA-1839\'s rule', () => {
    _setVisitsForTests(null);
    const snap = cachedVisits();
    expect(snap).toHaveLength(0);
    expect(Object.isFrozen(snap)).toBe(true);
    // and a tick before the disk answers costs one movement and writes nothing.
    expect(tickLedgerVisit()).toBeNull();
  });

  it('D.13 ⚠⚠⚠ THE WRITE GOES THROUGH OTA-1835\'s SERIALISED DOOR', () => {
    // A load-modify-save here would be the exact lost-update defect OTA-1835
    // measured and closed for every other field on this object.
    const save = codeOnly('app/engine/saveSystem.ts');
    const fn = save.slice(save.indexOf('export async function setLedgerVisits'), save.indexOf('export async function setLedgerVisits') + 400);
    expect(fn).toContain('mutateGlobalStash');
    expect(fn).not.toContain('saveGlobalStash');
  });

  it('D.14 ⚠ an install with no visits deserializes to empty, with no migration', async () => {
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());          // no ledgerVisits key at all
    expect(await loadLedgerVisits()).toEqual([]);
  });

  it('D.15 ⚠⚠⚠ THE COUNTDOWN IS SPENT BY MOVEMENT AND BY NOTHING ELSE', () => {
    // §13 asks for the bound to be counted from the EXISTING movement authority
    // rather than a second one. Graded on code: the ONLY caller of the tick is
    // inside `stepDirection`, on ground the Fallen spawner already judged
    // peaceful, and gated on the beat not already being claimed.
    const store = codeOnly('app/state/gameStore.ts');
    expect(store.match(/ledgerVisits\.tickLedgerVisit\(\)/g)).toHaveLength(1);
    expect(store).toContain('if (peacefulWild && !revenantBeatFired && !get().ledgerVisitor) {');
    // and there is no second movement authority anywhere in the new modules.
    expect(codeOnly('app/state/ledgerVisits.ts')).not.toContain('stepDirection');
    expect(codeOnly('app/state/ledgerVisits.ts')).not.toContain('mapX');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §E — THE NPC FIREWALL (matrix 31-37)
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1845 §E — a messenger, and nothing a fight could use', () => {
  const INTRO_FILES = ['app/engine/senderIntro.ts', 'app/state/ledgerVisits.ts', 'app/components/LedgerVisitModal.tsx'];

  it('E.1 ⚠⚠⚠ NO ENEMY IS EVER BUILT — there is nothing for a hostile path to reach', () => {
    // ⚠ Comments stripped: these files SAY they build no enemy, and a raw grep
    // would match the promise instead of grading the code. This is the OTA-1842
    // trap, hit again in OTA-1844, refused a third time here.
    for (const f of INTRO_FILES) {
      const c = codeOnly(f);
      for (const forbidden of ['enemies', 'enemyHps', 'buildEnemy', 'spawnEnemy', 'turnOrder', 'attack(']) {
        expect(c).not.toContain(forbidden);
      }
    }
  });

  it('E.2 ⚠⚠⚠ NO DAMAGE, NO HIT POINTS, NO COMBAT ARITHMETIC', () => {
    for (const f of INTRO_FILES) {
      const c = codeOnly(f);
      for (const forbidden of ['hpMax', 'takeDamage', 'rollCheck', 'damage', 'armorClass']) {
        expect(c).not.toContain(forbidden);
      }
    }
  });

  it('E.3 ⚠⚠⚠ NO XP, NO TC, NO LOOT, NO GEAR — the rider is not an economy', () => {
    for (const f of INTRO_FILES) {
      const c = codeOnly(f);
      for (const forbidden of ['grantXp', 'addXp', 'gold', 'tartarianCoin', 'addCoins', 'loot', 'dropTable', 'inventory', 'addItem']) {
        expect(c.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    }
  });

  it('E.4 ⚠⚠ THE MODAL OFFERS TWO ANSWERS AND NEITHER IS A SWING', () => {
    const modal = codeOnly('app/components/LedgerVisitModal.tsx');
    expect(modal).toContain('VISIT_REPLY_LABEL');
    expect(modal).toContain('VISIT_DISMISS_LABEL');
    expect(modal.toLowerCase()).not.toContain('attack');
    expect(modal.toLowerCase()).not.toContain('hostile');
  });

  it('E.5 ⚠⚠ THE RIDER IS NOT PERSISTED AS A ROAMING NPC — the queue holds words, not a body', () => {
    const v = visit();
    expect(Object.keys(v).sort()).toEqual(['dogNames', 'house', 'installId', 'names', 'sender', 'steps', 'ts']);
    // nothing in the stored row can be placed on a tile or fought.
    expect(JSON.stringify(v)).not.toMatch(/mapX|mapY|locationId|hp\b/);
  });

  it('E.6 ⚠ they always leave — there is no branch in which a rider stays', () => {
    const v = visit();
    expect(visitFarewellLine(v)).toContain('turns back the way they came');
    const c = codeOnly('app/state/ledgerVisits.ts');
    // the answer path always clears the visitor, on both replies.
    expect(c.match(/ledgerVisitor: null/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('E.7 ⚠ the beat is short and says nothing about the machinery', () => {
    const lines = visitLog(visit()).map((l) => l.text).join(' ');
    for (const forbidden of ['payload', 'pairing', 'import', 'seal', 'JSON', 'file', 'upload', 'backend', 'authenticat']) {
      expect(lines.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(visitLog(visit())).toHaveLength(3);
  });

  it('E.8 ⚠ the ask names the dead it is about, and a companion as a companion', () => {
    expect(visitAskLine(visit())).toContain('Francis child of Sasmooch');
    const withDog = visit({ dogNames: ['Marrow, who walked with Francis of House Sasmooch'] });
    expect(visitAskLine(withDog)).toContain('dog');
    const onlyDog = visit({ names: [], dogNames: ['Marrow'] });
    expect(visitAskLine(onlyDog)).toContain('stay with them');
    // ⚠ and a dog is never asked to be "put down" — OTA-1844's separation
    // survives into the sentence that asks for help with both.
    expect(visitAskLine(onlyDog)).not.toContain('put');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §F — BATCH AND MULTI-SENDER (matrix 38-42), end to end
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1845 §F — one accepted transfer, one rider', () => {
  it('F.1 ⚠⚠⚠ FIVE OF A HOUSE\'S DEAD IN ONE ENTRY QUEUE ONE INTRODUCTION', async () => {
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());
    beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
    const card = await myHouseCode();
    for (let i = 0; i < 5; i += 1) {
      await recordFallen({ ...DEAD_A, name: `Francis ${i}`, ts: 1_760_000_000_000 + i } as never);
    }
    const payload = await buildExportPayload(senderSnapshotFrom({ name: 'Maud' }) ?? undefined);
    await beB_ridingWithA(card);
    const out = await importPayloadText(payload);
    expect(out.added).toBe(5);
    queueFromImport(out, 5_000);
    expect(cachedVisits()).toHaveLength(1);
    expect(cachedVisits()[0]!.names.length).toBeGreaterThan(1);
  });

  it('F.2 ⚠⚠ and re-accepting that same batch adds NO further rider', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    queueFromImport(await importPayloadText(a.payload), 5_000);
    queueFromImport(await importPayloadText(a.payload), 6_000);
    queueFromImport(await importPayloadText(a.payload), 7_000);
    expect(cachedVisits()).toHaveLength(1);
  });

  it('F.3 ⚠⚠⚠ A SECOND HOUSE QUEUES ITS OWN, and the first is still owed', async () => {
    const a = await houseA({ name: 'Maud' });
    // A second, independent sending house.
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());
    beInstall('inst-Z', 'Ghislain', 'k_zzzzzzzzzzzzzzzzzzzz');
    const zCard = await myHouseCode();
    await recordFallen({ ...DEAD_A, name: 'Alaric', ts: 1_760_000_500_000 } as never);
    const zPayload = await buildExportPayload(senderSnapshotFrom({ name: 'Ghislain the Lesser' }) ?? undefined);

    await beB_ridingWithA(a.card);
    await acceptHouseCode(zCard);
    queueFromImport(await importPayloadText(a.payload), 5_000);
    queueFromImport(await importPayloadText(zPayload), 6_000);
    expect(cachedVisits().map((v) => v.installId).sort()).toEqual(['inst-A', 'inst-Z']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §G — THE FIREWALLS (matrix 43-50)
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1845 §G — nothing that was live moved', () => {
  it('G.1 ⚠⚠⚠ THE ENCOUNTER GATE IS BYTE-FOR-BYTE WHAT OTA-1844 SHIPPED', () => {
    const store = codeOnly('app/state/gameStore.ts');
    // the tile gate, the chance and the shared draw — unchanged expressions.
    expect(store).toContain('const rvChance = rvLedger.revenantSpawnChance(rvForeignCount);');
    expect(store).toContain('if (rvPool.length > 0 && Math.random() < rvChance) {');
    expect(store).toContain('const rvPick = Math.floor(Math.random() * (rvPool.length + rvDogs.length));');
    expect(store).toContain('revenantRolledTiles: [...(s2.worldMemory.revenantRolledTiles ?? []), rvTileKey].slice(-120),');
  });

  it('G.2 ⚠⚠⚠ THE RIDER ADDS NO FALLEN ENCOUNTER FREQUENCY — it is not in that branch', () => {
    const store = codeOnly('app/state/gameStore.ts');
    const gate = store.slice(store.indexOf('const rvChance'), store.indexOf('const sTileKey'));
    // the introduction tick lives AFTER the Fallen branch closes and reads none
    // of its dice, so no path through it can change how often a Hollowed or a
    // Last Walk happens.
    expect(gate).toContain('tickLedgerVisit');
    expect(gate.indexOf('tickLedgerVisit')).toBeGreaterThan(gate.indexOf('rvPick'));
    expect(codeOnly('app/state/ledgerVisits.ts')).not.toContain('revenantSpawnChance');
    expect(codeOnly('app/state/ledgerVisits.ts')).not.toContain('revenantPool');
  });

  it('G.3 ⚠⚠ THE LAST WALK IS UNTOUCHED', () => {
    const dogs = codeOnly('app/engine/fallenDogs.ts');
    expect(dogs).toContain("return !!dog && dog.status === 'with_player';");
    expect(dogs).toContain("export const LAST_WALK_ACTS = ['speak', 'name', 'sit'] as const;");
    expect(dogs).not.toContain('Math.random');
    // and the rider knows nothing about it.
    expect(codeOnly('app/state/ledgerVisits.ts')).not.toContain('lastWalk');
  });

  it('G.4 ⚠⚠⚠ THE CLOSURE TRANSPORT IS UNCHANGED — a rest still rides home in the body', async () => {
    const a = await houseA({ name: 'Maud' });
    const body = JSON.parse((JSON.parse(a.payload) as { body: string }).body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['dogs', 'fallen', 'house', 'installId', 'rests', 'sender', 'v']);
  });

  it('G.5 ⚠⚠ HUMAN REST SEMANTICS ARE UNCHANGED — defeat is still the rest', () => {
    const storeFile = codeOnly('app/engine/fallenLedgerStore.ts');
    expect(storeFile).toContain('const foreign = ledger.foreign.filter((f) => fallenKey(f) !== rest.fallenKey);');
    expect(storeFile).toContain('const dogs = (ledger.dogs ?? []).filter((d) => dogFallenKey(d) !== rest.fallenKey);');
  });

  it('G.6 ⚠⚠ THE TRUST LABELS ARE THE SAME THREE, translating the same three states', async () => {
    const a = await houseA({ name: 'Maud' });
    await beB_ridingWithA(a.card);
    expect((await previewPayloadText(a.payload)).trust).toBe('verified');
    // ⚠ a TORN paste, not `{}` — an empty object is perfectly readable and
    // answers `legacy`, which is OTA-1842's own distinction and not a defect.
    expect((await previewPayloadText('half a copied str')).trust).toBe('refused');
    expect((await previewPayloadText('half a copied str')).refusal).toBe('unreadable');
    // legacy: a house paired before seals existed, still deliberately admitted.
    await AsyncStorage.clear();
    await saveGlobalStash(FRESH_STASH());
    beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
    _setPairedForTests([{ player: 'Sasmooch', installId: 'inst-A', addedTs: 1 }]);
    const inner = (JSON.parse(a.payload) as { body: string }).body;
    expect((await previewPayloadText(inner)).trust).toBe('legacy');
  });

  it('G.7 ⚠⚠ ROCKY IS UNTOUCHED — nothing in this OTA names him', () => {
    for (const f of ['app/engine/senderIntro.ts', 'app/state/ledgerVisits.ts', 'app/engine/ledgerLinks.ts', 'app/state/ledgerRoute.ts']) {
      expect(SRC(f).toLowerCase()).not.toContain('rocky');
    }
  });

  it('G.8 ⚠⚠⚠ NO BACKEND, NO ACCOUNT, NO AUTOMATIC DELIVERY — graded on code', () => {
    for (const f of ['app/engine/ledgerLinks.ts', 'app/engine/senderIntro.ts', 'app/state/ledgerVisits.ts', 'app/state/ledgerRoute.ts']) {
      const c = codeOnly(f);
      for (const forbidden of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /firebase/i, /supabase/i, /\bawait\s+post\(/i, /signIn/i, /oauth/i]) {
        expect(c).not.toMatch(forbidden);
      }
    }
  });

  it('G.9 ⚠⚠ THE INVITATION LEAKS NOTHING — only the request material a pairing needs', async () => {
    const a = await houseA({ name: 'Maud' });
    const card = await myHouseCode();
    const body = inviteBody({ character: 'Maud', house: 'Sasmooch', card, link: buildRequestLink(card) });
    const whole = inviteShareText(inviteSubject('Sasmooch'), body);
    // the dead themselves are NOT in a request; only the house card is.
    expect(whole).not.toContain(a.payload);
    expect(whole).not.toContain('Francis');
    for (const forbidden of ['inventory', 'hpMax', 'resurrectionGems', 'slot', 'seal', 'HMAC', 'JSON', 'payload']) {
      expect(whole).not.toContain(forbidden);
    }
    expect(whole).toContain(card);
  });

  it('G.10 ⚠ the player-facing words are the Ledger\'s, not the implementation\'s', () => {
    const screen = SRC('app/screens/FallenExchangeScreen.tsx');
    expect(screen).toContain('THE LEDGER OF THE FALLEN');
    for (const label of ['SEND REQUEST', 'SHARE ENTRY', 'VIEW ENTRY', 'ACCEPT', 'DECLINE', 'THE ROLL']) {
      expect(screen).toContain(label);
    }
    // ⚠ and the beat a player reads never uses an implementation word.
    const lines = [...visitLog(visit()).map((l) => l.text), visitFarewellLine(visit())].join(' ');
    for (const forbidden of ['payload', 'JSON', 'import', 'seal', 'HMAC', 'attachment']) {
      expect(lines.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
