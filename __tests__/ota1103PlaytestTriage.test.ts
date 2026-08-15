// OTA-1103 — DEVICE-LOG TRIAGE: THE ECHO THAT PAID FOREVER, THE ROOF THAT
// WASN'T, AND THE ARC THE FALL ERASED.
//
// Three defects from one APK-293 playtest log (2026-08-05):
//
//  1. ⚠ ECHO-HOOK FARM. OTA-075's cross-room echo re-planted the SAME
//     most-recent discovery in every new scene — the log shows the Giant
//     Bone Longbow thread completing twice in 15 seconds, +12 TC and a
//     Rare each time, indefinitely repeatable. A memory now surfaces ONCE:
//     the entry is stamped `echoed` at plant time and the scan skips it.
//
//  2. WEATHER BITES UNDER A FACTION'S ROOF. OTA-980's "a roof is a roof"
//     exempts the base graph's open-air rooms (gate / square / culvert) —
//     Reclaimer courtyards. But a faction re-skin can move those rooms
//     indoors: the Architects' gate is "a clerical office with filing
//     cabinets", and the log shows Aetheric arcs landing in it (−2/−2/−3).
//     The open-air call now consults the faction variant's own declaration.
//
//  3. THE FALL THAT ERASED AN ARC. The climb-fall computed new HP from the
//     `player` snapshot captured before the weather tick in the same
//     pipeline, then wrote it absolutely — the log shows an arc's −3 land
//     at 14 HP and the fall 71ms later still reading "pre-fall hp=14",
//     ending at 10 where 7 was owed. The fall now reads HP live.

jest.setTimeout(20000);

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  findReferenceableInvestigation,
  type InvestigationEntry,
} from '../app/engine/investigationTable';
import { hubRoomOpenAir } from '../app/engine/hub';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const store = src('app/state/gameStore.ts');

const entry = (noun: string, consumedAt: number, extra: Partial<InvestigationEntry> = {}): InvestigationEntry => ({
  noun,
  category: 'relic' as InvestigationEntry['category'],
  generatedAt: consumedAt - 1000,
  loreLine: null,
  yield: null,
  hookKind: null,
  consumed: true,
  consumedAt,
  result: { kind: 'item', detail: 'Bone Sliver' } as InvestigationEntry['result'],
  ...extra,
});

describe('OTA-1103 — a memory surfaces once', () => {
  const rooms = {
    lab: { roomInvestigationTable: { longbow: entry('Giant Bone Longbow', 2000) } },
    ops: { roomInvestigationTable: { bench: entry('bench', 1000) } },
  };

  it('the scan returns the most recent discovery WITH the room it lives in', () => {
    const ref = findReferenceableInvestigation(rooms, 'elsewhere');
    expect(ref?.entry.noun).toBe('Giant Bone Longbow');
    expect(ref?.roomKey).toBe('lab');
  });

  it('⚠ an echoed entry is SPENT — the scan moves on instead of re-picking it forever', () => {
    const marked = {
      lab: { roomInvestigationTable: { longbow: entry('Giant Bone Longbow', 2000, { echoed: true }) } },
      ops: { roomInvestigationTable: { bench: entry('bench', 1000) } },
    };
    const ref = findReferenceableInvestigation(marked, 'elsewhere');
    // The farm is dead: the longbow can never seed a second thread. The
    // OLDER un-echoed discovery gets its turn instead.
    expect(ref?.entry.noun).toBe('bench');
    // …and once every memory is spent, the scan honestly returns nothing.
    const allMarked = {
      lab: { roomInvestigationTable: { longbow: entry('Giant Bone Longbow', 2000, { echoed: true }) } },
      ops: { roomInvestigationTable: { bench: entry('bench', 1000, { echoed: true }) } },
    };
    expect(findReferenceableInvestigation(allMarked, 'elsewhere')).toBeNull();
  });

  it('⚠ the store stamps `echoed` AT PLANT TIME, not at thread resolve', () => {
    // Stamping on resolve would let a player who ignores the hook re-roll it
    // room after room. The set() lands in the same block that pushes the hook.
    expect(store).toContain('e.noun === ref.entry.noun ? [k, { ...e, echoed: true }] : [k, e]');
    expect(store).toMatch(/nouns: \[ref\.entry\.noun\],\s*\n\s*plantedLine: buildEchoHookLine\(ref\.entry\)/);
  });
});

describe('OTA-1103 — the roof follows the faction skin', () => {
  it('⚠ the Architects\' gate and operations room are INTERIORS — no weather inside', () => {
    // Base graph says gate/central are open air (Reclaimer courtyards); the
    // Conspiracy variant declares them offices. The override must win.
    expect(hubRoomOpenAir('outpost_gate', 'conspiracy_architects', true)).toBe(false);
    expect(hubRoomOpenAir('outpost_central', 'conspiracy_architects', true)).toBe(false);
  });

  it('a faction with a genuinely open room keeps the sky', () => {
    // The Monarchs' central is "a flagstone court" — declared open.
    expect(hubRoomOpenAir('outpost_central', 'mud_monarchs', true)).toBe(true);
  });

  it('no declaration = the base graph decides, in both directions', () => {
    // Reclaimers have no variant rows: fallback passes through untouched.
    expect(hubRoomOpenAir('outpost_gate', 'reclaimers_guild', true)).toBe(true);
    expect(hubRoomOpenAir('outpost_armory', 'reclaimers_guild', false)).toBe(false);
    // Unknown faction likewise.
    expect(hubRoomOpenAir('outpost_gate', null, true)).toBe(true);
  });

  it('every faction variant of gate + central declares its roof explicitly', () => {
    // The bug was an undeclared assumption; this keeps the declaration
    // complete so a future faction skin can't silently inherit the wrong sky.
    const variants = JSON.parse(src('app/data/world/hub_faction_variants.json')) as {
      factions: Record<string, Record<string, { open_air?: boolean }>>;
    };
    for (const [faction, roomsOf] of Object.entries(variants.factions)) {
      for (const rid of ['outpost_gate', 'outpost_central']) {
        const room = roomsOf[rid];
        if (room) {
          expect(`${faction}/${rid}:${typeof room.open_air}`).toBe(`${faction}/${rid}:boolean`);
        }
      }
    }
  });

  it('the weather tick consults the variant, base set as fallback', () => {
    expect(store).toContain("hubRoomOpenAir(hubRoomNow, get().player?.factionId ?? null, OPEN_AIR_HUB_ROOMS.has(hubRoomNow))");
  });
});

describe('OTA-1103 — the fall reads HP live', () => {
  it('⚠ fall damage is computed from live state, not the pipeline-top snapshot', () => {
    expect(store).toContain('const hpAtFall = get().player?.hp ?? player.hp;');
    expect(store).toContain('const newHp = Math.max(0, hpAtFall - fallDamage);');
    // The stale form must be gone — it silently erased any damage the
    // weather tick applied earlier in the same submit.
    expect(store).not.toContain('const newHp = Math.max(0, player.hp - fallDamage);');
  });

  it('the narration and debug vitals report the same live number', () => {
    expect(store).toContain('`vitals@fall: hp ${hpAtFall}/${player.hpMax}');
    expect(store).toContain('`vitals: pre-fall hp=${hpAtFall}/${player.hpMax}');
  });

  it('the slide and wall-flee paths already read live — locked so they stay that way', () => {
    expect(store).toContain('const liveHpSlide = get().player?.hp ?? player.hp;');
    expect(store).toContain('const livePl = get().player ?? player;');
  });
});
