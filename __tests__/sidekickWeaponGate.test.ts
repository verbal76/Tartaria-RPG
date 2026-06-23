// engine_Dev — the SIDEKICK-WEAPON gate. A single author-set threshold (0..100)
// blocks crafting any sidekick weapon (golem_weapon recipes) until the player is at
// least that % through the data-driven main mission. Covers the progress-percent
// helper + the clamped contentPack scalar. (The craft-handler wiring that consumes
// these is typechecked; this pins the math + the gate value.)

import { mainQuestProgressPercent } from '../app/engine/customMainQuestEngine';
import {
  setCustomMainQuestOverride,
  clearAllOverrides,
  setSidekickWeaponQuestPct,
  getSidekickWeaponQuestPct,
} from '../app/engine/contentPack';
import type { PlayerCharacter } from '../app/engine/types';

const player = (step: number): PlayerCharacter => ({ customQuestStep: step, factionId: 'none' } as unknown as PlayerCharacter);

const FOUR_STEP = {
  title: 'X',
  steps: [
    { id: '1', action: 'reach', locationId: 'a' },
    { id: '2', action: 'reach', locationId: 'b' },
    { id: '3', action: 'reach', locationId: 'c' },
    { id: '4', action: 'reach', locationId: 'd' },
  ],
} as never;

describe('engine_Dev — sidekick-weapon main-mission % gate', () => {
  afterEach(() => clearAllOverrides());

  it('mainQuestProgressPercent = effective step / total steps', () => {
    setCustomMainQuestOverride(FOUR_STEP);
    expect(mainQuestProgressPercent(player(0))).toBe(0);
    expect(mainQuestProgressPercent(player(1))).toBe(25);
    expect(mainQuestProgressPercent(player(2))).toBe(50);
    expect(mainQuestProgressPercent(player(3))).toBe(75);
    expect(mainQuestProgressPercent(player(4))).toBe(100);
  });

  it('returns 100 with NO main quest loaded — the gate never blocks a quest-less game', () => {
    expect(mainQuestProgressPercent(player(0))).toBe(100);
  });

  it('the gate scalar clamps to 0..100 and round-trips', () => {
    setSidekickWeaponQuestPct(150);
    expect(getSidekickWeaponQuestPct()).toBe(100);
    setSidekickWeaponQuestPct(-5);
    expect(getSidekickWeaponQuestPct()).toBe(0);
    setSidekickWeaponQuestPct(42.6);
    expect(getSidekickWeaponQuestPct()).toBe(43);
  });

  it('clearAllOverrides resets the gate to 0 (no gate)', () => {
    setSidekickWeaponQuestPct(60);
    clearAllOverrides();
    expect(getSidekickWeaponQuestPct()).toBe(0);
  });
});
