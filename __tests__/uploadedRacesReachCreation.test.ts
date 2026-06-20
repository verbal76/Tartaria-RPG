// engine_Dev — confirm an uploaded races/factions pack survives persist + a cold
// boot (hydrate) and reaches getRaces()/getFactions() — the data character
// creation renders from.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { useContentPackStore } from '../app/state/contentPackStore';
import { getRaces, getFactions } from '../app/engine/character';
import { clearAllOverrides } from '../app/engine/contentPack';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CUSTOM_RACES = [
  { id: 'sailor', name: 'Sailor', racialStatBonuses: { dexterity: 1 }, traits: [], flavor: 'A 1943 deckhand.' },
  { id: 'officer', name: 'Officer', racialStatBonuses: { charisma: 1 }, traits: [], flavor: 'Navy brass.' },
];
const CUSTOM_FACTIONS = [
  { id: 'navy', name: 'US Navy', flavor: 'The fleet.' },
  { id: 'ona', name: 'Office of Naval Research', flavor: 'The experiment.' },
];

describe('engine_Dev — uploaded races/factions reach character creation', () => {
  afterEach(async () => { useContentPackStore.getState().clearAll(); await AsyncStorage.clear(); });

  it('a store upload immediately changes getRaces()/getFactions()', () => {
    useContentPackStore.getState().loadTableJson('races', JSON.stringify(CUSTOM_RACES));
    useContentPackStore.getState().loadTableJson('factions', JSON.stringify(CUSTOM_FACTIONS));
    expect(getRaces().map((r) => r.id)).toEqual(['sailor', 'officer']);
    expect(getFactions().map((f) => f.id)).toEqual(['navy', 'ona']);
  });

  it('survives a cold boot: persisted override → hydrate() → getRaces()', async () => {
    // Persist a pack the way the store does, then wipe the in-memory registry to
    // simulate a fresh app process / OTA reload.
    await AsyncStorage.setItem(
      'tartaria.contentPack.v1',
      JSON.stringify({ tables: { races: CUSTOM_RACES, factions: CUSTOM_FACTIONS }, lore: {} }),
    );
    clearAllOverrides();
    expect(getRaces().some((r) => r.id === 'sailor')).toBe(false); // registry empty pre-hydrate

    await useContentPackStore.getState().hydrate();
    expect(getRaces().map((r) => r.id)).toEqual(['sailor', 'officer']);
    expect(getFactions().map((f) => f.id)).toEqual(['navy', 'ona']);
  });
});
