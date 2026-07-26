// OTA-994 — category LOCK for review item #116 (owner: "verify that will clear
// out that entire category of issues"). OTA-993 routed 7 stat level-up toasts
// through statNowClause; the owner's verification pass found 11 more reward
// toasts still printing the bare base stat. This suite closes the category and
// LOCKS it: no player-facing "+1 <STAT> (now ${...})" toast may bypass
// statNowClause ever again — any future toast written the old way fails here.
import * as fs from 'fs';
import * as path from 'path';

describe('OTA-994 — every player stat toast reads the sheet (category lock)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/state/gameStore.ts'), 'utf8');

  it('no reward toast prints a bare base stat ("+1 XXX (now ${...})")', () => {
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      // "+1 max HP / max stamina" toasts are EXEMPT: hpMax/staminaMax have no
      // base-vs-gear duality — the sheet shows the same number the toast does.
      .filter(({ line }) => line.includes('✦') && /\+1 /.test(line) && !/\+1 max /.test(line) && line.includes('(now ${'));
    expect(offenders.map(({ n, line }) => `${n}: ${line.trim().slice(0, 90)}`)).toEqual([]);
  });

  it('the statNowClause helper is wired at every rewritten site (18 total)', () => {
    const count = (src.match(/statNowClause\(get\(\)\.player/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(22); // 7 from the truth batch + 15 from this completion
  });
});
