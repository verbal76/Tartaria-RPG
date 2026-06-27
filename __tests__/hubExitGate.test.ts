import { roomIsExit, hubDefinesExitRoom, findHubRoom, hubEntryRoomId } from '../app/engine/hub';

describe('hub EXIT gating (gate room only)', () => {
  it('the Tartaria hub defines an entrance/gate room', () => {
    expect(hubDefinesExitRoom()).toBe(true);
  });

  it('roomIsExit is true ONLY for the entrance-tagged gate room', () => {
    const gate = findHubRoom('outpost_gate');
    expect(gate).not.toBeNull();
    expect(roomIsExit(gate)).toBe(true);
    // a non-gate room (e.g. the armory) is not an exit
    const armory = findHubRoom('outpost_armory');
    expect(armory).not.toBeNull();
    expect(roomIsExit(armory)).toBe(false);
    expect(roomIsExit(null)).toBe(false);
  });

  it('the gate IS the spawn room, so EXIT is present where the player starts', () => {
    expect(roomIsExit(findHubRoom(hubEntryRoomId()))).toBe(true);
  });
});
