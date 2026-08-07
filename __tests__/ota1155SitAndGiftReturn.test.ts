// OTA-1155 — TWO THINGS THE OWNER HIT ON THE PHONE, BOTH OF THEM OURS.
//
// 1. *"when I gift something to somebody it stays in the inventory menu the minute
//    you hit the give to and then the person's name and it should pop back to the
//    main world screen so you can see the response."*
//
//    OTA-1154 moved the recipient from `pendingGift` onto `giftMode` and sent the
//    player into their pack to choose. It did not move the CLEANUP: every exit from
//    `giveGift` still cleared only `pendingGift`, a field the flow no longer ran
//    on. So the give landed, the vendor's reaction went to the world feed, and the
//    player sat looking at their inventory with gift mode still lit. The reaction
//    was written to a screen nobody was on.
//
// 2. *"narration is suggesting things that I can't do."*
//
//    Halem's gift line — authored by US, one OTA earlier — ends "there's a bowl of
//    something hot for you if you'll sit." `sit` was in no verb list in the game.
//    Device log, three attempts in seventy seconds:
//      04:52:32 [player] sit           → soft refusal
//      04:53:19 [player] I'll sit      → soft refusal
//      04:53:36 [player] sit with halem→ soft refusal
//    Each time Qwen read it CORRECTLY (intent=wait) and each time the store's
//    repair guard threw the answer away as "invented a wait the player never asked
//    for" — because that guard carried its own hand-typed six-word copy of the ten
//    wait synonyms, and neither list had ever heard of sitting down.
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: unknown = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import * as fs from 'fs';
import * as path from 'path';
import { qwenRephraseRejection } from '../app/state/gameStore';
import { parseInput, mentionsWaitVerb } from '../app/engine/parser';
import { gestureFamily, callToActionLine } from '../app/engine/callToAction';
import { dressFactionFighter, FACTION_BODIES, pickFactionBody } from '../app/engine/factionBodies';
import { scaleEncounterForContext, findEnemyByName } from '../app/engine/encounter';
import { bossSwingsTwice } from '../app/engine/combatRules';
import type { Enemy } from '../app/engine/types';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');

// Minimal parse context — these inputs name nothing in the world, which is the
// point: bare "sit" has to work with an empty scene behind it.
const ctx = { enemyNames: [], vendorName: null } as unknown as Parameters<typeof parseInput>[1];

describe('OTA-1155 #2 — the game stops refusing an action its own prose invited', () => {
  it('⚠ the invitation is real, and it is ours', () => {
    // The exact line Halem said before the three refusals. If this text ever
    // moves, the verb it asks for still has to exist — that is what the rest of
    // this block is checking.
    const prefs = read('app', 'data', 'npcs', 'gift_prefs.json');
    expect(prefs).toContain("if you'll sit");
  });

  it('bare "sit" parses — it does not demote to unknown', () => {
    const p = parseInput('sit', ctx);
    expect(p.intent).not.toBe('unknown');
    expect(p.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('every phrasing the owner actually typed parses', () => {
    for (const raw of ['sit', "I'll sit", 'sit with halem', 'sit down', 'take a seat']) {
      const p = parseInput(raw, ctx);
      expect([raw, p.intent]).toEqual([raw, 'gesture']);
    }
  });

  it('⚠ sitting is a call-to-action beat, NOT an eight-hour sleep', () => {
    // The tempting cheap fix was to alias sit onto `rest`. Answering "sit" — said
    // to a man holding out a bowl of stew — by blacking out until morning is worse
    // than the refusal was.
    expect(parseInput('sit', ctx).intent).not.toBe('rest');
    expect(parseInput('sit', ctx).intent).not.toBe('wait');
  });

  it('the settle family exists and owns every spelling the parser can emit', () => {
    // 'sitdown' / 'takeaseat' are the COLLAPSED forms the multi-word pass hands
    // back as matchedVerb. Missing one of them silently drops that phrasing into
    // the 'touch' fallback — "You lay a hand on the dark ahead" for "sit down".
    for (const v of ['sit', 'sitdown', 'takeaseat']) {
      expect([v, gestureFamily(v)]).toEqual([v, 'settle']);
    }
  });

  it('⚠ a bare sit does not sit down with "the dark ahead"', () => {
    for (let i = 0; i < 25; i++) {
      const line = callToActionLine('sit', '');
      expect(line).not.toContain('the dark ahead');
      expect(line).not.toContain('{noun}');
    }
  });

  it('⚠ you sit with Halem the Trader, not with THE Halem the Trader', () => {
    for (let i = 0; i < 25; i++) {
      const line = callToActionLine('sit', 'Halem the Trader', { person: true });
      expect(line).toContain('Halem the Trader');
      expect(line).not.toContain('the Halem');
    }
  });

  it('a place still keeps its article', () => {
    // The person flag must not leak into the ordinary case.
    const line = callToActionLine('touch', 'steeple door');
    expect(line).toContain('the steeple door');
  });
});

describe('OTA-1155 #2b — the wait guard asks the verb table instead of remembering it', () => {
  it('every synonym of the wait intent counts as asking to wait', () => {
    // The old literal was /wait|hold|stay|linger|pause|bide/ — six of ten. This is
    // the assertion that would have failed on it.
    for (const v of ['wait', 'stay', 'hold', 'pause', 'still', 'linger', 'tarry', 'idle', 'bide', 'remain']) {
      expect([v, mentionsWaitVerb(`I will ${v} here`)]).toEqual([v, true]);
    }
  });

  it('words that merely CONTAIN a wait verb do not count', () => {
    // Whole-word matching: "stayed"/"remainder"/"idler" are not requests to wait.
    expect(mentionsWaitVerb('search the remainder of the room')).toBe(false);
    expect(mentionsWaitVerb('climb the tower')).toBe(false);
  });

  it('⚠ an honest wait repair of a word the old list forgot is no longer thrown away', () => {
    // Both share a word with what the player typed, so the OTA-993 invention
    // guard is satisfied and the WAIT clause is the only thing left that could
    // reject them. It used to, because "remain" and "tarry" weren't on its list.
    expect(qwenRephraseRejection(null, 'wait', 'wait here', 'I will remain here')).toBeNull();
    expect(qwenRephraseRejection(null, 'wait', 'wait a while', 'tarry a while')).toBeNull();
  });

  it('and a genuinely invented wait is STILL rejected', () => {
    // The OTA-970 case this guard was built for: "clomb into the warp" coming back
    // as a do-nothing wait aimed at a noun from nowhere.
    expect(qwenRephraseRejection(null, 'wait', 'wait the reclaimer stake', 'clomb into the warp')).toBeTruthy();
  });

  it('⚠ the hand-typed copy of the wait list is GONE from the store', () => {
    // If it comes back there are two answers again, and the second one is the one
    // that goes stale — it already did once. Matching the PARENTHESISED regex form
    // on purpose: the comment above the fix still quotes the old literal bare, and
    // that history is worth more than a slightly tighter assertion.
    expect(STORE).not.toContain('(wait|hold|stay|linger|pause|bide)');
  });
});

describe('OTA-1155 #1 — a GIVE always puts you back where you can read the reply', () => {
  // giveGift's body, isolated so "every exit path" is a claim about THIS function
  // and not about the file.
  const start = STORE.indexOf('  giveGift: (itemId) => {');
  const end = STORE.indexOf('\n  pendingTalk:', start);
  const body = start > 0 && end > start ? STORE.slice(start, end) : '';

  it('giveGift is still where this test thinks it is', () => {
    // Guards every assertion below: an empty slice would make "the old cleanup is
    // gone" pass for the wrong reason.
    expect(start).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(500);
  });

  it('the recipient carries the screen the gift began on', () => {
    expect(STORE).toContain('returnTo: ScreenName');
    expect(STORE).toContain('giftReturnScreen');
  });

  it('⚠ gift mode can never "return" you into the pack it opened', () => {
    // giftReturnScreen captures the CURRENT screen, and gift mode's whole job is
    // to push you to 'inventory'. Without this clause an entry point opened from
    // the pack would send the give straight back to the pack.
    expect(STORE).toMatch(/currentScreen === 'inventory' \? 'exploration' : s\.currentScreen/);
  });

  it('⚠ EVERY exit from giveGift navigates — none of them just returns', () => {
    // The bug was one specific path (success) leaving the player in the pack, but
    // the refused / blocked / stranger paths all wrote a player-facing line to the
    // same covered screen. Counting them here so a future edit that adds a fifth
    // exit has to think about it.
    const returns = body.match(/\breturn;/g) ?? [];
    expect(returns.length).toBeGreaterThanOrEqual(4);
    const done = body.match(/\bdone\(\);/g) ?? [];
    // Four early exits + the success tail.
    expect(done.length).toBe(returns.length + 1);
  });

  it('⚠ the old cleanup that cleared the WRONG field is gone', () => {
    // `set({ pendingGift: null })` on its own was OTA-1154's leftover: by then the
    // flow ran on giftMode, so this cleared a field nobody was reading and left
    // gift mode lit on a screen the player could not see the answer from.
    expect(body).not.toMatch(/set\(\{ pendingGift: null \}\);/);
  });

  it('done() clears BOTH fields, not just the one', () => {
    expect(body).toContain('set({ pendingGift: null, giftMode: null });');
  });
});

describe('OTA-1155 #3 — a dressed faction fighter is rank and file, never a boss', () => {
  // Device log 2026-08-07T03:24:35, verbatim:
  //   "Forgotten Order Raider 1 presses the second strike — bosses do not yield
  //    the tempo."  ... 239 HP left ... vs your AC 26 ... ATK 16 ... 12 damage
  // Two of them, 248 HP each, against a 29 HP player. The owner fled.
  const reaver = () => findEnemyByName('Tartarian Reaver');

  it('the roster still has exactly one Legendary human, and it IS a boss', () => {
    // The premise. If either half stops being true the fix below is answering a
    // question nobody is asking any more — but the guard should stay regardless.
    expect(FACTION_BODIES.Legendary).toEqual(['Tartarian Reaver']);
    const r = reaver();
    expect(r).toBeTruthy();
    expect(r!.boss).toBe(true);
    expect(r!.hp).toBeGreaterThan(300);
  });

  it('⚠ a Legendary tile therefore picks it with CERTAINTY — this is not a rare roll', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickFactionBody('Legendary')?.name).toBe('Tartarian Reaver');
    }
  });

  it('⚠ dressing it strips the boss flag', () => {
    const dressed = dressFactionFighter(reaver()!, 'forgotten_order', 'Forgotten Order', 'Raider', 1);
    expect(dressed.boss).toBe(false);
    expect(bossSwingsTwice(dressed)).toBe(false);
    // …and the body is otherwise intact, which is the whole point of the dresser:
    // a soldier's corpse still yields a soldier's kit.
    expect(dressed.name).toBe('Forgotten Order Raider 1');
    expect(dressed.damage).toBe(reaver()!.damage);
  });

  it('⚠ and the pack budget applies again — the 248-HP-each case cannot recur', () => {
    // This is the one that actually mattered. Two bosses made `nonBossIdx` EMPTY,
    // which routed a two-body party down the SOLO branch and skipped packHpCeiling
    // entirely (70 at danger 0, 120 at danger 5). Each body then took the full
    // static-boss scale: 310 × 0.8 = 248. The log's number, exactly.
    const party: Enemy[] = [1, 2].map((i) =>
      dressFactionFighter(reaver()!, 'forgotten_order', 'Forgotten Order', 'Raider', i));
    // Danger 5 and a strong player — the most generous budget the game hands out.
    const scaled = scaleEncounterForContext(party, 5, 40);
    const total = scaled.reduce((s, e) => s + e.hp, 0);
    expect(total).toBeLessThanOrEqual(120);
    for (const e of scaled) {
      expect(e.boss).toBe(false);
      expect(e.hp).toBeLessThan(248);
    }
  });
});

describe('OTA-1155 #4 — a container is not a prop in the room', () => {
  const SNIP = (() => {
    const i = STORE.indexOf('function collectSceneNouns');
    return i > 0 ? STORE.slice(i, i + 3200) : '';
  })();

  it('⚠ location aliases are pushed AFTER the scene\'s own nouns', () => {
    // resolveContextNoun breaks a substring tie by array order (`return
    // matches[0]`), so whatever goes in first wins. Aliases used to. Device log
    // 2026-08-07T00:30:37: `climb river-xord` in Ostragar — a city with an
    // interactable literally called `river-cord` — resolved to `river capital`,
    // an alias of the city, and the Arbiter narrated the city as an object.
    const iAmbient = SNIP.indexOf('scene.ambientNouns');
    const iAlias = SNIP.indexOf('scene.location?.aliases');
    expect(iAmbient).toBeGreaterThan(0);
    expect(iAlias).toBeGreaterThan(iAmbient);
  });

  it('the canonical location NAME is still kept out entirely', () => {
    // The invariant this function states in its own header, and which pushing the
    // aliases first quietly broke. Aliases are a last resort, not a prop.
    expect(SNIP).not.toContain('nouns.push(scene.location.name)');
  });
});

describe('OTA-1155 #6 — a gift never claims standing it did not grant', () => {
  const { canonicalFactionId } = require('../app/engine/factions');
  const { applyRepChange } = require('../app/engine/factions');

  it('⚠ the premise: applyRepChange is a SILENT no-op on an unknown id', () => {
    // This is why the bug was invisible. It does not throw, it does not warn —
    // it hands back the standing array untouched and an empty `changed` list,
    // and the caller logged "Standing +2" without ever looking.
    const before = [{ factionId: 'stone_builders', standing: 0 }];
    const out = applyRepChange(before, 'architectural_sentinels', 2);
    expect(out.changed).toEqual([]);
    expect(out.standing[0].standing).toBe(0);
  });

  it('the four legacy race ids OTA-834 remapped now resolve', () => {
    expect(canonicalFactionId('architectural_sentinels')).toBe('stone_builders');
    expect(canonicalFactionId('unknowing_masses')).toBe('conspiracy_architects');
    expect(canonicalFactionId('aetherborn')).toBe('eternal_dynasty');
    expect(canonicalFactionId('mud_golems')).toBe('mud_monarchs');
  });

  it('a real id passes through, and pure nonsense stays unresolvable', () => {
    expect(canonicalFactionId('stone_builders')).toBe('stone_builders');
    expect(canonicalFactionId('not_a_faction_at_all')).toBeNull();
    expect(canonicalFactionId(null)).toBeNull();
    expect(canonicalFactionId('')).toBeNull();
  });

  it('⚠ the healed id actually moves standing — the whole point', () => {
    const before = [{ factionId: 'stone_builders', standing: 0 }];
    const id = canonicalFactionId('architectural_sentinels')!;
    const out = applyRepChange(before, id, 2);
    expect(out.changed.length).toBeGreaterThan(0);
    expect(out.standing.find((s: { factionId: string }) => s.factionId === 'stone_builders')!.standing).toBe(2);
  });

  it('⚠ the gift path canonicalises BEFORE it debits the lifetime budget', () => {
    // Order matters more than the check does: the budget write sits above the
    // applyRepChange call, so a bail that happens after it spends the allowance
    // on a grant that never landed — permanently, since the budget is lifetime.
    const start = STORE.indexOf('function applyGiftStanding');
    const fn = STORE.slice(start, STORE.indexOf('\n}', start));
    expect(start).toBeGreaterThan(0);
    expect(fn).toContain('canonicalFactionId(rel?.factionId)');
    expect(fn.indexOf('canonicalFactionId')).toBeLessThan(fn.indexOf('giftStandingGranted'));
  });

  it('⚠ the standing line prints the faction NAME, not the raw id', () => {
    // "Standing +2 — architectural sentinels." was the only reason anyone
    // noticed: a display name would have read as a real faction and hidden it.
    const start = STORE.indexOf('function applyGiftStanding');
    const fn = STORE.slice(start, STORE.indexOf('\n}', start));
    // The raw-id spelling survives ONCE, as factionLabel's own fallback for a
    // canonical id the roster somehow has no display name for. What must not
    // survive is a Standing line built from it directly.
    expect(fn).not.toMatch(/Standing[^`]*\$\{faction\.replace/);
    expect((fn.match(/\$\{factionLabel\}/g) ?? []).length).toBe(2);
  });

  it('a sighting heals the stale id in the save', () => {
    const NPCM = read('app', 'engine', 'npcMemory.ts');
    expect(NPCM).toContain('healFactionId');
    // Both write sites, or the one that misses it keeps re-poisoning the row.
    expect((NPCM.match(/factionId: healFactionId\(/g) ?? []).length).toBe(2);
  });
});

describe('OTA-1155 #5 — the narrator may say the name of the room it is standing in', () => {
  it('⚠ world-ladder biomes and sub-rooms are on the allow-list', () => {
    // Three of eight ambient generations in the log were killed by
    // `off-canon-entity` for naming "Etheric Engine Chamber" and "The Silt
    // Wastes" — a sub-room the player was standing in, and a top-level biome.
    // Neither is in locations.json, which was the entire allow-list.
    expect(STORE).toContain("require('../engine/worldLadder')");
    expect(STORE).toMatch(/microMicroLocations[\s\S]{0,80}names\.push\(mm\.name\)/);
  });

  it('both names the log lost really are in the ladder', () => {
    const ladder = require('../app/data/world/worldLadder.json') as {
      macroLocations: Array<{ name: string; microLocations: Array<{ name: string; microMicroLocations: Array<{ name: string }> }> }>;
    };
    const all: string[] = [];
    for (const ma of ladder.macroLocations) {
      all.push(ma.name);
      for (const mi of ma.microLocations ?? []) {
        all.push(mi.name);
        for (const mm of mi.microMicroLocations ?? []) all.push(mm.name);
      }
    }
    expect(all).toContain('The Silt Wastes');
    expect(all).toContain('Etheric Engine Chamber');
  });
});

