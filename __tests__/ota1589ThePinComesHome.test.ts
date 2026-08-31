// ⚠⚠⚠ OTA-1589 — THE PIN COMES HOME, AND THE STRANDED RECORDS GET UNSTUCK.
//
// Owner: *"audit all the work that has been done, analyze the mission structure
// we tried to put in place and identify the root cause of the failure and fix
// it."*
//
// ⚠⚠⚠ THE ROOT CAUSE, READ OUT OF HIS OWN DEVICE LOG (run mtgnmcrn0ya9,
// 2026-08-31). He opened the missions screen, set a contract active, and the
// route said Nimari — 8 tiles, 20 hours. He walked it. At 02:54:27 he arrived;
// the MAIN quest spoke, the contract said nothing. At 02:54:54 he tapped
// INVESTIGATE — twice — and got generic lore. At 02:57:50 he set course back.
// At 03:02 and 03:03 he opened the missions screen twice more and sent the log:
// "mission is still broken."
//
// Only ONE record state fits every line of that log: PAST THE LAST STAGE.
// A finished record's pin fell through `contractStageAnchorId(def, stage)` —
// `stages[stage]` is undefined past the end — to the CONTRACT'S FAR ANCHOR.
// So the card said READY, the only button on it said "ROUTE TO NIMARI", and
// `turnInMystery`'s refusal said "set a course to the ◆ pin in Contracts" —
// the same wrong pin. A closed loop that marches the player to a drowned
// capital where the mission can neither advance (no stage left) nor be paid
// (no vendor, no board, no hall).
//
// ⚠⚠ AND THE STRUCTURAL HALF: the stage INDEX is a raw persisted integer into
// stage arrays rewritten at least four times (P19-B, 1576, 1582, 1583), while
// every fix so far repaired a DOOR — accept (1582), the kill path (1583), the
// arrival line (1586). Door fixes help records that pass through the door AFTER
// the fix; his save carries records placed by every previous era, and no code
// re-examined them. That is also why 10,900 green tests kept disagreeing with
// one phone: the walkers create FRESH records, never the save old builds left.
//
// The fix, in two halves: a finished contract's pin routes to the nearest PAY
// WINDOW (hub tile — where posting agents stand), labelled as the hand-in it
// is; and a load-time repair pass moves any record an old build parked on a
// beat nothing can pay.

import {
  openContractMarkers, nearestTurnInSiteId, contractAnchorId, contractStageAnchorId,
} from '../app/engine/contractMarkers';
import { hubLocationIds, isHubLocation } from '../app/engine/hub';
import { repairMissionRecords } from '../app/engine/missionRepair';
import { missionArrivalLines } from '../app/engine/missionTrace';
import { MYSTERIES, findMysteryById } from '../app/engine/mysteries';
import type { PlayerCharacter } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const at = (loc: string, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ ...placedAt(loc), inventory: [], ...extra } as unknown as PlayerCharacter);

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const CODEX = findMysteryById('mystery_ashen_codex')!;
const DONE = CODEX.stages.length; // past the end = READY

describe('OTA-1589 — his exact loop, closed', () => {
  it('⚠⚠⚠ A FINISHED MYSTERY NO LONGER PINS ON THE FAR ANCHOR', () => {
    // The Ashen Codex anchors at Nimari. Completed, its pin used to fall back
    // there — the exact 20-hour walk in his log. It must now point at a hub.
    const p = at('great_tartary_plains', {
      activeMysteries: [{ id: CODEX.id, stage: DONE }],
    } as Partial<PlayerCharacter>);
    const pin = openContractMarkers(p).find((m) => m.key === `mystery:${CODEX.id}`)!;
    expect(pin.ready).toBe(true);
    expect(pin.anchorId).not.toBe(contractAnchorId(CODEX));
    expect(isHubLocation(pin.anchorId)).toBe(true);
  });

  it('⚠⚠⚠ AND THE OLD FALLBACK IS PROVEN, so the fix is against a measured fact', () => {
    // The raw helper still falls through past the end — that behaviour is fine
    // for a helper (the pin builder is the one that must not use it there). If
    // this ever stops holding, the marker fix above is guarding a ghost.
    expect(contractStageAnchorId(CODEX, DONE)).toBe(contractAnchorId(CODEX));
  });

  it('⚠⚠ the pin goes to the NEAREST pay window, not a fixed one', () => {
    // Measured, not assumed: from each of two different hub tiles, the nearest
    // site is the tile itself (distance zero beats every other hub).
    const sites = hubLocationIds();
    expect(sites.length).toBeGreaterThan(1);
    for (const s of [sites[0]!, sites[sites.length - 1]!]) {
      expect(nearestTurnInSiteId(at(s))).toBe(s);
    }
  });

  it('⚠⚠ an IN-FLIGHT record keeps its stage pin — the field work still routes to the field', () => {
    const p = at('great_tartary_plains', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }],
    } as Partial<PlayerCharacter>);
    const pin = openContractMarkers(p).find((m) => m.key === 'mystery:mystery_red_tower')!;
    const def = MYSTERIES.find((m) => m.id === 'mystery_red_tower')!;
    expect(pin.ready).toBeUndefined();
    expect(pin.anchorId).toBe(contractStageAnchorId(def, 0));
  });
});

describe('OTA-1589 — the load-time repair pass', () => {
  it('⚠⚠⚠ A RECORD PARKED ON A VERBLESS BEAT IS MOVED TO ONE THE MACHINE CAN SEE', () => {
    // Stage 3 of the Ashen Codex is the verbless epilogue. No verb pays it, no
    // matcher sees it, the card cannot open it — a record standing there is
    // wedged forever, with no symptom except "mission is still broken". Today's
    // rule (the kill path's own): consume it, which lands READY — the owner's
    // ruling that an epilogue is the turn-in's prose.
    const p = at('nimari', {
      activeMysteries: [{ id: CODEX.id, stage: 3 }],
    } as Partial<PlayerCharacter>);
    expect(CODEX.stages[3]!.checkKind).toBeNull();
    const { player: fixed, notes } = repairMissionRecords(p);
    expect(fixed.activeMysteries![0]!.stage).toBe(DONE);
    expect(notes.join('\n')).toContain('parked it on a verbless beat');
  });

  it('⚠⚠ unusable and overshot indices are clamped, and each repair leaves a receipt', () => {
    const p = at('nimari', {
      activeMysteries: [
        { id: CODEX.id, stage: -2 },
        { id: 'mystery_red_tower', stage: 99 },
      ],
    } as Partial<PlayerCharacter>);
    const { player: fixed, notes } = repairMissionRecords(p);
    expect(fixed.activeMysteries![0]!.stage).toBe(0); // first actionable — the giver's beat
    const rt = findMysteryById('mystery_red_tower')!;
    expect(fixed.activeMysteries![1]!.stage).toBe(rt.stages.length); // plain READY
    expect(notes).toHaveLength(2);
  });

  it('⚠⚠ a healthy save passes through UNTOUCHED — same reference, zero notes', () => {
    // The pass repairs records the machine cannot SEE, never records it merely
    // sees differently than an older build did. Anything stronger would be a
    // silent save migration, which is how a forensics session loses a day.
    const p = at('nimari', {
      activeMysteries: [{ id: CODEX.id, stage: 1 }],
      activeHunts: [],
      activeStorylines: [],
    } as unknown as Partial<PlayerCharacter>);
    const { player: same, notes } = repairMissionRecords(p);
    expect(same).toBe(p);
    expect(notes).toEqual([]);
  });

  it('⚠ and it is idempotent — repairing a repaired save changes nothing', () => {
    const p = at('nimari', {
      activeMysteries: [{ id: CODEX.id, stage: 3 }],
    } as Partial<PlayerCharacter>);
    const once = repairMissionRecords(p).player;
    const twice = repairMissionRecords(once);
    expect(twice.player).toBe(once);
    expect(twice.notes).toEqual([]);
  });
});

describe('OTA-1589 — the finished contract speaks at the pay window', () => {
  it('⚠⚠⚠ ARRIVING AT ANY HUB WITH A FINISHED CONTRACT SAYS HAND IT IN', () => {
    const hub = hubLocationIds()[0]!;
    const p = at(hub, {
      activeMysteries: [{ id: CODEX.id, stage: DONE }],
    } as Partial<PlayerCharacter>);
    const lines = missionArrivalLines(p).join('\n');
    expect(lines).toContain(CODEX.title);
    expect(lines).toContain('find the counter and hand it in');
  });

  it('⚠⚠ and stays silent off-hub — the field has nothing left to say to it', () => {
    const p = at('nimari', {
      activeMysteries: [{ id: CODEX.id, stage: DONE }],
    } as Partial<PlayerCharacter>);
    expect(missionArrivalLines(p)).toEqual([]);
  });
});

describe('OTA-1589 — wired where his loop actually ran', () => {
  it('⚠⚠⚠ THE LOAD SEAM REPAIRS, AND LOGS EVERY REPAIR', () => {
    const SLOT = src('app', 'state', 'slices', 'slotSlice.ts');
    expect(SLOT).toContain('repairMissionRecords({ ...player, hasSeenIntro: true })');
    expect(SLOT).toContain('player: repairedPlayer,');
    expect(SLOT).toContain("for (const n of repairNotes) get().appendLog('debug', n);");
  });

  it('⚠⚠⚠ THE READY CARD SAYS HAND IN, NOT ROUTE TO THE FIELD', () => {
    const SCREEN = src('app', 'screens', 'ContractsScreen.tsx');
    expect(SCREEN).toContain('HAND IN AT ${info.anchorName.toUpperCase()}');
    expect(SCREEN).toContain('find the counter and HAND IT IN');
    // The ready flag actually flows from the marker into the card's lookup.
    expect(SCREEN).toContain('ready: cm.ready');
  });

  it('⚠ the pin builder and the READY pill ask the same question', () => {
    // missionReady.ts unified "ready" for exactly this reason (OTA-1152); the
    // marker builder keeps the staged families' expression in step with it and
    // says so at the definition.
    const CM = src('app', 'engine', 'contractMarkers.ts');
    expect(CM).toContain('function stagedWorkDone(');
    expect(CM).toContain('see missionReady.ts');
  });
});
