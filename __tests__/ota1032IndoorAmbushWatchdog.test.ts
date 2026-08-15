// OTA-1032 — WHO CAN AMBUSH YOU INDOORS, and HOW FAST QWEN COMES BACK.
// (1) The owner's log: resting in the Builders' crew bunks inside fortified
//     Asgardar summoned a Rare 202-HP Mud Cyclops, narrated as if it crossed
//     open country. The odds were right (a hub rest is 8% vs the wilds' 22%) —
//     the cast was wrong. Under a roof the pick is now swapped for an
//     indoor-plausible foe AT THE SAME RARITY.
// (2) The same log spends ~2 minutes on canned templates while Qwen recovers,
//     because every step of the watchdog dance waited a full 60s tick.
import * as fs from 'fs';
import * as path from 'path';
import {
  INDOOR_AMBUSHERS, indoorAmbusherNames, isIndoorPlausibleEnemy,
  pickIndoorAmbusher, indoorRestWakeLine, indoorRestArrivalLine,
} from '../app/engine/indoorAmbush';
import { findEnemyByName } from '../app/engine/encounter';

describe('OTA-1032 — the indoor cast is real, and believable', () => {
  it('every name in the cast exists in the enemy roster', () => {
    const missing = indoorAmbusherNames().filter((n) => !findEnemyByName(n));
    expect(missing).toEqual([]);
  });

  it('each rarity bucket holds enemies of THAT rarity — the swap preserves danger', () => {
    for (const [rarity, names] of Object.entries(INDOOR_AMBUSHERS)) {
      for (const name of names) {
        const e = findEnemyByName(name);
        expect({ name, rarity: e?.rarity }).toEqual({ name, rarity });
      }
    }
  });

  it('the open-country megafauna that caused this are NOT admitted', () => {
    // The owner's actual ambusher, plus the rest of the "not in a bunkroom" set.
    for (const beast of [
      'Mud Cyclops', 'Mud Boar', 'Silt Serpent', 'Mud Drake', 'Rock Basilisk',
      'Aetheric Lion', 'Mud Harpy', 'Sludge Behemoth', 'Iron Titan',
      'Metal Hydra', 'Storm Walker', 'Aetheric Behemoth',
    ]) {
      expect({ beast, admitted: isIndoorPlausibleEnemy(beast) }).toEqual({ beast, admitted: false });
    }
  });

  it('the cast covers the four things that CAN be inside with you', () => {
    // An intruder, vermin, a machine on its rounds, and the sealed dead.
    expect(isIndoorPlausibleEnemy('Silt Thief')).toBe(true);
    expect(isIndoorPlausibleEnemy('Gutter Rat')).toBe(true);
    expect(isIndoorPlausibleEnemy('Aetheric Drone')).toBe(true);
    expect(isIndoorPlausibleEnemy('Drowned Aetherkin')).toBe(true);
  });

  it('pickIndoorAmbusher returns a same-rarity foe, and null for nonsense', () => {
    for (const rarity of ['Common', 'Uncommon', 'Rare', 'Legendary']) {
      const picked = pickIndoorAmbusher(rarity);
      expect(picked).toBeTruthy();
      expect(picked!.rarity).toBe(rarity);
      expect(isIndoorPlausibleEnemy(picked!.name)).toBe(true);
    }
    expect(pickIndoorAmbusher('Mythic')).toBeNull();
    expect(pickIndoorAmbusher(null)).toBeNull();
    expect(pickIndoorAmbusher(undefined)).toBeNull();
  });

  it('the indoor beats never use open-ground imagery', () => {
    const banned = /circled|crosses your path|crests the rise|closes the distance|open ground|across the mud/i;
    for (let i = 0; i < 40; i++) {
      expect(indoorRestWakeLine()).not.toMatch(banned);
      expect(indoorRestArrivalLine('A Silt Thief')).not.toMatch(banned);
    }
    // ...and the arrival line actually names the foe.
    expect(indoorRestArrivalLine('A Silt Thief')).toMatch(/A Silt Thief/);
  });
});

describe('OTA-1032 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const store = read('app', 'state', 'gameStore.ts');

  it('the rest ambush swaps the cast under a roof, at the same rarity', () => {
    expect(store).toMatch(/pickIndoorAmbusher\(rawWildRestEnemy\.rarity\)/);
    expect(store).toMatch(/const rawRestEnemy = restIndoorSwap \?\? rawWildRestEnemy;/);
    // Both narration beats branch on the roof test.
    expect(store).toMatch(/restAmb\.indoorRestWakeLine\(\)/);
    expect(store).toMatch(/restAmb\.indoorRestArrivalLine\(withArticleCap\(enemy\.name\)\)/);
  });

  it('the roof test reuses the scoped one that treats the gate as open air', () => {
    expect(store).toMatch(/const restUnderRoof = underRoof;/);
    expect(store).toMatch(/OPEN_AIR_HUB_ROOMS/);
  });

  it('the watchdog polls adaptively and wakes on foreground', () => {
    expect(store).toMatch(/QWEN_WATCHDOG_HEALTHY_MS = 60_000/);
    expect(store).toMatch(/QWEN_WATCHDOG_RECOVERING_MS = 5_000/);
    // The fixed-interval loop is gone; health drives the next delay.
    expect(store).not.toMatch(/QWEN_WATCHDOG_INTERVAL_MS/);
    // OTA-1084 — the recovering delay now runs through the backoff ladder.
    expect(store).toMatch(/schedule\(healthy \? QWEN_WATCHDOG_HEALTHY_MS : qwenRecoveringDelayMs\(\)\)/);
    // Dormancy is caused by backgrounding, so the return to foreground checks.
    expect(store).toMatch(/AppState\.addEventListener\('change'/);
    // ⚠ RETARGETED BY OTA-1173. The claim — "the return to foreground checks" — is
    // unchanged and still asserted below; what moved is that a bare iOS `active` no longer
    // qualifies. `active` fires there for a notification banner or a Control Center pull,
    // so the old spelling kicked a ~400MB context load on incidental twitches.
    expect(store).toMatch(/if \(!qwenTrulyBackgrounded\) return;/);
    const fg = store.indexOf('if (!qwenTrulyBackgrounded) return;');
    expect(store.slice(fg, fg + 700)).toMatch(/tick\(\);/);
  });

  it('the health check reports health rather than just returning', () => {
    expect(store).toMatch(/function runQwenHealthCheck\(/);
    // Healthy path returns true, recovering paths return false.
    const start = store.indexOf('function runQwenHealthCheck(');
    const body = store.slice(start, start + 4000);
    expect(body).toMatch(/return true;/);
    expect(body).toMatch(/return false;/);
  });
});
