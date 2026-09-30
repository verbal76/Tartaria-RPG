// Phase 8 — qualification for buildGuardianApproachOptions() (owner ruling
// §5/§9/§11 letters K, L, M). Pure unit tests, no store, no gameplay, no
// NEW TARTARIAN triggered. This is the OPTION CONSTRUCTION half of the
// owner's "never merge those two concepts again" rule (§6) — decide()'s
// own reasoning is qualified separately in canonicalAttemptMemoryPolicy
// .test.ts.

import { buildGuardianApproachOptions, type GuardianApproachContext } from '../test-utils/canonical/guardianApproachOptions';

function baseCtx(over: Partial<GuardianApproachContext> = {}): GuardianApproachContext {
  return {
    atCapital: true,
    capitalId: 'asgardar',
    hubLocationId: 'dynasty_border_post',
    objectiveId: 'guardian:asgardar',
    equipUpgrade: null,
    hasHealingItem: true,
    vendorHealOffer: null,
    damagedEquippedItemName: null,
    ...over,
  };
}

describe('Phase 8 — buildGuardianApproachOptions qualification', () => {
  // K — SUMMON remains available whenever production permits it (i.e.
  // whenever the caller reports the Tartarian is actually at the capital).
  it('[K] offers summon when at the capital', () => {
    const options = buildGuardianApproachOptions(baseCtx({ atCapital: true }));
    expect(options.some((o) => o.id === 'summon')).toBe(true);
  });

  it('[K] never offers summon when not at the capital — never fabricated', () => {
    const options = buildGuardianApproachOptions(baseCtx({ atCapital: false }));
    expect(options.some((o) => o.id === 'summon')).toBe(false);
    expect(options.some((o) => o.id === 'return-to-capital')).toBe(true);
  });

  // L — legitimate non-summon alternatives ARE constructed after a
  // withdrawal, when the underlying facts genuinely support them.
  it('[L] offers equip-upgrade only when a real upgrade is reported', () => {
    expect(buildGuardianApproachOptions(baseCtx()).some((o) => o.id === 'equip-upgrade')).toBe(false);
    const withUpgrade = buildGuardianApproachOptions(baseCtx({ equipUpgrade: { name: 'Better Blade', rank: 2, fromRank: 1 } }));
    expect(withUpgrade.some((o) => o.id === 'equip-upgrade')).toBe(true);
  });

  it('[L] offers retreat-to-hub only when at a capital that is not itself the hub', () => {
    expect(buildGuardianApproachOptions(baseCtx({ atCapital: true, capitalId: 'asgardar', hubLocationId: 'dynasty_border_post' })).some((o) => o.id === 'retreat-to-hub')).toBe(true);
    expect(buildGuardianApproachOptions(baseCtx({ atCapital: false })).some((o) => o.id === 'retreat-to-hub')).toBe(false);
    expect(buildGuardianApproachOptions(baseCtx({ atCapital: true, capitalId: 'dynasty_border_post', hubLocationId: 'dynasty_border_post' })).some((o) => o.id === 'retreat-to-hub')).toBe(false);
  });

  it('[L] offers buy-healing only when a vendor genuinely stocks a heal offer and none is already held', () => {
    expect(buildGuardianApproachOptions(baseCtx({ vendorHealOffer: null })).some((o) => o.id === 'buy-healing')).toBe(false);
    expect(buildGuardianApproachOptions(baseCtx({ vendorHealOffer: { itemName: 'Trail Rations', price: 5 }, hasHealingItem: true })).some((o) => o.id === 'buy-healing')).toBe(false);
    expect(buildGuardianApproachOptions(baseCtx({ vendorHealOffer: { itemName: 'Trail Rations', price: 5 }, hasHealingItem: false })).some((o) => o.id === 'buy-healing')).toBe(true);
  });

  it('[L] offers repair-gear only when a damaged equipped item is reported', () => {
    expect(buildGuardianApproachOptions(baseCtx({ damagedEquippedItemName: null })).some((o) => o.id === 'repair-gear')).toBe(false);
    expect(buildGuardianApproachOptions(baseCtx({ damagedEquippedItemName: 'Mud-Warden\'s Vest' })).some((o) => o.id === 'repair-gear')).toBe(true);
  });

  // M — never fabricates an option beyond what the context reported.
  it('[M] with every optional fact false/null, only summon and retreat-to-hub are offered — nothing invented', () => {
    const options = buildGuardianApproachOptions(baseCtx());
    const ids = options.map((o) => o.id).sort();
    expect(ids).toEqual(['retreat-to-hub', 'summon']);
  });

  it('[M] with no real alternative reachable at all (already at the hub, no upgrade, no vendor), only summon remains', () => {
    const options = buildGuardianApproachOptions(baseCtx({ capitalId: 'dynasty_border_post', hubLocationId: 'dynasty_border_post' }));
    expect(options.map((o) => o.id)).toEqual(['summon']);
  });
});
