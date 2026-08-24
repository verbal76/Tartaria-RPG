// OTA-1186 — A FACTION'S SITE WEARS ITS OWN COLOURS, NOT THE VISITOR'S.
//
// ⚠ WHAT IT WAS. `hubRoomFor` and `hubNameForFaction` were called with `player.factionId`
// at every one of their 17 call sites, so a Mud Monarch saw "The Atrium" and "Monarch
// Court" at every outpost in the world — including the Architects' own. One map wearing
// your colours wherever you went, which is why the world did not read as though factions
// held ground.
//
// ⚠⚠ AND THE WORLD MAP ALREADY DISAGREED WITH IT. `MapScreen.OUTPOST_NAME_BY_LOCATION`
// (arb105) has always tagged each of the nine faction tiles with its OWNER'S outpost name,
// so the travel list said "Monarch Waystation (Monarch Court)" and then the interior called
// itself yours. This makes the inside agree with the list that already shipped — which is
// why it is a correction rather than a new design.
//
// ⚠ THE LAYOUT DOES NOT MOVE. Same 15-room graph, same exits, same anchorNpc. Only the
// name set changes. WHO those anchors answer for is PUNCHLIST P9 and is deliberately out.

import {
  hubOwnerFaction,
  hubSkinFactionFor,
  hubRoomFor,
  hubNameForFaction,
  findHubRoom,
  HUB,
  isLostCapitalHub,
  hubDisplayNameFor,
} from '../app/engine/hub';
import { FACTION_STARTING_LOCATION } from '../app/engine/character';
import fs from 'fs';
import { callAt } from '../test-utils/srcBlock';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('OTA-1186 — who owns a hub site', () => {
  test('every faction owns its own starting site', () => {
    for (const [factionId, locId] of Object.entries(FACTION_STARTING_LOCATION)) {
      expect(hubOwnerFaction(locId)).toBe(factionId);
    }
  });

  test('all nine owned sites really do render the hub interior', () => {
    // If one of them were not in hubLocationIds the ownership map would be pointing at a
    // place that never draws a hub room, and the change would silently do nothing there.
    const hubs = new Set(HUB.hubLocationIds ?? []);
    for (const locId of Object.values(FACTION_STARTING_LOCATION)) {
      expect(hubs.has(locId)).toBe(true);
    }
  });

  test('an unowned hub site has no owner', () => {
    expect(hubOwnerFaction('asgardar')).toBeNull();
    expect(hubOwnerFaction('tartarian_outskirts')).toBeNull();
  });

  test('a missing location is safe', () => {
    expect(hubOwnerFaction(null)).toBeNull();
    expect(hubOwnerFaction(undefined)).toBeNull();
    expect(hubOwnerFaction('not_a_place')).toBeNull();
  });
});

describe('⚠⚠ OTA-1186 — nine sites move, and NOTHING else does', () => {
  test('at another faction’s site you see THEIR colours', () => {
    expect(hubSkinFactionFor('architect_blind', 'mud_monarchs')).toBe('conspiracy_architects');
    expect(hubSkinFactionFor('monarch_waystation', 'stone_builders')).toBe('mud_monarchs');
  });

  test('at your OWN site you still see yours, because it is yours', () => {
    expect(hubSkinFactionFor('monarch_waystation', 'mud_monarchs')).toBe('mud_monarchs');
  });

  // ⚠⚠⚠ REBUILT BY OTA-1458, AND THE SPLIT IS THE WHOLE POINT. This was one test
  // asserting one rule — "an UNOWNED site falls back to the player" — over two cases
  // that turned out to want opposite answers. The owner, from his device log, walking
  // into a sealed pre-flood capital: *"[world] You've left The Hidden Market and
  // entered Drakova. A Lost Capital. [world] You pass through the gate into Monarch
  // Court — The Atrium."* He called that an error. A drowned city cannot present the
  // Mud Monarchs' toll-court because the visitor happens to be a Monarch — that is
  // precisely the defect OTA-1186 set out to kill, surviving in the places nobody
  // holds.
  //
  // ⚠ OTA-1186'S OBJECTION WAS REAL AND IS NOW ANSWERED, NOT OVERRULED. It declined
  // to return null because `hubNameForFaction(null)` resolves to "Reclaimers' Outpost"
  // — a worse lie. `hubDisplayNameFor` now names an unheld capital after ITSELF, so
  // the objection no longer applies. The reasoning was sound; the missing piece was
  // the namer.
  //
  // ⚠ AND HALF THE OLD CLAIM SURVIVES INTACT. `tartarian_outskirts` is unowned too,
  // and genuinely IS the Reclaimers' Outpost (static_hub.json still anchors HUB.hubName
  // there), so the player fallback stays exactly right for it. Splitting the test is
  // what makes both halves testable; the old one could only be right about one.
  test('⚠⚠⚠ an unheld CAPITAL wears NOBODY’s colours — not even the visitor’s', () => {
    for (const capital of ['asgardar', 'drakova', 'buried_cities', 'giant_vault']) {
      expect(hubSkinFactionFor(capital, 'mud_monarchs')).toBeNull();
      expect(hubSkinFactionFor(capital, 'stone_builders')).toBeNull();
      expect(isLostCapitalHub(capital)).toBe(true);
    }
  });

  test('⚠⚠⚠ …and ALL FOUR are found — the first derivation silently missed two', () => {
    // The first version of this derived the set from the macro-region ladder
    // (LOCATION_TO_MACRO === 'lost_capitals'). It matched Drakova and Asgardar and
    // MISSED Giant Vault (filed under aetherstone_deep) and Buried Cities (silt_wastes)
    // — the ladder classifies by GEOGRAPHY, not by who holds a place. Two of the four
    // would have shipped still wearing the player's colours, with nothing failing.
    // Ownership is the property actually in question, so ownership is what it reads.
    const found = ['asgardar', 'drakova', 'buried_cities', 'giant_vault']
      .filter((id) => isLostCapitalHub(id));
    expect(found).toHaveLength(4);
  });

  test('⚠⚠ an unheld capital NAMES ITSELF — the objection OTA-1186 raised is closed', () => {
    // The failure this forbids is the one that stopped OTA-1186 making this change:
    // a capital renamed to somebody else's outpost. Both wrong answers are checked,
    // not just the one we happen to produce today.
    for (const [id, name] of [['drakova', 'Drakova'], ['giant_vault', 'The Giant Vault']] as const) {
      const shown = hubDisplayNameFor(id, 'mud_monarchs');
      expect(shown).toBe(name);
      expect(shown).not.toBe(HUB.hubName);              // not "Reclaimers' Outpost"
      expect(shown).not.toBe(hubNameForFaction('mud_monarchs')); // not the visitor's
    }
  });

  test('⚠⚠ an unowned NON-capital still falls back to the player — unchanged', () => {
    // The surviving half of OTA-1186's claim. tartarian_outskirts is unowned but is
    // the Reclaimers' Outpost in fact, so the visitor fallback is correct there.
    expect(hubSkinFactionFor('tartarian_outskirts', 'stone_builders')).toBe('stone_builders');
    expect(isLostCapitalHub('tartarian_outskirts')).toBe(false);
  });

  test('⚠⚠ AND THE NINE OWNED SITES DID NOT MOVE — this OTA touches only the unheld', () => {
    // The regression that would matter most: breaking the thing OTA-1186 built while
    // correcting its edge case.
    expect(hubSkinFactionFor('architect_blind', 'mud_monarchs')).toBe('conspiracy_architects');
    expect(hubSkinFactionFor('monarch_waystation', 'stone_builders')).toBe('mud_monarchs');
    expect(hubSkinFactionFor('varakush', 'mud_monarchs')).toBe('forgotten_order');
  });

  test('⚠ the premise of that fallback — the neutral name really is a faction’s', () => {
    // If HUB.hubName ever became genuinely neutral this test goes quiet, so it checks the
    // reason the fallback exists rather than only the fallback.
    expect(HUB.hubName).toBe(hubNameForFaction('reclaimers_guild'));
  });

  test('a factionless player at an unowned site does not crash', () => {
    expect(hubSkinFactionFor('asgardar', null)).toBeNull();
    expect(hubSkinFactionFor(null, null)).toBeNull();
  });

  test('⚠ an owned site wins even for a factionless player', () => {
    expect(hubSkinFactionFor('architect_blind', null)).toBe('conspiracy_architects');
  });
});

describe('⚠⚠ OTA-1186 — the LAYOUT is untouched. Only names change.', () => {
  const ROOMS = HUB.rooms.map((r) => r.id);

  test('every room keeps its exits, anchor and tags under a foreign skin', () => {
    for (const id of ROOMS) {
      const base = findHubRoom(id)!;
      const skinned = hubRoomFor(id, 'conspiracy_architects')!;
      expect(skinned.exits).toEqual(base.exits);
      expect(skinned.anchorNpc).toBe(base.anchorNpc);
      expect(skinned.tags).toEqual(base.tags);
      expect(skinned.interactables).toEqual(base.interactables);
    }
  });

  test('⚠ the broker is still at the gate under every faction’s skin', () => {
    // OTA-1185's entire fix rests on this. If a skin could move an anchor, the trading
    // post could vanish from a site and take the P2 fallback with it.
    for (const factionId of Object.keys(FACTION_STARTING_LOCATION)) {
      expect(hubRoomFor('outpost_gate', factionId)!.anchorNpc).toBe('Halem the Trader');
    }
  });

  test('at least one room really is renamed, or this OTA does nothing', () => {
    const base = findHubRoom('outpost_gate')!;
    const arch = hubRoomFor('outpost_gate', 'conspiracy_architects')!;
    expect(arch.name).not.toBe(base.name);
  });
});

describe('⚠⚠ OTA-1186 — no call site still passes the player’s faction raw', () => {
  test('the store, the input row and the map all resolve the skin first', () => {
    // ⚠ Checked per CALL SITE rather than with one regex over the file. The first version
    // used `hubRoomFor\([^)]*,\s*player\.factionId\)` and matched the FIXED code — the
    // nested `hubSkinFactionFor(player.currentLocationId, player.factionId)` ends in
    // exactly that text. A pattern that cannot tell the fix from the defect guards nothing.
    const arb105 = '([factionId, locId]) => [locId, hubNameForFaction(factionId)]';
    for (const rel of ['app/state/gameStore.ts', 'app/components/InputBox.tsx', 'app/screens/MapScreen.tsx']) {
      const src = SRC(rel);
      expect(src).toContain('hubSkinFactionFor');
      for (const fn of ['hubRoomFor(', 'hubNameForFaction(']) {
        for (let i = src.indexOf(fn); i !== -1; i = src.indexOf(fn, i + 1)) {
          // ⚠ OTA-1484 — the 140-byte guess became the call's OWN parens
          // (callAt), so the window is exactly this call's arguments — and a
          // multiline call, which the old first-line skip quietly excused from
          // the rule, is now inspected like every other.
          const call = callAt(src, fn, { from: i });
          if (call.startsWith('hubNameForFaction(factionId)')) continue;  // arb105, below
          if (src.slice(Math.max(0, i - 60), i + 80).includes(arb105)) continue;
          // ⚠ Two accepted spellings: the resolver called inline, or its result hoisted
          // into a local (InputBox computes it once for a useMemo dep list).
          // What must NEVER appear is the player's faction handed straight to a hub call.
          //
          // ⚠⚠ OTA-1279 — THIS USED TO ACCEPT THE LITERAL NAME `skinFactionId`, WHICH
          // GUARDED THE SPELLING RATHER THAN THE RULE. A correct hoist under any other
          // name failed (the gameStore's `skin`), and — far worse — a RAW faction id
          // would have sailed through unnoticed if someone happened to name it
          // `skinFactionId`. A bare identifier now counts only when this file actually
          // assigns it from the resolver, which is what the rule was ever about.
          const line = call.replace(/\s+/g, ' ');
          const local = /,\s*([A-Za-z_$][\w$]*)\s*\)/.exec(line)?.[1];
          const hoisted = !!local
            && new RegExp(`(?:const|let)\\s+${local}\\s*=\\s*[^;]*hubSkinFactionFor\\(`).test(src);
          const resolved = line.includes('hubSkinFactionFor') || hoisted;
          expect({ rel, line, resolved }).toEqual({ rel, line, resolved: true });
        }
      }
    }
  });

  test('⚠ the world map’s per-site outpost names are LEFT ALONE, on purpose', () => {
    // arb105 already resolved each tile to its OWNER. It is the thing the interior is
    // being brought into line with, so rewriting it would be backwards.
    const src = SRC('app/screens/MapScreen.tsx');
    expect(src).toContain('([factionId, locId]) => [locId, hubNameForFaction(factionId)]');
  });

  test('the ownership map is derived, never re-typed', () => {
    // A second hand-written faction→site list is a second thing to keep in sync.
    const src = SRC('app/engine/hub.ts');
    expect(src).toContain('FACTION_STARTING_LOCATION');
    expect(src).toContain('Object.entries(FACTION_STARTING_LOCATION).map');
  });
});
