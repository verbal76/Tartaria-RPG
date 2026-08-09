// OTA-1217 — PUNCHLIST P11 CLOSED. HAL brought up to golem's version: the EXIT chip
// belongs only in the gate room.
//
// ⚠⚠ THE LIVE LINE WAS THE DEFICIENT ONE. `fix(golem-line): EXIT chip only in the gate
// room` (e04a6ed5) landed on golem-line on 2026-06-27 and was never ported up, so HaL2001
// — the branch the Apple testers are on — has been letting players walk out of an outpost
// through the armory or the mess hall. The outpost is a 15-room interior entered and left
// through the Gate; leaving from any room is not a shortcut, it is a hole in the geography.
//
// It surfaced because `verify-parity` flagged `InputBox.tsx` on every port that touched it.
// Owner, on being shown the better version was on the branch nobody plays: *"ok then bring
// hal up to the better version."*
//
// ⚠ The base of this suite is golem's own `hubExitGate.test.ts`, kept so both lines assert
// the same thing, with the OTA-1209 and tutorial cases added.

import {
  roomIsExit,
  hubDefinesExitRoom,
  findHubRoom,
  hubEntryRoomId,
  hubRoomFor,
  HUB,
} from '../app/engine/hub';
import { FACTION_STARTING_LOCATION } from '../app/engine/character';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('OTA-1217 — the gate is the way out', () => {
  it('the hub defines an entrance/gate room at all', () => {
    expect(hubDefinesExitRoom()).toBe(true);
  });

  it('roomIsExit is true ONLY for the entrance-tagged gate room', () => {
    const gate = findHubRoom('outpost_gate');
    expect(gate).not.toBeNull();
    expect(roomIsExit(gate)).toBe(true);
    const armory = findHubRoom('outpost_armory');
    expect(armory).not.toBeNull();
    expect(roomIsExit(armory)).toBe(false);
    expect(roomIsExit(null)).toBe(false);
  });

  it('⚠ exactly ONE room is tagged as the entrance', () => {
    // Two gates would make the rule meaningless without failing anything.
    const gates = HUB.rooms.filter((r) => (r.tags ?? []).includes('entrance'));
    expect(gates).toHaveLength(1);
    expect(gates[0]!.id).toBe('outpost_gate');
  });

  it('⚠ the gate IS the spawn room, so the tutorial’s leave beat still has its chip', () => {
    // `explore_or_leave` unlocks EXIT. If the gate were not where the player starts, this
    // change would have broken the tutorial rather than tightened the geography.
    expect(roomIsExit(findHubRoom(hubEntryRoomId()))).toBe(true);
  });
});

describe('⚠⚠ OTA-1217 — the rule survives OTA-1209’s per-site skins', () => {
  it('the gate is still the gate under every faction’s colours', () => {
    // `hubRoomFor` merges only name/shortName/description — tags come from the base room.
    // If a skin could drop the `entrance` tag, a player at a foreign site would lose the
    // ability to leave, which is exactly the failure the fallback exists to prevent.
    for (const factionId of Object.keys(FACTION_STARTING_LOCATION)) {
      expect(roomIsExit(hubRoomFor('outpost_gate', factionId))).toBe(true);
      expect(roomIsExit(hubRoomFor('outpost_armory', factionId))).toBe(false);
    }
  });
});

describe('⚠⚠ OTA-1217 — the fallback is the point', () => {
  it('when no room is tagged, EXIT stays available everywhere', () => {
    // A gating rule whose failure mode is "the player cannot leave the building" would be a
    // far worse defect than the one it fixes. The chip logic returns true when
    // hubDefinesExitRoom() is false, so a layout that forgets the tag strands nobody.
    const src = SRC('app/components/InputBox.tsx');
    const i = src.indexOf('const showExitChip = useMemo(');
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('}, [hubRoom]);', i));
    expect(body).toContain('if (hubDefinesExitRoom()) return roomIsExit(hubRoom);');
    expect(body).toContain('return true;');
  });

  it('the chip is actually gated on it in the render', () => {
    const src = SRC('app/components/InputBox.tsx');
    expect(src).toContain('{showExitChip ? (');
    expect(src).toMatch(/showExitChip \? \(\s*\n\s*<TravelBtn label="EXIT"/);
  });
});
