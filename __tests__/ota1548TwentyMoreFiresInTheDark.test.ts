/**
 * OTA-1548 — TWENTY MORE FIRES IN THE DARK.
 *
 * Owner: *"we need at least 20 more whispers that follow the yulka chain but
 * have different quests different people giving them out different rewards
 * and different themes."*
 *
 * ⚠⚠⚠ THE MACHINE WAS ONE PERSON DEEP. Meet, accept, buy, leave, fetch,
 * recover, return, ambush, panel copy, route labels, typed commands, the talk
 * sheet — all hardcoded to Yulka by name. The content moved onto ChainDef
 * (app/engine/whisperChains.ts) and the engine now runs ANY entry in the
 * table; Yulka is row one and her behavior is pinned byte-identical below.
 *
 * ⚠⚠⚠ AND THE AUDIT CAUGHT HER LYING ABOUT SOUTH. Yulka's targetOffset was
 * dyRange [-3,-2] — which walks NORTH (north = y−1 everywhere in the engine)
 * — while every authored line says "south". SET COURSE masked it by routing
 * to the stored tile; a player following the prose on foot could never have
 * found her. The data now agrees with the fiction, and every chain's copy
 * DIRECTION IS GENERATED FROM ITS OFFSET, with the plant-line prose locked
 * against it here so the class cannot be authored again.
 *
 * ⚠⚠ TWENTY-ONE CHAINS, TWENTY-THREE NEW HUMANS. Every mark and ambusher is
 * a real enemies.json entry of type Human — which, by OTA-1035's law, pools
 * them into FACTION_BODIES; ambient faction fights get the new faces free.
 */
import {
  CHAINS,
  findChain,
  offsetDirWord,
  offsetSpanText,
  activeHoursText,
  pronounForms,
  describeWhisperStage,
  whisperRouteTarget,
  makeStolenGoods,
} from '../app/engine/whispers';
import { findEnemyByName } from '../app/engine/encounter';
import { FACTION_BODIES, FACTION_NOUN_BY_BODY } from '../app/engine/factionBodies';
import type { WhisperRecord } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const STORE = src('app', 'state', 'gameStore.ts');

const HUB_ROOM_IDS = (() => {
  const hub = JSON.parse(src('app', 'data', 'world', 'static_hub.json')) as unknown;
  const ids = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>;
      if (typeof rec.id === 'string' && rec.id.startsWith('outpost_')) ids.add(rec.id);
      Object.values(rec).forEach(walk);
    }
  };
  walk(hub);
  return ids;
})();

const LOOT_RARITY = (() => {
  const rows = JSON.parse(src('app', 'data', 'relics', 'loot_tables.json')) as Array<{ name: string; rarity: string }>;
  return new Map(rows.map((r) => [r.name, r.rarity]));
})();

/** Item names a chain may pay in that are established outside loot_tables. */
const EXTRA_ITEM_NAMES = new Set(['Aetheric Disc', 'Bone Bolt']);

const DIRS = ['north', 'south', 'east', 'west'] as const;
const mentionsDir = (line: string, dir: string): boolean =>
  new RegExp(`\\b${dir}\\b`, 'i').test(line)
  || new RegExp(`(^|[^A-Za-z])${dir.charAt(0).toUpperCase()}([^A-Za-z]|$)`).test(line);

describe('OTA-1548 — the table is twenty-one chains deep and internally sound', () => {
  it('⚠⚠⚠ at least 21 chains, and identities never collide', () => {
    expect(CHAINS.length).toBeGreaterThanOrEqual(21);
    const ids = CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Typed commands key on the lowercased name; the sheet keys on the name.
    const names = CHAINS.map((c) => c.content.npcName.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const titles = CHAINS.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('⚠⚠⚠ every mark and ambusher is a REAL Human on the roster — the spawn throws otherwise', () => {
    for (const c of CHAINS) {
      const mark = findEnemyByName(c.content.fetchEnemy) as { type?: string } | null;
      expect({ chain: c.id, mark: c.content.fetchEnemy, found: !!mark, type: mark?.type })
        .toEqual({ chain: c.id, mark: c.content.fetchEnemy, found: true, type: 'Human' });
      if (c.content.ambush) {
        const amb = findEnemyByName(c.content.ambush.enemy) as { type?: string } | null;
        expect({ chain: c.id, ambusher: c.content.ambush.enemy, found: !!amb, type: amb?.type })
          .toEqual({ chain: c.id, ambusher: c.content.ambush.enemy, found: true, type: 'Human' });
      }
    }
  });

  it('⚠⚠⚠ every mark is UNIQUE to its chain — the death hook matches by enemy name', () => {
    const marks = CHAINS.map((c) => c.content.fetchEnemy);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it('⚠⚠⚠ every stolen-goods name is UNIQUE — the return step finds them by name', () => {
    const goods = CHAINS.map((c) => c.content.stolen.name);
    expect(new Set(goods).size).toBe(goods.length);
    for (const g of goods) expect(g.startsWith('Stolen ')).toBe(true);
  });

  it('⚠⚠ every plant room is a real static-hub room, and the chains spread across them', () => {
    const rooms = new Set<string>();
    for (const c of CHAINS) {
      for (const r of c.plantLocations) {
        expect({ chain: c.id, room: r, known: HUB_ROOM_IDS.has(r) }).toEqual({ chain: c.id, room: r, known: true });
        rooms.add(r);
      }
    }
    // Different people in different places — not everyone crowding the Mess.
    expect(rooms.size).toBeGreaterThanOrEqual(7);
    // ⚠⚠⚠ AND NEVER THE GATE. outpost_gate is a corridor: every player crosses
    // it on every arrival and departure, and a FRESH CHARACTER IS STANDING IN
    // IT before they have done anything. A chain planted there fires many
    // times more often than its siblings and lands a rumour on character
    // creation — which is also how this rule was found: two chains hung on the
    // gate shifted the random stream at game start, and two unrelated combat
    // suites (OTA-1508's halved-lunge pair, OTA-1017's initiative volley)
    // started reading different dice.
    expect([...rooms]).not.toContain('outpost_gate');
  });

  it('⚠⚠ every reward and buy-grant item is an established name at its established rarity', () => {
    for (const c of CHAINS) {
      const grants = [c.content.reward.item, c.content.buy?.grant].filter(
        (g): g is NonNullable<typeof g> => !!g,
      );
      for (const g of grants) {
        const known = LOOT_RARITY.has(g.name) || EXTRA_ITEM_NAMES.has(g.name);
        expect({ chain: c.id, item: g.name, known }).toEqual({ chain: c.id, item: g.name, known: true });
        const tableRarity = LOOT_RARITY.get(g.name);
        if (tableRarity) {
          expect({ chain: c.id, item: g.name, rarity: g.rarity }).toEqual({ chain: c.id, item: g.name, rarity: tableRarity });
        }
        expect(g.qty).toBeGreaterThan(0);
      }
      expect(c.content.reward.tc).toBeGreaterThanOrEqual(0);
      expect((c.content.reward.item ? 1 : 0) + c.content.reward.tc).toBeGreaterThan(0);
    }
  });

  it('⚠⚠ a giver either sells (buy + button label) or refuses in voice — never neither', () => {
    for (const c of CHAINS) {
      const has = { chain: c.id, sells: !!c.content.buy, labeled: !!c.content.buyBtnLabel, refuses: !!c.content.buyRefusalLine };
      if (c.content.buy) expect(has).toEqual({ chain: c.id, sells: true, labeled: true, refuses: false });
      else expect(has).toEqual({ chain: c.id, sells: false, labeled: false, refuses: true });
      expect(c.content.acceptBtnLabel.length).toBeGreaterThan(0);
    }
  });

  it('⚠ rewards, prices and themes actually vary across the table', () => {
    const tcs = new Set(CHAINS.map((c) => c.content.reward.tc));
    expect(tcs.size).toBeGreaterThanOrEqual(8);
    const kickers = new Set(CHAINS.map((c) => c.content.kicker));
    expect(kickers.size).toBeGreaterThanOrEqual(15);
    const pronouns = new Set(CHAINS.map((c) => c.content.pronoun));
    expect(pronouns.size).toBe(3); // she, he, and they all represented
    // Some chains gate on night, some on day, some not at all.
    const hourKinds = new Set(CHAINS.map((c) => activeHoursText(c.activeHours).includes('after dark') ? 'night'
      : activeHoursText(c.activeHours).includes('daylight') ? 'day' : 'any'));
    expect(hourKinds.size).toBe(3);
  });
});

describe('OTA-1548 — copy and geometry are pinned together', () => {
  it('⚠⚠⚠ every plant line names the direction its offset actually walks — and no other', () => {
    // The Yulka bug, made unauthorable: dyRange [-3,-2] under prose saying
    // "south" ships a camp nobody following the words can find.
    for (const c of CHAINS) {
      const dir = offsetDirWord(c.targetOffset);
      for (const line of c.plantLines) {
        expect({ chain: c.id, line, names: mentionsDir(line, dir) }).toEqual({ chain: c.id, line, names: true });
        for (const other of DIRS) {
          if (other === dir) continue;
          expect({ chain: c.id, line, stray: other, present: new RegExp(`\\b${other}\\b`, 'i').test(line) })
            .toEqual({ chain: c.id, line, stray: other, present: false });
        }
      }
    }
  });

  it('⚠⚠⚠ every pitch names the fetch direction it sends you', () => {
    for (const c of CHAINS) {
      const fdir = offsetDirWord(c.content.fetchOffset);
      expect({ chain: c.id, fdir, named: new RegExp(`\\b${fdir}\\b`, 'i').test(c.content.pitch) })
        .toEqual({ chain: c.id, fdir, named: true });
    }
  });

  it('⚠⚠⚠ Yulka walks SOUTH now, like she always claimed', () => {
    const y = findChain('yulka_discs')!;
    expect(y.targetOffset.dyRange).toEqual([2, 3]);
    expect(offsetDirWord(y.targetOffset)).toBe('south');
    expect(offsetDirWord(y.content.fetchOffset)).toBe('east');
  });

  it('⚠⚠ the copy helpers speak the shipped dialect', () => {
    expect(offsetDirWord({ dxRange: [0, 0], dyRange: [-3, -2] })).toBe('north');
    expect(offsetDirWord({ dxRange: [-3, -2], dyRange: [-1, 1] })).toBe('west');
    expect(offsetSpanText({ dxRange: [-1, 1], dyRange: [2, 3] })).toBe('2-3');
    expect(offsetSpanText({ dxRange: [3, 3], dyRange: [0, 0] })).toBe('3');
    expect(activeHoursText([20, 4])).toBe(', after dark (8 pm to 4 am)');
    expect(activeHoursText([6, 18])).toBe(', in daylight (6 am to 6 pm)');
    expect(activeHoursText(undefined)).toBe('');
    expect(pronounForms('they')).toEqual({ obj: 'them', subjCap: 'They', owes: 'owe' });
  });
});

describe('OTA-1548 — Yulka is row one, byte-identical where it was pinned', () => {
  const legacy = (over: Partial<WhisperRecord> = {}): WhisperRecord => ({
    id: 'yulka_discs', stage: 'planted', plantedAtHour: 0,
    targetMapX: 0, targetMapY: 0, targetLocationId: 'reclaimer_stake', ...over,
  });

  it('⚠⚠⚠ her panel copy renders the exact OTA-1542 strings, generated now', () => {
    expect(describeWhisperStage(legacy({ source: 'Nix' })))
      .toBe('Word from Nix: Yulka camps 2-3 tiles south of where you met them, after dark (8 pm to 4 am). SET COURSE below walks you to the spot.');
    expect(describeWhisperStage(legacy()))
      .toBe('Travel south of the outpost. Yulka camps somewhere in tiles 2-3 south, after dark (8 pm to 4 am).');
    expect(describeWhisperStage(legacy({ stage: 'fetch_in_progress' })))
      .toBe(`Travel east of Yulka's tile. The thief is 2-3 tiles over.`);
    expect(describeWhisperStage(legacy({ stage: 'fetch_returned' })))
      .toBe(`Return to Yulka's tile with the recovered Discs. She owes you 5.`);
    expect(describeWhisperStage(legacy({ stage: 'ambush_armed' })))
      .toBe('Walk home with the Discs. Someone may notice.');
  });

  it('⚠⚠ her route labels are the shipped ones, off the content block', () => {
    expect(whisperRouteTarget(legacy())?.label).toBe(`Yulka's fire`);
    expect(whisperRouteTarget(legacy({ stage: 'fetch_active', ctx: { thiefGridX: 1, thiefGridY: 1 } }))?.label)
      .toBe('the Silt Thief');
    expect(whisperRouteTarget(legacy({ stage: 'fetch_returned' }))?.label).toBe('Yulka (return the Discs)');
  });

  it('⚠⚠ her voice is untouched, and her stolen goods still stack twelve', () => {
    const y = findChain('yulka_discs')!;
    expect(y.content.pitch).toContain('pendejo');
    expect(y.content.buy?.costTc).toBe(50);
    expect(y.content.reward.tc).toBe(30);
    const stolen = makeStolenGoods(y);
    expect(stolen.name).toBe('Stolen Aetheric Discs');
    expect(stolen.quantity).toBe(12);
    expect(stolen.tags).toEqual(['whisper', 'aether', 'quest']);
  });

  it('⚠ a fresh chain renders panel copy through the same generator', () => {
    const line = describeWhisperStage({ ...legacy(), id: 'brasko_lenses', source: 'Nix' });
    expect(line).toBe('Word from Nix: Brasko camps 2-3 tiles east of where you met them, after dark (9 pm to 5 am). SET COURSE below walks you to the spot.');
  });
});

describe('OTA-1548 — the machine dispatches by table, never by name', () => {
  it('⚠⚠⚠ the death hook pays any chain whose mark just died — no Silt Thief literal', () => {
    const code = codeOnly(STORE);
    expect(code).toContain('ch.content.fetchEnemy === enemy.name');
    expect(code).not.toContain("if (enemy.name === 'Silt Thief')");
  });

  it('⚠⚠⚠ the resolver, handlers and sheet action are chain-generic', () => {
    const code = codeOnly(STORE);
    expect(code).toContain('fireWhisperMeet(get, set, meet, meetChain);');
    expect(code).toContain('fireWhisperFetch(get, set, fetch, fetchChain);');
    expect(code).toContain('fireWhisperReturn(get, set, ret, retChain);');
    expect(code).toContain('answerWhisper(choice) {');
    expect(code).not.toContain('fireYulka');
    expect(code).not.toContain('handleYulka');
  });

  it('⚠⚠ hub planting shuffles its candidates; a persuaded wanderer hands out a RANDOM unheld rumour', () => {
    const code = codeOnly(STORE);
    expect(code).toContain('eligibleChains.sort(() => Math.random() - 0.5);');
    expect(code).toContain('unheld[Math.floor(Math.random() * unheld.length)]');
    expect(code).not.toContain('CHAINS.find((c) => !held.has(c.id))');
  });

  it('⚠⚠ every new Human joined the faction-body pools, as OTA-1035 requires', () => {
    const pooled = new Set(Object.values(FACTION_BODIES).flat());
    for (const c of CHAINS) {
      expect({ chain: c.id, mark: c.content.fetchEnemy, pooled: pooled.has(c.content.fetchEnemy) })
        .toEqual({ chain: c.id, mark: c.content.fetchEnemy, pooled: true });
      expect(FACTION_NOUN_BY_BODY[c.content.fetchEnemy]).toBe('Raider');
    }
  });
});
