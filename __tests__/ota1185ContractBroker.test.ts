// OTA-1185 — PUNCHLIST P2 CLOSED. The trading post takes any faction's contract for a cut.
//
// ⚠ WHAT IT WAS. A mystery or storyline could only be handed to a vendor whose faction
// posted it. Four vendors are anchored in the shared outpost layout and stand at every
// outpost in the game, but between them they answer for only three factions; any other
// faction's agent arrives solely through `pickRandomVendor()`, a uniform roll over 30.
//
// ⚠⚠ AND THE ORIGINAL P2 WRITE-UP WAS WRONG IN BOTH DIRECTIONS — this suite pins the
// corrected facts so the claim cannot drift back:
//   - It said a player could not finish their OWN faction's mysteries. They could: the
//     Irma anchor is re-pointed to the HOST faction at every hub (arbAnchorVendorFaction),
//     and "host" is read from `player.factionId`, so she answers for the player everywhere.
//   - It omitted `true_tartarians` from the unreachable list, because it assumed Irma
//     covered them. She does not — she is re-pointed AWAY from them.
//
// ⚠ WHY A BROKER AND NOT THE COURIER (PUNCHLIST P3). Switching remote hand-in back on
// would reverse the owner's OTA-824 call *"kill all remote hand-ins, make all routable,
// but make the journey worth the loot."* A hand-in at the trading post reverses nothing —
// it is still face to face, still at an outpost the player travelled to.

// ⚠ OTA-1400 — SLICE 9 sent contracts and the mission board into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — what a pin on THE STORE has meant since slice 4.
import { readFileSync } from 'fs';
import { join } from 'path';
import { storeSource } from '../test-utils/storeSource';
import {
  isContractBroker,
  vendorCanTakeContract,
  contractPayoutTc,
  brokerAcceptLine,
  CONTRACT_BROKER_VENDOR_ID,
  BROKER_PLAYER_SHARE,
} from '../app/engine/contractBroker';
import fs from 'fs';
import path from 'path';
import { blockAt } from '../test-utils/srcBlock';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const HALEM = { id: 'halem_trader', faction: null as string | null };
const IRMA = { id: 'irma_ironhand', faction: 'stone_builders' as string | null };

describe('OTA-1185 — who the broker is', () => {
  test('the trading post is the broker', () => {
    expect(isContractBroker(HALEM)).toBe(true);
    expect(CONTRACT_BROKER_VENDOR_ID).toBe('halem_trader');
  });

  test('an ordinary faction vendor is not', () => {
    expect(isContractBroker(IRMA)).toBe(false);
  });

  test('a missing vendor is not, and does not throw', () => {
    expect(isContractBroker(null)).toBe(false);
    expect(isContractBroker(undefined)).toBe(false);
  });

  test('⚠⚠ IT IS KEYED ON THE ID, NEVER ON `faction === null`', () => {
    // Six vendors are factionless and FOUR of them — Naha, Thalan, Velar Shadowblade,
    // Elara Lightfinger — are wanderers who spawn ON THE ROAD via the roadside roll.
    // Matching on a null faction would let a player close contracts at any drifter
    // between tiles, deleting the travel OTA-824 exists to protect.
    const roadsideDrifter = { id: 'naha_drifter', faction: null };
    expect(isContractBroker(roadsideDrifter)).toBe(false);
    expect(vendorCanTakeContract(roadsideDrifter, 'mud_monarchs')).toBe(false);
  });

  test('⚠ the four road-spawning factionless vendors really are factionless in the data', () => {
    // If one of them ever gained a faction this assertion would go quiet and stop
    // guarding anything — so it checks the premise, not just the outcome.
    const data = JSON.parse(SRC('app/data/npcs/vendors.json')) as {
      vendors: { id: string; name: string; faction: string | null }[];
    };
    const factionless = data.vendors.filter((v) => !v.faction).map((v) => v.name);
    expect(factionless.length).toBeGreaterThan(1);
    expect(factionless).toContain('Halem the Trader');
    // and exactly one of them is the broker
    expect(data.vendors.filter((v) => v.id === CONTRACT_BROKER_VENDOR_ID)).toHaveLength(1);
  });

  test('⚠ the broker is anchored in the shared layout, which is what makes him reachable', () => {
    // The whole fix rests on him standing at EVERY outpost. `hubRoomFor` merges only
    // name/shortName/description from the per-faction variants, so anchorNpc is the
    // same at all of them — but that is only useful if he is an anchor at all.
    const hub = JSON.parse(SRC('app/data/world/static_hub.json')) as {
      rooms: { id: string; anchorNpc: string | null }[];
      hubLocationIds?: string[];
    };
    const his = hub.rooms.filter((r) => r.anchorNpc === 'Halem the Trader').map((r) => r.id);
    expect(his).toContain('outpost_gate');   // the room you enter by
    expect(his.length).toBeGreaterThanOrEqual(2);
    expect((hub.hubLocationIds ?? []).length).toBeGreaterThanOrEqual(9);
  });

  test('⚠ hubRoomFor must never let a faction skin override the anchor', () => {
    const src = SRC('app/engine/hub.ts');
    const i = src.indexOf('export function hubRoomFor');
    const body = blockAt(src, 'export function hubRoomFor');
    expect(body).toContain('name: override.name');
    // anchorNpc is taken from the base and must not appear as an override target
    expect(body).not.toMatch(/anchorNpc:\s*override/);
  });
});

describe('OTA-1185 — who may take a contract', () => {
  test('the posting faction may', () => {
    expect(vendorCanTakeContract(IRMA, 'stone_builders')).toBe(true);
  });

  test('another faction may not', () => {
    expect(vendorCanTakeContract(IRMA, 'mud_monarchs')).toBe(false);
  });

  test('the broker may take anyone’s', () => {
    expect(vendorCanTakeContract(HALEM, 'mud_monarchs')).toBe(true);
    expect(vendorCanTakeContract(HALEM, 'conspiracy_architects')).toBe(true);
  });

  test('⚠ an UNALIGNED contract is still taken by anybody — unchanged behaviour', () => {
    // The old gates were all `if (candidate.factionId && …)`. Three mysteries ship with
    // no faction; they must not start being refused because the rule moved.
    expect(vendorCanTakeContract(IRMA, null)).toBe(true);
    expect(vendorCanTakeContract(IRMA, undefined)).toBe(true);
  });

  test('no vendor at all is still a refusal', () => {
    expect(vendorCanTakeContract(null, 'mud_monarchs')).toBe(false);
  });
});

describe('OTA-1185 — what the broker costs', () => {
  // ⚠ RETARGETED BY OTA-1192. `contractPayoutTc` took a boolean `viaBroker` until the
  // Hidden Market arrived charging a different rate — a boolean cannot express two
  // brokers. It now takes the player's SHARE (or null for a direct hand-in), so these
  // pass BROKER_PLAYER_SHARE where they used to pass `true`. The rule each one guards is
  // unchanged; only how the rate is spelled has moved.
  test('a direct hand-in pays base plus the long-haul bonus', () => {
    expect(contractPayoutTc(100, 40, null)).toBe(140);
  });

  test('the broker pays 80% of base', () => {
    expect(contractPayoutTc(100, 0, BROKER_PLAYER_SHARE)).toBe(80);
    expect(BROKER_PLAYER_SHARE).toBe(0.8);
  });

  test('⚠⚠ the broker FORFEITS the long-haul bonus entirely, not a share of it', () => {
    // The bonus is paid for making the trip to the faction. A hand-in that skips finding
    // them has not made that trip. Taking a cut of it instead would leave the fallback
    // competitive with the real thing at distance, which is backwards.
    expect(contractPayoutTc(100, 150, BROKER_PLAYER_SHARE)).toBe(80);
    expect(contractPayoutTc(100, 150, BROKER_PLAYER_SHARE)).toBeLessThan(contractPayoutTc(100, 150, null));
  });

  test('⚠ going to the right people always pays more, at every distance', () => {
    for (const bonus of [0, 5, 30, 150]) {
      expect(contractPayoutTc(100, bonus, null)).toBeGreaterThan(contractPayoutTc(100, bonus, BROKER_PLAYER_SHARE));
    }
  });

  test('⚠ a contract that paid something never brokers down to nothing', () => {
    // A 0 TC result on a small contract reads as "the hand-in did nothing" — the exact
    // complaint P1 was filed for. Floored at 1.
    expect(contractPayoutTc(1, 0, BROKER_PLAYER_SHARE)).toBe(1);
    expect(contractPayoutTc(2, 0, BROKER_PLAYER_SHARE)).toBeGreaterThanOrEqual(1);
  });

  test('a contract that paid nothing still pays nothing', () => {
    expect(contractPayoutTc(0, 0, BROKER_PLAYER_SHARE)).toBe(0);
  });

  test('negative or fractional inputs cannot produce a negative payout', () => {
    expect(contractPayoutTc(-50, -10, null)).toBe(0);
    expect(contractPayoutTc(-50, -10, BROKER_PLAYER_SHARE)).toBe(0);
  });

  test('the line he says names the same cut the maths applies', () => {
    const line = brokerAcceptLine('Halem the Trader', 'mud monarchs');
    expect(line).toContain('Halem the Trader');
    expect(line).toContain('mud monarchs');
    expect(line).toContain(`${Math.round((1 - BROKER_PLAYER_SHARE) * 100)} percent`);
  });
});

describe('⚠⚠ OTA-1185 — every turn-in path routes through the ONE resolver', () => {
  const STORE = storeSource();

  test('no handler still hand-rolls the faction comparison as its gate', () => {
    // Four handlers had three different wordings of the same rule. A fifth spelling is
    // how one of them silently stops honouring the broker.
    expect(STORE).not.toMatch(/if \(candidate\.factionId && candidate\.factionId !== scene\?\.vendor\?\.faction\)/);
    expect(STORE).not.toMatch(/if \(def\.factionId && def\.factionId !== scene\.vendor\.faction\)/);
  });

  test('all four typed handlers plus the Contracts button ask vendorCanTakeContract', () => {
    const calls = STORE.match(/CB\.vendorCanTakeContract\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  test('every brokered path pays through contractPayoutTc', () => {
    const pays = STORE.match(/CB\.contractPayoutTc\(/g) ?? [];
    expect(pays.length).toBeGreaterThanOrEqual(5);
  });

  test('⚠ the cut is only charged when the faction did NOT match', () => {
    // Otherwise the broker's own work — and unaligned contracts anyone can take — would
    // be docked 20% for no reason.
    const viaFlags = STORE.match(/CB\.isContractBroker\([^)]*\)\s*\n?\s*&& !!\w+\.factionId && \w+\.factionId !== /g) ?? [];
    expect(viaFlags.length).toBeGreaterThanOrEqual(3);
  });

  test('⚠⚠ no reward line claims a long-haul bonus the broker did not pay', () => {
    // OTA-1156 shipped because a line stated an outcome nobody had checked. The same
    // defect in reward copy would read as the player being paid a bonus they were not.
    const bad = STORE.match(/\$\{journeyTc > 0 \? ` \(incl\./g) ?? [];
    expect(bad).toHaveLength(0);
    // ⚠ Widened by OTA-1188: two of these now also exclude the COURIER, so the guard reads
    // `!xViaBroker && !xViaCourier && journeyTc > 0`. The rule is unchanged — a reward line
    // may not claim a bonus that was not paid — so the pattern matches the rule, not one
    // particular spelling of it.
    const guarded = STORE.match(/!\w*[Vv]iaBroker && (!\w*[Vv]iaCourier && )?journeyTc > 0/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(3);
  });

  test('the refusals now point at the trading post', () => {
    // ⚠⚠ OTA-1402 — THE COUNT WENT FROM FOUR TO ONE, AND THAT IS THE FIX, NOT A
    // REGRESSION. This counted the pointer once per refusal site, which is the
    // shape that let four hand-written phrasings of one rule drift apart — two
    // said "Wrong agent", one "wrong faction", one "waves you off". All four now
    // route through `app/engine/contractRefusal.ts`, so the pointer is written
    // once and cannot disagree with itself.
    //
    // What this test protects is that a refusal TELLS THE PLAYER WHERE TO GO, so
    // that is what it checks now: the shared refusal carries the pointer, and
    // every call site reaches it.
    // ⚠ OTA-1403 — asserted on the RUNTIME OUTPUT, not on the source text. The
    // sentence is assembled from concatenated template literals, so it exists in
    // the message and not in any one line of the file — a source match here
    // would be testing the line wrapping rather than what the player reads.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { wrongCounterpartyBody } = require('../app/engine/contractRefusal') as
      typeof import('../app/engine/contractRefusal');
    expect(wrongCounterpartyBody({ sourceLabel: 'a runner', contractFactionId: 'stone_builders' }))
      .toMatch(/trading post at any outpost gate/);
    expect((STORE.match(/refuseWrongCounterparty\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('the Contracts screen says what the broker pays', () => {
    const src = SRC('app/screens/ContractsScreen.tsx');
    expect(src).toMatch(/trading post .*80%/);
  });
});

describe('⚠⚠ OTA-1185 — the broker DOES take deliveries, and this suite is why', () => {
  const STORE = storeSource();

  test('⚠⚠ a fetch quest is NOT refused at the broker', () => {
    // The first version refused it, citing OTA-456's "you can't mail the goods", and
    // justified the refusal as free because faction quests come from the player's own
    // board. The next test is the premise check that killed that justification.
    expect(STORE).not.toContain('if (questViaBroker && candidate.fetch)');
  });

  test('⚠⚠ THE PREMISE CHECK: faction quests are NOT only the player’s own', () => {
    // This is the assertion that caught it. The accept handler's quest pool is keyed on a
    // faction derived from the SCENE VENDOR, not from the player — and a Hidden Market
    // stall iterates EVERY faction. So a player can hold an unreachable faction's fetch
    // quest, and refusing it at the broker would strand the exact contract P2 is about.
    //
    // ⚠ Anchored on landmarks, not a fixed slice — the seventh windowed assertion to age
    // this session. The rule is "the accept handler's pool is fed from searchFactions,
    // and searchFactions comes from the vendor", and that survives the code moving.
    const anchor = STORE.indexOf("const searchFactions = isBrokerVendorId(scene?.vendor?.id)");
    expect(anchor).toBeGreaterThan(-1);
    const loop = STORE.indexOf('for (const fid of searchFactions)', anchor);
    const pool = STORE.indexOf('availableFactionQuests(', loop);
    expect(loop).toBeGreaterThan(anchor);
    expect(pool).toBeGreaterThan(loop);
    // and the pool's first argument is the loop variable, not the player's faction
    expect(STORE.slice(pool, STORE.indexOf(')', pool))).toContain('fid');
  });

  test('⚠ the goods still leave the player’s hands — the fetch gate is untouched', () => {
    // OTA-456's rule is about goods travelling with nobody present. The broker hand-in is
    // face to face, and the verify-and-consume still runs, so the delivery is real —
    // only the final destination is delegated.
    //
    // ⚠ Window-free: the HOLD check and the CONSUME must both fall between the fetch
    // gate and the payout, in that order. No slice size to age.
    const gate = STORE.indexOf('OTA-450 — fetch gate.');
    const hold = STORE.indexOf('if (have < quantity)', gate);
    const consume = STORE.indexOf('inventory: consumed', gate);
    const payout = STORE.indexOf('const baseAndJourneyTc = CB.contractPayoutTc(', gate);
    expect(gate).toBeGreaterThan(-1);
    expect(hold).toBeGreaterThan(gate);
    expect(consume).toBeGreaterThan(hold);
    expect(payout).toBeGreaterThan(consume);
  });

  test('⚠⚠ the BROKER is not the courier — it still requires being there in person', () => {
    // ⚠ RETARGETED BY OTA-1188, which deliberately restored the courier for reports. This
    // assertion used to pin `"No couriers for this."` — a line that OTA-1188 removes on
    // purpose, so leaving it would have failed the build for a change that was intended.
    //
    // What OTA-1185 actually guarantees is narrower and still true: the BROKER path is a
    // face-to-face hand-in. It is reached only through a vendor in scene, so it can never
    // become a way to close a contract from open country.
    expect(STORE).toContain('CB.isContractBroker(scene?.vendor)');
    expect(STORE).not.toMatch(/isContractBroker\((?!scene)/);
  });
});
