// OTA-1210 — PUNCHLIST P5, P7 and P8. Three defects from the P3 audit, none of which
// needed a design decision.
//
//   P7 — the long-haul bonus measured where you STOOD, not the trip you made.
//   P8 — a finished bounty could not be handed in at the board that posted it.
//   P5 — a comment claimed the location challenges were switched off. All six are on.

import {
  contractJourneyBonusTc,
  contractTurnInRemoteness,
} from '../app/engine/contractMarkers';
import { canonicalCellOf } from '../app/engine/worldMap';
import { FACTION_STARTING_LOCATION } from '../app/engine/character';
import {
  TIER_C_ENABLED,
  LOCATION_CHALLENGES,
  challengeActive,
} from '../app/engine/locationChallenges';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const STORE = SRC('app/state/gameStore.ts');
const HUB = 'tartarian_outskirts';
const cellOf = (id: string) => canonicalCellOf(id);

describe('⚠⚠ OTA-1210 / P7 — the bonus measures the TRIP now', () => {
  // A deep site and the starter hub, so "far from hub" and "far from accept" differ.
  const deep = 'architect_blind';
  const deepCell = cellOf(deep);
  const hubCell = cellOf(HUB);

  test('accepting and handing in on the same tile pays NOTHING', () => {
    // ⚠ The headline defect: this used to pay the MAXIMUM at a deep capital, for a
    // contract the player never carried anywhere.
    expect(contractJourneyBonusTc(deep, 100, deepCell)).toBe(0);
  });

  test('⚠ and that same hand-in still pays the max WITHOUT the stamp — the old behaviour', () => {
    // Proves the defect existed and that the legacy path is untouched, in one assertion.
    expect(contractJourneyBonusTc(deep, 100)).toBeGreaterThan(0);
    expect(contractJourneyBonusTc(deep, 100)).toBe(
      Math.min(contractTurnInRemoteness(deep) * 6, Math.round(100 * 1.5)),
    );
  });

  test('⚠⚠ hauling from a deep capital BACK to the hub now pays — it used to pay zero', () => {
    const paid = contractJourneyBonusTc(HUB, 100, deepCell);
    expect(paid).toBeGreaterThan(0);
    // and the old read would have given nothing at all for that same trek
    expect(contractJourneyBonusTc(HUB, 100)).toBe(0);
  });

  test('the trip is symmetric — the same distance pays the same either way', () => {
    expect(contractJourneyBonusTc(HUB, 100, deepCell))
      .toBe(contractJourneyBonusTc(deep, 100, hubCell));
  });

  test('a longer trip pays more', () => {
    const near = { x: deepCell.x + 1, y: deepCell.y };
    const far = { x: deepCell.x + 5, y: deepCell.y };
    expect(contractJourneyBonusTc(deep, 500, far))
      .toBeGreaterThan(contractJourneyBonusTc(deep, 500, near));
  });

  test('⚠ the tuning numbers did NOT move — still 6 TC a cell, still capped at 1.5x base', () => {
    const three = { x: deepCell.x + 3, y: deepCell.y };
    expect(contractJourneyBonusTc(deep, 1000, three)).toBe(18);
    // cap bites on a small reward
    expect(contractJourneyBonusTc(deep, 4, { x: deepCell.x + 50, y: deepCell.y })).toBe(6);
  });

  test('a null or undefined stamp is the legacy path, not a crash', () => {
    expect(contractJourneyBonusTc(deep, 100, null)).toBe(contractJourneyBonusTc(deep, 100));
    expect(contractJourneyBonusTc(deep, 100, undefined)).toBe(contractJourneyBonusTc(deep, 100));
  });

  test('never negative, whatever it is handed', () => {
    expect(contractJourneyBonusTc(deep, -10, deepCell)).toBe(0);
    expect(contractJourneyBonusTc(deep, 0, hubCell)).toBe(0);
  });
});

describe('⚠⚠ OTA-1210 / P7 — the stamp is written and read everywhere', () => {
  test('all four active-contract records can carry an accept cell', () => {
    const types = SRC('app/engine/types.ts');
    expect(types.match(/acceptedAtCell\?: \{ x: number; y: number \}/g) ?? []).toHaveLength(4);
  });

  test('⚠ every accept site stamps it, through ONE helper', () => {
    // Nine accept sites already spell the player variable four different ways. A stamp
    // that is right at eight of them is a contract that silently pays the legacy rate at
    // the ninth — so they all go through `acceptCellStamp`.
    expect(STORE).toContain('function acceptCellStamp(');
    expect((STORE.match(/\.\.\.acceptCellStamp\(get\)/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });

  test('⚠ the legacy backfill is deliberately NOT stamped', () => {
    // Contracts migrated from a pre-OTA-1210 save were accepted somewhere unknowable;
    // inventing a cell for them would fabricate a journey the player may not have made.
    // ⚠ Anchored on the migration COMMENT and the next field, both of which the two
    // lines share. The first spelling of this pinned `activeFactionQuests: ((p.` and the
    // SINGLE-ACTIVE backfill — HaL2001-only text, so it could never have run on
    // golem-line, where that backfill does not exist.
    const i = STORE.indexOf('// Migrate legacy flat-id list into the new staged shape');
    expect(i).toBeGreaterThan(-1);
    const end = STORE.indexOf('completedFactionQuestIds:', i);
    expect(end).toBeGreaterThan(i);
    expect(STORE.slice(i, end)).not.toContain('acceptCellStamp');
  });

  test('every payout reads the stamp off the contract record', () => {
    const pays = STORE.match(/contractJourneyBonusTc\([^;]*acceptedAtCell\)/g) ?? [];
    expect(pays.length).toBeGreaterThanOrEqual(5);
  });

  test('⚠ no payout still calls it with only two arguments', () => {
    // A missed site pays the old, wrong number and nothing else would notice.
    const twoArg = STORE.match(/contractJourneyBonusTc\(player\.currentLocationId, [\w.]+\.\w+\)/g) ?? [];
    expect(twoArg).toHaveLength(0);
  });
});

describe('⚠⚠ OTA-1210 / P8 — the board takes back what it posted', () => {
  test('the resolver exists and is the only one', () => {
    expect(STORE).toContain('function turnInCounterparty(');
  });

  test('it accepts a vendor, a mission board, or the faction hall', () => {
    const i = STORE.indexOf('function turnInCounterparty(');
    const body = STORE.slice(i, STORE.indexOf('\n}', i));
    expect(body).toContain('scene?.vendor');
    expect(body).toContain('scene?.missionBoard');
    expect(body).toContain('isHubLocation(player.currentLocationId)');
    expect(body).toContain('startingLocationForFaction');
    expect(body).toContain('return null;');
  });

  test('⚠ all four turn-in paths use it — hunts, mysteries, storylines, and the button', () => {
    const uses = STORE.match(/turnInCounterparty\(get, player, scene\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });

  test('⚠⚠ none of them still refuses on a bare missing vendor', () => {
    // This is the defect itself: `if (!scene?.vendor)` in a turn-in handler.
    const i = STORE.indexOf('turnInHunt(titleOrId');
    const j = STORE.indexOf('completeContractFromUIInner');
    const region = STORE.slice(i, j);
    expect(region).not.toMatch(/if \(!scene\?\.vendor\) \{\s*\n\s*get\(\)\.appendLog\(\s*\n?\s*'arbiter',\s*\n?\s*`The Arbiter folds their arms\./);
  });

  test('the faction gate reads the COUNTERPARTY, not the vendor', () => {
    // ⚠ Reading `scene.vendor.faction` at a board or hall resolves to undefined and
    // refuses the very contract the counterparty just agreed to take.
    // ⚠ `\w+!?\.faction` — OTA-1211 made the counterparty optional on the courier paths,
    // so two of these now carry a non-null assertion. Pinning the exact punctuation would
    // have made this fail on a change that did not touch the rule it guards.
    const gates = STORE.match(/CB\.vendorCanTakeContract\(\{ id: scene\?\.vendor\?\.id, faction: \w+!?\.faction \}/g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(4);
  });

  test('⚠ crediting an NPC still requires an actual NPC', () => {
    // A board or a hall is not a person; OTA-1073's ledger must not gain a phantom entry.
    const i = STORE.indexOf('function creditTurnIn(');
    const body = STORE.slice(i, STORE.indexOf('\n}', i));
    expect(body).toContain('if (!v) return;');
  });

  test('faction quests were always allowed all three — this closes the gap, not opens one', () => {
    expect(STORE).toContain("scene?.vendor?.faction ?? scene?.missionBoard?.faction ?? null");
  });
});

describe('⚠⚠ OTA-1210 / P5 — the "challenges are off" comment was false', () => {
  test('the false claim is gone', () => {
    expect(STORE).not.toContain('so this loop is\n    // inert today');
    expect(STORE).not.toMatch(/challenges are switched OFF \(locationChallenges/);
  });

  test('⚠ THE PREMISE: they really are all on, which is why the comment was wrong', () => {
    // ⚠ Read from the MODULE, not from the file text. The first version grepped for
    // `enabled: false` and failed on two matches — both inside COMMENTS explaining how to
    // switch a challenge off. That is the OTA-1205 trap again: a pattern that matches
    // prose rather than behaviour. If Tier C is genuinely switched off later this fails,
    // and the comment gets revisited rather than quietly becoming true again.
    expect(TIER_C_ENABLED).toBe(true);
    for (const c of LOCATION_CHALLENGES) expect(c.enabled).toBe(true);
  });

  test('all six are present, and every one reports itself active', () => {
    const ids = LOCATION_CHALLENGES.map((c) => c.id).sort();
    expect(ids).toEqual([
      'defense_of_the_enclave', 'labyrinth_of_shadows', 'parley_of_factions',
      'tongue_of_the_red_tower', 'trap_dives_of_the_stair', 'warden_of_the_cathedral',
    ]);
    // challengeActive requires BOTH the master flag and the per-challenge flag, so this
    // is the real "is this loop inert" question the old comment answered wrongly.
    for (const c of LOCATION_CHALLENGES) expect(challengeActive(c.id)).toBe(true);
  });
});

describe('OTA-1210 — the ownership map the P8 hall branch depends on', () => {
  test('every faction still maps to a hub site', () => {
    for (const locId of Object.values(FACTION_STARTING_LOCATION)) {
      expect(typeof locId).toBe('string');
      expect(cellOf(locId)).toBeDefined();
    }
  });
});
