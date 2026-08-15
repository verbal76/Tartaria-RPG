// OTA-1035 — TWO OWNER ITEMS OFF THE ASGARDAR/ISKAN-VEIL LOG.
// (1) "let's fix the loot drop issue where humans drop beast loot." A faction
//     party is built by RESKINNING a roster entry, and outdoors that entry was
//     whatever the WILD table rolled for the tile — so a "Conspiracy Architects
//     Patrol" could be a Mud Cyclops underneath, dropping Raven Feather and
//     Aether Wing off a man's corpse. Faction fighters now always wear a HUMAN
//     body, the same list the indoor ambush uses since OTA-1056.
// (2) "the battle follow up… should have the flavor text, and the rewards on
//     it." A boss kill fires eight-plus lines from five modules in one tick and
//     the story beat gets shoved off screen by the reward lines. It is collected
//     into one card now.
import * as fs from 'fs';
import * as path from 'path';
import {
  FACTION_BODIES, FACTION_NOUN_BY_BODY, pickFactionBody, dressFactionFighter,
  nounForBody, factionBodyNames,
} from '../app/engine/factionBodies';
import { findEnemyByName } from '../app/engine/encounter';
import { pickIndoorFactionIntruder } from '../app/engine/indoorAmbush';

const ROSTER = (() => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'enemies', 'enemies.json'), 'utf8'),
  ) as { enemies?: unknown[] } | unknown[];
  return (Array.isArray(raw) ? raw : raw.enemies ?? []) as Array<{
    name: string; type: string; rarity: string; drops?: string[];
  }>;
})();

describe('OTA-1035 — a faction fighter is a PERSON', () => {
  it('the body list is exactly the humans in the roster — no one left out', () => {
    const humans = ROSTER.filter((e) => e.type === 'Human').map((e) => e.name);
    expect(humans.length).toBeGreaterThan(0);
    expect([...factionBodyNames()].sort()).toEqual([...humans].sort());
  });

  it('every listed body is a real roster entry at the rarity it is filed under', () => {
    for (const [rarity, names] of Object.entries(FACTION_BODIES)) {
      for (const name of names) {
        const e = findEnemyByName(name) as { type?: string; rarity?: string } | null;
        expect({ name, found: !!e }).toEqual({ name, found: true });
        expect({ name, type: e!.type }).toEqual({ name, type: 'Human' });
        expect({ name, rarity: e!.rarity }).toEqual({ name, rarity });
      }
    }
  });

  it('every body has a noun, and it is one of the two words', () => {
    for (const name of factionBodyNames()) {
      expect(['Raider', 'Soldier']).toContain(nounForBody(name));
      expect(FACTION_NOUN_BY_BODY[name]).toBeTruthy();
    }
  });

  it('NO body drops beast loot — that is the whole bug', () => {
    // The owner's report: Raven Feather and Aether Wing off a faction raider.
    const BEAST_LOOT = /feather|wing|fang|claw|pelt|hide|scale|beak|talon|tail|horn/i;
    for (const name of factionBodyNames()) {
      const row = ROSTER.find((e) => e.name === name)!;
      const beastly = (row.drops ?? []).filter((d) => BEAST_LOOT.test(d));
      expect({ name, beastly }).toEqual({ name, beastly: [] });
    }
  });

  it('pickFactionBody returns that rarity, or null when none exists there', () => {
    for (const rarity of ['Uncommon', 'Rare', 'Legendary']) {
      const b = pickFactionBody(rarity);
      expect({ rarity, got: b?.rarity }).toEqual({ rarity, got: rarity });
    }
    // Common has no human body — the strict form says so.
    expect(pickFactionBody('Common')).toBeNull();
    expect(pickFactionBody(null)).toBeNull();
    expect(pickFactionBody('Mythic')).toBeNull();
  });

  it('with `nearest`, a Common tile still sends PEOPLE — never a beast', () => {
    for (let i = 0; i < 60; i++) {
      const b = pickFactionBody('Common', { nearest: true });
      expect(b).toBeTruthy();
      expect(factionBodyNames()).toContain(b!.name);
    }
    // Nearest walks UP from Common: the cheapest human tier is Uncommon.
    const tiers = new Set(
      Array.from({ length: 60 }, () => pickFactionBody('Common', { nearest: true })!.rarity),
    );
    expect([...tiers]).toEqual(['Uncommon']);
    // An unknown rarity still produces somebody rather than nothing.
    expect(pickFactionBody('Mythic', { nearest: true })).toBeTruthy();
  });

  it('dressing keeps the statline and the DROPS, changes the colours', () => {
    const body = findEnemyByName('Silt Thief')!;
    const solo = dressFactionFighter(body, 'mud_monarchs', 'Mud Monarchs', 'Patrol');
    expect(solo.name).toBe('Mud Monarchs Patrol');
    expect(solo.factionId).toBe('mud_monarchs');
    expect(solo.hp).toBe(body.hp);
    // The DROPS ride along untouched — a soldier's kit, not a bird's. (`drops`
    // is data on the roster row rather than a field on the Enemy type, so it is
    // read off the dressed object rather than through it.)
    const dropsOf = (e: unknown) => (e as { drops?: string[] }).drops;
    expect(dropsOf(solo)).toEqual(dropsOf(body));
    expect(dropsOf(solo)).toEqual(ROSTER.find((r) => r.name === 'Silt Thief')!.drops);
    expect(solo.aliases).toEqual(expect.arrayContaining(['patrol', 'soldier', 'raider', 'intruder']));
    // A party member is numbered; a lone fighter is not.
    const third = dressFactionFighter(body, 'reclaimers', 'Reclaimers', 'Patrol', 3);
    expect(third.name).toBe('Reclaimers Patrol 3');
  });

  it('the indoor path still behaves — one list, both callers', () => {
    const e = pickIndoorFactionIntruder('Rare', 'stone_builders', 'Stone Builders');
    expect(e).toBeTruthy();
    expect(e!.name).toMatch(/^Stone Builders (Raider|Soldier)$/);
    expect(e!.rarity).toBe('Rare');
    // Indoors keeps the strict form: Common stays vermin, not a soldier.
    expect(pickIndoorFactionIntruder('Common', 'stone_builders', 'Stone Builders')).toBeNull();
  });
});

describe('OTA-1035 — the battle follow-up card', () => {
  const store = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
  );
  const modal = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'components', 'MissionCompleteModal.tsx'), 'utf8',
  );

  it('the outdoor raid builder dresses a human body, with a safe fallback', () => {
    expect(store).toMatch(/fbMod\.pickFactionBody\(tmpl\.rarity, \{ nearest: true \}\) \?\? tmpl/);
    expect(store).toMatch(/fbMod\.dressFactionFighter\(/);
    // The old inline reskin is gone.
    expect(store).not.toMatch(/aliases: \[opts\.noun\.toLowerCase\(\), 'soldier', 'raider', opts\.factionName/);
  });

  it('the capture window opens on a BOSS only and always closes', () => {
    expect(store).toMatch(/bossVictoryCapture = enemy\.boss \? \{ name: enemy\.name, flavor: \[\], rewards: \[\] \} : null;/);
    expect(store).toMatch(/bossVictoryCapture = null;\n\s+get\(\)\.raiseBossVictoryNotice\(cap\.name, cap\.flavor, cap\.rewards\);/);
    // Every line passes through the collector, which is a no-op when shut.
    expect(store).toMatch(/captureBossVictoryLine\(channel, text\);/);
  });

  it('rewards and story are split by channel; combat rolls stay in the feed', () => {
    const start = store.indexOf('function captureBossVictoryLine(');
    const body = store.slice(start, start + 900);
    expect(body).toMatch(/channel === 'reward' \? cap\.rewards/);
    expect(body).toMatch(/channel === 'arbiter' \|\| channel === 'world' \? cap\.flavor/);
    expect(body).toMatch(/: null;/);
    expect(body).toMatch(/bucket\.includes\(clean\)/);   // no duplicate lines on the card
  });

  it('the late Resurrection Gem still lands on the card', () => {
    expect(store).toMatch(/if \(enemy\.boss\) get\(\)\.raiseBossVictoryNotice\(enemy\.name, \[\], \[line\]\);/);
  });

  it('one battle raises one card — a mission finished in the same fight merges', () => {
    const start = store.indexOf('raiseMissionCompleteNotice(kind, title, body) {');
    const body = store.slice(start, start + 700);
    expect(body).toMatch(/prev\.title === title \|\| !!prev\.heading/);
    expect(store).toMatch(/function mergeRewardLines\(/);
  });

  it('the modal leads with the flavor and pays out under it', () => {
    expect(modal).toMatch(/flavor\.map\(/);
    expect(modal).toMatch(/THE TAKE/);
    // The story block is rendered BEFORE the reward block.
    expect(modal.indexOf('flavor.map(')).toBeLessThan(modal.indexOf('notice.rewards.map('));
    // A plain mission notice is untouched: no heading, no flavor, same kicker.
    expect(modal).toMatch(/notice\.heading \?\? `\$\{notice\.kind\.toUpperCase\(\)\} COMPLETE`/);
  });

  it('a card with story to read gets a longer safety valve, never a shorter one', () => {
    expect(modal).toMatch(/AUTO_CLOSE_FLAVOR_MS = 60000/);
    expect(modal).toMatch(/hasFlavor \? AUTO_CLOSE_FLAVOR_MS : AUTO_CLOSE_MS/);
    const short = Number(/AUTO_CLOSE_MS = (\d+)/.exec(modal)![1]);
    const long = Number(/AUTO_CLOSE_FLAVOR_MS = (\d+)/.exec(modal)![1]);
    expect(long).toBeGreaterThan(short);
  });
});
