/**
 * OTA-1874 (SURFACE) — THE TRADE IS READ BEFORE IT IS MADE.
 *
 * The companion suite (`ota1874TheDogYouChooseIsTheDogYouGet`) proves the
 * TRANSACTION. This one proves the SURFACE the owner's headline is actually
 * about:
 *
 *   "a one-active-companion system in which the player can deliberately replace
 *    a living dog AFTER SEEING EXACTLY WHAT IS BEING GAINED AND LOST."
 *
 * Four owner rules live on this card and each has its own section:
 *
 *   §G  EXACT CURRENT / MAXIMUM for both dogs — *"no vague 'high potential'
 *       abstraction"* — and a blank, not a zero, where there is no companion.
 *   §H  NO VERDICT — *"The UI must not call one dog 'better.' The player
 *       decides."* Pinned on the DATA as well as the words, because a row that
 *       carries no winner field cannot grow one by accident.
 *   §I  AFFORDABILITY IS VISIBLE, NEVER A DOOR. Short of the coin you can still
 *       open the card and read the animal; you simply cannot confirm.
 *   §J  WHAT IS LOST IS NAMED, AND CAN BE PREVENTED. The dog by name, the
 *       permanence, the vest — plus the UNEQUIP control, because being told a
 *       thing will be lost with no way to stop it is not a choice.
 *
 * ⚠ AND THE WHOLE CARD IS A READING SURFACE. §K opens it, scrolls it, unequips
 * inside it and walks away, then asserts the save is byte-identical apart from
 * the unequip the player asked for. Nothing else on this card may move a field.
 *
 * THE NEGATIVE CONTROLS RUN AGAINST THIS FILE. None was committed; production
 * was restored byte-identically (md5-verified) after every one.
 *
 *   NC-6  the card refuses to open when the player is broke ....... RED
 *   NC-7  the shown ceiling becomes a literal 30 .................. STAYED GREEN
 *   NC-7b same mutation, after the test was widened ............... RED
 *         -> §G's ceiling claim originally exercised ONLY a dog with no
 *            `potential`, where `dogStatCeiling` legitimately answers with the
 *            absolute engine maximum — so a hard-coded 30 agreed with it and
 *            the test agreed with a bug. It now pins a MIGRATED dog too, where
 *            the personal ceiling is strictly under 30.
 *   NC-8  a `better` flag is added to the comparison row .......... RED
 *   NC-9  `stealFromVendor`'s dog refusal is removed .............. STAYED GREEN
 *   NC-9b same mutation, after the test was widened ............... RED
 *         -> §L originally asserted only that the pack did not change. A FAILED
 *            steal roll leaves the pack alone too, so deleting the guard
 *            outright kept it green. It now requires the refusal LINE — which
 *            only the guard can produce — and that no dice were rolled at all.
 *
 * Two of five controls exposed a test that agreed with the mutation. Both were
 * widened before being accepted; neither production file was touched to make a
 * test pass.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
/* ⚠ `react-test-renderer` SHIPS NO BUNDLED TYPES IN THIS TREE, and adding
 * @types just to satisfy one import would put a dependency in package.json for
 * a test-only concern. The require is typed locally instead — narrowly, to the
 * surface this suite actually touches — so the test-typecheck ratchet stays at
 * baseline rather than growing to buy a convenience. This is the pattern
 * ota1233 / ota1236 / ota1243 / ota1836 already use, for the same reason. */
interface ReactTestInstance {
  readonly props: Record<string, any>;
  readonly children: ReadonlyArray<ReactTestInstance | string>;
  findAll(fn: (n: ReactTestInstance) => boolean, opts?: { deep?: boolean }): ReactTestInstance[];
}
interface ReactTestRenderer {
  readonly root: ReactTestInstance;
  unmount(): void;
  toJSON(): unknown;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RTR = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): ReactTestRenderer;
};
const act = RTR.act;
const create = RTR.create;
import { useGameStore, withReplacementDogOffer } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { createDogCompanion } from '../app/engine/dogCompanion';
import { DogComparisonModal } from '../app/components/DogComparisonModal';
import { comparisonRows } from '../app/engine/dogComparison';
import { rollProspectiveDog, ALL_DOG_BREEDS, type ProspectiveDog } from '../app/engine/dogBreeds';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';
import type { VendorInstance, VendorOffer } from '../app/engine/vendors';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));
jest.setTimeout(240000);

const VEST: InventoryItem = { id: 'vest_worn_1', name: 'Padded Dog Vest', kind: 'dog_armor', quantity: 1, tags: [] };
const SPARE: InventoryItem = { id: 'vest_spare_1', name: 'Padded Dog Vest', kind: 'dog_armor', quantity: 1, tags: [] };

/* ─────────────────────────── harness ─────────────────────────── */

/** ⚠ ALL rendered text, flattened as the PLAYER READS IT. A claim about what
 *  can be read is a claim about the whole card, not about one node the test
 *  happened to find.
 *
 *  ⚠⚠ JOINED WITH NOTHING, THEN WHITESPACE-COLLAPSED — and that is a
 *  correctness point, not tidiness. React splits one `<Text>` into a child per
 *  interpolation, so `Rocky is wearing the {vest}.` arrives as four strings
 *  whose own spacing is already correct. Joining them with a space invents gaps
 *  that are not on screen ("Rocky  is set free"), and every assertion about a
 *  sentence then fails against a card that renders perfectly. Collapsing runs
 *  afterwards folds the genuine line breaks between sibling Texts. */
function allText(node: ReactTestInstance | ReactTestRenderer): string {
  const root = (node as ReactTestRenderer).root ?? (node as ReactTestInstance);
  const out: string[] = [];
  const walk = (n: ReactTestInstance): void => {
    for (const c of n.children) {
      if (typeof c === 'string') out.push(c);
      else { walk(c); out.push(' '); }
    }
  };
  walk(root);
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** ⚠ PRESSABLES SORTED BY SHORTEST TRIMMED TEXT — the OTA-1873 lesson, and it
 *  is the same trap here: BrandedModal wraps its whole card in a
 *  TouchableWithoutFeedback scrim whose rendered text CONTAINS every button
 *  label, and it precedes the buttons in tree order. A naive find-by-text
 *  matches the scrim and silently cancels. */
function pressables(r: ReactTestRenderer): ReactTestInstance[] {
  return r.root
    .findAll((n: ReactTestInstance) => typeof n.props?.onPress === 'function' && !n.props?.disabled, { deep: true })
    .sort((a: ReactTestInstance, b: ReactTestInstance) => allText(a).trim().length - allText(b).trim().length);
}
function pressText(r: ReactTestRenderer, needle: string): void {
  const hit = pressables(r).find((n) => allText(n).toUpperCase().includes(needle.toUpperCase()));
  if (!hit) throw new Error(`no pressable containing "${needle}". Saw: ${pressables(r).map((n) => JSON.stringify(allText(n).trim().slice(0, 40))).join(', ')}`);
  act(() => { hit.props.onPress(); });
}

async function bootWithLivingDog(tc = 5000): Promise<void> {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const rocky = createDogCompanion({ name: 'Rocky', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: 0 });
  store.setState({
    player: {
      ...p0, tc, hoursElapsed: 412, inventory: [VEST, SPARE],
      dog: {
        ...rocky, loyalty: 97,
        stats: { strength: 17, dexterity: 12, intelligence: 11 },
        equipped: { vest: VEST.name, vestId: VEST.id },
      },
    } as PlayerCharacter,
    worldMemory: { ...store.getState().worldMemory, pendingDogOnboarding: null, releasedDogs: undefined },
  });
}

/** A fixed animal, so a claim about printed numbers is not a claim about dice. */
function fixedProspect(): ProspectiveDog {
  const collie = ALL_DOG_BREEDS.find((b) => b.id === 'border_collie')!;
  let i = 0;
  const seq = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.6, 0.4, 0.8, 0.15];
  return rollProspectiveDog(collie, () => seq[i++ % seq.length]!);
}

/** Mount the card the way VendorScreen does. Returns the renderer plus spies. */
function mountCard(over?: { tc?: number; dogless?: boolean }) {
  const dog = over?.dogless ? null : useGameStore.getState().player!.dog;
  const prospective = fixedProspect();
  const adopted: string[] = [];
  const unequips: number[] = [];
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <DogComparisonModal
        visible
        prospective={prospective}
        dog={dog}
        inventory={useGameStore.getState().player!.inventory}
        tc={over?.tc ?? useGameStore.getState().player!.tc}
        vendorName="Duvo Saltbeard"
        onUnequipVest={() => { unequips.push(1); useGameStore.getState().setDogVest(null); }}
        onAdopt={(id) => { adopted.push(id); }}
        onClose={() => {}}
      />,
    );
  });
  return { r, prospective, adopted, unequips };
}

/* ═════════════════ §G — exact current / maximum ═════════════════ */

describe('OTA-1874 §G - the card prints four numbers, not an abstraction', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('every stat shows now / max for BOTH dogs, as exact numbers', () => {
    const { r, prospective } = mountCard();
    const text = allText(r);
    const rows = comparisonRows(useGameStore.getState().player!.dog, prospective);
    for (const row of rows) {
      expect(row.current).not.toBeNull();
      // the player's dog, current over its own personal ceiling
      expect(text).toContain(`${row.current!.now} / ${row.current!.max}`);
      // and the animal on the shelf, the same shape
      expect(text).toContain(`${row.prospective.now} / ${row.prospective.max}`);
      expect(text).toContain(row.label);
    }
    // ⚠ NOT A BAND, NOT A WORD. The vocabulary the owner ruled out by name
    // must not appear anywhere on the card.
    expect(text.toLowerCase()).not.toMatch(/high potential|great potential|promising|untapped/);
  });

  it('WITH NO COMPANION the left column is BLANK, not zeros', () => {
    const { r } = mountCard({ dogless: true });
    const text = allText(r);
    expect(text).toContain('NO DOG');
    expect(text).toContain('none at your side');
    // ⚠ A ZERO IS A CLAIM ABOUT A DOG. There is no dog, so there is no claim:
    // three stat rows plus HP, all showing the em-dash placeholder.
    expect((text.match(/—/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(text).not.toContain('0 / 0');
  });

  it('the ceiling shown is the TRAINER\'s ceiling — PERSONAL, not the engine maximum', () => {
    /* ⚠ AMENDED AFTER A NEGATIVE CONTROL CAUGHT THIS TEST BEING WEAK. It
     *  originally checked only a dog with NO `potential` — the pre-migration
     *  shape — where `dogStatCeiling` falls back to the absolute engine
     *  maximum. Replacing the call with a literal 30 therefore changed nothing
     *  and the control stayed green: the test agreed with a bug.
     *
     *  Both cases are pinned now, and the MIGRATED one is the load-bearing
     *  half: a dog with a personal ceiling must be shown THAT, strictly under
     *  30, or the card promises development the trainer will refuse. */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DC = require('../app/engine/dogCompanion') as typeof import('../app/engine/dogCompanion');

    // (a) a dog that HAS a personal ceiling — Rocky's is the mongrel table's.
    const migrated = useGameStore.getState().player!.dog!;
    expect(migrated.potential).toBeTruthy();
    const rowsM = comparisonRows(migrated, fixedProspect());
    for (const row of rowsM) {
      expect(row.current!.max).toBe(DC.dogStatCeiling(migrated, row.stat));
      // ⚠ AND IT IS NOT THE ENGINE MAXIMUM. This is what the control needed.
      expect(row.current!.max).toBeLessThan(DC.dogAbsoluteMaxStat());
      expect(row.current!.max).toBe(migrated.potential![row.stat]);
    }

    // (b) a dog from before personal ceilings existed still reads the trainer.
    const st = useGameStore.getState();
    const legacy = { ...st.player!.dog! } as Record<string, unknown>;
    delete legacy.potential;
    useGameStore.setState({ player: { ...st.player!, dog: legacy } as unknown as PlayerCharacter });
    const rowsL = comparisonRows(useGameStore.getState().player!.dog, fixedProspect());
    for (const row of rowsL) {
      expect(row.current!.max).toBe(DC.dogStatCeiling(useGameStore.getState().player!.dog!, row.stat));
    }
  });
});

/* ═════════════════ §H — no verdict ═════════════════ */

describe('OTA-1874 §H - the card does not decide for the player', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('a comparison row carries NO field a renderer could turn into a verdict', () => {
    /* ⚠ THE STRONGEST FORM OF "no better/worse". Auditing the rendered words
     *  catches today's copy; auditing the DATA catches tomorrow's. The row has
     *  four numbers, a stat key and a label, and nothing else - no winner, no
     *  delta, no flag, no tone. */
    const rows = comparisonRows(useGameStore.getState().player!.dog, fixedProspect());
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['current', 'label', 'prospective', 'stat']);
      expect(Object.keys(row.current!).sort()).toEqual(['max', 'now']);
      expect(Object.keys(row.prospective).sort()).toEqual(['max', 'now']);
    }
  });

  it('and says nothing that ranks the two animals', () => {
    const text = allText(mountCard().r).toLowerCase();
    for (const word of ['better', 'worse', 'stronger', 'weaker', 'upgrade', 'downgrade', 'recommend', 'superior', 'inferior']) {
      expect(text).not.toContain(word);
    }
  });
});

/* ═════════════════ §I — affordability shows, never blocks ═════════════════ */

describe('OTA-1874 §I - being broke does not close the door on looking', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('short of the coin the card still READS, and says the shortfall', () => {
    const { r, prospective } = mountCard({ tc: 10 });
    const text = allText(r);
    // the animal is fully described...
    expect(text).toContain(prospective.trait);
    expect(text).toContain(`${prospective.price} TC`);
    // ...and the gap is stated in the player's own numbers
    expect(text).toContain(`${prospective.price - 10} short`);
    expect(text).toContain(`${prospective.price - 10} TC SHORT`);
  });

  it('and the irreversible confirmation cannot be reached from there', () => {
    const { r, adopted } = mountCard({ tc: 10 });
    pressText(r, 'SHORT');
    expect(allText(r)).not.toContain('LET GO AND TAKE ON');
    expect(adopted).toEqual([]);
  });

  it('with the coin, the confirm names the price, the dog and the permanence', () => {
    const { r, prospective } = mountCard();
    pressText(r, 'REPLACE ROCKY');
    const text = allText(r);
    expect(text).toContain('LET ROCKY GO?');
    expect(text).toContain(`${prospective.price} TC leaves your purse`);
    expect(text).toContain('permanently');
    expect(text).toContain('not a death');
    expect(text).toContain(VEST.name);
  });
});

/* ═════════════════ §J — the loss is named, and preventable ═════════════════ */

describe('OTA-1874 §J - the vest, and the control that keeps it', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('names the dog, the permanence and the exact piece of gear', () => {
    const text = allText(mountCard().r);
    expect(text).toContain('IF YOU TAKE THIS DOG');
    expect(text).toContain('Rocky is set free');
    expect(text).toContain('permanently, and alive');
    expect(text).toContain(`Rocky is wearing the ${VEST.name}`);
  });

  it('UNEQUIP takes it off, and the warning CHANGES under the player\'s hand', async () => {
    const { r, unequips } = mountCard();
    expect(allText(r)).toContain('TAKE THE PADDED DOG VEST OFF FIRST');
    pressText(r, 'TAKE THE PADDED DOG VEST OFF FIRST');
    await flush();
    expect(unequips).toEqual([1]);
    expect(useGameStore.getState().player!.dog!.equipped.vest).toBeNull();
    // ⚠ THE CARD RE-READS LIVE STATE. Re-render with the post-unequip player
    // and the warning must have become its own opposite.
    const after = mountCard();
    const text = allText(after.r);
    expect(text).toContain('Rocky is carrying nothing of yours');
    expect(text).not.toContain('It goes too.');
    // and the vest is STILL IN THE PACK - unequipping is not discarding
    expect(useGameStore.getState().player!.inventory.some((i) => i.id === VEST.id)).toBe(true);
  });

  it('the unequip goes through the store\'s ONE dog-equipment path', () => {
    /* ⚠ NOT A SECOND HAND-WRITTEN EQUIP. The inventory screen carried this
     *  logic inline; a copy on the comparison card is how two surfaces start
     *  disagreeing about what "equipped" means. Read comment-stripped so the
     *  note explaining the consolidation cannot satisfy the scanner. */
    const codeOnly = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const INV = codeOnly(src('app', 'screens', 'InventoryScreen.tsx'));
    expect(INV.includes('setDogVest')).toBe(true);           // self-test
    expect(INV).not.toMatch(/equipped:\s*\{\s*vest:/);       // no inline write left
    const CARD = codeOnly(src('app', 'components', 'DogComparisonModal.tsx'));
    expect(CARD).not.toMatch(/equipped:\s*\{\s*vest:/);
    expect(CARD.includes('useGameStore')).toBe(false);       // the card owns no store write at all
  });
});

/* ═════════════════ §K — the card is a reading surface ═════════════════ */

describe('OTA-1874 §K - looking costs nothing', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('open it, step into the confirm, step BACK out, and nothing has moved', () => {
    const before = JSON.stringify({
      p: useGameStore.getState().player,
      w: useGameStore.getState().worldMemory,
    });
    const { r, adopted } = mountCard();
    pressText(r, 'REPLACE ROCKY');
    pressText(r, 'BACK');
    expect(adopted).toEqual([]);
    expect(JSON.stringify({
      p: useGameStore.getState().player,
      w: useGameStore.getState().worldMemory,
    })).toBe(before);
  });

  it('the confirm hands over the OFFER ID, not the card\'s own copy of the dog', () => {
    /* ⚠ OWNER RULE 27, at the seam. The card holds a rolled animal; what it
     *  passes on is only its identity, so the store re-finds it on the live
     *  vendor and a refreshed stall makes the sale FAIL rather than silently
     *  hand over a different dog. */
    const { r, prospective, adopted } = mountCard();
    pressText(r, 'REPLACE ROCKY');
    pressText(r, 'LET GO AND TAKE ON');
    expect(adopted).toEqual([prospective.offerId]);
  });

  it('TWO TAPS on the final confirm dispatch ONCE', () => {
    // ⚠ THIS is the layer the OTA-1873 ref latch is for: the guard lives in
    // React state, which does not update inside the frame. (The store needs no
    // latch of its own - vendorSlice carries that measurement.)
    const { r, adopted } = mountCard();
    pressText(r, 'REPLACE ROCKY');
    const commit = pressables(r).find((n) => allText(n).toUpperCase().includes('LET GO AND TAKE ON'))!;
    act(() => { commit.props.onPress(); commit.props.onPress(); commit.props.onPress(); });
    expect(adopted.length).toBe(1);
  });
});

/* ═════════════════ §L — the shelf routes to the card ═════════════════ */

describe('OTA-1874 §L - a dog row is not an item row', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('a dog on the counter carries the rolled animal, and STEAL refuses it', async () => {
    const st = useGameStore.getState();
    const stall = {
      id: 'roadside_honest_test', name: 'Duvo Saltbeard', title: 'roadside trader',
      offers: [{ itemName: 'Rope', price: 10, quantity: 2 }],
    } as VendorInstance;
    const v = withReplacementDogOffer(stall, st.player!, st.worldMemory)!;
    useGameStore.setState({ currentScene: { ...st.currentScene!, vendor: v, enemies: [] } as never });
    const row = v.offers.find((o) => !!o.dog) as VendorOffer & { dog: ProspectiveDog };
    expect(row.dog.offerId).toBeTruthy();

    /* ⚠⚠ A REAL HOLE THIS PACKAGE OPENED, AND CLOSED. `buyFromVendor` has
     *  asked the dog lookup before the catalog since OTA-1726; `stealFromVendor`
     *  never did. It was not reachable in practice while the dog row was hidden
     *  from anyone who owned a dog — the companion market puts one on every
     *  eligible counter, so `steal <breed>` became a broad way to drop a living
     *  animal into the pack as bare 'misc'. */
    /* ⚠⚠ AMENDED AFTER A NEGATIVE CONTROL CAUGHT THIS TEST BEING WEAK. It
     *  asserted only that the pack did not change — but a FAILED steal roll
     *  leaves the pack alone too, so deleting the guard entirely kept it green.
     *  The claim has to be that the REFUSAL was reached, which only the guard
     *  can produce, and the roll never happened. */
    const logLen = useGameStore.getState().gameLog.length;
    const invBefore = JSON.stringify(useGameStore.getState().player!.inventory);
    useGameStore.getState().stealFromVendor(row.itemName);
    await flush();
    const added = useGameStore.getState().gameLog.slice(logLen).map((l) => l.text).join(' ');
    expect(added).toContain('It is an animal');
    // ⚠ AND NO ROLL WAS MADE. A steal that got as far as the dice would say so,
    // win or lose; the refusal happens before the vendor is even alerted.
    expect(added).not.toMatch(/d20|caught|lifted|slip(?:ped)? it/i);
    expect(JSON.stringify(useGameStore.getState().player!.inventory)).toBe(invBefore);
    expect(useGameStore.getState().player!.inventory.some((i) => i.name === row.itemName)).toBe(false);
  });

  it('the vendor screen opens the COMPARISON card for a dog row, not the buy sheet', () => {
    // A source claim, and a narrow one: the press handler must fork on the row
    // carrying an animal. Comment-stripped, so the note above it cannot pass.
    const codeOnly = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const V = codeOnly(src('app', 'screens', 'VendorScreen.tsx'));
    expect(V).toContain('o.dog ? setDogOnCounter(o.dog) : openBuy(');
    expect(V).toContain('<DogComparisonModal');
    // and STEAL is not offered on it
    expect(V).toContain('!tutorialDemoVendor && !o.dog');
  });
});
