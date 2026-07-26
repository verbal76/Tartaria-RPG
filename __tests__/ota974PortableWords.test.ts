// OTA-974 — #119-completion: the missing names. The portability filter used
// raw substring matching, so 'mud' banned every Mud-* weapon/armor from
// ambient spawns and pickup, 'arch' banned "Architect's" gear, 'rain' matched
// "training". Word-boundary matching everywhere; the substance rule fires
// only on the noun's head word.
import { isOversized, refusalLine } from '../app/engine/portability';
import { pickTakeableGearForScene } from '../app/engine/takeableGearSpawns';

describe('OTA-974 — portability matches words, not letters', () => {
  it('substances stay unpocketable; items NAMED after them are portable again', () => {
    expect(isOversized('mud')).toBe(true);
    expect(isOversized('wet mud')).toBe(true);
    expect(isOversized("Mud Executioner's Blade")).toBe(false); // exact catalog weapon
    expect(isOversized('fog bank')).toBe(true); // substance as MODIFIER still counts
    expect(isOversized('ash drift')).toBe(true);
    expect(isOversized('training dummy')).toBe(false); // 'rain' inside a word
    expect(isOversized('ashen cloak')).toBe(false); // 'ash' inside a word
  });

  it('the genuinely huge stays huge', () => {
    expect(isOversized('boulder')).toBe(true);
    expect(isOversized('massive boulder')).toBe(true);
    expect(isOversized('titan skull')).toBe(true);
    expect(isOversized('wagon')).toBe(true);
    expect(isOversized('tower shield')).toBe(true); // word-boundary 'tower' still fires
    expect(typeof refusalLine('wagon')).toBe('string');
  });

  it('the Mud-* gear is back in the ambient spawn pool', () => {
    const union = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const n of pickTakeableGearForScene(`mudprobe@${i}`)) union.add(n);
    }
    expect([...union].some((n) => /^Mud[ -]/i.test(n))).toBe(true);
  });
});
