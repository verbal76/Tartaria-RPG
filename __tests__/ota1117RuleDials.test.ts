// OTA-1117 — THE RULE DIALS, AND ONE THAT WAS A CONTROL OVER NOTHING.
//
// OTA-1113 defined nine dials; OTA-1116 wired the content one. This closes the
// set. The survey rates rule changes above multipliers because they cost
// nothing to compute and change how a fight is PLAYED rather than how long it
// takes — and both of these are exactly that.
//
//   witholdIntel   — the WIS-granted free read of a foe's resists and
//                    weaknesses is switched off. What you know is what this
//                    character has personally felt land or wash off.
//   witholdIdentity — the Qwen synthesis that writes a curio's description and
//                    effect does not run. The static row still functions; the
//                    free enrichment on top does not arrive.
//
// ⚠ AND `hunger` IS REMOVED. It was written as "hunger clock rate … exactly as
// shipped", which was already false: hunger had been deleted from the game
// before the dial existed. Both accrual sites are hardcoded to 0 and
// effectiveStaminaMax ignores the penalty outright. A switch the player can
// check that cannot change a single number is worse than a missing one,
// because they believe it.

import fs from 'fs';
import path from 'path';
import {
  PRESSURE_PROFILES, DEFAULT_PRESSURE, PRESET_TIERS, DIFFICULTY_SYSTEMS, profileOf,
} from '../app/engine/pressure';

const src = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('OTA-1117 — the two rule dials still obey the identity row', () => {
  it('⚠ both are OFF at the default tier — a standard run is untouched', () => {
    const owed = PRESSURE_PROFILES[DEFAULT_PRESSURE];
    expect(owed.witholdIdentity).toBe(false);
    expect(owed.witholdIntel).toBe(false);
  });

  it('...and off at salvage too — an easier run never hides MORE', () => {
    expect(PRESSURE_PROFILES.salvage.witholdIdentity).toBe(false);
    expect(PRESSURE_PROFILES.salvage.witholdIntel).toBe(false);
  });

  it('they switch on in order: identity at let_it_come, both at bury_me', () => {
    expect(PRESSURE_PROFILES.let_it_come.witholdIdentity).toBe(true);
    expect(PRESSURE_PROFILES.let_it_come.witholdIntel).toBe(false);
    expect(PRESSURE_PROFILES.bury_me.witholdIdentity).toBe(true);
    expect(PRESSURE_PROFILES.bury_me.witholdIntel).toBe(true);
  });

  it('a rule dial never un-sets as the tiers get harder', () => {
    let seenIdentity = false;
    let seenIntel = false;
    for (const t of PRESET_TIERS) {
      const p = PRESSURE_PROFILES[t];
      if (seenIdentity) expect(p.witholdIdentity).toBe(true);
      if (seenIntel) expect(p.witholdIntel).toBe(true);
      seenIdentity = seenIdentity || p.witholdIdentity;
      seenIntel = seenIntel || p.witholdIntel;
    }
  });

  it('a CUSTOM run that checks neither gets neither', () => {
    const p = profileOf({
      pressure: 'custom',
      pressureCustom: { intensity: 'bury_me', systems: ['spawn'] },
    } as never);
    expect(p.witholdIdentity).toBe(false);
    expect(p.witholdIntel).toBe(false);
    expect(p.spawn).toBe(PRESSURE_PROFILES.bury_me.spawn);
  });

  it('a CUSTOM run that checks them gets exactly them', () => {
    const p = profileOf({
      pressure: 'custom',
      pressureCustom: { intensity: 'bury_me', systems: ['identity', 'intel'] },
    } as never);
    expect(p.witholdIdentity).toBe(true);
    expect(p.witholdIntel).toBe(true);
    // ...and nothing else moved.
    expect(p.spawn).toBe(1);
    expect(p.loot).toBe(1);
  });
});

describe('OTA-1117 — witholdIntel takes the FREE read, never the earned one', () => {
  const panel = src('app/components/EnemyPanel.tsx');

  it('the dial reaches the panel as a prop', () => {
    expect(panel).toContain('witholdIntel?: boolean;');
  });

  it('⚠ it gates the WIS read, and only the WIS read', () => {
    expect(panel).toContain('const canReadDefenses = !witholdIntel && (playerWisdom ?? 0) >= WEAKNESS_READ_WIS;');
  });

  it('⚠ strike-to-learn survives — the `observed` path is untouched', () => {
    // Taking BOTH would be blindness, not difficulty: the earned tags are the
    // replacement for the free read, not a second thing to remove.
    expect(panel).toContain('observed && (observed.weak.length > 0 || observed.resist.length > 0)');
    expect(panel).not.toContain('witholdIntel && observed');
  });

  it('⚠ a BOSS still shows its defenses — that reveal was an owner request, twice', () => {
    // "Core Guardians show no weakness/resistance in combat" was reported twice
    // and fixed on purpose. A difficulty dial does not get to re-break it.
    expect(panel).toContain('view.enemy.boss || canRead');
    expect(panel).toContain('e.boss || canRead');
  });

  it('the screen passes the live profile rather than a hardcoded false', () => {
    const screen = src('app/screens/ExplorationScreen.tsx');
    expect(screen).toContain('witholdIntel={player ? profileOf(player).witholdIntel : false}');
    expect(screen).toContain("import { profileOf } from '../engine/pressure';");
  });
});

describe('OTA-1117 — witholdIdentity stops the free enrichment, not the item', () => {
  const store = src('app/state/gameStore.ts');

  it('the synthesis requester checks the dial', () => {
    expect(store).toContain('if (profileOf(get().player).witholdIdentity) return;');
  });

  it('⚠ it reads LIVE state — a mid-run tier change must take effect', () => {
    // The requester is installed once at boot and lives for the session, so a
    // profile captured at install time would freeze whatever tier the first
    // character had. `get().player` is the whole point.
    expect(store).toContain('profileOf(get().player)');
  });

  it('⚠ the gate sits on the SYNTHESIS, not on the static inference', () => {
    // Gating the static row would not withhold identity — it would hand the
    // player a broken item. The comment has to say so, because the next person
    // to read this will be tempted to push the gate deeper.
    expect(store).toContain('WHY THE GATE IS HERE AND NOT DEEPER');
    expect(store).toContain('it would hand the player a broken');
  });

  it('it fails closed the same way a dropped request already did', () => {
    expect(store).toContain('Fail-closed');
  });
});

describe('OTA-1117 — ⚠ the hunger dial is gone, and the file says why', () => {
  const pressure = src('app/engine/pressure.ts');

  it('the field no longer exists on the profile', () => {
    expect(pressure).not.toContain('hunger: number;');
    for (const t of PRESET_TIERS) {
      expect(PRESSURE_PROFILES[t]).not.toHaveProperty('hunger');
    }
  });

  it('it is no longer checkable in the CUSTOM picker', () => {
    expect(DIFFICULTY_SYSTEMS.some((d) => d.id === ('hunger' as never))).toBe(false);
  });

  it('the removal records that hunger was already deleted from the game', () => {
    expect(pressure).toContain('THE `hunger` DIAL IS GONE, AND THIS IS WHY');
    expect(pressure).toContain('Hunger had ALREADY been removed from the game');
  });

  it('⚠ and records the rule: do not revive a mechanic to justify a config field', () => {
    // Narrowed to fragments that sit on ONE line — the prose wraps, and an
    // assertion that spans a line break breaks on reflow rather than on meaning.
    expect(pressure).toContain('is worse than a missing one');
    expect(pressure).toContain('reversing a shipped');
  });

  it('the claim is verifiable in the store — hunger genuinely accrues nothing', () => {
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('const newHunger = 0;');
    expect(store).toContain('HUNGER REMOVED');
  });
});

describe('OTA-1117 — every remaining dial has a consumer', () => {
  it('⚠ the picker offers nothing that cannot change a number', () => {
    // The whole lesson of the hunger dial in one assertion: a system is only
    // listed if something reads it. If a future dial is added to the picker
    // before it is wired, this is what should catch it.
    const wired: Record<string, string> = {
      spawn: 'app/state/gameStore.ts',
      pack: 'app/state/gameStore.ts',
      elite: 'app/state/gameStore.ts',
      discovery: 'app/state/gameStore.ts',
      loot: 'app/state/gameStore.ts',
      identity: 'app/state/gameStore.ts',
      intel: 'app/components/EnemyPanel.tsx',
      tide: 'app/state/gameStore.ts',
      hostile: 'app/state/gameStore.ts',
      creep: 'app/state/gameStore.ts',
      exposure: 'app/state/gameStore.ts',
      prices: 'app/engine/vendorPricing.ts',
    };
    for (const sys of DIFFICULTY_SYSTEMS) {
      expect(Object.keys(wired)).toContain(sys.id);
    }
  });

  it('the three lever types are all still represented', () => {
    const kinds = new Set(DIFFICULTY_SYSTEMS.map((d) => d.kind));
    expect(kinds.has('multiplier')).toBe(true);
    expect(kinds.has('rule')).toBe(true);
    expect(kinds.has('content')).toBe(true);
  });
});
