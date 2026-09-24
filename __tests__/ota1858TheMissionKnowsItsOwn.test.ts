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

// ⚠⚠⚠ OTA-1858 — THE MISSION KNOWS ITS OWN. Package 2 of the mechanical-integrity
// program: can every authored objective actually be obtained, kept, checked and used
// in the order the arc requires?
//
// The corpus answered most of it cleanly and this file pins those answers so they
// cannot rot: 219 grants, 213 requirements, EVERY requirement has an earlier grant in
// its own arc, no name is granted twice, no name is shared between two arcs, and no
// requirement asks for more than its grant hands over. The chain is a chain.
//
// ⚠⚠ WHAT WAS NOT CLEAN — ONE NAME, TWO OBJECTS. Five mission objectives share a name
// with an ordinary tradeable object in the world, and `stageRequirementMet` /
// `grantStageItems` both keyed on NAME ALONE. Measured before the repair:
//
//   · a ['loot','relic','rare'] row satisfied all five requirements;
//   · holding it SUPPRESSED the mission's own grant — landed 0, and the
//     "✦ … mission item" receipt never printed;
//   · that row is NOT quest-locked, so it could be sold or scrapped at any vendor
//     while the mission copy could not.
//
// The quest lock exists so a chain cannot be spent by accident. It never engaged,
// because the protected copy was never handed over. Both halves now count the
// mission's OWN object (questStage.countObjectiveInPack) and they move together —
// see the source pins in §E for why splitting them would brick a live save.
//
// ⚠ WHAT THIS FILE DELIBERATELY DOES NOT CLAIM. It does not require every grant to
// have a later requirement — §A's evidence set is eight authored souvenirs and they
// are asserted to stay legal. It does not rename anything: whether the mystery's
// relic and the world's relic ought to be one fiction is the owner's call, and §B
// pins the five collisions in DATA so a future rename is a visible, deliberate act
// rather than a silent one.

import { useGameStore, grantStageItems } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { countInPack, countObjectiveInPack, stageRequirementMet, stageLocationId } from '../app/engine/questStage';
import { isQuestLockedItem } from '../app/engine/questItems';
import { isUnsellable } from '../app/engine/sellPrice';
import { canScrap } from '../app/engine/scrapEngine';
import { findMysteryById } from '../app/engine/mysteries';
import { findHuntById } from '../app/engine/hunts';
import { contractAnchorId, huntAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter } from '../app/engine/missionEncounter';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';
import huntsRaw from '../app/data/quests/hunts.json';
import mysteriesRaw from '../app/data/quests/mysteries.json';
import storylinesRaw from '../app/data/quests/faction-storylines.json';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const setFn = (fn: never) => store.setState(fn as never);

type Stage = {
  npcName?: string; checkKind?: string | null;
  grants?: { item: string; quantity?: number };
  requires?: { item: string; quantity?: number };
};
type Arc = { family: string; id: string; stages: Stage[] };

const pick = (doc: unknown): Array<{ id: string; stages: Stage[] }> =>
  (Array.isArray(doc) ? doc : Object.values(doc as object).find(Array.isArray)) as never;

const ARCS: Arc[] = [
  ...pick(huntsRaw).map((a) => ({ family: 'hunt', id: a.id, stages: a.stages ?? [] })),
  ...pick(mysteriesRaw).map((a) => ({ family: 'mystery', id: a.id, stages: a.stages ?? [] })),
  ...pick(storylinesRaw).map((a) => ({ family: 'storyline', id: a.id, stages: a.stages ?? [] })),
];
const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

const GRANTS = ARCS.flatMap((a) => a.stages.map((s, i) => ({ a, i, s })).filter((r) => r.s?.grants));
const REQUIRES = ARCS.flatMap((a) => a.stages.map((s, i) => ({ a, i, s })).filter((r) => r.s?.requires));

/** A mission object as `grantStageItems` actually mints it. */
const missionCopy = (name: string, id = 'q1') =>
  ({ id, name, kind: 'misc', quantity: 1, tags: ['quest', 'mission'], description: 'Carried for a mission.' } as never);
/** The same NAME, as the world hands it out — loot, vendor stock, a chest. */
const lookalike = (name: string, id = 'l1') =>
  ({ id, name, kind: 'misc', quantity: 1, tags: ['loot', 'relic', 'rare'] } as never);

// ⚠⚠ §B's MANIFEST — the five measured collisions, arc-anchored. `grantAt`/`reqAt`
// are the authored stage indices; a rename or a re-home breaks this row loudly.
const COLLISIONS = [
  { arc: 'mystery_hollow_crown', item: 'Hollow Crown', grantAt: 2, reqAt: 3, alsoIs: 'Legendary head armour (items/armor.json)' },
  { arc: 'mystery_obsidian_orb', item: 'Shifting Obsidian Orb', grantAt: 2, reqAt: 3, alsoIs: 'Rare loot relic, 850 tc' },
  { arc: 'mystery_temporal_watch', item: 'Temporal Distortion Watch', grantAt: 2, reqAt: 3, alsoIs: 'Rare loot relic, 820 tc' },
  { arc: 'mystery_red_tower', item: 'Fragment of the Red Tower', grantAt: 2, reqAt: 3, alsoIs: 'Rare loot relic, 900 tc' },
  { arc: 'mystery_cradle_compass', item: 'Cradle of Dusk Compass', grantAt: 1, reqAt: 2, alsoIs: 'Legendary loot relic, 5000 tc' },
] as const;

// ⚠ §A's UPHELD SET — grants no stage ever requires. Two hunt souvenirs and six
// mystery relics, all MID-ARC. These are evidence the player keeps, not a broken
// link, and this file exists partly to stop a later pass "tidying" them away.
const EVIDENCE_WITH_NO_LATER_REQUIREMENT = [
  'hunt:hunt_bog_dragon#1', 'hunt:hunt_mud_titan#1',
  'mystery:mystery_drowned_bell_samarran#2', 'mystery:mystery_singing_stone_ostragar#2',
  'mystery:mystery_second_flood_cipher#2', 'mystery:mystery_giants_tooth#2',
  'mystery:mystery_ashen_codex#2', 'mystery:mystery_tuning_fork_asgardar#2',
];

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) await new Promise((r) => setTimeout(r, 15));
}

describe('OTA-1858 §A — the chain is a chain (whole corpus)', () => {
  it('⚠ the census is pinned', () => {
    expect({
      arcs: ARCS.length,
      stages: ARCS.reduce((n, a) => n + a.stages.length, 0),
      grants: GRANTS.length,
      requires: REQUIRES.length,
      // ⚠ 281 -> 287: ENDING batch 1's six epilogue beats. They grant and require
      // nothing, so `grants` and `requires` — the counts this pins — do not move.
    }).toEqual({ arcs: 50, stages: 287, grants: 219, requires: 213 });
  });

  it('⚠⚠⚠ EVERY REQUIREMENT HAS AN EARLIER GRANT IN ITS OWN ARC — nothing is unobtainable', () => {
    const orphans = REQUIRES.filter(
      (r) => !r.a.stages.some((s, j) => j < r.i && s?.grants && norm(s.grants.item) === norm(r.s.requires!.item)),
    ).map((r) => `${r.a.family}:${r.a.id}#${r.i} needs ${r.s.requires!.item}`);
    expect(orphans).toEqual([]);
  });

  it('⚠⚠ no item name is granted by two stages — a mission object has ONE source', () => {
    const by: Record<string, string[]> = {};
    for (const g of GRANTS) (by[norm(g.s.grants!.item)] ??= []).push(`${g.a.family}:${g.a.id}#${g.i}`);
    expect(Object.entries(by).filter(([, v]) => v.length > 1).map(([k, v]) => `${k}: ${v.join(', ')}`)).toEqual([]);
  });

  it('⚠⚠ no item name is shared between two arcs — one arc cannot pay another', () => {
    const by: Record<string, Set<string>> = {};
    for (const r of [...GRANTS, ...REQUIRES]) {
      const name = norm(r.s.grants?.item ?? r.s.requires!.item);
      (by[name] ??= new Set()).add(`${r.a.family}:${r.a.id}`);
    }
    expect(Object.entries(by).filter(([, v]) => v.size > 1).map(([k, v]) => `${k}: ${[...v].join(', ')}`)).toEqual([]);
  });

  it('⚠ no requirement asks for more than its grant hands over', () => {
    const short = REQUIRES.filter((r) => {
      const g = r.a.stages.filter((s, j) => j < r.i && s?.grants && norm(s.grants.item) === norm(r.s.requires!.item)).pop();
      return !!g && (r.s.requires!.quantity ?? 1) > (g.grants!.quantity ?? 1);
    }).map((r) => `${r.a.id}#${r.i}`);
    expect(short).toEqual([]);
  });

  it('⚠⚠ NC5 — a grant with no later requirement is LEGAL, and these eight are the set', () => {
    const reqNames = new Set(REQUIRES.map((r) => norm(r.s.requires!.item)));
    const evidence = GRANTS.filter((g) => !reqNames.has(norm(g.s.grants!.item)))
      .map((g) => `${g.a.family}:${g.a.id}#${g.i}`);
    expect(evidence.sort()).toEqual([...EVIDENCE_WITH_NO_LATER_REQUIREMENT].sort());
    // …and every one of them is mid-arc, not a dangling final beat.
    for (const g of GRANTS.filter((x) => !reqNames.has(norm(x.s.grants!.item)))) {
      expect({ at: `${g.a.id}#${g.i}`, last: g.i === g.a.stages.length - 1 }).toEqual({ at: `${g.a.id}#${g.i}`, last: false });
    }
  });
});

describe('OTA-1858 §B — one name, two objects', () => {
  it('⚠⚠⚠ THE FIVE COLLISIONS ARE STILL EXACTLY THESE FIVE, AND STILL COLLIDE IN DATA', () => {
    for (const c of COLLISIONS) {
      const arc = ARCS.find((a) => a.id === c.arc)!;
      expect({ arc: c.arc, grants: norm(arc.stages[c.grantAt]?.grants?.item) }).toEqual({ arc: c.arc, grants: norm(c.item) });
      expect({ arc: c.arc, requires: norm(arc.stages[c.reqAt]?.requires?.item) }).toEqual({ arc: c.arc, requires: norm(c.item) });
      // The requirement is the arc's last GATED beat in every one of the five.
      // ⚠ Was `stages.length - 1`. mystery_hollow_crown now carries a trailing
      // epilogue behind its climax, so the last INDEX is a verbless beat. What the
      // collision test means is that nothing payable follows the requirement, which
      // is exactly the last-gated index — and that still holds for all five.
      let lastGated = arc.stages.length - 1;
      while (lastGated > 0 && arc.stages[lastGated]?.checkKind == null) lastGated -= 1;
      expect({ arc: c.arc, last: c.reqAt === lastGated }).toEqual({ arc: c.arc, last: true });
    }
  });

  it('⚠⚠⚠ THE MISSION\'S OWN COPY PAYS', () => {
    for (const c of COLLISIONS) {
      expect({ item: c.item, met: stageRequirementMet({ requires: { item: c.item } } as never, [missionCopy(c.item)]) })
        .toEqual({ item: c.item, met: true });
    }
  });

  it('⚠⚠⚠ AND A LOOKALIKE DOES NOT — this is the repair', () => {
    for (const c of COLLISIONS) {
      expect({ item: c.item, met: stageRequirementMet({ requires: { item: c.item } } as never, [lookalike(c.item)]) })
        .toEqual({ item: c.item, met: false });
    }
  });

  it('⚠⚠ WHY IT MATTERS — the lookalike is sellable and scrappable, the mission copy is neither', () => {
    for (const c of COLLISIONS) {
      expect({ item: c.item, locked: isQuestLockedItem(missionCopy(c.item)), sell: isUnsellable(missionCopy(c.item)), scrap: canScrap(missionCopy(c.item)) })
        .toEqual({ item: c.item, locked: true, sell: true, scrap: false });
      expect({ item: c.item, locked: isQuestLockedItem(lookalike(c.item)), sell: isUnsellable(lookalike(c.item)) })
        .toEqual({ item: c.item, locked: false, sell: false });
    }
  });

  it('⚠ the two counts are genuinely different questions', () => {
    const pack = [lookalike('Fragment of the Red Tower')];
    expect(countInPack(pack, 'Fragment of the Red Tower')).toBe(1);        // "things called X"
    expect(countObjectiveInPack(pack, 'Fragment of the Red Tower')).toBe(0); // "the mission's X"
    const both = [lookalike('Fragment of the Red Tower'), missionCopy('Fragment of the Red Tower', 'q2')];
    expect(countInPack(both, 'Fragment of the Red Tower')).toBe(2);
    expect(countObjectiveInPack(both, 'Fragment of the Red Tower')).toBe(1);
  });

  it('⚠⚠ NC3 — A WRONG-BUT-PERFECTLY-VALID MISSION OBJECT DOES NOT PAY', () => {
    // Another arc's quest-locked objective is as protected as this one and still worth
    // nothing here. Identity is the NAME plus the lock, never the lock alone.
    const wrong = missionCopy("Reeve's Brass Token", 'other_arc');
    expect(isQuestLockedItem(wrong)).toBe(true);
    for (const c of COLLISIONS) {
      expect({ item: c.item, met: stageRequirementMet({ requires: { item: c.item } } as never, [wrong]) })
        .toEqual({ item: c.item, met: false });
    }
    // and the reverse, so the assertion is not passing for a trivial reason
    expect(stageRequirementMet({ requires: { item: "Reeve's Brass Token" } } as never, [wrong])).toBe(true);
  });

  it('⚠ and a requirement with no colliding twin is untouched — the other 208 still pay', () => {
    // Bog Dragon's chain, the known-good control: nothing in the world shares these names.
    const bd = ARCS.find((a) => a.id === 'hunt_bog_dragon')!;
    for (const r of bd.stages.map((s, i) => ({ s, i })).filter((x) => x.s?.requires)) {
      expect({ at: r.i, met: stageRequirementMet(r.s as never, [missionCopy(r.s.requires!.item)]) })
        .toEqual({ at: r.i, met: true });
    }
  });
});

describe('OTA-1858 §C — the grant hands over its own object', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Packkeeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    get().skipTutorial?.();
    await settle(() => !!get().currentScene);
  });

  const NAME = 'Fragment of the Red Tower';
  const clear = () => {
    const p = get().player!;
    store.setState({ player: { ...p, inventory: p.inventory.filter((i) => i.name !== NAME) } });
  };

  it('⚠⚠⚠ A LOOKALIKE NO LONGER SUPPRESSES THE GRANT — the mission hands over its own', () => {
    clear();
    const p = get().player!;
    store.setState({ player: { ...p, inventory: [...p.inventory, lookalike(NAME, 'looted')] } });
    const def = findMysteryById('mystery_red_tower')!;
    const before = get().gameLog.length;
    const landed = grantStageItems(get as never, setFn as never, def.title, def.stages as never, 2, 3);
    expect(landed).toBe(1);
    const rows = (get().player?.inventory ?? []).filter((i) => i.name === NAME);
    expect(rows.length).toBe(2);                                   // the looted one AND the mission one
    expect(rows.some((r) => isQuestLockedItem(r))).toBe(true);
    expect(get().gameLog.slice(before).some((e) => e.text.includes('mission item'))).toBe(true);
  });

  it('⚠⚠ and it is IDEMPOTENT — a second pass adds nothing, with the lookalike still present', () => {
    const def = findMysteryById('mystery_red_tower')!;
    const landed = grantStageItems(get as never, setFn as never, def.title, def.stages as never, 2, 3);
    expect(landed).toBe(0);
    const mine = (get().player?.inventory ?? []).filter((i) => i.name === NAME && isQuestLockedItem(i));
    expect(mine.reduce((n, r) => n + (r.quantity ?? 0), 0)).toBe(1);
  });

  it('⚠⚠ the pack now satisfies the arc\'s last beat, and the looted relic is still the player\'s to sell', () => {
    const inv = get().player?.inventory ?? [];
    expect(stageRequirementMet({ requires: { item: NAME } } as never, inv)).toBe(true);
    const looted = inv.find((i) => i.id === 'looted')!;
    expect(isUnsellable(looted)).toBe(false);
  });

  it('⚠⚠ SAVE AND RELOAD PRESERVES THE CHAIN', async () => {
    await get().persist();
    await get().hydrate();
    const inv = get().player?.inventory ?? [];
    expect(countObjectiveInPack(inv, NAME)).toBe(1);
    expect(stageRequirementMet({ requires: { item: NAME } } as never, inv)).toBe(true);
  });

  it('⚠ an empty pack still gets it, exactly once, quest-tagged — the catch-up heal still works', () => {
    clear();
    const def = findMysteryById('mystery_red_tower')!;
    expect(grantStageItems(get as never, setFn as never, def.title, def.stages as never, 2, 3)).toBe(1);
    expect(grantStageItems(get as never, setFn as never, def.title, def.stages as never, 2, 3)).toBe(0);
    const row = (get().player?.inventory ?? []).find((i) => i.name === NAME)!;
    expect(row.tags).toEqual(['quest', 'mission']);
  });
});

describe('OTA-1858 §D — the door refuses, and names what it wants', () => {
  // The Monarch's Waystation: mystery_hollow_crown #3 is a `boss` beat with a person
  // standing in it, so the mission ENCOUNTER CARD is the player-facing door — and the
  // card's PROCEED exists only when the pack satisfies the stage.
  const def = () => findMysteryById('mystery_hollow_crown')!;
  const where = () => stageLocationId(def().stages[3] as never, contractAnchorId(def() as never), resolvePosterLocation)!;

  const seat = (rows: unknown[]) => {
    const p = get().player!;
    store.setState({
      player: {
        ...p,
        ...placedAt(where()),
        hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        inventory: [...p.inventory.filter((i) => i.name !== 'Hollow Crown'), ...(rows as never[])],
        activeMysteries: [{ id: 'mystery_hollow_crown', stage: 3, tracked: true } as never],
      },
      activeBuildingId: null,
    });
  };
  const card = () => armedEncounter(get().player);

  it('⚠⚠ WITH NOTHING — the card owes the crown and offers no way forward', () => {
    seat([]);
    const c = card()!;
    expect(c.missionId).toBe('mystery_hollow_crown');
    expect(c.owed).toBe('Hollow Crown');
    expect(choicesFor(freshEncounter(c.key), { hasFight: c.hasFight, canPersuade: c.canPersuade })).not.toContain('proceed');
  });

  it('⚠⚠⚠ WITH THE LOOKALIKE — still owed, still no way forward. The bought crown does not pay.', () => {
    seat([lookalike('Hollow Crown', 'bought')]);
    const c = card()!;
    expect(c.owed).toBe('Hollow Crown');
    expect(c.canPersuade).toBe(false);
    expect(choicesFor(freshEncounter(c.key), { hasFight: c.hasFight, canPersuade: c.canPersuade })).not.toContain('proceed');
  });

  it('⚠⚠⚠ WITH THE MISSION\'S OWN — nothing owed, and the door opens', () => {
    seat([missionCopy('Hollow Crown', 'mine')]);
    const c = card()!;
    expect(c.owed).toBeNull();
    expect(c.canPersuade).toBe(true);
    expect(choicesFor(freshEncounter(c.key), { hasFight: c.hasFight, canPersuade: c.canPersuade })).toContain('proceed');
  });

  it('⚠ the control still opens: Bog Dragon\'s Mira beat pays with the token she was given', () => {
    const bd = findHuntById('hunt_bog_dragon')!;
    const stage = bd.stages[2];
    const p = get().player!;
    store.setState({
      player: {
        ...p,
        ...placedAt(stageLocationId(stage as never, huntAnchorId(bd as never), resolvePosterLocation)!),
        hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        inventory: [...p.inventory.filter((i) => !/Brass Token/.test(i.name)), missionCopy("Reeve's Brass Token", 'bt')],
        activeMysteries: [],
        activeHunts: [{ id: 'hunt_bog_dragon', stage: 2, tracked: true } as never],
      },
      activeBuildingId: null,
    });
    const c = armedEncounter(get().player)!;
    expect(c.missionId).toBe('hunt_bog_dragon');
    expect(c.owed).toBeNull();
    expect(choicesFor(freshEncounter(c.key), { hasFight: c.hasFight, canPersuade: c.canPersuade })).toContain('proceed');
  });
});

describe('OTA-1858 §E — the two halves move together', () => {
  it('⚠⚠⚠ the requirement check and the grant guard read the SAME count', () => {
    const QS = readFileSync(join(__dirname, '..', 'app', 'engine', 'questStage.ts'), 'utf8');
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // stageRequirementMet asks for the mission's own object…
    const body = QS.slice(QS.indexOf('export function stageRequirementMet'));
    expect(body.slice(0, 420)).toContain('countObjectiveInPack(inventory, req.item)');
    // …and so does grantStageItems' idempotency guard. Split them and a player holding
    // a lookalike is bricked: the gate tightens while the grant stays suppressed.
    const guard = GS.slice(GS.indexOf('export function grantStageItems'));
    expect(guard.slice(0, 2600)).toContain('QS.countObjectiveInPack(live.inventory, g.item)');
    expect(guard.slice(0, 2600)).not.toContain('QS.countInPack(live.inventory, g.item)');
  });

  it('⚠ countInPack itself is untouched — every other reader keeps the old question', () => {
    const QS = readFileSync(join(__dirname, '..', 'app', 'engine', 'questStage.ts'), 'utf8');
    const f = QS.slice(QS.indexOf('export function countInPack'), QS.indexOf('OTA-1858 — COUNT THE MISSION'));
    expect(f).not.toContain('isQuestLockedItem');
  });
});
