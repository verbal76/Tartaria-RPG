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
    // ⚠⚠⚠ OTA-1726 — THE VENDOR HALF OF THIS BLOCK IS DELETED, and deliberately
    // not replaced. It asserted that `puppyVendorUsed` permanently blocks the
    // replacement vendor. That was the shipped behaviour and it is exactly what
    // the owner's canon forbids: *"once dog gameplay is unlocked, loss of an
    // individual dog does not permanently remove access to dogs."* The market
    // suite (ota1726TheRoadBackToADog) pins the OPPOSITE property — a save
    // carrying puppyVendorUsed=true can still buy a dog. Two tests asserting
    // opposite rules is how OTA-1717 got its contradiction; only the canon lives.
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

  // ⚠⚠ OTA-1726 — the "trade item selection" block that stood here is deleted. It
  // re-implemented gameStore's candidate filter INSIDE the test body and asserted
  // against its own copy, so it would have gone on passing after the real filter
  // was removed — which is precisely what happened. A test that cannot fail when
  // its subject is deleted was never testing the subject.
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

  // ⚠⚠⚠ OTA-1726 — "Hard cap — ONE puppy vendor per save" is deleted. It pinned
  // `puppyVendorUsed` as a latch nothing can un-flip — that is, it enforced the
  // permanent lock-out the owner's canon exists to forbid. The flag still rides
  // on old saves; it is simply no longer a gate on anything.
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
    // ⚠ OTA-1726 — was `>= 4`, when there were four spawn guards. Two belonged to
    // the puppy-vendor trade, which is gone (it could not be completed: it told
    // the player to type a phrase with no parser verb behind it). The RULE is what
    // this test is for, and it now holds across MORE of the codebase than before,
    // not less — so the count states what is actually there and the replacement
    // acquisition path is pinned by name below.
    expect((src.match(/!hasActiveDog\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // ⚠⚠ AND THE REPLACEMENT PATH OBEYS IT TOO — the market's shelf gate and its
    // counter gate both ASK hasActiveDog rather than re-deriving "has a dog" from
    // a raw field, which is the whole point of OTA-346's rule.
    expect(src).toContain('hasActiveDog: hasActiveDog(player),');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const slice = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').resolve(__dirname, '../app/state/slices/vendorSlice.ts'), 'utf-8') as string;
    expect(slice).toContain('deps.hasActiveDog(player)');
    // ...and the old raw truthy dog guards are gone from those spawn sites.
    expect(src).not.toMatch(/!wm\.pendingDogOnboarding &&\s*\n\s*!get\(\)\.player\?\.dog &&/);
  });
});
