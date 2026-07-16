// OTA-845 ["losing is fun" — The Fallen] — a character's death is never a clean wipe:
// they're appended to an install-wide, cross-character roll of the Fallen (in the global
// stash), readable in the Lore Codex between runs. These lock the persistence contract.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordFallen, loadFallen, type FallenHero } from '../app/engine/saveSystem';

const hero = (name: string, over: Partial<FallenHero> = {}): FallenHero => ({
  name, raceName: 'Reclaimer', epitaph: `${name} does not rise.`, locationName: 'the Mud Flats',
  kills: 3, corruption: 'Tainted', hours: 40, ts: 1000, ...over,
});

beforeEach(async () => { await AsyncStorage.clear(); });

describe('OTA-845 — The Fallen roll', () => {
  it('starts empty', async () => {
    expect(await loadFallen()).toEqual([]);
  });

  it('records a fallen character and reads it back', async () => {
    await recordFallen(hero('Vale'));
    const roll = await loadFallen();
    expect(roll).toHaveLength(1);
    expect(roll[0].name).toBe('Vale');
    expect(roll[0].epitaph).toContain('Vale does not rise');
  });

  it('accumulates across deaths (oldest first in storage)', async () => {
    await recordFallen(hero('Vale'));
    await recordFallen(hero('Sasha'));
    const roll = await loadFallen();
    expect(roll.map((h) => h.name)).toEqual(['Vale', 'Sasha']);
  });

  it('persists all the memorial fields', async () => {
    await recordFallen(hero('Grim', { kills: 12, corruption: 'Hollowed', hours: 99, locationName: 'Nimari' }));
    const [h] = await loadFallen();
    expect(h).toMatchObject({ name: 'Grim', kills: 12, corruption: 'Hollowed', hours: 99, locationName: 'Nimari' });
  });

  it('caps the roll (never grows without bound)', async () => {
    for (let i = 0; i < 30; i++) await recordFallen(hero(`Hero${i}`, { ts: i }));
    const roll = await loadFallen();
    expect(roll.length).toBeLessThanOrEqual(25);
    // the newest survive; the oldest are pruned
    expect(roll[roll.length - 1].name).toBe('Hero29');
    expect(roll.some((h) => h.name === 'Hero0')).toBe(false);
  });

  it('recordFallen returns the current roll size', async () => {
    expect(await recordFallen(hero('A'))).toBe(1);
    expect(await recordFallen(hero('B'))).toBe(2);
  });
});
