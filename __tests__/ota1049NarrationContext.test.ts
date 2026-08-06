// OTA-1049 — NARRATION CONTEXT. Owner's log: after a fight ended, a quiet crate
// salvage drew "Don't make me decide which one of you to leave breathing" —
// the mood is one action stale and the AGGRESSION pool presupposes a live
// opponent. Locks: AGGRESSION lines never fire without a live enemy; the
// torch-mark line has variants instead of one verbatim repeat.
import * as fs from 'fs';
import * as path from 'path';
import { buildArbiterRemark } from '../app/engine/narrativeGenerator';

const LOC: any = { id: 'x', name: 'The Flats', description: 'silt', tags: [] };
const COMBAT_LOCKED = /leave breathing|two killers|mind the angle|blade is a question|bleed loudly|Strike like you mean|body count|older than language/i;

describe('OTA-1049 — AGGRESSION mood requires a live enemy', () => {
  it('a stale AGGRESSION mood with NO enemy never draws the combat pool', () => {
    for (let i = 0; i < 300; i++) {
      const line = buildArbiterRemark({ location: LOC, mood: 'AGGRESSION' });
      expect(line).not.toMatch(COMBAT_LOCKED);
    }
  });
  it('with a live enemy the pool is still reachable (no over-suppression)', () => {
    const enemy: any = { name: 'Silt Thief', type: 'raider', abilityPoint: 'Strength 4', attack: 'club', damage: '1d4', hp: 8, rarity: 'Common', loot: [] };
    let hit = false;
    for (let i = 0; i < 400 && !hit; i++) {
      const line = buildArbiterRemark({ location: LOC, mood: 'AGGRESSION', enemy });
      if (COMBAT_LOCKED.test(line) || /Silt Thief/.test(line)) hit = true;
    }
    expect(hit).toBe(true);
  });
});

describe('OTA-1049 — SOURCE LOCKS', () => {
  it('the torch-mark line rotates variants (only one keeps "resonance")', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(src).toMatch(/const torchMarkLines = \[/);
    const block = src.slice(src.indexOf('const torchMarkLines'), src.indexOf('torchMarkLines[Math.floor'));
    expect((block.match(/give up something rare/g) ?? []).length).toBe(4);
    expect((block.match(/resonance/g) ?? []).length).toBe(1);
  });
});
