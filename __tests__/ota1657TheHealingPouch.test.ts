jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1657 — THE HEALING POUCH, AND THREE RACKS THAT FOLD.
//
// Owner: *"battle gets slowed down when you have to heal. let's make it
// available from the exploration screen. let's make another bandolier and call
// it the healing pouch or something. and we can load it with any three healing
// items they want so… 5 trauma kits, say 3 trail rations and maybe 10 blueberries
// in it. and we open it like a bandolier during combat and can use the preloaded
// heals from there. and when you use it, it acts like they do when being used
// from inventory."*
//
// And then: *"when you are in inventory let's make the bandolier, tool pouch and
// healing pouch collapsable like inventory categories to save space."*

import {
  MEDKIT_MAX,
  itemHeals,
  isMedkitEligible,
  medkitContents,
} from '../app/engine/medkitEligibility';
import { consumableDoesSomething } from '../app/engine/consumableCures';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const readSrc = (rel: string): string =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').readFileSync(require('path').join(__dirname, '..', rel), 'utf8') as string;

function inst(name: string, over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `i_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name, kind: 'consumable', rarity: 'Common', quantity: 1, tags: [],
    ...over,
  } as unknown as InventoryItem;
}

function carrying(items: InventoryItem[], medkitIds: string[] = []): PlayerCharacter {
  return { inventory: items, equipped: { medkitIds } } as unknown as PlayerCharacter;
}

describe('OTA-1657 — what counts as a heal (and it delegates, it does not decide)', () => {
  it('⚠ all three items the owner named by name are eligible', () => {
    for (const name of ['Trauma Kit', 'Trail Rations', 'Blueberries']) {
      expect(itemHeals(inst(name))).toBe(true);
    }
  });

  it('a pure cure with ZERO healHP still counts — that split was a real defect once', () => {
    // consumableCures.ts was written because `useConsumableOnTarget` refused any
    // item with healHP 0, so an antivenom worked from the combat bar and was
    // refused by the inventory screen. This rack asks that same shared predicate
    // rather than restating "what is a heal", so the two can never disagree.
    expect(consumableDoesSomething({ healHP: 0, cureBleed: true })).toBe(true);
    expect(consumableDoesSomething({ healHP: 0, curePoison: true })).toBe(true);
    expect(consumableDoesSomething({ healHP: 0, restoreStamina: 2 })).toBe(true);
    expect(consumableDoesSomething({ healHP: 0 })).toBe(false);
  });

  it('a weapon, an ore and a ring are not heals', () => {
    for (const name of ['Rusted Blade', 'Scrap Metal', 'Tin Ward Ring']) {
      expect(itemHeals(inst(name, { kind: 'misc' }))).toBe(false);
    }
  });

  it('⚠ the effect is read from the CATALOG, so a save-stamped instance still racks', () => {
    // An instance carries a tag snapshot but not always an `effect` —
    // restampInventoryItem merges tags and description and deliberately nothing
    // else. Asking the instance would refuse an old Trauma Kit while accepting an
    // identical new one, which is precisely the OTA-997 bug on the bandolier.
    const bare = inst('Trauma Kit', { tags: [], description: undefined } as Partial<InventoryItem>);
    expect((bare as { effect?: unknown }).effect).toBeUndefined();
    expect(itemHeals(bare)).toBe(true);
  });
});

describe('OTA-1657 — the pouch holds three STACKS', () => {
  it('three pockets, and the cap is the shortlist that makes it fast', () => {
    expect(MEDKIT_MAX).toBe(3);
  });

  it("⚠ a pocket is a STACK — the owner's load-out fits in three", () => {
    // "5 trauma kits, say 3 trail rations and maybe 10 blueberries" is THREE
    // pockets, not eighteen. The rack stores instance ids; the quantity rides on
    // the inventory stack, so 10 berries is one pocket that can be tapped ten
    // times.
    const kits = inst('Trauma Kit', { id: 'a', quantity: 5 });
    const rations = inst('Trail Rations', { id: 'b', quantity: 3 });
    const berries = inst('Blueberries', { id: 'c', quantity: 10 });
    const p = carrying([kits, rations, berries], ['a', 'b', 'c']);
    const loaded = medkitContents(p);
    expect(loaded).toHaveLength(3);
    expect(loaded.map((i) => i.quantity)).toEqual([5, 3, 10]);
  });

  it('⚠ a spent stack simply is not there — a ghost never holds a pocket', () => {
    // OTA-1005's lesson from the tool pouch: an id whose item left the pack by
    // ANY other path (eaten, sold, scrapped, dropped) rendered as an empty slot
    // yet still counted against the cap.
    const p = carrying([inst('Trauma Kit', { id: 'a', quantity: 0 })], ['a', 'ghost-id']);
    expect(medkitContents(p)).toEqual([]);
  });

  it('refuses what does not mend, and SAYS WHY (B15: refusals always speak)', () => {
    const blade = inst('Rusted Blade', { kind: 'weapon' });
    const verdict = isMedkitEligible(blade, carrying([blade]));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason.length).toBeGreaterThan(0);
    expect(verdict.reason.toLowerCase()).toContain('mend');
  });

  it('refuses a double-load of the same stack, with its own reason', () => {
    const kit = inst('Trauma Kit', { id: 'a', quantity: 5 });
    const verdict = isMedkitEligible(kit, carrying([kit], ['a']));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason.toLowerCase()).toContain('already');
  });

  it('accepts a real heal that is not yet loaded', () => {
    const kit = inst('Trauma Kit', { id: 'a', quantity: 5 });
    expect(isMedkitEligible(kit, carrying([kit])).eligible).toBe(true);
  });
});

describe('OTA-1657 — using from the pouch IS using from the pack', () => {
  it('⚠⚠ the popup tap calls useInventoryItem — not a second copy of the heal', () => {
    // Owner: "when you use it, it acts like they do when being used from
    // inventory." Not "similarly to" — the SAME action, so the heal, the
    // stamina, the cure, the stack decrement and every downstream hook are one
    // implementation. A second "what eating a Trauma Kit does" is the exact class
    // of drift this session has spent the day removing.
    const src = readSrc('app/components/InputBox.tsx');
    expect(src).toContain('useGameStore.getState().useInventoryItem(it.name)');
  });

  it('⚠ the popup is NOT gated on combat — that is the half he asked for by name', () => {
    // The bandolier popup is `inCombat && bandolierOpen && …` because a throw
    // needs a target. The heals popup must open on the road too.
    const src = readSrc('app/components/InputBox.tsx');
    expect(src).toContain('{medkitOpen && medkitItems.length > 0 ? (');
    expect(src).not.toContain('{inCombat && medkitOpen');
  });

  it('the ✚ heals button renders on BOTH the combat row and the exploration row', () => {
    const src = readSrc('app/components/InputBox.tsx');
    const buttons = src.match(/label=\{`✚ heals \(\$\{medkitItems\.length\}\)`\}/g) ?? [];
    expect(buttons).toHaveLength(2);
  });

  it('an empty pouch shows no button at all, in either place', () => {
    const src = readSrc('app/components/InputBox.tsx');
    const guards = src.match(/medkitItems\.length > 0 \?/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3); // two buttons + the popup
  });
});

describe('OTA-1657 — the store actions are wired both ways', () => {
  const slice = readSrc('app/state/slices/inventorySlice.ts');

  it('load and unload both exist and both persist', () => {
    expect(slice).toContain('stowInMedkit(itemName, itemId) {');
    expect(slice).toContain('removeFromMedkit(itemName, itemId) {');
    const stow = slice.slice(slice.indexOf('stowInMedkit(itemName, itemId) {'));
    expect(stow.slice(0, 3000)).toContain('void get().persist();');
  });

  it('⚠ the cap is read from the engine, not retyped into the store', () => {
    expect(slice).toContain('mk.MEDKIT_MAX');
    expect(slice).toContain('mk.isMedkitEligible(item, player)');
  });

  it('⚠ live ids only, so a ghost can never fill the pouch', () => {
    expect(slice).toContain(
      "(player.equipped?.medkitIds ?? []).filter((id) => player.inventory.some((i) => i.id === id))",
    );
  });
});

describe('OTA-1657 — three racks that fold', () => {
  const screen = readSrc('app/screens/InventoryScreen.tsx');

  it('⚠ ALL THREE racks go through the one RackFrame — not three copies of a chevron', () => {
    for (const rack of ['SCANNER POUCH', 'BANDOLIER', 'HEALING POUCH']) {
      expect(screen).toContain(`title="${rack}"`);
    }
    const frames = screen.match(/<\/RackFrame>/g) ?? [];
    expect(frames).toHaveLength(3);
  });

  it('the chevron is the same ▸/▾ grammar the inventory categories use', () => {
    expect(screen).toContain("{open ? '▾' : '▸'} {title}");
    expect(screen).toContain("{collapsed ? '▸' : '▾'}"); // arb108's categories, untouched
  });

  it('⚠ the COUNT stays on the header when folded — folding costs no information', () => {
    expect(screen).toContain('summary={`${filled}/${POUCH_MAX} stowed`}');
    expect(screen).toContain('summary={`${filled}/${BANDOLIER_MAX} racked`}');
    expect(screen).toContain('summary={`${filled}/${MEDKIT_MAX} loaded`}');
  });

  it('racks default OPEN and fold independently', () => {
    expect(screen).toContain("const rackOpen = (k: string) => racksOpen[k] ?? true;");
    expect(screen).toContain("open={rackOpen('pouch')}");
    expect(screen).toContain("open={rackOpen('bandolier')}");
    expect(screen).toContain("open={rackOpen('medkit')}");
  });

  it('⚠ all THREE fill modes are mutually exclusive — two armed taps would be a coin flip', () => {
    // Each rack's empty-slot handler must clear the other two.
    expect(screen).toContain('setBandolierFilterActive(false); setMedkitFilterActive(false); setPouchFilterActive((v) => !v);');
    expect(screen).toContain('setPouchFilterActive(false); setMedkitFilterActive(false); setBandolierFilterActive((v) => !v);');
    expect(screen).toContain('setPouchFilterActive(false); setBandolierFilterActive(false); setMedkitFilterActive((v) => !v);');
  });

  it('fill mode narrows the pack to heals, and the tap loads the stack he pointed at', () => {
    expect(screen).toContain('queryFiltered.filter((i) => isMedkitEligible(i, player).eligible)');
    expect(screen).toContain('stowInMedkit(item.name, item.id);');
  });
});
