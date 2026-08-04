// OTA-1115 — THE SECONDARY CAST GETS A LADDER TOO. The 21 secondary named
// NPCs (4-5 topics each) and the 11 class sets now carry depth: each named
// NPC drew one known + one familiar + one trusted topic from their
// archetype's pool (blade / maker / seeker / road / office) with their name
// woven into the prose, and every class set gained a familiar and a trusted
// topic in its own register. Catalog: 258 → 343 (182 before the deep-bench
// wave — Workstream B's writing goal landed). This suite locks the shape and
// guards the two failure modes of template authoring: leftover placeholders
// and a pool draw that skipped a rung.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import rawTopics from '../app/data/npcs/dialogue_topics.json';
import type { Topic } from '../app/engine/dialogue';

const NPCS = (rawTopics as { npcs: Record<string, { displayName: string; topics: Topic[] }> }).npcs;

const NINE = new Set([
  'irma_ironhand', 'scrap_broker', 'order_scholar', 'halem_trader',
  'tartarian_quartermaster', 'elara_lightfinger', 'felra_swiftfoot',
  'bran_the_beastmaster', 'nalren_frostgrip',
]);

const secondaryNamed = Object.keys(NPCS).filter((k) => !k.startsWith('class:') && !NINE.has(k));
const classes = Object.keys(NPCS).filter((k) => k.startsWith('class:'));

describe('OTA-1115 — the secondary cast carries a ladder', () => {
  it('every secondary named NPC now runs at least 7 topics, every class set at least 6', () => {
    for (const id of secondaryNamed) expect(NPCS[id]!.topics.length).toBeGreaterThanOrEqual(7);
    for (const id of classes) expect(NPCS[id]!.topics.length).toBeGreaterThanOrEqual(6);
  });

  it('each secondary named NPC drew exactly one pool topic per rung', () => {
    for (const id of secondaryNamed) {
      const pool = NPCS[id]!.topics.filter((t) => t.id.includes('_pool_'));
      expect(pool.length).toBe(3);
      const rungs = pool.map((t) => t.gate?.minRegard).sort();
      expect(rungs).toEqual(['familiar', 'known', 'trusted']);
    }
  });

  it("the pool prose carries the NPC's own name — no template placeholders anywhere", () => {
    for (const [id, set] of Object.entries(NPCS)) {
      for (const t of set.topics) {
        for (const l of t.lines) {
          if (l.includes('{name}')) throw new Error(`${id}:${t.id} kept a raw placeholder`);
        }
      }
    }
    for (const id of secondaryNamed) {
      const set = NPCS[id]!;
      const poolText = set.topics.filter((t) => t.id.includes('_pool_')).map((t) => t.lines.join(' ')).join(' ');
      expect(poolText).toContain(set.displayName);
    }
  });

  it('every class set gained a familiar and a trusted class topic', () => {
    for (const id of classes) {
      const cls = NPCS[id]!.topics.filter((t) => t.id.startsWith('cls_'));
      expect(cls.length).toBeGreaterThanOrEqual(2);
      expect(cls.some((t) => t.gate?.minRegard === 'familiar')).toBe(true);
      expect(cls.some((t) => t.gate?.minRegard === 'trusted')).toBe(true);
    }
  });

  it('pool neighbours differ — two NPCs sharing an archetype do not share their whole draw', () => {
    // The rotation exists so the seventh blade does not read like the first.
    const bladeDraws = ['velar_shadowblade', 'zorin_nightblade'].map((id) =>
      NPCS[id]!.topics.filter((t) => t.id.includes('_pool_')).map((t) => t.id.split('_pool_')[1]).join(','),
    );
    expect(bladeDraws[0]).not.toEqual(bladeDraws[1]);
  });

  it('the Workstream B writing goal landed: catalog at 340+ (was 182)', () => {
    const total = Object.values(NPCS).reduce((n, s) => n + s.topics.length, 0);
    expect(total).toBeGreaterThanOrEqual(340);
  });
});
