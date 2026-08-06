// OTA-1061 — THE CRAFT LIST SAYS WHICH SLOT. Owner: "under the craft tab for
// armor, it needs to list what slot its for. some of the names don't explain it.
// it took me a few minutes to find something in the hand slot."
//
// The catalog knew all along — previewArmor has built `kindLabel: "Hands Armor"`
// since it was written — but the craft row only ever rendered the STATS line, so
// the slot never reached the screen and the player had to infer it from the
// name. The audit below is why that inference fails: of the 90 distinct nouns
// armor names end in, 17 are used by more than one slot.
import * as fs from 'fs';
import * as path from 'path';
import { getItemPreview } from '../app/components/itemPreview';
import armorData from '../app/data/items/armor.json';

type ArmorRow = { name: string; slot: string };
const ARMOR: ArmorRow[] = (Array.isArray(armorData)
  ? armorData
  : ((armorData as { armor?: ArmorRow[] }).armor ?? [])) as ArmorRow[];
const SLOTS = ['head', 'chest', 'legs', 'cloak', 'feet', 'hands'];

describe('OTA-1061 — the preview carries the slot as DATA', () => {
  it('every catalogue armor piece reports its slot', () => {
    const missing = ARMOR.filter((a) => getItemPreview(a.name).slot !== a.slot);
    expect(missing.map((a) => a.name)).toEqual([]);
  });

  it('all six slots are represented, and nothing else leaks in', () => {
    const seen = new Set(ARMOR.map((a) => getItemPreview(a.name).slot));
    expect([...seen].sort()).toEqual([...SLOTS].sort());
  });

  it('non-armor carries no slot — the label must not appear on a sword', () => {
    for (const name of ['Rusted Blade', 'Trail Rations', 'Climbing Rope']) {
      expect({ name, slot: getItemPreview(name).slot }).toEqual({ name, slot: undefined });
    }
  });

  it('the prose label and the data agree — one source, two renderings', () => {
    for (const a of ARMOR.slice(0, 40)) {
      const p = getItemPreview(a.name);
      expect(p.kindLabel.toLowerCase()).toContain(p.slot!);
    }
  });
});

describe('OTA-1061 — WHY the name is not enough', () => {
  it('the noun an armor name ends in is genuinely ambiguous', () => {
    // This is the owner's complaint, measured. If a future rename made every
    // noun slot-unique the label would be redundant — it does not.
    const bySuffix = new Map<string, Set<string>>();
    for (const a of ARMOR) {
      const noun = a.name.split(/\s+/).pop()!.toLowerCase();
      if (!bySuffix.has(noun)) bySuffix.set(noun, new Set());
      bySuffix.get(noun)!.add(a.slot);
    }
    const ambiguous = [...bySuffix.entries()].filter(([, s]) => s.size > 1);
    expect(ambiguous.length).toBeGreaterThan(10);
    // The ones that actually bite: legs-vs-feet and chest-vs-cloak.
    const nouns = ambiguous.map(([n]) => n);
    expect(nouns).toEqual(expect.arrayContaining(['greaves', 'mantle', 'cloak']));
  });

  it('the hand slot the owner hunted for is a real, populated slot', () => {
    const hands = ARMOR.filter((a) => a.slot === 'hands');
    expect(hands.length).toBeGreaterThan(20);
    for (const a of hands) expect(getItemPreview(a.name).slot).toBe('hands');
  });
});

describe('OTA-1061 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const view = read('app', 'components', 'RecipesView.tsx');

  it('the craft row renders the slot on its own line', () => {
    expect(view).toMatch(/preview\.slot \? \(/);
    expect(view).toMatch(/\{preview\.slot\.toUpperCase\(\)\} SLOT/);
    expect(view).toMatch(/recipeSlot: \{/);
    // Above the stats line, so it reads before the numbers.
    expect(view.indexOf('preview.slot ? (')).toBeLessThan(view.indexOf('preview.stats.length > 0'));
  });

  it('typing a slot name FINDS those pieces — labelling alone was not the ask', () => {
    // "it took me a few minutes to find something in the hand slot" — the label
    // fixes reading, the search fixes finding.
    expect(view).toMatch(/getItemPreview\(e\.recipe\.result\)\.slot \?\? ''\)\.includes\(q\)/);
    // The name match is still there — the slot is an ADDITION, not a swap.
    expect(view).toMatch(/e\.recipe\.result\.toLowerCase\(\)\.includes\(q\)/);
  });

  it('a fused piece keeps its slot too', () => {
    const preview = read('app', 'components', 'itemPreview.ts');
    expect(preview).toMatch(/slot: u\.armorSlot,/);
    expect(preview).toMatch(/slot: a\.slot,/);
  });
});
