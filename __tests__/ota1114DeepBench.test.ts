// OTA-1114 — THE DEEP BENCH: the nine authored vendors grow from 5-8 topics
// to 14-16 laddered ones. The production audit's dialogue finding was
// thinness — a "person" who is three questions deep IS three questions deep.
// Every vendor now carries a full ladder: shopfront for anyone, craft and
// local colour at `known`, history and people at `familiar`, and at `trusted`
// the personal core — a marriage or its absence, an origin, why-this-trade, a
// fear, and one paying secret (a lead grant). Plus the OTA-1113 gate roads in
// live use: minLovedGifts intimacy doors and minPocketsMumbled thief doors.
// This suite locks the STRUCTURE so future edits can't quietly thin it back.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import rawTopics from '../app/data/npcs/dialogue_topics.json';
import type { Topic } from '../app/engine/dialogue';

const NPCS = (rawTopics as { npcs: Record<string, { displayName: string; topics: Topic[] }> }).npcs;

const NINE = [
  'irma_ironhand', 'scrap_broker', 'order_scholar', 'halem_trader',
  'tartarian_quartermaster', 'elara_lightfinger', 'felra_swiftfoot',
  'bran_the_beastmaster', 'nalren_frostgrip',
] as const;

describe('OTA-1114 — every deep-bench vendor carries a full ladder', () => {
  it('each of the nine has 14-16 topics', () => {
    for (const id of NINE) {
      const n = NPCS[id]!.topics.length;
      expect(n).toBeGreaterThanOrEqual(14);
      expect(n).toBeLessThanOrEqual(16);
    }
  });

  it('each has an ungated shopfront, rungs at known/familiar/trusted, and exactly one wronged topic', () => {
    for (const id of NINE) {
      const ts = NPCS[id]!.topics;
      expect(ts.filter((t) => !t.gate).length).toBeGreaterThanOrEqual(1);
      expect(ts.filter((t) => t.gate?.minRegard === 'known').length).toBeGreaterThanOrEqual(2);
      expect(ts.filter((t) => t.gate?.minRegard === 'familiar').length).toBeGreaterThanOrEqual(2);
      expect(ts.filter((t) => t.gate?.minRegard === 'trusted').length).toBeGreaterThanOrEqual(3);
      expect(ts.filter((t) => t.gate?.onlyRegard === 'wronged').length).toBe(1);
    }
  });

  it('each carries at least one paying secret, and every lead pays 20-40 TC', () => {
    for (const id of NINE) {
      const granting = NPCS[id]!.topics.filter((t) => t.grants);
      expect(granting.length).toBeGreaterThanOrEqual(1);
      for (const t of granting) {
        if (t.grants?.lead) {
          expect(t.grants.lead.rewardTc).toBeGreaterThanOrEqual(20);
          expect(t.grants.lead.rewardTc).toBeLessThanOrEqual(40);
          expect(t.grants.lead.hint.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it('the OTA-1113 gate roads are in live use: 6 loved-gift doors, 2 thief doors', () => {
    const all = Object.values(NPCS).flatMap((s) => s.topics);
    expect(all.filter((t) => t.gate?.minLovedGifts !== undefined).length).toBe(6);
    expect(all.filter((t) => t.gate?.minPocketsMumbled !== undefined).length).toBe(2);
  });

  it('topic ids and labels stay unique per vendor, every topic has at least one non-empty line', () => {
    for (const [npcId, set] of Object.entries(NPCS)) {
      const ids = set.topics.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      const labels = set.topics.map((t) => t.label);
      expect(new Set(labels).size).toBe(labels.length);
      for (const t of set.topics) {
        expect(t.lines.length).toBeGreaterThanOrEqual(1);
        for (const l of t.lines) {
          if (l.trim().length === 0) throw new Error(`${npcId}:${t.id} has an empty line`);
        }
      }
    }
  });

  it('the catalog grew to at least 250 authored topics', () => {
    const total = Object.values(NPCS).reduce((n, s) => n + s.topics.length, 0);
    expect(total).toBeGreaterThanOrEqual(250);
  });
});

describe('OTA-1114 — the owner-approved Irma arc is really in there', () => {
  const irma = NPCS.irma_ironhand!.topics;

  it('Berrin at familiar, Nimari at trusted, the sealed-galleries paying secret with the map hint', () => {
    const berrin = irma.find((t) => t.id === 'irma_berrin')!;
    expect(berrin.gate?.minRegard).toBe('familiar');
    expect(berrin.lines.join(' ')).toContain('Berrin');

    const nimari = irma.find((t) => t.id === 'irma_nimari')!;
    expect(nimari.gate?.minRegard).toBe('trusted');
    expect(nimari.lines.length).toBeGreaterThanOrEqual(2); // the re-ask goes deeper

    const galleries = irma.find((t) => t.id === 'irma_galleries')!;
    expect(galleries.gate?.minRegard).toBe('trusted');
    expect(galleries.grants?.lead?.hint).toContain('gallery');
  });

  it("the hammer only comes out for someone who honored who she is", () => {
    const hammer = irma.find((t) => t.id === 'irma_hammer')!;
    expect(hammer.gate?.minLovedGifts).toBe(1);
    expect(hammer.gate?.minRegard).toBe('trusted');
  });
});
