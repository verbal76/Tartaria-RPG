// OTA-1176 — EVERY VENDOR HAS TASTES, AND EVERY TASTE POINTS AT SOMETHING REAL.
//
// Owner: "all vendor need a fully fledged like, love and dislike list. that needs
// generated and it needs to fit the description of who they are that you got from
// talking to them or their stall type. And I don't want a tiny list with like six
// items. make them fully flushed out."
//
// ⚠ THE BUG UNDER THE ASK. Nine vendors had taste lists and TWENTY-ONE had none —
// but the nine were mostly dead too. Every one of them named tags that no item in
// the game carries: `ore`, `ingot`, `trinket`, `ration`, `curio`, `mechanism`,
// `component`, `ember`, `wind`, `pelt`, `book`, `record`, `spring`, `medicine`.
// The author reached for words that sounded like the vendor. The real tag
// vocabulary is mechanical — `armor`, `weapon`, `metal`, `food`, `potion`,
// `relic`. So Yara the wind-dealer loved `wind`, nothing is tagged `wind`, and her
// taste never fired once. Only accidental overlaps worked (Irma's `metal`).
//
// ⚠ IT WAS ALSO UNREACHABLE FOR MOST OF THE CAST. Prefs were a flat map keyed on
// the whole ledger id, which only ever matches the 30 fixed shopkeepers. Roadside
// traders key as `roadside:<name>`, Hidden Market staff as
// `hidden_market_<cat>:<name>`, lookout traders as `overlay:<name>`, wanderers as
// `wanderer:<archetype>:<name>` — 112 possible ids for 7 archetypes. All of them
// fell through to the generic fallback and reacted on price alone.
//
// THE FIRST DESCRIBE BLOCK IS THE ROOT-CAUSE LOCK. A test that only checked "does
// every vendor have an entry" would have passed on the old data with all fourteen
// dead tags in place. Content is only alive if it resolves against the catalog, so
// that is what gets asserted.
import fs from 'fs';
import path from 'path';
import {
  giftPrefFor,
  reactionFor,
  resolveGift,
  GIFT_FLOOR_TC,
  type GiftItem,
} from '../app/engine/gifting';
import { npcLedgerId } from '../app/engine/npcMemory';

const ROOT = path.join(__dirname, '..');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// The live catalog, assembled the same way the census that found the bug did.
const LIVE_TAGS = new Set<string>();
const LIVE_ITEMS = new Set<string>();
for (const dir of ['app/data/items', 'app/data/relics']) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!f.endsWith('.json') || f.includes('snapshot')) continue;
    let d: unknown;
    try { d = JSON.parse(fs.readFileSync(path.join(abs, f), 'utf8')); } catch { continue; }
    const rows: unknown[] = Array.isArray(d)
      ? d
      : (Object.values(d as Record<string, unknown>).find((v) => Array.isArray(v)) as unknown[]) ?? [];
    for (const r of rows) {
      const row = r as { name?: string; tags?: unknown };
      if (!row || typeof row.name !== 'string') continue;
      LIVE_ITEMS.add(row.name);
      if (Array.isArray(row.tags)) for (const t of row.tags) LIVE_TAGS.add(String(t).toLowerCase());
    }
  }
}

const PREFS_FILE = readJson('app/data/npcs/gift_prefs.json') as {
  npcs: Record<string, Record<string, unknown>>;
  aliases?: Record<string, string>;
  fallback: Record<string, unknown>;
};
const NPCS = PREFS_FILE.npcs;
const TAG_KEYS = ['lovesTags', 'likesTags', 'dislikesTags', 'coldTags'] as const;
const ITEM_KEYS = ['lovesItems', 'likesItems', 'dislikesItems'] as const;

describe('OTA-1176 — every authored taste resolves against the live catalog', () => {
  it('⚠ names a tag that no item carries: NONE', () => {
    const dead: string[] = [];
    for (const [npc, p] of Object.entries(NPCS)) {
      for (const k of TAG_KEYS) {
        for (const t of (p[k] as string[] | undefined) ?? []) {
          if (!LIVE_TAGS.has(String(t).toLowerCase())) dead.push(`${npc}.${k}: ${t}`);
        }
      }
    }
    // This is the assertion that would have failed on every one of the original
    // nine vendors. If it fails again, the content is decorative.
    expect(dead).toEqual([]);
  });

  it('⚠ names an item that does not exist: NONE', () => {
    const dead: string[] = [];
    for (const [npc, p] of Object.entries(NPCS)) {
      for (const k of ITEM_KEYS) {
        for (const n of (p[k] as string[] | undefined) ?? []) {
          if (!LIVE_ITEMS.has(String(n))) dead.push(`${npc}.${k}: ${n}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it('every alias points at a real entry', () => {
    for (const [from, to] of Object.entries(PREFS_FILE.aliases ?? {})) {
      expect(Object.keys(NPCS)).toContain(to);
      expect(NPCS[from]).toBeUndefined(); // an alias must not also be a copy
    }
  });
});

describe('OTA-1176 — coverage: nobody falls through to the generic fallback', () => {
  const isReal = (id: string, name?: string) => {
    const p = giftPrefFor(id, name);
    // The fallback carries lines but no tastes; a real profile has tastes.
    return ((p.lovesTags?.length ?? 0) + (p.lovesItems?.length ?? 0)) > 0;
  };

  it('all 30 fixed shopkeepers', () => {
    const vendors = readJson('app/data/npcs/vendors.json').vendors as { id: string; name: string }[];
    const missing = vendors.filter((v) => !isReal(npcLedgerId(v), v.name)).map((v) => v.id);
    expect(missing).toEqual([]);
    expect(vendors.length).toBe(30);
  });

  it('all 24 roadside traders, by the id the ledger actually mints', () => {
    const arch = readJson('app/data/npcs/roadside_traders.json').archetypes as
      { demeanor: string; people: string[] }[];
    const missing: string[] = [];
    for (const a of arch) {
      for (const person of a.people) {
        // Mirrors npcLedgerId's roadside_ branch.
        const id = npcLedgerId({ id: `roadside_${a.demeanor}_123`, name: person });
        if (!isReal(id, person)) missing.push(id);
      }
    }
    expect(missing).toEqual([]);
    expect(arch.flatMap((a) => a.people)).toHaveLength(24);
  });

  it('every Hidden Market face, including the five who also own a shop', () => {
    // The Market spells some names differently from their shop id; the alias map
    // is what keeps them one person. If it regresses, these resolve to fallback.
    const market: [string, string][] = [
      ['hidden_market_food', 'Halem the Trader'],
      ['hidden_market_materials', 'Tarek the Tinkerer'],
      ['hidden_market_food', 'Thalan the Wanderer'],
      ['hidden_market_weapons', 'Drakos the Mercenary'],
      ['hidden_market_armor', 'Irma Ironhand'],
      ['hidden_market_food', 'Naha'],
      ['hidden_market_materials', 'The Cartographer'],
      ['hidden_market_armor', 'Korash of the Deep'],
    ];
    const missing = market
      .filter(([cat, name]) => !isReal(npcLedgerId({ id: cat, name }), name))
      .map(([, name]) => name);
    expect(missing).toEqual([]);
  });

  it('all 5 lookout traders and all 7 wanderer archetypes', () => {
    const overlay = ['Olek the Ledger Keeper', 'Sister Yelena of the Tall Air', 'Pavel (allegedly)',
      'Adept Ireneus of the Catalogue', 'Mikola the Lost-On-Purpose'];
    const missingOverlay = overlay
      .filter((n) => !isReal(npcLedgerId({ id: 'overlay_abc', name: n }), n))
      .map((n) => n);
    expect(missingOverlay).toEqual([]);

    // 112 possible wanderer ids collapse to 7 archetype entries via the chain.
    const archs = ['traveler', 'refugee', 'tinker', 'scout', 'pilgrim', 'drifter', 'scavenger'];
    const missingW = archs
      .filter((a) => !isReal(npcLedgerId({ id: `wanderer_${a}_7`, name: 'Corin' }), 'Corin'))
      .map((a) => a);
    expect(missingW).toEqual([]);
  });
});

describe('OTA-1176 — the lookup chain', () => {
  it('a wanderer resolves by ARCHETYPE, so the random first name cannot matter', () => {
    const a = giftPrefFor(npcLedgerId({ id: 'wanderer_tinker_1', name: 'Corin' }), 'Corin');
    const b = giftPrefFor(npcLedgerId({ id: 'wanderer_tinker_2', name: 'Nix' }), 'Nix');
    expect(a.lovesTags).toEqual(b.lovesTags);
  });

  it('the same person has the same tastes in their shop and at the Market', () => {
    // The exact drift this alias map exists to prevent.
    const shop = giftPrefFor('halem_trader', 'Halem the Trader');
    const market = giftPrefFor(npcLedgerId({ id: 'hidden_market_food', name: 'Halem the Trader' }), 'Halem the Trader');
    expect(market.lovesTags).toEqual(shop.lovesTags);
    expect(market.lovesItems).toEqual(shop.lovesItems);
  });

  it('an unknown stranger still falls back rather than throwing', () => {
    const p = giftPrefFor('nobody:at:all', 'Nobody At All');
    expect(p).toBeDefined();
    expect(p.lovedLine ?? '').toEqual(expect.any(String));
  });
});

describe('OTA-1176 — reaction ordering', () => {
  const item = (name: string, tags: string[], worth = 100): GiftItem => ({ name, tags, worth });

  it('worthless is refused before any taste is consulted', () => {
    const r = reactionFor('irma_ironhand', item('Bent Nail', ['metal'], GIFT_FLOOR_TC - 1));
    expect(r).toBe('insulted');
  });

  it('an exact loved NAME beats a disliked TAG on the same item', () => {
    const p = giftPrefFor('irma_ironhand');
    const loved = p.lovesItems?.[0];
    if (!loved) throw new Error('fixture vendor has no loved item');
    const disliked = (p.dislikesTags ?? p.coldTags ?? [])[0] ?? 'food';
    expect(reactionFor('irma_ironhand', item(loved, [disliked]))).toBe('loved');
  });

  it('a disliked tag is NOT rescued by a liked tag', () => {
    const p = giftPrefFor('irma_ironhand');
    const dis = (p.dislikesTags ?? p.coldTags ?? [])[0];
    const like = p.likesTags?.[0];
    if (!dis || !like) throw new Error('fixture vendor missing a dislike or like tag');
    expect(reactionFor('irma_ironhand', item('Some Thing', [dis, like]))).toBe('disliked');
  });

  it('⚠ a dislike costs the player nothing — it is not an insult', () => {
    const p = giftPrefFor('irma_ironhand');
    const dis = (p.dislikesTags ?? p.coldTags ?? [])[0]!;
    const out = resolveGift('irma_ironhand', 'Irma', item('Some Thing', [dis]), {
      id: 'irma_ironhand', name: 'Irma', firstMetAt: 0, lastSeenAt: 0, lastSeenHours: 0,
      meetings: 1, trades: 0,
    } as never);
    expect(out.reaction).toBe('disliked');
    expect(out.refused).toBe(false);
    expect(out.standingDelta).toBe(0);
    expect(out.countsAsBoon).toBe(false);
  });
});

describe('OTA-1176 — the lists are actually fleshed out', () => {
  it('every profile carries all three tiers, not a token entry', () => {
    const thin: string[] = [];
    for (const [npc, p] of Object.entries(NPCS)) {
      const loves = ((p.lovesTags as string[]) ?? []).length + ((p.lovesItems as string[]) ?? []).length;
      const likes = ((p.likesTags as string[]) ?? []).length + ((p.likesItems as string[]) ?? []).length;
      const dis = ((p.dislikesTags as string[]) ?? []).length + ((p.coldTags as string[]) ?? []).length
        + ((p.dislikesItems as string[]) ?? []).length;
      // The owner's words: "I don't want a tiny list with like six items."
      if (loves < 4 || likes < 4 || dis < 2) thin.push(`${npc} (loves ${loves}, likes ${likes}, dislikes ${dis})`);
    }
    expect(thin).toEqual([]);
  });

  it('every profile speaks in its own voice for all four outcomes', () => {
    const silent: string[] = [];
    for (const [npc, p] of Object.entries(NPCS)) {
      for (const k of ['lovedLine', 'likedLine', 'dislikeLine', 'politeLine', 'insultLine']) {
        if (typeof p[k] !== 'string' || (p[k] as string).length < 10) silent.push(`${npc}.${k}`);
      }
    }
    expect(silent).toEqual([]);
  });

  it('nobody was written with the word the owner banned', () => {
    expect(JSON.stringify(PREFS_FILE).toLowerCase()).not.toContain('inured');
  });
});
