// OTA-813 — the Arbiter's combat templates lowercased the enemy name, which mangled
// a NAMED boss ("the heir atalan-drowned is patient"). combatEnemyLabel keeps proper
// case for bosses/Guardians and still lowercases generic creatures.

import { combatEnemyLabel } from '../app/engine/narrativeGenerator';

describe('OTA-813 — boss names keep their case in combat prose', () => {
  it('a boss / Core Guardian is a proper noun (unchanged case)', () => {
    expect(combatEnemyLabel({ name: 'Heir Atalan-Drowned', boss: true })).toBe('Heir Atalan-Drowned');
  });
  it('a generic creature still lowercases (reads as "the mud boar")', () => {
    expect(combatEnemyLabel({ name: 'Mud Boar', boss: false })).toBe('mud boar');
    expect(combatEnemyLabel({ name: 'Mud Boar' })).toBe('mud boar'); // boss undefined → generic
  });
});
