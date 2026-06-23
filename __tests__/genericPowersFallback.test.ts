// engine_Dev — a reskin that skips the Powers box gets the GENERIC disciplines
// (Stone Shaping / Construct Summoning / Mending), NOT Tartaria's Aetherstone/
// Aether-golem set. The energy NAME is renamed via the dev panel separately; this
// covers the discipline CONTENT the magic-tab cards render.

import { getPowers, GENERIC_POWERS } from '../app/engine/powers';
import {
  installGenericDefaults,
  clearGenericDefaults,
  setTableOverride,
  clearAllOverrides,
} from '../app/engine/contentPack';
import { GENERIC_GAME } from '../app/engine/genericGame';

afterEach(() => {
  clearAllOverrides();
  clearGenericDefaults();
});

describe('engine_Dev — generic powers fallback', () => {
  it('with no generic pack + no upload, falls to the built-in (test fixture)', () => {
    // unit tests never install the generic pack → built-in DEFAULT_POWERS
    expect(getPowers().length).toBe(3);
  });

  it('the generic-default pack resolves the magic disciplines to GENERIC_POWERS', () => {
    installGenericDefaults(GENERIC_GAME);
    const names = getPowers().map((p) => p.name);
    expect(names).toEqual(GENERIC_POWERS.map((p) => p.name));
    expect(names).toContain('Construct Summoning');
    // no Tartaria discipline names bleed through
    expect(names.some((n) => /aether/i.test(n))).toBe(false);
    // the summon discipline survives so the magic-tab summon card still renders
    expect(getPowers().some((p) => p.discipline === 'summon' && p.showGolemVariants)).toBe(true);
  });

  it('an uploaded powers table still wins over the generic pack', () => {
    installGenericDefaults(GENERIC_GAME);
    setTableOverride('powers', [
      { id: 'vril_call', discipline: 'summon', name: 'Vril Call', title: 'Vril Call', body: 'x', stat: 'intelligence', dcBase: 15, fuels: ['Coil'], examples: ['call the vril'], showGolemVariants: true },
    ]);
    expect(getPowers().map((p) => p.name)).toEqual(['Vril Call']);
  });
});
