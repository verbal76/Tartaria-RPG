jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({}));

import { tickDogStatus, DOG_BLEED_OUT_HOURS } from '../app/state/gameStore';
import type { GameStore } from '../app/state/gameStore';
import type { DogCompanion } from '../app/engine/types';

// Poplar Anvil — the dog can now permanently leave you two ways, both of
// which make the previously-unreachable puppy-vendor / rubble-puppy arc
// fire (puppyVendorOwed):
//   1. Bleed-out — benched at 0 HP for >= DOG_BLEED_OUT_HOURS.
//   2. Abandonment — loyalty decays to 0.
// These tests drive the exported reconciler against a mock store.

function makeDog(over: Partial<DogCompanion> = {}): DogCompanion {
  return {
    id: 'dog1', name: 'Rocky', breed: 'mutt',
    sex: { raw: 'male', pronoun: 'he' },
    startingProfile: 'mongrel',
    hp: 12, hpMax: 12,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80, lastFedAtHour: 0,
    equipped: { vest: null },
    status: 'with_player',
    ...over,
  };
}

function harness(dog: DogCompanion, hoursElapsed: number, wm: Partial<{ puppyVendorOwed: boolean; puppyVendorUsed: boolean; puppyVendorQueued: boolean }> = {}) {
  const logs: Array<{ ch: string; msg: string }> = [];
  let state: any = {
    player: { hoursElapsed, dog },
    worldMemory: { puppyVendorOwed: false, puppyVendorUsed: false, puppyVendorQueued: false, ...wm },
    appendLog: (ch: string, msg: string) => logs.push({ ch, msg }),
    persist: () => Promise.resolve(),
  };
  const get = () => state as GameStore;
  const set = (fn: (s: GameStore) => Partial<GameStore>) => { state = { ...state, ...fn(state) }; };
  return {
    get, set, logs,
    dog: () => get().player!.dog as DogCompanion,
    wm: () => get().worldMemory as any,
    text: () => logs.map((l) => l.msg).join('\n'),
  };
}

describe('tickDogStatus — bleed-out', () => {
  it('a dog benched at 0 HP past the window dies and owes a replacement puppy', () => {
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 0 }), DOG_BLEED_OUT_HOURS);
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('dead');
    expect(h.wm().puppyVendorOwed).toBe(true);
    expect(h.text()).toMatch(/gone/i);
  });

  it('inside the window it does NOT die yet', () => {
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 0 }), DOG_BLEED_OUT_HOURS - 1);
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('waiting_at_base');
    expect(h.wm().puppyVendorOwed).toBe(false);
  });

  it('fires a single mid-window "feed him or lose him" Arbiter reminder', () => {
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 0 }), DOG_BLEED_OUT_HOURS / 2);
    tickDogStatus(h.get, h.set);
    expect(h.dog().bleedWarned).toBe(true);
    expect(h.text()).toMatch(/gone for good/i); // OTA-915 — staged bleed-out warning text
    // A second tick at the same time must not re-fire the reminder.
    const before = h.logs.length;
    tickDogStatus(h.get, h.set);
    expect(h.logs.length).toBe(before);
  });

  it('a benched 0-HP dog with no stamp starts the clock instead of dying retroactively', () => {
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 0, downedAtHour: undefined }), 999);
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('waiting_at_base');
    expect(h.dog().downedAtHour).toBe(999);
  });

  it('healing the dog back up clears the bleed-out stamp', () => {
    const h = harness(makeDog({ status: 'with_player', hp: 8, downedAtHour: 3, bleedWarned: true }), 10);
    tickDogStatus(h.get, h.set);
    expect(h.dog().downedAtHour).toBeUndefined();
    expect(h.dog().bleedWarned).toBe(false);
  });

  it('respects an already-used puppy vendor (death still happens, flag not re-owed)', () => {
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 0 }), DOG_BLEED_OUT_HOURS, { puppyVendorUsed: true });
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('dead');
    expect(h.wm().puppyVendorOwed).toBe(false);
  });
});

describe('tickDogStatus — loyalty', () => {
  it('a dog at 0 loyalty abandons you, and owes you nothing', () => {
    // ⚠⚠ OTA-1717 — THIS USED TO ASSERT `puppyVendorOwed === true`, and the
    // repo held BOTH answers at once: dogHungerTimingChaos asserted "no
    // bail-out" (the OTA-124 rule, enforced by dogThresholdCheck) while this and
    // puppyVendorEdges asserted the opposite (the Poplar Anvil rule, written
    // into tickDogStatus). Both shipped. Neither noticed the other, and because
    // dogThresholdCheck ran first and synchronously, the newer rule never
    // reached a single player — it was dead on this path from the day it landed.
    // The owner settled it: the owed puppy was a one-time repair for an earlier
    // broken OTA, and neglect must not pay. So the surviving system owes nothing
    // here, which is also exactly what players have always experienced.
    const h = harness(makeDog({ loyalty: 0 }), 100);
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('abandoned');
    expect(h.wm().puppyVendorOwed).toBe(false);
    expect(h.text()).toMatch(/road is empty/i);
  });

  it('fires escalating 50/30/15 warning beats, once each', () => {
    let dog = makeDog({ loyalty: 50 });
    let h = harness(dog, 100);
    tickDogStatus(h.get, h.set);
    expect(h.dog().loyaltyBeatFloor).toBe(50);
    expect(h.logs.length).toBe(1);
    // Same band again — no duplicate.
    tickDogStatus(h.get, h.set);
    expect(h.logs.length).toBe(1);

    // Drop to 30 band.
    h = harness(makeDog({ loyalty: 30, loyaltyBeatFloor: 50 }), 100);
    tickDogStatus(h.get, h.set);
    expect(h.dog().loyaltyBeatFloor).toBe(30);
    expect(h.logs.length).toBe(1);

    // Drop to 15 band.
    h = harness(makeDog({ loyalty: 15, loyaltyBeatFloor: 30 }), 100);
    tickDogStatus(h.get, h.set);
    expect(h.dog().loyaltyBeatFloor).toBe(15);
  });

  it('a dead/abandoned dog is inert (no further ticks)', () => {
    const h = harness(makeDog({ status: 'dead', loyalty: 0 }), 100);
    tickDogStatus(h.get, h.set);
    expect(h.logs.length).toBe(0);
    expect(h.wm().puppyVendorOwed).toBe(false);
  });
});
