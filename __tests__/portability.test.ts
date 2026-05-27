import { isOversized, refusalLine, __TEST_ONLY__ } from '../app/engine/portability';

describe('portability gate', () => {
  it('flags vehicles as oversized', () => {
    expect(isOversized('wagon')).toBe(true);
    expect(isOversized('buried wagon')).toBe(true);
    expect(isOversized('mud cart')).toBe(true);
    expect(isOversized('rusted sled')).toBe(true);
    expect(isOversized('abandoned skiff')).toBe(true);
  });

  it('flags architecture as oversized', () => {
    expect(isOversized('pillar')).toBe(true);
    expect(isOversized('cracked obelisk')).toBe(true);
    expect(isOversized('archway')).toBe(true);
    expect(isOversized('stone throne')).toBe(true);
    expect(isOversized('portcullis')).toBe(true);
    expect(isOversized('baptismal font')).toBe(true);
  });

  it('flags furniture & fixed implements as oversized', () => {
    expect(isOversized('dining chair')).toBe(true);
    expect(isOversized('burnt anvil')).toBe(true);
    expect(isOversized('rocking chair')).toBe(true);
    expect(isOversized('observation chair')).toBe(true);
  });

  it('flags industrial machinery as oversized', () => {
    expect(isOversized('engine')).toBe(true);
    expect(isOversized('control panel reactor')).toBe(true);
    expect(isOversized('pump housing')).toBe(true);
    expect(isOversized('cooling vat')).toBe(true);
  });

  it('flags full-body sentinels/automatons as oversized', () => {
    expect(isOversized('sentinel')).toBe(true);
    expect(isOversized('clockwork knight')).toBe(true);
    expect(isOversized('mud golem')).toBe(true);
    expect(isOversized('fallen sentinel')).toBe(true);
  });

  it('flags geological mass as oversized', () => {
    expect(isOversized('boulder')).toBe(true);
    expect(isOversized('rubble pile')).toBe(true);
    expect(isOversized('petrified mud')).toBe(true);
    expect(isOversized('aetherstone rubble')).toBe(true);
  });

  it('flags bodies as oversized', () => {
    expect(isOversized('skeleton')).toBe(true);
    expect(isOversized('frozen corpse')).toBe(true);
    expect(isOversized('titan skull')).toBe(true);
    expect(isOversized('whale bone')).toBe(true);
  });

  it('flags terrain / atmospherics as oversized', () => {
    expect(isOversized('water')).toBe(true);
    expect(isOversized('mud')).toBe(true);
    expect(isOversized('silt')).toBe(true);
    expect(isOversized('fog bank')).toBe(true);
    expect(isOversized('ash drift')).toBe(true);
    expect(isOversized('rift')).toBe(true);
  });

  it('does NOT flag actually-portable items', () => {
    expect(isOversized('rusted blade')).toBe(false);
    expect(isOversized('rope')).toBe(false);
    expect(isOversized('lantern')).toBe(false);
    expect(isOversized('compass')).toBe(false);
    expect(isOversized('aether crystal')).toBe(false);
    expect(isOversized('first aid kit')).toBe(false);
    expect(isOversized('trail rations')).toBe(false);
    expect(isOversized('throwing knife')).toBe(false);
    expect(isOversized('aetheric locket')).toBe(false);
    expect(isOversized('coin pouch')).toBe(false);
    expect(isOversized('bone tool')).toBe(false);
  });

  it('refusal line substitutes the target', () => {
    const r = refusalLine('wagon');
    expect(r.toLowerCase()).toContain('wagon');
  });

  it('refusal lines exist for every rule', () => {
    for (const rule of __TEST_ONLY__.RULES) {
      expect(rule.refusals.length).toBeGreaterThan(0);
    }
  });

  it('returns fallback line for unmatched nouns', () => {
    // refusalLine on a noun NOT in any rule returns generic fallback
    const r = refusalLine('definitely-not-a-real-noun');
    expect(r).toContain("can't carry");
  });
});
