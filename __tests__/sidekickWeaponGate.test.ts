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
  DEFAULT_SIDEKICK_WEAPON_QUEST_PCT,
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

  it('the default gate is 40% (from app/data/sidekick-weapons.json), reset restores it', () => {
    // OTA-1011 — the built-in default is now a 40%-of-main-quest gate, sourced from
    // the tunable JSON (not a code literal). An author can still override to 0 (no
    // gate) or any 1..100; clearAllOverrides falls back to the JSON default.
    expect(DEFAULT_SIDEKICK_WEAPON_QUEST_PCT).toBe(40);
    setSidekickWeaponQuestPct(60);
    clearAllOverrides();
    expect(getSidekickWeaponQuestPct()).toBe(DEFAULT_SIDEKICK_WEAPON_QUEST_PCT);
    // 0 is a valid author choice (no gate) and is NOT overwritten by the default.
    setSidekickWeaponQuestPct(0);
    expect(getSidekickWeaponQuestPct()).toBe(0);
  });

  // OTA-1010 — the "you can now forge your sidekick's armaments" beat fires the
  // first time progress REACHES the gate %. This pins the exact boundary the
  // store's maybeAnnounceSidekickForge uses (progress >= gatePct, and never when
  // the gate is 0). The one-shot latch + prose are wired in the store (typechecked).
  it('unlock condition: progress must REACH the gate %, and gate 0 never fires', () => {
    setCustomMainQuestOverride(FOUR_STEP);
    setSidekickWeaponQuestPct(50);
    const gate = getSidekickWeaponQuestPct();
    const unlocked = (step: number) => gate > 0 && mainQuestProgressPercent(player(step)) >= gate;
    expect(unlocked(1)).toBe(false); // 25% — still sealed
    expect(unlocked(2)).toBe(true);  // 50% — the forge opens
    expect(unlocked(3)).toBe(true);  // past it — stays open
    // gate 0 (default / no author threshold) never gates and never announces.
    setSidekickWeaponQuestPct(0);
    const g0 = getSidekickWeaponQuestPct();
    expect(g0 > 0 && mainQuestProgressPercent(player(4)) >= g0).toBe(false);
  });
});
