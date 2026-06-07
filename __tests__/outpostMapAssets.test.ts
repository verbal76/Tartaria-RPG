import * as fs from 'fs';
import * as path from 'path';
import factionsData from '../app/data/factions/factions.json';
import type { Faction } from '../app/engine/types';

const FACTIONS = factionsData as Faction[];

// arb106 — every faction's outpost INTERIOR map art has landed. The Map
// screen shows the faction's interior PNG when the player is inside their
// outpost (MapScreen.OUTPOST_MAPS); this guards that the asset file exists
// on disk for all 9 factions so none silently fall back to the world atlas.
describe('outpost interior map assets (arb106)', () => {
  const dir = path.join(__dirname, '..', 'assets', 'outposts');

  it('every faction has an outpost map PNG on disk', () => {
    const missing: string[] = [];
    for (const f of FACTIONS) {
      const p = path.join(dir, `${f.id}.png`);
      if (!fs.existsSync(p)) missing.push(f.id);
    }
    expect(missing).toEqual([]);
  });

  it('all 9 factions are represented', () => {
    expect(FACTIONS.length).toBe(9);
  });
});
