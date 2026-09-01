// ⚠⚠⚠ OTA-1609 — THE STRIKE KEEPS ITS NAME.
//
// Owner, after OTA-1608 moved the ATK cell from parseInt(enemy.attack) — a
// move NAME on every bestiary row — to the real roll bonus: "I like the
// attack name, let's add that somewhere in the enemy portrait so it's known
// but not in the way."
//
// The name now rides the defs block as a dim STRIKES line under DEALS (a
// shade quieter than the amber — flavor never outshouts a decision input),
// and the detail popup carries "Strikes with: <name>". Every NUMBER on the
// card remains the roll's own arithmetic (1608), untouched.

import { readFileSync } from 'fs';
import { join } from 'path';
import enemiesData from '../app/data/enemies/enemies.json';

type Row = { name: string; attack?: string };
const ROWS: Row[] = (Array.isArray(enemiesData)
  ? enemiesData
  : (Object.values(enemiesData as Record<string, unknown>).find(Array.isArray) as Row[])) as Row[];

const EP = readFileSync(join(__dirname, '..', 'app', 'components', 'EnemyPanel.tsx'), 'utf8');

describe('OTA-1609 — the strike keeps its name, out of the way', () => {
  it('⚠⚠⚠ the card renders the STRIKES line and the popup carries the name', () => {
    expect(EP).toContain('function enemyAttackName(');
    expect(EP).toContain('<Text style={styles.defStrikes}>STRIKES </Text>');
    expect(EP).toContain('{enemyAttackName(view.enemy)}');
    expect(EP).toContain('`Strikes with: ${enemyAttackName(e)}`');
  });

  it('⚠⚠ quiet by construction — dimmer than DEALS, and gated so digits never render as a move', () => {
    // The style exists and is a dimmer tone than defDeals' #d9a566 amber.
    expect(EP).toContain("defStrikes: { color: '#8f8570'");
    // The helper nulls empty and purely-numeric attacks (some mints stamp digits).
    expect(EP).toContain("if (!name || /^\\+?\\d+$/.test(name)) return null;");
  });

  it('⚠⚠ the numbers stay the roll\'s own — 1608\'s resolvers are still the only arithmetic on the card', () => {
    expect(EP).toContain('const ac = enemyAC(view.enemy);');
    expect(EP).toContain('enemyAttackBonus(view.enemy)');
    expect(EP).not.toContain('parseInt(String(view.enemy.attack)');
  });

  it('⚠ the bestiary actually has names worth showing — the line will light up in play', () => {
    const named = ROWS.filter((r) => {
      const a = String(r.attack ?? '').trim();
      return a.length > 0 && !/^\+?\d+$/.test(a);
    });
    // The overwhelming majority of rows carry an authored move name.
    expect(named.length).toBeGreaterThan(ROWS.length * 0.8);
    expect(named.some((r) => r.name === 'Mud Spirit' && r.attack === 'Spirit Touch')).toBe(true);
  });
});
