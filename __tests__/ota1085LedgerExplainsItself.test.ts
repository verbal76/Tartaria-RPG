jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1085 — THE LEDGER EXPLAINS ITSELF.
 *
 * Two owner reports off the same Character screen:
 *
 * (1) "under arbiter it says '1 answer he was standing there for -5'...
 *     I have no idea what I got a -5 for." The aggregate fork-regard row
 *     named nothing. Each judged answer is now its OWN row carrying the
 *     words the player actually chose.
 *
 * (2) "you have that I killed the litany brother Conrad twice — once that
 *     I cut him down and then again that I defeated him." Core Guardians
 *     are Legendary, so the generic rare-kill writer AND the guardian
 *     milestone writer both recorded the same corpse. The guardian's
 *     dedicated record wins; the generic writer now skips guardians.
 */
import { regardParts, regardScore } from '../app/engine/arbiterPersona';
import personaData from '../app/data/lore/arbiter-persona.json';
import { optionById } from '../app/engine/storyForks';
import type { PlayerCharacter, WorldMemory } from '../app/engine/types';
import fs from 'fs';
import path from 'path';
import { placedAt } from '../test-utils/placePlayer';

function pc(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
    hp: 30, hpMax: 30, stamina: 10, staminaMax: 10, ac: 10, tc: 0, corruption: 0,
    inventory: [], factionStanding: [], ...placedAt('x'), activeQuests: [],
    ...over,
  } as PlayerCharacter;
}
const wm = (): WorldMemory => ({ npcRelations: {} } as unknown as WorldMemory);

describe('OTA-1085 — every judged answer is its own named row', () => {
  it("the owner's mystery row now names the deed (sell_them, -5)", () => {
    const parts = regardParts(pc({ storyChoices: { missing_letters: 'sell_them' } } as never), wm());
    const rows = parts.filter((x) => /^your answer:/.test(x.label));
    expect(rows).toHaveLength(1);
    // ⚠ OTA-1716 — was a whole-object deep equality, which broke the moment the
    // row grew a `detail`. What this test is about is the LABEL and the VALUE:
    // one row per judged answer, named with the words the player chose. The row
    // now also opens into the question he was asked, which is the same argument
    // this OTA made one level down — see ota1716.
    expect({ label: rows[0]!.label, value: rows[0]!.value })
      .toEqual({ label: 'your answer: Sell the bundle to a Tomekeeper', value: -5 });
    expect(rows[0]!.detail!.join('\n')).toContain('What do you do with the fifth letter?');
  });

  it('an answer he does not judge (delta 0) adds no row', () => {
    const parts = regardParts(pc({ storyChoices: { missing_letters: 'burn_them' } } as never), wm());
    expect(parts.filter((x) => /^your answer:/.test(x.label))).toEqual([]);
  });

  it('two judged answers are two rows, and the score is their plain sum', () => {
    const choices = { missing_letters: 'sell_them', exile_warrant: 'take_it_by_force' }; // -5 and -5
    const p = pc({ storyChoices: choices } as never);
    const rows = regardParts(p, wm()).filter((x) => /^your answer:/.test(x.label));
    expect(rows.map((r) => r.value)).toEqual([-5, -5]);
    expect(regardScore(p, wm())).toBe(-10);
  });

  it('AUTHORING LOCK — every judged fork key resolves to authored words (no fallback label)', () => {
    // If a forkRegard key ever drifts from forks.json, the sheet would fall
    // back to the old illegible label. Catch it at authoring time.
    for (const [key, v] of Object.entries(personaData.forkRegard)) {
      if ((v as number) === 0) continue;
      const [f, o] = key.split(':') as [string, string];
      expect({ key, label: optionById(f, o)?.label ?? null }).toEqual({ key, label: expect.stringMatching(/\w/) });
    }
  });
});

describe('OTA-1085 — SOURCE LOCKS: one corpse, one ledger line', () => {
  const store = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('the generic rare-kill writer skips Core Guardians', () => {
    expect(store).toMatch(/&& !cgKill\.isCoreGuardian\(enemy\)\) \{\s*\n\s*recordMemorableEvent\(get, set, \{\s*\n\s*kind: 'rare_kill'/);
  });

  it("the guardian's dedicated milestone record still stands", () => {
    expect(store).toMatch(/kind: 'mq_guardian_defeated'/);
    expect(store).toMatch(/text: `defeated \$\{enemy\.name\} at \$\{def\.capitalName\}`/);
  });
});
