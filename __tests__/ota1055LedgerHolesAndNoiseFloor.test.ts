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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1055 — the holes the OTA-1054 review found, closed.
 *
 * Six defects, five of them mine from the Phase 0/1 run. Every one is a case of
 * a rule applied at one site out of several, or a rule keyed off something that
 * was never an identity. They are grouped here rather than split across OTAs
 * because they share a root: the ledger and the noise floor were both wired by
 * following the code that already existed instead of the set of places that
 * needed it.
 *
 *  1. ROADSIDE TRADERS COLLAPSED INTO TWO PEOPLE. OTA-1053 correctly stopped
 *     keying the ledger off `roadside_<demeanor>_<Date.now()>` — that split one
 *     trader into unbounded strangers — but keyed it off the archetype NAME
 *     instead, and roadside_traders.json holds exactly two archetypes whose
 *     names are furniture ("Road Hawker", "Sketchy Stall"). So it over-corrected
 *     into the mirror bug. Fixed in the DATA: the archetypes now carry a cast.
 *  2. TWO OF THREE VENDOR-INSTALL SITES NEVER RECORDED THE MEETING. The Hidden
 *     Market stalls had no relation at all, so every ledger write against them
 *     silently no-opped; the roadside stall on the travel step — the dominant
 *     spawn path — never sighted either.
 *  3. ...and it was TWO of FIVE, not two of three — the elevated-overlay trader
 *     and the `spawn_vendor` campfire Reclaimer were unsighted too, and my first
 *     pass shipped a docblock claiming the hole was closed. The guard I wrote
 *     for tab-flicking was also dead code (it compared a vendor against itself
 *     at beginScene, and could not fire at the stalls either). Both found by
 *     review, after the first version of this very suite passed.
 *  4. STORY BEATS WERE BEING MERGED AWAY. OTA-1051 gave them a rule and a chip;
 *     appendLog's world/system debounce rebuilds the merged entry as
 *     `{ ...lastEntry, text }`, so a beat glued onto a preceding line inherited
 *     the FIRST line's meta and lost `storyBeat` entirely.
 *  5. `log-moved-on` WAS DEAD IN EVERY REAL SESSION. It compared gameLog.length
 *     across a 14-20s generation, and gameLog is `.slice(-500)` on every append.
 *  6. AUTO-GRANTED CONTRACTS POISONED THE ACCEPT BURST. Three sites hand a
 *     contract over off a hook the player walked into; all three ran the full
 *     burst path, which both nags the player for accepting nothing and can make
 *     their next genuinely-first manual accept render as the compact repeat.
 *  7. RAID DIALOGUE PRINTED SLUGS. A person who lives at Reclaimer's Stake said
 *     "reclaimer stake"; the Tartarian Pilgrim Camp came out "pilgrim waycamp".
 */
jest.setTimeout(60_000);

import {
  useGameStore,
  vendorNpcId,
  STORY_BEAT_META,
  _resetAcceptBurst,
  _playerVisibleLogTotal,
  _takeAmbientStampForTest,
  _ambientStaleReasonForTest,
  _AMBIENT_STALE_LINES,
  _bumpQuestsAcceptedForTest,
} from '../app/state/gameStore';
import { HUNTS } from '../app/engine/hunts';
import { pickRoadsideTrader } from '../app/engine/vendors';
import { getRelation, raidNewsLine, recordNpcSighting, recordNpcDealing } from '../app/engine/npcMemory';
import { emptyMemory } from '../app/engine/worldMemory';
import { getRaces, getFactions } from '../app/engine/character';
import type { NpcMet, OutpostRaid } from '../app/engine/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SRC: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/state/gameStore.ts'),
  'utf8',
);

async function boot(name: string) {
  _resetAcceptBurst();
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  return store;
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1055 — a roadside trader is a person, not a stall type', () => {
  it('the cast is big enough that two strangers are not the same ledger row', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 400; i++) ids.add(vendorNpcId(pickRoadsideTrader()));
    // 12 named traders per archetype, two archetypes. Before this fix the whole
    // roadside population resolved to exactly two ids.
    expect(ids.size).toBe(24);
  });

  it('the archetype furniture names never reach the ledger', () => {
    for (let i = 0; i < 200; i++) {
      const t = pickRoadsideTrader();
      expect(t.name).not.toBe('Road Hawker');
      expect(t.name).not.toBe('Sketchy Stall');
    }
  });

  it('the same person keeps ONE row across spawns — the OTA-1053 leak stays closed', () => {
    // The runtime id still carries Date.now() (nothing reads past the prefix),
    // so this is the property that actually matters: two spawns of the same
    // trader must be the same ledger person.
    const a = { id: `roadside_honest_${1}`, name: 'Grit Maalen' };
    const b = { id: `roadside_honest_${999999}`, name: 'Grit Maalen' };
    expect(vendorNpcId(a)).toBe(vendorNpcId(b));
    expect(vendorNpcId(a)).not.toContain('999999');
  });

  it('the person is decoupled from the stall — both archetypes still appear, and each name belongs to exactly one', () => {
    // ⚠ This replaces a test that asserted `demeanor` is honest|sketchy, that
    // `title.length > 0` and that offers >= 3 — every one of them unfalsifiable
    // given the data, and all three passed unchanged under a mutation that
    // reverted the whole feature. What actually needs guarding is that the cast
    // is PARTITIONED by archetype: if a name could be minted by both, the steal
    // DC and the enemy build would differ between two spawns of one person.
    const byName = new Map<string, Set<string>>();
    for (let i = 0; i < 600; i++) {
      const t = pickRoadsideTrader();
      if (!byName.has(t.name)) byName.set(t.name, new Set());
      byName.get(t.name)!.add(`${t.demeanor}|${t.title}`);
    }
    expect(byName.size).toBe(24);
    for (const [, kinds] of byName) expect(kinds.size).toBe(1);
    const demeanors = new Set([...byName.values()].map((k) => [...k][0]!.split('|')[0]!));
    expect(demeanors).toEqual(new Set(['honest', 'sketchy']));
  });
});

describe('OTA-1055 — every vendor install records the meeting', () => {
  it('all FIVE install sites go through the one helper', () => {
    // ⚠ The first version of this asserted THREE, because the docblock said
    // three. It was wrong: the elevated-overlay trader and the `spawn_vendor`
    // hook (the campfire Reclaimer) also install a real, tradeable, stealable
    // vendor, and both were unsighted — so a theft from either cost nothing on
    // the ledger, permanently. A test that encodes the comment's claim instead
    // of counting the code will always agree with the comment.
    expect((SRC.match(/sightVendor\(get, set,/g) ?? []).length).toBe(5);
    for (const site of [
      /sightVendor\(get, set, vendor, location\.id\);/,        // beginScene (greets inline)
      /sightVendor\(get, set, stallVendor, /,                   // Hidden Market stall
      /sightVendor\(get, set, stall, /,                         // roadside travel step
      /sightVendor\(get, set, overlayVendor, /,                 // elevated overlay trader
      /sightVendor\(get, set, \{\n\s+id: effect\.vendor\.id,/,  // spawn_vendor hook
    ]) expect(SRC).toMatch(site);
  });

  it('the helper is the only VENDOR write — the other two are Guardians', () => {
    // ⚠ The first version counted `rememberNpcMeeting(` === 3 under the name
    // "the ONLY thing that writes a vendor to the ledger". Two of those three
    // are the Core Guardian spawns, so adding a fourth vendor write while
    // dropping a Guardian site left it green. Count what the name claims.
    expect(SRC).not.toMatch(/worldMemory: rememberNpcMeeting\(s\.worldMemory, npcRecord/);
    // OTA-1057 — the slice ends at sightPerson, which now sits between the two.
    const inSightVendor = SRC.slice(SRC.indexOf('function sightVendor('), SRC.indexOf('function sightPerson('));
    expect((inSightVendor.match(/rememberNpcMeeting\(/g) ?? []).length).toBe(1);
    // OTA-1057 — 4: sightVendor, sightPerson (wanderers + escort leaders), and
    // the two Core Guardian spawns.
    expect((SRC.match(/rememberNpcMeeting\(/g) ?? []).length).toBe(4);
  });

  it('THE DEAD GUARD IS GONE — no per-site same-vendor check survives', () => {
    // ⚠ My first fix guarded tab-flicking by comparing the incoming vendor with
    // the one already in the scene. It could NEVER fire: goBuildingRoom early-
    // returns when you re-tap the tab you are on, so the only reachable case is
    // ALTERNATING tabs, where the previous vendor is the other stall and the
    // ids never match. A review drove the real store and measured a stall rep at
    // six meetings after six taps — the inflation the guard's own comment said
    // it prevented. The rule moved into recordNpcSighting, where it is one rule
    // for every caller instead of a guard each new site can forget.
    expect(SRC).not.toContain('priorVendor');
    const fn = SRC.slice(SRC.indexOf('function sightVendor('), SRC.indexOf('function emitVendorGreeting('));
    expect(fn).not.toContain('get().currentScene');
  });

  it('a Hidden Market stall now HAS a ledger identity to write against', () => {
    // Nothing but the stall path mints a `hidden_market_*` id, and OTA-1053's
    // rule left those ids intact — so before the sighting was wired, every
    // recordNpcDealing against one of these was a no-op forever.
    const stall = { id: 'hidden_market_weapons', name: 'Ash-Sleeve' };
    expect(vendorNpcId(stall)).toBe('hidden_market_weapons:ash_sleeve');
    let m = recordNpcSighting(emptyMemory(), { id: vendorNpcId(stall), name: stall.name } as NpcMet,
      { nowMs: 1, hoursElapsed: 0 });
    m = recordNpcDealing(m, vendorNpcId(stall), { wrongs: 1 });
    expect(getRelation(m, vendorNpcId(stall))!.wrongs).toBe(1);
  });
});

describe('OTA-1055 — a story beat is never merged away', () => {
  it('THE BUG: a beat appended right after a world line keeps its marker', async () => {
    const store = await boot('Beat');
    store.getState().appendLog('world', 'The radar sweeps the flats and finds nothing.');
    store.getState().appendLog('world', 'The stair beneath the hold finally opens.', { ...STORY_BEAT_META });
    const log = store.getState().gameLog;
    const last = log[log.length - 1]!;
    // Not merged...
    expect(last.text).toBe('The stair beneath the hold finally opens.');
    // ...and still flagged, which is what the renderer reads.
    expect((last.meta as { storyBeat?: boolean })?.storyBeat).toBe(true);
  });

  it('and it is not merged in the other direction either', async () => {
    // `{ ...lastEntry, text }` takes meta from the FIRST line, so a plain line
    // landing on top of a beat would have swallowed the beat's text under the
    // beat's own flag — a rule and a STORY chip around ordinary chatter.
    const store = await boot('Beat2');
    store.getState().appendLog('world', 'The forge takes the fourth Core.', { ...STORY_BEAT_META });
    store.getState().appendLog('world', 'Somewhere behind you a gull complains.');
    const log = store.getState().gameLog;
    expect(log[log.length - 1]!.text).toBe('Somewhere behind you a gull complains.');
    expect((log[log.length - 1]!.meta as { storyBeat?: boolean })?.storyBeat).toBeUndefined();
    expect((log[log.length - 2]!.meta as { storyBeat?: boolean })?.storyBeat).toBe(true);
  });

  it('ordinary world lines still merge — the debounce is not what got broken', async () => {
    const store = await boot('Merge');
    store.getState().appendLog('world', 'Mud sucks at your boots.');
    // Measured AFTER the first line: boot leaves world lines of its own in the
    // buffer, so the first append may itself merge into one of them.
    const before = store.getState().gameLog.length;
    store.getState().appendLog('world', 'The wind turns.');
    const log = store.getState().gameLog;
    expect(log.length).toBe(before);
    expect(log[log.length - 1]!.text).toContain('Mud sucks at your boots.');
    expect(log[log.length - 1]!.text).toContain('The wind turns.');
  });
});

describe('OTA-1055 — "the log moved on" can actually be detected', () => {
  it('THE BUG: the visible-line total keeps climbing past the buffer cap', async () => {
    const store = await boot('Counter');
    // Fill well past MAX_LOG_IN_MEMORY (500). gameLog pins at the cap; the
    // ambient-staleness check compared THAT across a 14-20s generation, so
    // `log-moved-on` could never fire again for the rest of the session.
    // `reward` rather than `world`/`system`: those two are debounce-merged, so
    // 620 of them collapse into a handful of entries and never reach the cap.
    for (let i = 0; i < 620; i++) store.getState().appendLog('reward', `✦ line ${i}`);
    expect(store.getState().gameLog.length).toBe(500);

    const before = _playerVisibleLogTotal();
    for (let i = 0; i < 7; i++) store.getState().appendLog('reward', `✦ after ${i}`);
    expect(_playerVisibleLogTotal() - before).toBe(7);
  });

  it('developer bookkeeping does not count as the world moving on', async () => {
    await boot('Quiet');
    const before = _playerVisibleLogTotal();
    useGameStore.getState().appendLog('debug', 'ambient ∅ nothing-to-say');
    useGameStore.getState().appendLog('cognitive', 'label: idle');
    expect(_playerVisibleLogTotal()).toBe(before);
  });

  it('the ambient stamp reads the counter, not the capped buffer', () => {
    expect(SRC).toMatch(/logLen: _playerVisibleLogCount,/);
    expect(SRC).not.toMatch(/logLen: get\(\)\.gameLog\.length/);
  });
});

describe('OTA-1055 — the Arbiter only counts what the PLAYER took', () => {
  it('the three world-grant sites are marked as grants', () => {
    expect((SRC.match(/bumpQuestsAccepted\(get, set, \{ granted: true \}\)/g) ?? []).length).toBe(3);
  });

  it('the six manual accept paths are not', () => {
    expect((SRC.match(/bumpQuestsAccepted\(get, set\);/g) ?? []).length).toBe(6);
  });

  it('a grant leaves the burst counter alone', () => {
    // The counter is module state, so the contract is expressed in the code:
    // everything after the first-contract one-shot is skipped for a grant.
    expect(SRC).toMatch(/if \(opts\?\.granted\) return;/);
    // ...including the burst INITIALISATION inside the first-contract branch,
    // which would otherwise open a burst the player never started.
    expect(SRC).toMatch(/if \(!opts\?\.granted\) \{\n\s+_burstLastAt = Date\.now\(\);\n\s+_burstCount = 1;\n\s+\}/);
  });

  it('a granted contract still counts as a contract accepted', () => {
    // Only the burst is excluded. The milestone bump is above the branch, so a
    // hook-granted hunt still moves questsAccepted — it IS on your slate.
    const fn = SRC.slice(SRC.indexOf('function bumpQuestsAccepted('));
    const milestone = fn.indexOf('questsAccepted: prev + 1');
    const grantGuard = fn.indexOf('if (opts?.granted) return;');
    expect(milestone).toBeGreaterThan(0);
    expect(grantGuard).toBeGreaterThan(milestone);
  });
});

describe('OTA-1055 — the face-to-face accept path finally credits the person', () => {
  it('acceptFactionQuest records contractsTaken against the agent', async () => {
    const store = await boot('Signer');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FACTION_QUESTS } = require('../app/engine/factionQuests') as typeof import('../app/engine/factionQuests');
    const faction = 'forgotten_order';
    const def = FACTION_QUESTS.find((q) => q.factionId === faction)!;
    const agent = { id: 'v_agent_test', name: 'Sallow Vek', title: 'agent', faction, offers: [] };
    store.setState((s) => ({
      player: {
        ...s.player!,
        factionStanding: [
          ...s.player!.factionStanding.filter((r) => r.factionId !== faction),
          { factionId: faction, standing: 90 },
        ],
      },
      currentScene: { ...store.getState().currentScene!, enemies: [], vendor: agent as never },
      // Stand them up on the ledger the way beginScene's sighting would have.
      // recordNpcDealing writes against an EXISTING relation and no-ops without
      // one — which is precisely why the un-sighted Hidden Market stalls above
      // swallowed every write made against them.
      worldMemory: recordNpcSighting(
        s.worldMemory,
        { id: vendorNpcId(agent), name: agent.name, role: 'agent', factionId: faction },
        { nowMs: Date.now(), hoursElapsed: 0 },
      ),
    }));
    store.getState().acceptFactionQuest(def.title);

    expect((store.getState().player!.activeFactionQuestIds ?? [])).toContain(def.id);
    const rel = getRelation(store.getState().worldMemory, vendorNpcId(agent));
    expect(rel?.contractsTaken ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('all six accept paths credit it — this was the odd one out', () => {
    expect((SRC.match(/contractsTaken: 1/g) ?? []).length).toBe(6);
  });
});

describe('OTA-1055 — they call the place by its name', () => {
  const IRMA: NpcMet = { id: 'v_irma', name: 'Irma', role: 'armorer', factionId: 'forgotten_order' };
  const relAt = (dealings: Record<string, number>) => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 10 });
    m = recordNpcDealing(m, IRMA.id, dealings);
    m = recordNpcSighting(m, IRMA, { nowMs: 2, hoursElapsed: 100 });
    return getRelation(m, IRMA.id)!;
  };
  const raid = (locationName?: string): OutpostRaid => ({
    defenderId: 'forgotten_order', defenderName: 'Forgotten Order',
    attackerId: 'reclaimers_guild', attackerName: 'Reclaimers Guild',
    locationId: 'reclaimer_stake', ...(locationName ? { locationName } : {}), atHours: 50,
  });

  it('THE BUG: the id was de-slugged into a lowercase non-name', () => {
    const line = raidNewsLine(relAt({ trades: 3 }), raid(), 'Irma', 'Verbal');
    expect(line).toContain('reclaimer stake'); // the old behaviour, kept as the migration fallback
    expect(line).not.toContain('_');
  });

  it('...and with the authored name stamped on, they say it properly', () => {
    const line = raidNewsLine(relAt({ trades: 3 }), raid("Reclaimer's Stake"), 'Irma', 'Verbal');
    expect(line).toContain("Reclaimer's Stake");
    expect(line).not.toContain('reclaimer stake');
  });

  it('the closest tier names the ground too', () => {
    const line = raidNewsLine(relAt({ contractsTurnedIn: 2 }), raid("Reclaimer's Stake"), 'Irma', 'Verbal');
    expect(line).toContain("Reclaimer's Stake");
  });

  it('a blank name falls back rather than leaving a hole in the sentence', () => {
    const line = raidNewsLine(relAt({ trades: 3 }), { ...raid(), locationName: '   ' }, 'Irma', 'Verbal');
    expect(line).toContain('reclaimer stake');
  });

  it('the store resolves the name where the location catalog actually lives', () => {
    expect(SRC).toMatch(/locationName: safeLocName\(raidedLoc\),/);
  });
});

describe('OTA-1055 — only money that changes hands settles a debt', () => {
  it('the buy path passes `spent`, so amends measure what was paid', () => {
    // tcTraded is lifetime volume across BOTH directions; paying a debt off by
    // selling loot to the person you robbed is not making amends.
    expect(SRC).toMatch(/tcTraded: totalCost,\n\s+\/\/ OTA-1055[\s\S]{0,120}spent: totalCost,/);
  });
});

describe('OTA-1055 — a visit, not a re-render', () => {
  // ⚠ The rule that replaced the dead per-site guard. A review drove the real
  // store and measured a Hidden Market rep at SIX meetings after six tab taps —
  // past MEETINGS_FOR_NAME, so a shopkeeper used the player's name and reached
  // the 'known' rung with no business done. In-game time does not pass inside a
  // market, so the clock is the honest test.
  const IRMA: NpcMet = { id: 'v_irma', name: 'Irma', role: 'armorer' };

  it('sightings at the same in-game hour are ONE meeting', () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 40 });
    for (let i = 0; i < 8; i++) m = recordNpcSighting(m, IRMA, { nowMs: 2 + i, hoursElapsed: 40 });
    expect(getRelation(m, IRMA.id)!.meetings).toBe(1);
  });

  it('...but the clock moving on makes it a real second visit', () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 40 });
    m = recordNpcSighting(m, IRMA, { nowMs: 2, hoursElapsed: 41 });
    expect(getRelation(m, IRMA.id)!.meetings).toBe(2);
  });

  it('a same-hour re-render does NOT burn the absence anchor', () => {
    // prevSeenHours is what npcAbsenceLine measures against. If a silent
    // re-sighting advanced it, a trader you had not seen in a hundred hours
    // would have nothing to say about it.
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 10 });
    m = recordNpcSighting(m, IRMA, { nowMs: 2, hoursElapsed: 200 });
    expect(getRelation(m, IRMA.id)!.prevSeenHours).toBe(10);
    m = recordNpcSighting(m, IRMA, { nowMs: 3, hoursElapsed: 200 });
    expect(getRelation(m, IRMA.id)!.prevSeenHours).toBe(10); // unmoved
  });

  it('a re-render still refreshes the display fields', () => {
    // A vendor can be re-minted with a new title; suppressing the visit must
    // not freeze who they are.
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 40 });
    m = recordNpcSighting(m, { ...IRMA, role: 'quartermaster', factionId: 'forgotten_order' },
      { nowMs: 99, hoursElapsed: 40 });
    const rel = getRelation(m, IRMA.id)!;
    expect(rel.role).toBe('quartermaster');
    expect(rel.factionId).toBe('forgotten_order');
    expect(rel.lastSeenAt).toBe(99);
    expect(rel.meetings).toBe(1);
  });
});

describe('OTA-1055 — the ambient stamp really consumes the counter', () => {
  it('THE BUG: log-moved-on fires past the buffer cap', async () => {
    // ⚠ This is the test that was missing. The old coverage checked the counter
    // in isolation and grepped for the source line; pointing the stamp back at
    // gameLog.length re-killed the check with the suite green.
    const store = await boot('Stale');
    for (let i = 0; i < 620; i++) store.getState().appendLog('reward', `✦ fill ${i}`);
    expect(store.getState().gameLog.length).toBe(500); // pinned at the cap
    const stamp = _takeAmbientStampForTest();
    for (let i = 0; i <= _AMBIENT_STALE_LINES; i++) store.getState().appendLog('reward', `✦ after ${i}`);
    expect(_ambientStaleReasonForTest(stamp)).toBe('log-moved-on');
  });

  it('a quiet moment is not stale', async () => {
    const store = await boot('Quietish');
    for (let i = 0; i < 620; i++) store.getState().appendLog('reward', `✦ fill ${i}`);
    const stamp = _takeAmbientStampForTest();
    store.getState().appendLog('reward', '✦ one thing happened');
    expect(_ambientStaleReasonForTest(stamp)).toBeNull();
  });
});

describe('OTA-1055 — a granted contract does not nag the player', () => {
  it("THE SYMPTOM: a grant does not make your next FIRST accept render compact", async () => {
    // The player-visible consequence, asserted nowhere before: OTA-1048 keys the
    // compact accept card off the same counter the burst uses.
    const store = await boot('Granted');
    const neutral = HUNTS.filter((h) => h.factionId === null);
    _resetAcceptBurst();
    store.setState((st) => ({ player: { ...st.player!, milestones: {
      ...(st.player!.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 }),
      questsAccepted: 3 } } }));
    for (let i = 0; i < 3; i++) _bumpQuestsAcceptedForTest({ granted: true });

    const mark = store.getState().gameLog.length;
    store.getState().acceptHunt(neutral[0]!.title);
    const out = store.getState().gameLog.slice(mark).map((e) => e.text).join('\n');
    expect(out).toContain('Open the Contracts board to see the stages');
    expect(out).not.toContain(`✦ Contract accepted — ${neutral[0]!.title}`);
  });

  it('a grant says nothing about stacking promises', async () => {
    const store = await boot('Silent');
    _resetAcceptBurst();
    store.setState((st) => ({ player: { ...st.player!, milestones: {
      ...(st.player!.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 }),
      questsAccepted: 3 } } }));
    const mark = store.getState().gameLog.length;
    for (let i = 0; i < 5; i++) _bumpQuestsAcceptedForTest({ granted: true });
    const out = store.getState().gameLog.slice(mark).map((e) => e.text).join('\n');
    expect(out).not.toMatch(/stacking|Slow down|lot of promises/i);
  });

  it('...but it still counts as a contract accepted', async () => {
    const store = await boot('Counted');
    store.setState((st) => ({ player: { ...st.player!, milestones: {
      ...(st.player!.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 }),
      questsAccepted: 3 } } }));
    _bumpQuestsAcceptedForTest({ granted: true });
    expect(store.getState().player!.milestones!.questsAccepted).toBe(4);
  });
});

describe('OTA-1055 — restitution has to cost something, end to end', () => {
  const AMENDS = 600;
  it('buying from someone you robbed clears the debt through the STORE', async () => {
    // ⚠ Replaces a regex over gameStore.ts. The engine rule was tested and the
    // line that supplies `spent` was grepped, but nothing joined the two.
    const store = await boot('Payer');
    const vendor = { id: 'v_amends_test', name: 'Sallow Vek', title: 'armorer', faction: null,
      offers: [{ itemName: 'Trail Rations', price: AMENDS * 2, quantity: 1 }] };
    const id = vendorNpcId(vendor);
    store.setState((st) => ({
      player: { ...st.player!, tc: AMENDS * 4 },
      currentScene: { ...store.getState().currentScene!, enemies: [], vendor: vendor as never },
      worldMemory: recordNpcDealing(
        recordNpcSighting(st.worldMemory, { id, name: vendor.name }, { nowMs: 1, hoursElapsed: 0 }),
        id, { wrongs: 1 }),
    }));
    expect(getRelation(store.getState().worldMemory, id)!.wrongs).toBe(1);

    store.getState().buyFromVendor('Trail Rations', 1);
    expect(getRelation(store.getState().worldMemory, id)!.wrongs).toBe(0);
  });

  it('SELLING to them does not — the TC moves the wrong way', async () => {
    const store = await boot('Seller');
    const vendor = { id: 'v_amends_sell', name: 'Ret the Ash', title: 'fence', faction: null, offers: [] };
    const id = vendorNpcId(vendor);
    store.setState((st) => ({
      currentScene: { ...store.getState().currentScene!, enemies: [], vendor: vendor as never },
      worldMemory: recordNpcDealing(
        recordNpcSighting(st.worldMemory, { id, name: vendor.name }, { nowMs: 1, hoursElapsed: 0 }),
        id, { wrongs: 1 }),
    }));
    // The sell path records business but no `spent`.
    store.setState((st) => ({
      worldMemory: recordNpcDealing(st.worldMemory, id, { trades: 1, tcTraded: AMENDS * 9 }),
    }));
    expect(getRelation(store.getState().worldMemory, id)!.wrongs).toBe(1);
  });
});
