// OTA-1099 — GROUP SELL: HOLD TO PICK, TAP TO ADD, SELL THE LOT.
//
// Owner: "if I want to have a hold to start multiple select so I can hold on an
// item and it gets a check mark then I tap to add others to that group and sell
// a group let's make that happen."
//
// The standard mobile pattern, and the reason it works is that the LONG-PRESS
// is the mode switch: a plain tap keeps meaning "sell this one" until you have
// declared otherwise, so nothing changes for a player who never holds a row.
//
// What this suite guards is the part a bulk action gets wrong if nobody is
// watching:
//   · the CHA rule — a bulk sale is ONE negotiation, so ten items sold together
//     must not pay ten times the social XP of ten sold apart;
//   · the WARNINGS — the gate-loss and loadout callouts the single-item confirm
//     raises must survive into the group confirm, or the group flow quietly does
//     what one sale would have stopped to ask about;
//   · the SELECTION is derived, never stored — a picked row that stops being
//     sellable falls out of the group instead of lingering as a dead id.

jest.setTimeout(20000);

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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const view = src('app/screens/VendorScreen.tsx');

describe('OTA-1099 — hold to pick, tap to add', () => {
  it('LONG-PRESS starts the group; a plain tap outside the mode still sells one', () => {
    // The load-bearing detail: a player who never holds a row sees no change at
    // all. The tap handler must branch on the mode, not replace the old action.
    expect(view).toContain('onPress={() => (sellSelectMode ? toggleSellSelect(item.id) : openSell(item.name, price, item.id))}');
    expect(view).toContain('onLongPress={() => (sellSelectMode ? toggleSellSelect(item.id) : beginSellSelect(item.id))}');
    expect(view).toContain('const beginSellSelect = (id: string) => { setSellSelectMode(true); setSellSelected([id]); };');
  });

  it('a picked row is ticked AND outlined, and reads as a checkbox', () => {
    expect(view).toContain("sellSelected.includes(item.id) && styles.offerRowPicked");
    expect(view).toContain("sellSelected.includes(item.id) ? '☑ ' : '☐ '");
    expect(view).toContain("accessibilityRole={sellSelectMode ? 'checkbox' : 'button'}");
  });

  it('emptying the group leaves the mode, so you are never parked on a bar that says 0', () => {
    expect(view).toContain('if (next.length === 0) setSellSelectMode(false);');
  });

  it('leaving the SELL tab ends the group — no hidden selection waiting on return', () => {
    expect(view).toContain("onPress={() => { exitSellSelect(); setMode('buy'); }}");
  });

  // OTA-1101 — RETARGETED. The bar was `{sellSelectMode && (…)}` inside the
  // scrolling list; it is now `{sellSelectMode ? (bar) : (tabRow)}` in the tab
  // row's slot. What this test guards — the bar exists only while a group does,
  // and states the pay-out up front — is unchanged; the placement assertion
  // moved to the anchoring test below.
  it('the bar only exists while a group does, and states the pay-out up front', () => {
    expect(view).toContain('{sellSelectMode ? (');
    expect(view).toContain('+{selectedTotal} TC');
    expect(view).toContain('SELL GROUP');
  });

  // OTA-1101 — owner: "the new line that says sell group needs to stay anchored
  // at the top and replace the buy sell buttons until, you either sell the group
  // or cancel the group."
  it('⚠ the bar is ANCHORED above the scroll and REPLACES the BUY/SELL tabs', () => {
    // Anchoring is structural, not cosmetic: the tab row sits OUTSIDE the
    // ScrollView, so occupying its slot is what stops the bar scrolling away
    // while you tick rows further down — exactly when the running total matters.
    const barAt = view.indexOf('{sellSelectMode ? (');
    const scrollAt = view.indexOf('<ScrollView style={styles.list}');
    expect(barAt).toBeGreaterThan(-1);
    expect(scrollAt).toBeGreaterThan(-1);
    expect(barAt).toBeLessThan(scrollAt);
    // It REPLACES rather than stacks — the tab row is the else branch, so BUY is
    // not even rendered while a group is open. The only two ways out are the two
    // the bar offers, which is what makes the mode honest.
    const branch = view.slice(barAt, scrollAt);
    expect(branch).toContain('SELL GROUP');
    expect(branch).toMatch(/\) : \(\s*<View style=\{styles\.tabRow\}>/);
    // …and the bar no longer lives inside the list it used to scroll with.
    const listBody = view.slice(scrollAt);
    expect(listBody).not.toContain('SELL GROUP');
  });
});

describe('OTA-1099 — the group sells honestly', () => {
  // ⚠ OTA-1481 REBUILT ALL THREE OF THESE. They quoted the per-unit loop's exact
  // source ('for (let i = 0; i < p.qty; i++)', 'let unit = 0') — and that loop
  // WAS the 2355ms stall the owner's 155-coin sell produced: one full persist,
  // one disk-logged line and three set()s per unit. The claims below are the
  // same claims the old pins meant; they are just stated against the batched
  // shape (one sellToVendor call per ROW, the stack riding in `units`), and
  // where possible against a rule rather than a spelling.
  const groupFn = () => view.slice(
    view.indexOf('const doGroupSell = ()'),
    view.indexOf('const doGroupSell = ()') + 1400,
  );

  it('⚠ ONE NEGOTIATION — only the FIRST row across the WHOLE group is social', () => {
    // OTA-727 made a stack sale one negotiation. A group sale is the same beat at
    // a larger scale: if every row were social, selling ten things together
    // would farm ten times the Charisma of selling them one at a time — a brand
    // new exploit introduced by a convenience feature.
    const fn = groupFn();
    expect(fn).toMatch(/social:\s*idx === 0/);
    // Exactly ONE sell call in the group path — the per-unit inner loop must not
    // come back, because it multiplies persists by stack size again.
    expect((fn.match(/sellToVendor\(/g) ?? []).length).toBe(1);
    expect(fn).not.toMatch(/for \(let i = 0; i < p\.qty/);
  });

  it('WHOLE stacks move, matching what the row and the total say', () => {
    const fn = groupFn();
    expect(fn).toContain('qty: r.item.quantity ?? 1');
    // The stack rides in `units` on the single call — the slice clamps it to the
    // live quantity, so the row count and the moved count cannot disagree.
    expect(fn).toMatch(/units:\s*p\.qty/);
    // …and the total the bar shows is priced the same way, so the number the
    // player agreed to is the number they get.
    expect(view).toContain('selectedRows.reduce((n, r) => n + r.price * (r.item.quantity ?? 1), 0)');
  });

  it('the plan is SNAPSHOT before the first sale mutates the list it came from', () => {
    const fn = groupFn();
    const planAt = fn.search(/const plan = selectedRows\.map\(/);
    expect(planAt).toBeGreaterThan(-1);
    // Every read after the snapshot is of `plan`; the sale iteration never
    // touches `selectedRows`, which is re-derived per render and mutates under
    // the first set().
    const afterPlan = fn.slice(planAt + 'const plan = selectedRows.map('.length);
    expect(afterPlan).toMatch(/plan\.forEach|for \(const p of plan\)/);
    expect(afterPlan).not.toMatch(/sellToVendor\([^)]*selectedRows/);
  });

  it('⚠ the group confirm carries the SAME warnings the single-item confirm raises', () => {
    // The real risk of any bulk action: it quietly does what one action would
    // have stopped to ask about. Gate loss (your last climbing strap) and
    // loadout membership (racked in the bandolier / pouch) both survive.
    expect(view).toContain('const selectedGateLosses = selectedRows');
    expect(view).toContain('gateLossFor(r.item.name)');
    expect(view).toContain('const selectedLoadout = selectedRows');
    expect(view).toContain('bandolierIds.has(r.item.id) || toolPouchIds.has(r.item.id)');
    // …and they reach the modal, tinting the confirm button destructive.
    expect(view).toContain('This is your last way to');
    expect(view).toContain('Part of your working loadout');
    expect(view).toContain("selectedGateLosses.length > 0 ? ('destructive' as const) : ('primary' as const)");
  });

  it('the group confirm itemises what is going, so SELL is never a blind tap', () => {
    expect(view).toContain('.map((r) => `· ${r.item.name}');
    expect(view).toContain('visible={groupSellConfirm}');
  });

  it('selection is DERIVED from the live sell list, never stored as rows', () => {
    // A picked row that stops being sellable (sold, dropped, equipped) must fall
    // out of the group rather than linger as an id the SELL button skips while
    // the count still claims it.
    expect(view).toContain('const sellableById = new Map(sellable.map((row) => [row.item.id, row]));');
    expect(view).toContain('const selectedRows = sellSelected');
    expect(view).toContain('.map((id) => sellableById.get(id))');
    expect(view).toContain('.filter((r): r is NonNullable<typeof r> => !!r);');
  });

  it('a completed group sale clears the selection AND the mode', () => {
    const fn = view.slice(view.indexOf('const doGroupSell = ()'), view.indexOf('const doGroupSell = ()') + 1400);
    expect(fn).toContain('setGroupSellConfirm(false);');
    expect(fn).toContain('exitSellSelect();');
  });

  it('the equipped-gear exclusion is untouched — a group can never sell what you are wearing', () => {
    // The group is built from `sellable`, which already excludes equipped
    // instances and unsellables. This asserts the group did not get its own
    // parallel source that could drift from that rule.
    expect(view).toContain('!equippedItemIds.has(i.id) && !isUnsellable(i)');
    expect(view).not.toMatch(/selectedRows\s*=\s*player\.inventory/);
  });
});
