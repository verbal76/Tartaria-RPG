// engine_Dev — the built-in whisper chain (the bespoke Tartaria "Yulka" quest)
// is extracted to app/data/whispers/builtin-whispers.json, and a reskin that
// skips the WHISPERS box falls to a GENERIC one-hop whisper, not Yulka. An
// uploaded whispers table still wins.

import { getWhispers, CHAINS, makeStolenDiscs } from '../app/engine/whispers';
import {
  installGenericDefaults,
  clearGenericDefaults,
  setWhispersOverride,
  clearAllOverrides,
} from '../app/engine/contentPack';
import { GENERIC_GAME } from '../app/engine/genericGame';

afterEach(() => {
  clearAllOverrides();
  clearGenericDefaults();
});

describe('engine_Dev — whisper extraction + generic fallback', () => {
  it('the built-in chain loads from JSON (test fixture = the yulka chain)', () => {
    expect(CHAINS.map((c) => c.id)).toEqual(['yulka_discs']);
    expect(CHAINS[0]!.fetchItemName).toBe('Stolen Aetheric Discs');
    expect(getWhispers().map((c) => c.id)).toEqual(['yulka_discs']); // no override/pack
  });

  it('the generic-default pack drives a GENERIC whisper, not Yulka', () => {
    installGenericDefaults(GENERIC_GAME);
    const live = getWhispers();
    expect(live.map((c) => c.id)).toEqual(['roadside_cache']);
    expect(live.some((c) => /yulka/i.test(c.id))).toBe(false);
    // it's a one-hop generic chain (meetLine/meetEffects), no bespoke logic needed
    expect(live[0]!.meetLine).toBeTruthy();
    expect(Array.isArray(live[0]!.meetEffects)).toBe(true);
  });

  it('an uploaded whispers table still wins over the generic pack', () => {
    installGenericDefaults(GENERIC_GAME);
    setWhispersOverride([
      { id: 'pier_rumor', title: 'A Rumor on the Pier', plantLocations: ['dock'], plantChance: 0.2, plantLines: ['x'], targetOffset: { dxRange: [1, 1], dyRange: [0, 0] }, meetLine: 'y', meetEffects: [{ type: 'grant_tc', amount: 10 }] },
    ]);
    expect(getWhispers().map((c) => c.id)).toEqual(['pier_rumor']);
  });

  it('makeStolenDiscs mints the quest item under the name it is given (parameterized)', () => {
    expect(makeStolenDiscs(3, 'Stolen Aetheric Discs').name).toBe('Stolen Aetheric Discs');
    expect(makeStolenDiscs(3, 'Recovered Crate').name).toBe('Recovered Crate');
    expect(makeStolenDiscs(3).name).toBe('Recovered Goods'); // generic default
  });
});
