// OTA-1490 — THE DEVICE IS THE OWNER, NOT THE CHARACTER.
//
// ⚠⚠ Owner: *"I have 2 characters on 1 account and only 1 has the send log
// option."* OTA-1489's gate read the LOADED character's name, but ownership is
// a property of the device in the hand. The unlock is now sticky: the first
// time an unlock-named character is seen, the device is marked, and every
// character on it gets the owner tools from then on. A device that never held
// an unlock-named character never sets the flag — the player-facing surface
// is unchanged.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  noteOwnerCharacterSeen, ownerToolsUnlocked, unlockOwnerTools, OWNER_TOOLS_KEY,
} from '../app/diagnostics/ownerTools';
import { between } from '../test-utils/srcBlock';

const ABOUT = readFileSync(join(__dirname, '..', 'app', 'screens', 'AboutScreen.tsx'), 'utf8');

beforeEach(async () => { await AsyncStorage.removeItem(OWNER_TOOLS_KEY); });

describe('OTA-1490 — the sticky unlock', () => {
  it('⚠⚠ the owner\'s exact case: Verbal marks the device, the second character inherits', async () => {
    expect(await ownerToolsUnlocked('Mudline Karn')).toBe(false); // before: locked
    await noteOwnerCharacterSeen('Verbal');
    expect(await ownerToolsUnlocked('Mudline Karn')).toBe(true);  // after: unlocked
    expect(await ownerToolsUnlocked(null)).toBe(true);            // even with no player loaded
  });

  it('⚠⚠ a device that never held an unlock name NEVER unlocks', async () => {
    await noteOwnerCharacterSeen('Mudline Karn');
    await noteOwnerCharacterSeen('A Player Entirely');
    await noteOwnerCharacterSeen(null);
    expect(await AsyncStorage.getItem(OWNER_TOOLS_KEY)).toBeNull();
    expect(await ownerToolsUnlocked('Mudline Karn')).toBe(false);
  });

  it('⚠ an unlock-named character still unlocks directly, flag or no flag', async () => {
    expect(await ownerToolsUnlocked('Verbal')).toBe(true);
    expect(await ownerToolsUnlocked('sasmooch jr')).toBe(true);
  });
});

describe('OTA-1490 — the seven-tap universal unlock', () => {
  it('⚠⚠ the ritual unlocks a device whose roster carries only ordinary names', async () => {
    // The owner's real topology: golem AND hal installed, three characters
    // across two accounts, per-install storage. An install with no
    // unlock-named character can never set the flag by name — the tap
    // ritual is how EVERY install becomes his.
    expect(await ownerToolsUnlocked('Mudline Karn')).toBe(false);
    await unlockOwnerTools();
    expect(await ownerToolsUnlocked('Mudline Karn')).toBe(true);
    expect(await ownerToolsUnlocked(null)).toBe(true);
  });

  it('⚠⚠ the About screen wires it: seven taps on the info block, then unlock', () => {
    // The counter guards the threshold and the unlock is called exactly at it.
    const handler = between(ABOUT, 'const handleOwnerTap = () => {', '};');
    expect(handler).toContain('if (next >= 7)');
    expect(handler).toContain('unlockOwnerTools()');
    expect(ABOUT).toContain('onPress={handleOwnerTap}');
    // And the ritual gives feedback: a countdown once it is clearly
    // deliberate, and a pointer to where the unlocked tool lives.
    expect(ABOUT).toMatch(/more taps to unlock owner tools/);
    expect(ABOUT).toMatch(/OWNER TOOLS UNLOCKED[^<]*SESSION/);
  });
});

describe('OTA-1490 — wired into the SEND LOG gate', () => {
  it('⚠⚠ the render gate is the device unlock, and the screen both NOTES and READS', () => {
    expect(ABOUT).toContain('{ownerTools && crashConfigured && (');
    // The note runs BEFORE the read, so the visit that introduces the owner
    // character is also the visit that unlocks — no second trip needed.
    const effect = between(ABOUT, 'void noteOwnerCharacterSeen(player?.name)', 'setOwnerTools(on)');
    expect(effect).toContain('ownerToolsUnlocked(player?.name)');
  });
});
