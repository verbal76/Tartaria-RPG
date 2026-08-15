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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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


// ⚠⚠ OTA-1307 — THE CONFIRM HAD NO CONFIRM BUTTON.
//
// Owner: *"the sell all common items… takes me to the warning and explanation
// screen. I hit OK which okay should have a highlighted outline not the dull one
// that it has. but even when I hit it it just takes me back to the same menu.
// doesn't sell anything."*
//
// The `buttons` chain in VendorScreen has a branch for every mode — dismiss,
// sell, steal, accept, buy — and none for `bulkSellCommonGear`, so it fell
// through to the terminal fallback: one neutral-tone OK wired to `cancel`. The
// dullness he noticed WAS the diagnosis (`tone: 'neutral'`), and cancel closes
// the modal without selling anything.
//
// ⚠ The selling logic was never missing — `confirmAction` has carried a complete
// bulkSellCommonGear branch since OTA-1232. It was simply unreachable. A title
// and a body were written for this mode and a button was not, so the feature
// looked whole from every angle except the one that does the work.
import { useGameStore } from '../app/state/gameStore';
import { planCommonGearSale } from '../app/engine/bulkSell';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const SCREEN = readFileSync(join(__dirname, '..', 'app', 'screens', 'VendorScreen.tsx'), 'utf8');

describe('OTA-1307 — sell-all-common actually sells', () => {
  it('⚠⚠ THE BUG: the bulk mode reaches a real confirm, not the dead OK fallback', () => {
    const i = SCREEN.indexOf('buttons={');
    expect(i).toBeGreaterThan(-1);
    const chain = SCREEN.slice(i, SCREEN.indexOf('onRequestClose={cancel}', i));
    // The mode must be answered by its OWN branch...
    expect(chain).toContain("pending?.mode === 'bulkSellCommonGear'");
    const branch = chain.slice(chain.indexOf("pending?.mode === 'bulkSellCommonGear'"));
    const upToNext = branch.slice(0, branch.indexOf(': pending?.mode ==='));
    // ...and that branch must call the thing that sells, not cancel.
    expect(upToNext).toContain('onPress: confirmAction');
    // ...with a primary-tone button — "highlighted, not the dull one".
    expect(upToNext).toContain("tone: 'primary'");
  });

  it('⚠ the terminal OK fallback still exists for modes that only acknowledge', () => {
    // Removing the fallback would be the wrong fix — it is correct for the
    // can't-afford case. The bug was reaching it, not having it.
    expect(SCREEN).toContain("[{ label: 'OK', onPress: cancel, tone: 'neutral' }]");
  });

  it('⚠⚠ and the plan the button commits to is the one that gets sold', () => {
    // The confirm re-plans at fire time; both the button label and the sale read
    // the same planner, so the number he taps is the number that leaves the pack.
    const gear = (name: string, id: string): { item: InventoryItem; price: number } => ({
      item: { id, name, kind: 'armor', rarity: 'Common', quantity: 1 } as InventoryItem,
      price: 7,
    });
    const sellable = [
      gear("Mud-Treader's Greaves", 'a'),
      gear('Aether-Runner Greaves', 'b'),
      { item: { id: 'c', name: 'Scrap Metal', kind: 'misc', rarity: 'Common', quantity: 4 } as InventoryItem, price: 2 },
    ];
    const plan = planCommonGearSale(sellable);
    // Gear only — the crafting stock is untouched, which is the whole boundary
    // the confirm body promises.
    expect(plan.rows.map((r) => r.item.name).sort()).toEqual(['Aether-Runner Greaves', "Mud-Treader's Greaves"]);
    expect(plan.count).toBe(2);
    expect(plan.total).toBe(14);
  });

  it('⚠ the button label carries the count and total the body promised', () => {
    // ⚠ Scope to the BUTTONS chain. `bulkSellCommonGear` appears in the title and
    // contextLine chains too, and a naive first-match reads those instead — the
    // mode was never missing from the screen, only from the buttons.
    const btns = SCREEN.slice(SCREEN.indexOf('buttons={'), SCREEN.indexOf('onRequestClose={cancel}', SCREEN.indexOf('buttons={')));
    const branch = btns.slice(btns.indexOf("pending?.mode === 'bulkSellCommonGear'"));
    const upToNext = branch.slice(0, branch.indexOf(': pending?.mode ==='));
    expect(upToNext).toContain('${pending.count}');
    expect(upToNext).toContain('${pending.total}');
  });
});
