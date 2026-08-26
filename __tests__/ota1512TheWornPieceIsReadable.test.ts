// OTA-1512 — THE WORN PIECE IS READABLE (two defects from the 2026-08-26 22:03 log).
//
// ⚠⚠⚠ ONE — THE MARK THAT NEVER CAME. Owner, verbatim, on picking up a
// Salvager's Mask of Secrets while wearing a Forge-Black Cowl: *"if there was
// no star that means I have something equipped. so how come there was no red
// or green pyramid for the mask?"* He read the marks exactly right. The mask
// resolves (armor.json, head, AC +1); the COWL does not — it is Crucible-
// forged, so its name is assembled at the bench and can never be in a
// hand-authored catalog. Every worn-side read in gatherSort was catalog-or-
// nothing, in SEVEN places, so the comparison refused and the row fell
// through to a plain 🛡 with no slot named. Forged gear is end-game gear:
// the marks went dark exactly when the choices start mattering.
//
// ⚠⚠⚠ TWO — THE ATTEMPTS THAT WERE NEVER CHANCES. The same log shows bundle
// #mt9gmr2ylu58 burning attempts 2 AND 3 one-point-three seconds apart, on
// either side of an OTA restart, the second answering in 25ms — before the
// Sentry transport existed. The relay's outcome ledger proves neither
// reached the door (accepted/error and accepted/attachment byte-identical
// before and after). Both are held now, not burned.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-file-system', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    documentDirectory: '/tmp/',
    cacheDirectory: '/tmp/',
    getInfoAsync: jest.fn(async (uri: string) => ({ exists: store.has(uri) })),
    makeDirectoryAsync: jest.fn(async () => {}),
    readAsStringAsync: jest.fn(async (uri: string) => store.get(uri) ?? ''),
    writeAsStringAsync: jest.fn(async (uri: string, data: string) => { store.set(uri, data); }),
    deleteAsync: jest.fn(async (uri: string) => { store.delete(uri); }),
    downloadAsync: jest.fn(async () => ({ uri: '' })),
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  };
});
jest.mock('../app/diagnostics/crashReporter', () => ({ reportingEnabled: () => true }));
jest.mock('../app/diagnostics/sentryTransport', () => ({
  sendDiagnosticsBundle: jest.fn(async () => false),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';
import {
  wornArmorFacts, wornWeaponFacts, equipVerdict, gatherIcon,
  isUpgradeOverEquipped, upgradeReasonClause,
} from '../app/engine/gatherSort';

const ROOT = join(__dirname, '..');
const GATHER = readFileSync(join(ROOT, 'app', 'engine', 'gatherSort.ts'), 'utf8');
const APP = readFileSync(join(ROOT, 'App.tsx'), 'utf8');

/** The owner's own head slot, verbatim from the 22:03 log: a Crucible-forged
 *  cowl. `Forge-Black` comes from the fusion metal theme bank, `Cowl` from the
 *  head slot-noun pool — no catalog row exists or ever will. */
const FORGED_COWL: InventoryItem = {
  id: 'i_cowl', name: 'Forge-Black Cowl', kind: 'armor', quantity: 1,
  tags: ['armor', 'head'],
  uniqueStats: {
    kind: 'armor', rarity: 'Rare', armorSlot: 'head', acBonus: 3,
    durability: { current: 40, max: 40 }, resistance: 'burn',
  },
} as unknown as InventoryItem;

const MASK = "Salvager's Mask of Secrets"; // armor.json, head, acBonus 1

function wearer(head: InventoryItem | null, extra: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Great Scott',
    inventory: head ? [head] : [],
    equipped: head ? { head: head.name, headId: head.id } : {},
    stats: { strength: 20, dexterity: 12, intelligence: 10, wisdom: 12, charisma: 12, stealth: 3 },
    ...extra,
  } as unknown as PlayerCharacter;
}

describe('OTA-1512 — the forged piece can be read', () => {
  it('⚠⚠⚠ THE OWNER’S CASE: the mask earns a real ▼ against a forged cowl, not a blank shield', () => {
    const p = wearer(FORGED_COWL);
    const v = equipVerdict(p, MASK);
    // AC +1 mask vs an AC +3 forged cowl → honestly worse, and it says so.
    expect(v).toEqual({ slot: 'head', state: 'down' });
    expect(gatherIcon({ kind: 'armor', upgrade: false, verdict: v })).toBe('▼');
  });

  it('⚠⚠ pre-1512 this exact case produced NO verdict — the regression is pinned', () => {
    // The whole defect in one line: a catalog-only read of the worn piece.
    const { ARMOR } = require('../app/engine/crafting');
    const catalogHasCowl = ARMOR.some((a: { name: string }) => a.name === 'Forge-Black Cowl');
    expect(catalogHasCowl).toBe(false);      // …which is why it used to refuse…
    expect(wornArmorFacts(FORGED_COWL)).toEqual({  // …and why it no longer does.
      name: 'Forge-Black Cowl', slot: 'head', acBonus: 3,
      resistances: ['burn'], statBonuses: undefined,
    });
  });

  it('⚠⚠ a BETTER piece over a forged one earns the ▲ and a reason that quotes both ACs', () => {
    const weakCowl = {
      ...FORGED_COWL,
      uniqueStats: { ...FORGED_COWL.uniqueStats, acBonus: 0 },
    } as unknown as InventoryItem;
    const p = wearer(weakCowl);
    expect(isUpgradeOverEquipped(p, MASK)).toBe(true);
    expect(equipVerdict(p, MASK)).toEqual({ slot: 'head', state: 'up' });
    expect(upgradeReasonClause(p, MASK)).toBe('AC +1 over your +0');
  });

  it('⚠ the star still means bare — an empty head slot is untouched by this change', () => {
    expect(equipVerdict(wearer(null), MASK)).toEqual({ slot: 'head', state: 'empty' });
    expect(gatherIcon({ kind: 'armor', upgrade: true, verdict: { slot: 'head', state: 'empty' } })).toBe('★');
  });

  it('⚠⚠ the REFUSAL SURVIVES where it is honest: a worn thing nothing can identify still earns no mark', () => {
    const rubbish = { id: 'i_x', name: 'Zzzqx Bramblehusk', kind: 'other', quantity: 1, tags: [] } as unknown as InventoryItem;
    expect(wornArmorFacts(rubbish)).toBeNull();
    expect(equipVerdict(wearer(rubbish), MASK)).toBeNull();
  });

  it('⚠ this copy’s own AC outranks the catalog number (instanceStats wins)', () => {
    const rolled = {
      id: 'i_m', name: MASK, kind: 'armor', quantity: 1, tags: ['armor', 'head'],
      instanceStats: { acBonus: 9 },
    } as unknown as InventoryItem;
    expect(wornArmorFacts(rolled)?.acBonus).toBe(9);
  });

  it('⚠⚠ the WEAPON half of the same hole: a forged main hand compares too', () => {
    const forgedSpike = {
      id: 'i_spike', name: 'Ashen Resonant Spike', kind: 'weapon', quantity: 1, tags: ['weapon'],
      uniqueStats: { kind: 'weapon', rarity: 'Rare', damageDice: '2d8', durability: { current: 30, max: 30 } },
    } as unknown as InventoryItem;
    // The dice come from the forge's stamp; `kind`/`tags` ride along so the
    // slot-picker's reach read and the damage read cannot disagree (OTA-1277).
    expect(wornWeaponFacts(forgedSpike)).toEqual({
      name: 'Ashen Resonant Spike', damageDice: '2d8', kind: 'melee', tags: ['weapon'],
    });
    // A forged BOW is classified ranged off the forge's own reachClass.
    const forgedBow = {
      id: 'i_bow', name: 'Ashen Resonant Caster', kind: 'weapon', quantity: 1, tags: ['weapon'],
      uniqueStats: { kind: 'weapon', rarity: 'Rare', damageDice: '2d6', reachClass: 'ranged', durability: { current: 30, max: 30 } },
    } as unknown as InventoryItem;
    expect(wornWeaponFacts(forgedBow)?.kind).toBe('ranged');
  });

  it('⚠⚠ no worn-side read is left on the catalog-only path (the whole class converted)', () => {
    // The class, not the case: if a new catalog-only worn read appears, this
    // fails. Read CODE only — this file's own header quotes the old calls to
    // explain the defect, and a pin that a comment can satisfy is no pin.
    const code = GATHER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/armorByName\((?:worn|main|held|off)\.name\)/);
    expect(code).not.toMatch(/weaponByName\((?:worn|main|held|off)\.name\)/);
    expect((code.match(/wornArmorFacts\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((code.match(/wornWeaponFacts\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('OTA-1512 — the threat dot can actually be seen', () => {
  // ⚠⚠⚠ Owner: *"we can no longer scroll up to see the bottom of the enemy
  // portrait, and the colored range dot isn't in the popup when we tap the
  // enemy portrait, so i cannot see it either way."* OTA-1508 put the dot on
  // the one edge the corner panel clips, and never gave the popup a threat
  // line — so the feature shipped invisible on both routes.
  const PANEL = readFileSync(join(ROOT, 'app', 'components', 'EnemyPanel.tsx'), 'utf8');

  it('⚠⚠⚠ ROUTE ONE — the dot is NOT pinned to the clipped bottom edge any more', () => {
    const style = PANEL.slice(PANEL.indexOf('  threatDot: {'), PANEL.indexOf('  threat_red:'));
    expect(style).not.toContain("position: 'absolute'");
    expect(style).not.toContain('bottom: 5');
    expect(style).not.toContain('right: 5');
    // Still a dot, still ringed so it reads against whatever is behind it.
    expect(style).toContain('borderRadius: 5');
    expect(style).toContain("borderColor: '#0d0b0a'");
  });

  it('⚠⚠ ROUTE ONE — it rides the head row, on the card’s first line', () => {
    const headAt = PANEL.indexOf('<View style={styles.head}>');
    const dotAt = PANEL.indexOf('styles[`threat_${view.threat}`]');
    const subheadAt = PANEL.indexOf('<View style={styles.subhead}>');
    expect(headAt).toBeGreaterThan(-1);
    expect(dotAt).toBeGreaterThan(headAt);      // inside the head…
    expect(dotAt).toBeLessThan(subheadAt);      // …and above everything below it.
  });

  it('⚠⚠⚠ ROUTE TWO — the popup spells the same verdict out, since it cannot draw a dot', () => {
    const body = PANEL.slice(PANEL.indexOf('function enemyDetailBody('));
    expect(body).toContain('Threat: ${says}');
    expect(body).toContain('RED — it can hit you where you stand');
    expect(body).toContain('YELLOW — it can reach you, but only weakly');
    expect(body).toContain('GREEN — it cannot touch you from there');
    // The popup's colours must come from the SAME verdict the dot paints —
    // one resolver, or the two routes can disagree about the same enemy.
    expect(body).toContain('view.threat');
  });

  it('⚠ the three colours are untouched — this moved the mark, it did not redefine it', () => {
    expect(PANEL).toContain("threat_red: { backgroundColor: '#e05f5f' },");
    expect(PANEL).toContain("threat_yellow: { backgroundColor: '#e0c05f' },");
    expect(PANEL).toContain("threat_green: { backgroundColor: '#9ec96a' },");
  });
});

describe('OTA-1512 — an attempt must be a real chance', () => {
  beforeEach(() => {
    jest.resetModules();
    (require('expo-file-system').__store as Map<string, string>).clear();
  });

  it('⚠⚠⚠ THE 1.3-SECOND DOUBLE BURN: a restart-driven boot is HELD, not charged', async () => {
    const pb = require('../app/diagnostics/pendingBundle');
    const bundle = { log: 'l', inventory: 'i', save: 's', device: 'd' };
    const rec = await pb.persistPendingBundle(bundle);
    expect(rec.attempts).toBe(1);
    // A boot moments later — the shape of the owner's 22:02:33 retry.
    const line = await pb.retryPendingBundleAtBoot();
    expect(line).toContain('held');
    expect(line).toContain('a restart, not a chance');
    // …and the attempt is still on the books, unspent.
    expect((await pb.readPendingBundle()).attempts).toBe(1);
  });

  it('⚠⚠ past the gap it DOES spend one, and the line times the send', async () => {
    const pb = require('../app/diagnostics/pendingBundle');
    const FS = require('expo-file-system');
    await pb.persistPendingBundle({ log: 'l', inventory: 'i', save: 's', device: 'd' });
    // Age the record past MIN_RETRY_GAP_MS without touching the clock.
    const uri = FS.documentDirectory + pb.PENDING_BUNDLE_FILE;
    const aged = JSON.parse(FS.__store.get(uri));
    aged.lastAttemptAt = Date.now() - (pb.MIN_RETRY_GAP_MS + 1000);
    FS.__store.set(uri, JSON.stringify(aged));

    const line = await pb.retryPendingBundleAtBoot();
    expect(line).toContain('attempt 2/5');
    expect(line).toMatch(/did not go out \(after \d+ms\)/); // the 25ms-vs-10s tell
    expect((await pb.readPendingBundle()).attempts).toBe(2);
  });

  it('⚠ a bundle that has spent everything is still cleared, gap or no gap', async () => {
    const pb = require('../app/diagnostics/pendingBundle');
    const FS = require('expo-file-system');
    await pb.persistPendingBundle({ log: 'l', inventory: 'i', save: 's', device: 'd' });
    const uri = FS.documentDirectory + pb.PENDING_BUNDLE_FILE;
    const spent = JSON.parse(FS.__store.get(uri));
    spent.attempts = pb.MAX_SEND_ATTEMPTS;
    FS.__store.set(uri, JSON.stringify(spent));
    const line = await pb.retryPendingBundleAtBoot();
    expect(line).toContain('spent all 5 attempts — cleared');
    expect(await pb.readPendingBundle()).toBeNull();
  });

  it('⚠⚠ the boot retry waits on the OTA verdict, so a restart never eats an attempt', () => {
    expect(APP).toContain('const staying = await new Promise<boolean>((resolve) => {');
    expect(APP).toContain('if (useGameStore.getState().otaBootResolved) { resolve(true); return; }');
    expect(APP).toContain('if (staying) {');
    // The retry must sit INSIDE the gate, not beside it.
    const gateAt = APP.indexOf('const staying = await new Promise<boolean>');
    const retryAt = APP.indexOf('pb.retryPendingBundleAtBoot()');
    expect(gateAt).toBeGreaterThan(-1);
    expect(retryAt).toBeGreaterThan(gateAt);
  });
});
