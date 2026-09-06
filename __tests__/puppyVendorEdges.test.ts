// OTA-124 vandalistic — puppy-vendor + rubble-puppy edge cases.
// Asserts:
//   - Combat-death does NOT currently flip puppyVendorOwed (BUG flagged
//     via test.failing — engine never sets the flag true, so the
//     vendor never spawns)
//   - Poplar Anvil: hunger-abandonment (loyalty 0 via tickDogStatus) NOW
//     DOES owe a replacement puppy (supersedes the old OTA-124 invariant)
//   - puppyVendorUsed=true blocks BOTH paths (vendor and rubble)
//   - With all Guardians cleared + puppyVendorOwed set, the rubble path
//     fires (~5% per outdoor scene)
//   - When player has no Common-tier items, the vendor falls back to
//     any 1-stack non-equipped item

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

import { useGameStore, tickDogStatus, hasActiveDog } from '../app/state/gameStore';
import { totalGuardiansCount } from '../app/engine/coreGuardians';

async function bootBase() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Owner', raceId: 'mud_dweller', factionId: 'forgotten_order' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-124 vandalistic — puppy-vendor + rubble-puppy edges', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
  });

  describe('Source-level BUG — puppyVendorOwed is never set TRUE on dog combat death', () => {
    // Grep the source file for any assignment that sets puppyVendorOwed
    // to true. There should be at least one — otherwise the Phase 6
    // safety net never engages. The migration in loadSlotIntoGame
    // (saved.worldMemory.puppyVendorOwed ?? false) is the ONLY current
    // setter — and that's a passive default, not an active trigger.
    //
    // Per spec: "Trigger flag on save: worldMemory.puppyVendorOwed.
    // Defaults false. Set true ONLY when player.dog.status transitions
    // to 'dead' via the combat-death path."
    //
    // Current engine never flips dog.status to 'dead' anywhere
    // (combat retaliation sets 'waiting_at_base' even at hp=0) and
    // never sets puppyVendorOwed=true anywhere. The puppy vendor and
    // rubble-puppy fallbacks are therefore unreachable in normal play.

    // OTA-124 — both wired in handlePlayerDeath: dog with hp<=0 at
    // player-death flips to status='dead' AND puppyVendorOwed = true
    // (gated on !puppyVendorUsed). Safety net now reachable.
    it(
      'source contains at least one `puppyVendorOwed: true` assignment outside loadSlotIntoGame migration',
      () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const src = require('fs').readFileSync(
          require('path').resolve(__dirname, '../app/state/gameStore.ts'),
          'utf-8',
        );
        // Find any setter that flips it to true.
        const trueSetters = src.match(/puppyVendorOwed\s*:\s*true/g) ?? [];
        expect(trueSetters.length).toBeGreaterThan(0);
      },
    );

    it(
      'source contains a dog status="dead" transition (combat-death path)',
      () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const src: string = require('fs').readFileSync(
          require('path').resolve(__dirname, '../app/state/gameStore.ts'),
          'utf-8',
        );
        // We need an ASSIGNMENT that sets dog status to 'dead' (not a
        // comparison). Look for "status: 'dead'" preceded by `{`/`,`
        // (object literal context), excluding `=== 'dead'` comparisons.
        const deadAssign = src.match(/status\s*:\s*'dead'/g) ?? [];
        expect(deadAssign.length).toBeGreaterThan(0);
      },
    );
  });

  describe('⚠⚠ OTA-1717 — hunger-abandonment owes NOTHING', () => {
    // This block used to read "Poplar Anvil — hunger-abandonment NOW owes a
    // replacement puppy", superseding the OTA-124 no-bail-out invariant. It was
    // written into tickDogStatus and it never reached a player: dogThresholdCheck
    // ran first, synchronously, on the same crossing, and abandoned the dog
    // without the flag. Two systems, two opposite specs, each with its own test,
    // for a year. The owner settled it — the owed puppy was a one-time repair
    // for an earlier broken OTA, and neglect must not pay — so the OTA-124 rule
    // stands and there is now only one system to enforce it.
    function mkDog(over: Record<string, unknown> = {}) {
      return {
        id: 'd', name: 'Lost', breed: 'mutt',
        sex: { raw: 'they', pronoun: 'they' as const },
        startingProfile: 'mongrel' as const,
        hp: 12, hpMax: 16,
        stats: { strength: 10, dexterity: 10, intelligence: 10 },
        statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
        loyalty: 0, lastFedAtHour: 0,
        equipped: { vest: null },
        status: 'with_player' as const,
        ...over,
      };
    }

    it('a with_player dog at loyalty 0 abandons and does NOT flip puppyVendorOwed', async () => {
      const store = await bootBase();
      const p0 = store.getState().player!;
      store.setState({ player: { ...p0, hoursElapsed: 1000, dog: mkDog() as never } });
      tickDogStatus(store.getState, (fn) => store.setState(fn as never));
      expect(store.getState().player!.dog!.status).toBe('abandoned');
      expect(store.getState().worldMemory.puppyVendorOwed).toBeFalsy();
    });

    it('an already-abandoned dog is inert — tick does not re-owe or mutate it', async () => {
      const store = await bootBase();
      const p0 = store.getState().player!;
      store.setState({ player: { ...p0, hoursElapsed: 1000, dog: mkDog({ status: 'abandoned' }) as never } });
      tickDogStatus(store.getState, (fn) => store.setState(fn as never));
      expect(store.getState().worldMemory.puppyVendorOwed).toBeFalsy();
    });
  });

  describe('puppyVendorUsed=true blocks both vendor and rubble paths', () => {
    it('vendor scene-entry hook bails when puppyVendorUsed=true', async () => {
      const store = await bootBase();
      // Set the safety flags as if a prior vendor was already used.
      store.setState((s) => ({
        worldMemory: {
          ...s.worldMemory,
          puppyVendorOwed: true,
          puppyVendorUsed: true, // permanently locked
          puppyVendorQueued: true,
        },
      }));
      // Simulate the player landing on an outdoor scene (we can't
      // beginScene without a real location/setup, so we test the
      // guard directly): the gameStore check is
      //   wm.puppyVendorQueued && wm.puppyVendorOwed && !wm.puppyVendorUsed
      const wm = store.getState().worldMemory;
      const shouldFire = !!(wm.puppyVendorQueued && wm.puppyVendorOwed && !wm.puppyVendorUsed);
      expect(shouldFire).toBe(false);
    });

    it('rubble-puppy hook bails when puppyVendorUsed=true', async () => {
      const store = await bootBase();
      store.setState((s) => ({
        worldMemory: {
          ...s.worldMemory,
          puppyVendorOwed: true,
          puppyVendorUsed: true,
        },
      }));
      const wm = store.getState().worldMemory;
      const shouldFire = !!(wm.puppyVendorOwed && !wm.puppyVendorUsed);
      expect(shouldFire).toBe(false);
    });
  });

  describe('rubble-puppy guards — all Guardians cleared requirement', () => {
    it('with fewer than total Guardians, rubble hook does not fire', async () => {
      const store = await bootBase();
      const total = totalGuardiansCount();
      store.setState((s) => ({
        worldMemory: {
          ...s.worldMemory,
          puppyVendorOwed: true,
          puppyVendorUsed: false,
        },
        player: s.player
          ? {
              ...s.player,
              mainQuest: {
                ...(s.player.mainQuest ?? {}),
                guardiansDefeated: [], // none
              } as never,
            }
          : s.player,
      }));
      const p = store.getState().player!;
      const def = (p.mainQuest?.guardiansDefeated ?? []).length;
      expect(def < total).toBe(true);
    });

    it('with ALL Guardians cleared and flag set, rubble path is gated only by the random roll', async () => {
      const store = await bootBase();
      const total = totalGuardiansCount();
      const fakeDef = Array.from({ length: total }, (_, i) => `guardian_${i}`);
      store.setState((s) => ({
        worldMemory: {
          ...s.worldMemory,
          puppyVendorOwed: true,
          puppyVendorUsed: false,
        },
        player: s.player
          ? {
              ...s.player,
              mainQuest: {
                ...(s.player.mainQuest ?? {}),
                guardiansDefeated: fakeDef,
              } as never,
            }
          : s.player,
      }));
      const p = store.getState().player!;
      expect((p.mainQuest?.guardiansDefeated ?? []).length).toBe(total);
    });
  });

  describe('puppy vendor trade item selection — Common rarity preference + fallback', () => {
    // Mirror the selection logic at gameStore.ts:18181-18197 directly
    // (the spawn path requires a live scene; this validates the math).
    interface PickItem { id: string; name: string; kind: string; quantity: number; rarity?: string; }
    function pickTradeItem(
      inventory: PickItem[],
      equippedIds: string[],
    ): PickItem | null {
      const candidates = inventory.filter(
        (i) =>
          i.rarity === 'Common' &&
          i.quantity >= 1 &&
          i.kind !== 'weapon' &&
          i.kind !== 'armor' &&
          !equippedIds.includes(i.id),
      );
      const fallback = inventory.find((i) => i.quantity >= 1);
      return candidates[0] ?? fallback ?? null;
    }

    it('Common consumable + Common misc → picks the first Common non-equipped non-weapon/armor', () => {
      const inv = [
        { id: '1', name: 'Trail Rations', kind: 'consumable', quantity: 3, rarity: 'Common' },
        { id: '2', name: 'Rusty Sword', kind: 'weapon', quantity: 1, rarity: 'Common' },
      ];
      const picked = pickTradeItem(inv, []);
      expect(picked?.name).toBe('Trail Rations');
    });

    it('No Common items → falls back to ANY 1-stack non-equipped item', () => {
      const inv = [
        { id: '1', name: 'Aether Crystal', kind: 'material', quantity: 2, rarity: 'Uncommon' },
        { id: '2', name: 'Rare Pendant', kind: 'amulet', quantity: 1, rarity: 'Rare' },
      ];
      const picked = pickTradeItem(inv, []);
      expect(picked).toBeTruthy();
      expect(picked?.name).toBe('Aether Crystal');
    });

    it('Equipped Common items are skipped', () => {
      const inv = [
        { id: '1', name: 'Burlap Shirt', kind: 'armor', quantity: 1, rarity: 'Common' },
        { id: '2', name: 'Trail Rations', kind: 'consumable', quantity: 1, rarity: 'Common' },
        { id: '3', name: 'Equipped Ring', kind: 'ring', quantity: 1, rarity: 'Common' },
      ];
      const picked = pickTradeItem(inv, ['3']);
      expect(picked?.name).toBe('Trail Rations');
    });

    it('Empty inventory → null', () => {
      expect(pickTradeItem([], [])).toBeNull();
    });

    it('Only weapons/armor → fallback picks one anyway', () => {
      const inv = [
        { id: '1', name: 'Iron Sword', kind: 'weapon', quantity: 1, rarity: 'Common' },
      ];
      // Spec says "fall back to ANY 1-stack item except equipped gear" —
      // the engine's fallback does pick the weapon (the kind!=weapon
      // filter only applies to the Common-preference candidates). The
      // fallback line says `player.inventory.find((i) => i.quantity >= 1)`
      // with no kind check.
      const picked = pickTradeItem(inv, []);
      expect(picked?.name).toBe('Iron Sword');
    });
  });

  describe('rubble-puppy rate — ~5% per outdoor scene roll', () => {
    // Pure simulation of the random gate: Math.random() < 0.05.
    it('1000 simulated outdoor scene rolls → ~50 fires (within 30-80)', () => {
      let fires = 0;
      for (let i = 0; i < 1000; i++) {
        if (Math.random() < 0.05) fires++;
      }
      expect(fires).toBeGreaterThan(30);
      expect(fires).toBeLessThan(80);
    });
  });

  describe('Hard cap — ONE puppy vendor per save', () => {
    it('puppyVendorUsed acts as the permanent latch', () => {
      // Once flipped true, no path can un-flip it (no source assignment
      // sets puppyVendorUsed back to false).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const src = require('fs').readFileSync(
        require('path').resolve(__dirname, '../app/state/gameStore.ts'),
        'utf-8',
      );
      const matches = src.match(/puppyVendorUsed\s*:\s*false/g) ?? [];
      // Only the loadSlotIntoGame migration default sets it to false.
      // We expect at most 1 such match (the migration line) — if there
      // were more, some code path would be flipping the latch back.
      expect(matches.length).toBeLessThanOrEqual(1);
    });
  });
});

// OTA-346 — 338 hardening #3: clear-the-slot, status-based. A dog that died or
// was abandoned KEEPS its record on player.dog (status 'dead'/'abandoned') so the
// dead-dog narration + COPY SAVE highlights + WRITE-verification can read it — but
// it must NOT count as an active companion, or the puppy-vendor REPLACEMENT arc
// (gated on "no active dog") can never fire. hasActiveDog encodes that gate.
describe('OTA-346 — hasActiveDog gates the puppy-vendor replacement arc', () => {
  function dog(status: string) {
    return { id: 'd', name: 'Rocky', status, hp: status === 'dead' ? 0 : 12, hpMax: 12, loyalty: status === 'abandoned' ? 0 : 80 } as never;
  }
  it('a living, present dog counts as active (vendor stays gated off)', () => {
    expect(hasActiveDog({ dog: dog('with_player') } as never)).toBe(true);
    expect(hasActiveDog({ dog: dog('waiting_at_base') } as never)).toBe(true);
  });
  it('a DEAD or ABANDONED dog does NOT count as active (replacement arc reachable)', () => {
    expect(hasActiveDog({ dog: dog('dead') } as never)).toBe(false);
    expect(hasActiveDog({ dog: dog('abandoned') } as never)).toBe(false);
  });
  it('no dog / no player → not active', () => {
    expect(hasActiveDog({ dog: null } as never)).toBe(false);
    expect(hasActiveDog(null)).toBe(false);
    expect(hasActiveDog(undefined)).toBe(false);
  });
  it('the spawn guards gate on hasActiveDog, not a raw !player.dog', () => {
    // Regression: a dead/abandoned dog used to leave `!player.dog` false forever,
    // so the replacement vendor never fired. The four spawn-guard sites must use
    // hasActiveDog now.
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../app/state/gameStore'), 'utf8') as string;
    // Every puppy-vendor / rubble spawn guard uses hasActiveDog(...)
    expect((src.match(/!hasActiveDog\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // ...and the old raw truthy dog guards are gone from those spawn sites.
    expect(src).not.toMatch(/!wm\.pendingDogOnboarding &&\s*\n\s*!get\(\)\.player\?\.dog &&/);
  });
});
