// OTA-1034 — GOLEM FUEL YOU CAN ACTUALLY BUY, IN LIMITED AMOUNTS. Owner asked
// about "getting limited amounts of aether mud to named vendors for sale". It
// was not stocked anywhere: summoning a Mud Golem costs 2 Aether Mud and the
// only way to get any was to forage it. Six named vendors now carry it, and
// because materials otherwise roll 1-10 per visit (five golems' worth off one
// counter), mud rolls a deliberately tight 2-5 instead.
//
// Second half: the ambient companion aside still came back EMPTY on a build
// that carries the OTA-1054 register fix, so that filter was not the whole
// story. The ∅ debug line never said which filter ate it — now it does.
import * as fs from 'fs';
import * as path from 'path';
import { rollOfferQuantity, findVendorByName } from '../app/engine/vendors';
import vendorsData from '../app/data/npcs/vendors.json';
import materialsData from '../app/data/items/materials.json';

type Offer = { itemName: string; price: number; quantity?: number };
type Vendor = { name: string; offers?: Offer[] };
const VENDORS: Vendor[] = (Array.isArray(vendorsData)
  ? vendorsData
  : ((vendorsData as { vendors?: Vendor[] }).vendors ?? [])) as Vendor[];

const MUD_SELLERS = [
  'Halem the Trader', 'Tellin Mak', 'Tarek the Tinkerer',
  'Naha', 'Veska of the Hollow', 'Foreman Drest Holloway',
];

describe('OTA-1034 — six named vendors stock Aether Mud', () => {
  it('every named seller carries it, at a price a Common material can justify', () => {
    for (const name of MUD_SELLERS) {
      const v = VENDORS.find((x) => x.name === name);
      expect({ name, exists: !!v }).toEqual({ name, exists: true });
      const offer = (v!.offers ?? []).find((o) => o.itemName === 'Aether Mud');
      expect({ name, stocked: !!offer }).toEqual({ name, stocked: true });
      expect({ name, sane: offer!.price >= 3 && offer!.price <= 12 })
        .toEqual({ name, sane: true });
    }
  });

  it('it is a real catalogue item, not a name typed into the shop list', () => {
    const list = ((materialsData as { materials?: Array<{ name: string }> }).materials
      ?? (materialsData as unknown as Array<{ name: string }>));
    expect(list.some((m) => m.name === 'Aether Mud')).toBe(true);
  });

  it('only sellers with AUTHORED stock were used — never a dynamically-filled one', () => {
    // Twelve vendors carry `offers: []` and are stocked elsewhere at runtime;
    // an entry added to one of those would be silently overwritten.
    for (const name of MUD_SELLERS) {
      const v = VENDORS.find((x) => x.name === name)!;
      expect({ name, authored: (v.offers ?? []).length > 1 }).toEqual({ name, authored: true });
    }
  });

  it('supply is spread — no single counter, and no single faction, gates the fuel', () => {
    expect(MUD_SELLERS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('OTA-1034 — LIMITED means limited', () => {
  it('mud never rolls more than 5, and never fewer than 2', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const q = rollOfferQuantity('Aether Mud');
      expect(q).toBeGreaterThanOrEqual(2);
      expect(q).toBeLessThanOrEqual(5);
      seen.add(q);
    }
    // The band is actually used, not pinned to one value.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is case-insensitive — the shop list spelling cannot dodge the cap', () => {
    for (const spelling of ['aether mud', 'AETHER MUD', 'Aether Mud']) {
      for (let i = 0; i < 60; i++) {
        expect(rollOfferQuantity(spelling)).toBeLessThanOrEqual(5);
      }
    }
  });

  it('an ORDINARY material still rolls the wide 1-10 band — mud is the exception', () => {
    let sawAboveFive = false;
    for (let i = 0; i < 400; i++) {
      if (rollOfferQuantity('Patched Cloth') > 5) { sawAboveFive = true; break; }
    }
    expect(sawAboveFive).toBe(true);
  });

  it('a two-golem trip is possible, a stockpile is not', () => {
    // 2 Aether Mud per summon: the worst shelf still funds one, the best two.
    for (let i = 0; i < 200; i++) {
      const summons = Math.floor(rollOfferQuantity('Aether Mud') / 2);
      expect(summons).toBeGreaterThanOrEqual(1);
      expect(summons).toBeLessThanOrEqual(2);
    }
  });

  it('the vendor you actually walk up to has a stocked, capped quantity', () => {
    // The whole point is the SHOP, not the helper: go through the same lookup
    // the game uses, for every seller, and read the number off the shelf.
    for (const name of MUD_SELLERS) {
      const quantities = new Set<number>();
      for (let i = 0; i < 40; i++) {
        const inst = findVendorByName(name);
        expect({ name, found: !!inst }).toEqual({ name, found: true });
        const mud = (inst!.offers as Offer[]).find((o) => o.itemName === 'Aether Mud');
        expect({ name, onShelf: !!mud }).toEqual({ name, onShelf: true });
        expect(typeof mud!.quantity).toBe('number');
        expect({ name, q: mud!.quantity! >= 2 && mud!.quantity! <= 5 })
          .toEqual({ name, q: true });
        quantities.add(mud!.quantity!);
      }
      // The shelf refills differently each visit rather than being fixed stock.
      expect({ name, varies: quantities.size > 1 }).toEqual({ name, varies: true });
    }
  });
});

describe('OTA-1034 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('the scarce band is a table, not a special case buried in the roll', () => {
    const src = read('app', 'engine', 'vendors.ts');
    expect(src).toMatch(/const SCARCE_STOCK: Readonly<Record<string, readonly \[number, number\]>>/);
    expect(src).toMatch(/'aether mud': \[2, 5\]/);
    // Consulted BEFORE the food/material bands, or the wide roll would win.
    const body = src.slice(src.indexOf('export function rollOfferQuantity'));
    expect(body.indexOf('SCARCE_STOCK[n]')).toBeLessThan(body.indexOf('FOOD_NAMES.has(n)'));
  });

  it('the ambient ∅ now names which filter ate the line', () => {
    // ⚠ OTA-1398 — the ambient ∅ instrumentation moved to app/ai/narration.ts.
    const store = read('app', 'state', 'gameStore.ts') + '\n' + read('app', 'ai', 'narration.ts');
    expect(store).toMatch(/ambient-empty reason=model-returned-nothing/);
    expect(store).toMatch(/ambient-empty reason=\$\{why\} raw=/);
    for (const reason of [
      'cleaners-emptied-it', 'third-person', 'they-opener', 'action-opener',
      'instruction-echo', 'off-canon-entity', 'near-duplicate-of-recent', 'unknown',
    ]) {
      expect({ reason, present: store.includes(`'${reason}'`) })
        .toEqual({ reason, present: true });
    }
  });

  it('the instrumentation is debug-only — it cannot put a line in the feed', () => {
    // ⚠ OTA-1398 — the ambient ∅ instrumentation moved to app/ai/narration.ts.
    const store = read('app', 'state', 'gameStore.ts') + '\n' + read('app', 'ai', 'narration.ts');
    const start = store.indexOf("if (!ambientUsable) {");
    expect(start).toBeGreaterThan(0);
    const block = store.slice(start, start + 1600);
    expect(block).toMatch(/appendLog\('debug'/);
    expect(block).not.toMatch(/appendLog\('arbiter'/);
    expect(block).not.toMatch(/appendLog\('world'/);
  });
});
