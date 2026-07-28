// arb-fix — regression coverage for two playtest-log fixes:
//   1. parser respects an explicit trailing ordinal ("raider 3") when resolving
//      numbered enemies, instead of first-token-wins ("raider 3" → raider 2).
//   2. buildTraderEnemy carries the vendor's faction onto the enemy, so killing
//      a faction merchant actually shifts standing (the kill→standing path is
//      gated on enemy.factionId, which trader enemies previously never set).

import { parseInput } from '../app/engine/parser';
import { buildTraderEnemy } from '../app/engine/vendors';

describe('arb-fix — numbered-enemy target resolution respects the ordinal', () => {
  const enemyNames = [
    'Conspiracy Architects Raider 2',
    'Conspiracy Architects Raider 3',
  ];

  it('"approach raider 3" resolves to Raider 3, not the first alive raider', () => {
    const p = parseInput('approach Conspiracy Architects Raider 3', {
      enemyNames,
      enemyPresent: true,
    });
    expect(p.resolvedNoun).toBe('Conspiracy Architects Raider 3');
  });

  it('"attack raider 2" still resolves to Raider 2', () => {
    const p = parseInput('attack Conspiracy Architects Raider 2', {
      enemyNames,
      enemyPresent: true,
    });
    expect(p.resolvedNoun).toBe('Conspiracy Architects Raider 2');
  });

  it('with no ordinal, an unnumbered target still resolves (first match)', () => {
    const p = parseInput('approach raider', { enemyNames, enemyPresent: true });
    expect(p.resolvedNoun).toMatch(/Conspiracy Architects Raider [23]/);
  });
});

describe('arb-fix — buildTraderEnemy carries the vendor faction', () => {
  it('a faction vendor becomes an enemy tagged with that faction', () => {
    const hub = buildTraderEnemy({
      id: 'irma', name: 'Irma Ironhand', title: 'Heavy Armorer',
      faction: 'true_tartarians', description: '',
      offers: [{ itemName: 'Iron Spear', price: 30 }],
    });
    expect(hub.factionId).toBe('true_tartarians');
  });

  it('a factionless roadside trader stays unattributed (no standing hit on kill)', () => {
    const sketchy = buildTraderEnemy({
      id: 'x', name: 'Stall', title: '', faction: null, description: '',
      offers: [{ itemName: 'Pocket Knife', price: 5 }], demeanor: 'sketchy',
    });
    expect(sketchy.factionId).toBeUndefined();
  });
});
