// OTA-1215 — PUNCHLIST P10 CLOSED. The Hidden Market takes back what it hands out.
//
// ⚠⚠ THE DEFECT WAS AN ASYMMETRY. `isBrokerVendorId` has made `hidden_market_*` stalls post
// EVERY faction's open work since OTA-782 — *"so there's always a board to pick from no
// matter who you've been running with."* The TURN-IN gate was never given the same rule, so
// a stall rostered to a Stone Builders rep would hand you a Mud Monarch mystery and then
// refuse to take it back. A broker that brokered in one direction only.
//
// ⚠⚠ AND IT CHARGES LESS THAN THE TRADING POST — 10% against Halem's 20% — which is
// geography, not generosity. Halem stands at the gate of every outpost in the world; the
// Hidden Market is ONE location out past the frontier camps. Same rate at both would make
// the trip pointless, and OTA-1210 just spent a whole OTA establishing that travel pays.

import {
  brokerShareFor,
  isContractBroker,
  isHiddenMarketStall,
  vendorCanTakeContract,
  contractPayoutTc,
  brokerAcceptLine,
  BROKER_PLAYER_SHARE,
  HIDDEN_MARKET_PLAYER_SHARE,
  CONTRACT_BROKER_VENDOR_ID,
} from '../app/engine/contractBroker';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const STORE = SRC('app/state/gameStore.ts');
const HALEM = { id: 'halem_trader', faction: null as string | null };
const STALL = { id: 'hidden_market_2', faction: 'stone_builders' as string | null };
const IRMA = { id: 'irma_ironhand', faction: 'stone_builders' as string | null };

describe('⚠⚠ OTA-1215 — the asymmetry is closed', () => {
  test('a Hidden Market stall is a broker now', () => {
    expect(isHiddenMarketStall(STALL)).toBe(true);
    expect(isContractBroker(STALL)).toBe(true);
  });

  test('⚠ THE PREMISE: the accept side already treated them as brokers', () => {
    // If the accept side ever stops posting every faction's work, this fix is answering a
    // question nobody is asking any more — so the premise is checked, not assumed.
    expect(STORE).toContain("id.startsWith('hidden_market_')");
    expect(STORE).toContain('const searchFactions = isBrokerVendorId(scene?.vendor?.id)');
  });

  test('it takes another faction’s contract', () => {
    expect(vendorCanTakeContract(STALL, 'mud_monarchs')).toBe(true);
    expect(vendorCanTakeContract(STALL, 'conspiracy_architects')).toBe(true);
  });

  test('an ordinary faction vendor still refuses one', () => {
    expect(vendorCanTakeContract(IRMA, 'mud_monarchs')).toBe(false);
    expect(isContractBroker(IRMA)).toBe(false);
    expect(brokerShareFor(IRMA)).toBeNull();
  });

  test('a roadside drifter is still not a broker', () => {
    // The OTA-1208 rule survives: four of the six factionless vendors spawn on the road,
    // and matching on a null faction would delete the travel entirely.
    expect(isContractBroker({ id: 'naha_drifter' })).toBe(false);
  });
});

describe('⚠⚠ OTA-1215 — THE LADDER, and it must hold at every rung', () => {
  test('the two brokers charge different rates', () => {
    expect(brokerShareFor(HALEM)).toBe(BROKER_PLAYER_SHARE);
    expect(brokerShareFor(STALL)).toBe(HIDDEN_MARKET_PLAYER_SHARE);
    expect(HIDDEN_MARKET_PLAYER_SHARE).toBeGreaterThan(BROKER_PLAYER_SHARE);
  });

  test('⚠ direct > Hidden Market > trading post, at every distance', () => {
    for (const bonus of [0, 5, 40, 200]) {
      const direct = contractPayoutTc(200, bonus, null);
      const market = contractPayoutTc(200, bonus, HIDDEN_MARKET_PLAYER_SHARE);
      const post = contractPayoutTc(200, bonus, BROKER_PLAYER_SHARE);
      expect(direct).toBeGreaterThan(market);
      expect(market).toBeGreaterThan(post);
    }
  });

  test('⚠ neither broker ever earns the long-haul bonus', () => {
    // The bonus pays for making the trip TO THE FACTION. Brokering is the trip not made.
    expect(contractPayoutTc(100, 999, HIDDEN_MARKET_PLAYER_SHARE)).toBe(90);
    expect(contractPayoutTc(100, 999, BROKER_PLAYER_SHARE)).toBe(80);
  });

  test('a contract that paid something never brokers down to nothing', () => {
    expect(contractPayoutTc(1, 0, HIDDEN_MARKET_PLAYER_SHARE)).toBe(1);
    expect(contractPayoutTc(1, 0, BROKER_PLAYER_SHARE)).toBe(1);
  });

  test('nothing still pays nothing, and negatives cannot go negative', () => {
    expect(contractPayoutTc(0, 0, HIDDEN_MARKET_PLAYER_SHARE)).toBe(0);
    expect(contractPayoutTc(-30, -5, null)).toBe(0);
  });
});

describe('⚠⚠ OTA-1215 — the rate table is the ONE source of truth', () => {
  test('isContractBroker is derived from it, not a second list', () => {
    // Two independent lists is how one broker silently stops being honoured.
    const src = SRC('app/engine/contractBroker.ts');
    expect(src).toContain('return brokerShareFor(vendor) !== null;');
  });

  test('⚠ contractPayoutTc takes the SHARE, not a boolean', () => {
    // A boolean cannot express two brokers; a second flag beside it would be the same
    // mistake with more words.
    const src = SRC('app/engine/contractBroker.ts');
    expect(src).toContain('brokerShare: number | null,');
    expect(src).not.toMatch(/viaBroker: boolean/);
  });

  test('every payout site passes a resolved share', () => {
    const sites = STORE.match(/CB\.contractPayoutTc\([^;]*brokerShareFor\(scene\?\.vendor\) : null\)/g) ?? [];
    expect(sites.length).toBeGreaterThanOrEqual(5);
  });

  test('⚠⚠ the spoken line quotes the rate ACTUALLY applied', () => {
    // It used to read BROKER_PLAYER_SHARE directly, which would have told a player at a
    // Hidden Market stall they were paying 20% while charging them 10%.
    expect(brokerAcceptLine('A stall', 'mud monarchs', HIDDEN_MARKET_PLAYER_SHARE)).toContain('10 percent');
    expect(brokerAcceptLine('Halem the Trader', 'mud monarchs', BROKER_PLAYER_SHARE)).toContain('20 percent');
    const calls = STORE.match(/CB\.brokerAcceptLine\([^;]*brokerShareFor\(scene\?\.vendor\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  test('the trading post is still matched by id, never by a null faction', () => {
    expect(CONTRACT_BROKER_VENDOR_ID).toBe('halem_trader');
    expect(brokerShareFor({ id: 'halem_trader' })).toBe(BROKER_PLAYER_SHARE);
    expect(brokerShareFor({ id: null })).toBeNull();
    expect(brokerShareFor(null)).toBeNull();
  });
});

describe('⚠ OTA-1215 — a stall still takes its OWN faction’s work at full pay', () => {
  test('the broker cut applies only when the faction did not match', () => {
    // Otherwise a stall would dock 10% from a contract it was always entitled to take.
    const flags = STORE.match(/CB\.isContractBroker\([^)]*\)\s*\n?\s*&& !!\w+\.factionId && \w+\.factionId !== /g) ?? [];
    expect(flags.length).toBeGreaterThanOrEqual(3);
  });
});
