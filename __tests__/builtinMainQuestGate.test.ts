// engine_Dev — the legacy built-in (Tartaria) main quest + Core Guardians are
// disabled whenever a DATA-DRIVEN main quest exists (an upload, or the generic-
// default pack). At runtime a quest is always present, so the built-in phase
// machine / guardian spawns never run in a real game. This locks the gate.

import {
  hasAnyMainQuest,
  setCustomMainQuestOverride,
  installGenericDefaults,
  clearGenericDefaults,
  clearAllOverrides,
} from '../app/engine/contentPack';
import { GENERIC_GAME } from '../app/engine/genericGame';

afterEach(() => { clearAllOverrides(); clearGenericDefaults(); });

describe('engine_Dev — built-in main quest gate (hasAnyMainQuest)', () => {
  it('is FALSE with nothing loaded (the unit-test fixture state) → built-in still runs in tests', () => {
    expect(hasAnyMainQuest()).toBe(false);
  });

  it('is TRUE once an author uploads a main quest → built-in disabled', () => {
    setCustomMainQuestOverride({ title: 'X', steps: [{ id: 's1', action: 'reach', locationId: 'home' }] } as never);
    expect(hasAnyMainQuest()).toBe(true);
  });

  it('is TRUE once the generic-default pack is installed → built-in disabled at runtime', () => {
    expect(GENERIC_GAME.mainQuest).toBeTruthy(); // the generic pack ships a quest
    installGenericDefaults(GENERIC_GAME);
    expect(hasAnyMainQuest()).toBe(true);
  });

  it('returns to FALSE when both are cleared', () => {
    setCustomMainQuestOverride({ title: 'X', steps: [{ id: 's1', action: 'reach', locationId: 'home' }] } as never);
    installGenericDefaults(GENERIC_GAME);
    expect(hasAnyMainQuest()).toBe(true);
    clearAllOverrides();
    clearGenericDefaults();
    expect(hasAnyMainQuest()).toBe(false);
  });
});
