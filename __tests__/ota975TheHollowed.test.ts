jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// OTA-975 — THE HOLLOWED: the install's fallen characters return as one-time
// Aetherkin-revenant boss events. Violent where the other Aetherkin are
// afraid; wear the kit they died in (captured at death going forward, seeded
// for pre-998 records); standard loot rolls draw from that kit; the kill is
// exempt from the Aetherkin reverence penalty; the memorial marks them put to
// rest, install-wide.
import {
  revenantFromFallen, revenantGearNames, revenantDefeatLines, revenantIntroBeats,
  isRevenant, revenantName,
} from '../app/engine/fallenRevenants';
import { isAetherkin } from '../app/engine/aetherkin';
import { recordFallen, loadFallen, markFallenAvenged, type FallenHero } from '../app/engine/saveSystem';

const FH: FallenHero = {
  name: 'Verbal', raceName: 'Tartarian Giant',
  epitaph: 'They died as they lived — mid-swing.',
  locationName: 'the Sentinel Ward', kills: 120, corruption: 'Untouched', hours: 40, ts: 1234,
};

describe('OTA-975 — the Hollowed', () => {
  it('builds a boss-band revenant that is NOT an Aetherkin for the penalty system', () => {
    const foe = revenantFromFallen(FH, 133);
    expect(foe.name).toBe('Hollowed Verbal');
    expect(foe.boss).toBe(true);
    expect(foe.rarity).toBe('Legendary');
    expect(foe.hp).toBeGreaterThanOrEqual(60);
    expect(foe.hp).toBeLessThanOrEqual(Math.round(133 * 2.5));
    expect(isRevenant(foe)).toBe(true);
    expect(isAetherkin(foe)).toBe(false); // EXEMPTION LOCK — the kill must never cost reverence standing
    expect(foe.loot.length).toBeGreaterThan(0); // the died-in kit feeds the drop rolls
  });

  it('pre-998 records get a stable seeded kit; recorded gear passes through', () => {
    const a = revenantGearNames({ ...FH, gearNames: undefined });
    const b = revenantGearNames({ ...FH, gearNames: undefined });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(revenantGearNames({ ...FH, gearNames: ['Storm-Tempered Maul'] })[0]).toBe('Storm-Tempered Maul');
  });

  it('the sentimental close names them, rests them, and credits the avenger', () => {
    const lines = revenantDefeatLines(FH, 'Wren');
    expect(lines.world).toContain('Verbal');
    expect(lines.world).toContain('rest');
    expect(lines.reward).toContain('put to rest by Wren');
    const beats = revenantIntroBeats(FH, true);
    expect(beats.identification).toContain('It wears your face');
    expect(revenantName(FH)).toBe('Hollowed Verbal');
  });

  it('the memorial marks them avenged, install-wide', async () => {
    await recordFallen(FH);
    await markFallenAvenged(1234, 'Wren');
    const roll = await loadFallen();
    const mine = roll.find((f) => f.ts === 1234);
    expect(mine?.avengedBy).toBe('Wren');
    expect(mine?.avengedTs).toBeGreaterThan(0);
  });
});
