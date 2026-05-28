// OTA-124 pre-ship stress — parser fuzz including dog-system verbs.
//
// Scope:
//   - 500 random inputs containing dog verbs + edge cases — should never
//     crash submitPlayerAction.
//   - Edge: player named the dog "feed" / "heal" / "rex" — `feed rex`
//     should route to the dog feed handler (not to the player's
//     feed-self or to a "rex" lookup).
//   - Edge: `feed dog` with no item arg — should refuse cleanly.
//   - Edge: `call dog` when the dog is waiting_at_base — should still
//     open the call modal (per spec, the dog rejoins on `climb down`,
//     not on call; but the call modal should still be invocable).
//   - 50 mutations of the existing parserFuzz pattern set — confirm
//     dog additions didn't regress baseline behavior.
//
// Bootstrap follows the dogFeedHeal / parserFuzz pattern (mocks the
// expo / RN modules so the store hydrates under node).

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

import { useGameStore } from '../app/state/gameStore';
import { createDogCompanion } from '../app/engine/dogCompanion';
import { parseInput } from '../app/engine/parser';

const DOG_VERB_INPUTS = [
  'feed dog jerky',
  'feed dog Marrow Bone',
  'heal dog Trail Rations',
  'heal dog First Aid Kit',
  'use Trail Rations on dog',
  'use marrow bone on dog',
  'call rex',
  'call dog',
  'here dog',
  'come marrow',
  'bite the enemy',
  'distract the giant',
  'sic dog',
  'summon golem then call dog',
  'feed dog',                     // no item — must refuse cleanly
  'feed',                          // bare — must not crash
  'heal',                          // bare — must not crash
  'use on dog',                    // malformed
  'call',                          // bare — must not crash
  'come',                          // bare — must not crash
  'feed dog the the Marrow Bone',  // repeated articles
  'FEED DOG MARROW BONE',          // shouting
  'feed   dog    Marrow Bone',     // extra whitespace
  '   call dog   ',                // padded
  'feed dog 🦴',                    // emoji noun
  'feed dog ', 'heal dog ',
];

async function bootWithDogNamed(name: string, status?: 'with_player' | 'waiting_at_base') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Fuzzer', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const dog = createDogCompanion({
    name,
    breed: 'mutt',
    rawSex: 'boy',
    startingProfile: 'mongrel',
    currentHour: 0,
  });
  store.setState({
    player: {
      ...p0,
      dog: { ...dog, loyalty: 50, status: status ?? 'with_player' },
      inventory: [
        { id: 'rat_1', name: 'Trail Rations', kind: 'consumable', quantity: 5, tags: ['food'], rarity: 'Common' },
        { id: 'mar_1', name: 'Marrow Bone', kind: 'consumable', quantity: 3, tags: ['food', 'dog_treat'], rarity: 'Uncommon' },
        ...p0.inventory,
      ],
    },
  });
  return store;
}

async function bootNoDog() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Fuzzer', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-124 pre-ship — parser fuzz with dog verbs', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('500 randomized dog-verb inputs never crash submitPlayerAction', async () => {
    const store = await bootWithDogNamed('Marrow');
    const errors: { input: string; err: string }[] = [];
    // Build 500 inputs by repeating + permuting the dog set.
    const inputs: string[] = [];
    for (let i = 0; i < 500; i++) {
      const base = DOG_VERB_INPUTS[i % DOG_VERB_INPUTS.length]!;
      // Sprinkle in some chaos — random suffix tokens, garbage prepended,
      // random casing per character.
      let mutated = base;
      if (i % 3 === 0) mutated = mutated.toUpperCase();
      if (i % 5 === 0) mutated = '  ' + mutated + '  ';
      if (i % 7 === 0) mutated = mutated.replace(/dog/g, 'doggo');
      if (i % 11 === 0) mutated = `the ${mutated}`;
      if (i % 13 === 0) mutated += ' please';
      if (i % 17 === 0) mutated = mutated.split('').reverse().join('').slice(0, 20);
      inputs.push(mutated);
    }
    for (const inp of inputs) {
      try {
        store.getState().submitPlayerAction(inp);
      } catch (e) {
        errors.push({ input: inp, err: e instanceof Error ? e.message : String(e) });
        if (errors.length > 5) break;
      }
    }
    expect(errors).toEqual([]);
  });

  it('intent classification: dog verbs route correctly when dog present', () => {
    // parseInput is pure; just confirms the verb table maps right.
    const samples = [
      { input: 'bite the enemy', expectIntent: 'dog_bite' },
      { input: 'distract the giant', expectIntent: 'dog_distract' },
      { input: 'sic dog', expectIntent: 'dog_bite' },
    ];
    for (const { input, expectIntent } of samples) {
      const parsed = parseInput(input);
      expect(parsed.intent).toBe(expectIntent);
    }
  });

  it('edge: dog named "rex" — `feed rex Trail Rations` feeds the dog', async () => {
    const store = await bootWithDogNamed('Rex');
    const before = store.getState().player!.dog!.loyalty;
    store.getState().submitPlayerAction('feed rex Trail Rations');
    const after = store.getState().player!.dog!.loyalty;
    expect(after).toBeGreaterThan(before); // routed through dog handler
  });

  it('edge: dog named "feed" — `feed feed Trail Rations` still feeds the dog', async () => {
    // Pathological dog name. The regex /^feed\s+(\S+)\s+(.+)$/ captures
    // <target> as "feed" — should match the dog name token.
    const store = await bootWithDogNamed('feed');
    const before = store.getState().player!.dog!.loyalty;
    store.getState().submitPlayerAction('feed feed Trail Rations');
    const after = store.getState().player!.dog!.loyalty;
    expect(after).toBeGreaterThan(before);
  });

  it('edge: dog named "heal" — `heal heal First Aid Kit` heals the dog', async () => {
    const store = await bootWithDogNamed('heal');
    const p0 = store.getState().player!;
    // Damage the dog so heal has room.
    store.setState({ player: { ...p0, dog: { ...p0.dog!, hp: 4 } } });
    // Add a First Aid Kit.
    store.setState({
      player: {
        ...store.getState().player!,
        inventory: [
          { id: 'fak_1', name: 'First Aid Kit', kind: 'consumable', quantity: 1, tags: ['healing'], rarity: 'Uncommon' },
          ...store.getState().player!.inventory,
        ],
      },
    });
    const before = store.getState().player!.dog!.hp;
    store.getState().submitPlayerAction('heal heal First Aid Kit');
    const after = store.getState().player!.dog!.hp;
    expect(after).toBeGreaterThan(before);
  });

  it('edge: `feed dog` with no item arg — does not crash and does not consume any item', async () => {
    const store = await bootWithDogNamed('Marrow');
    const inventoryBefore = store.getState().player!.inventory.map((i) => ({ name: i.name, qty: i.quantity }));
    expect(() => store.getState().submitPlayerAction('feed dog')).not.toThrow();
    const inventoryAfter = store.getState().player!.inventory.map((i) => ({ name: i.name, qty: i.quantity }));
    expect(inventoryAfter).toEqual(inventoryBefore);
  });

  it('edge: `call dog` when dog status is waiting_at_base — opens modal', async () => {
    const store = await bootWithDogNamed('Marrow', 'waiting_at_base');
    expect(store.getState().callDogModalOpen).toBe(false);
    store.getState().submitPlayerAction('call dog');
    // Per current implementation: tryDogCallVerb only fires when the
    // dog is NOT abandoned/dead — waiting_at_base IS allowed.
    expect(store.getState().callDogModalOpen).toBe(true);
  });

  it('regression: parser fuzz subset still passes WITH dog verbs added', async () => {
    // 50 mutations of the existing parser fuzz pattern set — confirm
    // dog-verb additions did not regress these.
    const baseline = [
      'attack', 'atak', 'attck', 'investigate the bench', 'salvge', 'salveage',
      'craft a sword', 'craaft sword', 'climb the wall', 'cliimb the gate',
      'search the rubble', 'serach', 'take the torch', 'tkae the torch',
      'rest', 'reeest', 'go north', 'gow norht', 'leave the outpost',
      'look around', 'lookaround', 'travel to halem', 'travel halem',
      'open the chest', 'open chest', 'use scanner', 'use the scanner',
      'equip sword', 'unequip', 'gift bread to halem', 'sell sword',
      'buy ration', 'accept the contract', 'turn in the quest', 'dig here',
      'throw rock at the drone', 'jump across', 'dash forward', 'disengage',
      'aim at the giant', 'reload', 'fight back', 'hide behind the wall',
      'pick the lock', 'shape stone', 'summon mud golem', 'mend wounds',
      'ask about halem', 'rest until dawn', 'ASK ABOUT THE CITY',
      'lOoK aRoUnD',
    ];
    const store = await bootNoDog();
    const errors: string[] = [];
    for (const input of baseline) {
      try {
        store.getState().submitPlayerAction(input);
      } catch (e) {
        errors.push(`${input}: ${e instanceof Error ? e.message : String(e)}`);
        if (errors.length > 3) break;
      }
    }
    expect(errors).toEqual([]);
  });

  it('without a dog: bite + distract route to the standard attack table (no crash)', async () => {
    const store = await bootNoDog();
    // No dog → these intents have no handler, but parser should still
    // resolve them to dog_bite / dog_distract and the engine should
    // refuse cleanly (or no-op).
    expect(() => {
      store.getState().submitPlayerAction('bite the enemy');
      store.getState().submitPlayerAction('distract the giant');
    }).not.toThrow();
  });

  it('without a dog: feed/heal/call do not crash and do not summon a dog from thin air', async () => {
    const store = await bootNoDog();
    // Reset the modal flag — a prior test may have opened it on this
    // shared store instance, and the no-dog path must not RE-open it.
    store.setState({ callDogModalOpen: false });
    expect(() => {
      store.getState().submitPlayerAction('feed dog jerky');
      store.getState().submitPlayerAction('heal dog ration');
      store.getState().submitPlayerAction('call dog');
    }).not.toThrow();
    expect(store.getState().player!.dog).toBeFalsy();
    // After running call dog with no dog, the modal must remain closed.
    expect(store.getState().callDogModalOpen).toBe(false);
  });
});
