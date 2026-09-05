/**
 * OTA-1576 / OTA-1577 — THE STAGE SAYS WHO IS THERE, AND THE BAR REMEMBERS THE
 * KEYBOARD. Two owner reports he typed straight into the game, in plain English,
 * because the game had left him nowhere else to put them.
 *
 * ⚠⚠⚠ (1) "I'm on stage two of a mission. I'm supposed to find three tartarian
 * raiders on this tile but I haven't." Three separate defects stacked under it:
 *
 *   a. THE NOUN RESOLVER TOOK ONE TOKEN OUT OF TWO. `find the tartarian raider`
 *      resolved to `Tartarian Trap` — a noun sharing only the ADJECTIVE, which
 *      does not contain the word "raider" at all.
 *   b. THE STAGE SPAWNED THE BOSS ITS OWN PROSE SAYS HAS LEFT. `false_summit`
 *      exists to say the target was NOT here — "Embers still warm. REAVER GONE.
 *      Three of his sworn followers rise …" — and every boss stage spawned the
 *      hunt's single global `targetEnemyName` regardless. Both false_summits in
 *      the game did this.
 *   c. AND THERE WAS NO SUCH ENEMY. "Tartarian Raider" is named in the prose and
 *      appears nowhere in enemies.json, so even a correct spawn had nothing to
 *      spawn.
 *
 * ⚠⚠⚠ (2) "there was no text box for this either … I still don't see the full
 * box sitting on top of the keyboard." Fifth report of the same burial, and
 * OTA-1551's latch was already the right idea with the wrong lifetime.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseInput } from '../app/engine/parser';
import { scaleHuntEscort, HUNTS } from '../app/engine/hunts';
import type { PlayerCharacter } from '../app/engine/types';
import ENEMIES from '../app/data/enemies/enemies.json';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const enemies = ENEMIES as unknown as Array<{ name: string; type?: string; hp: number }>;
const player = { hpMax: 34, hp: 34, inventory: [] } as unknown as PlayerCharacter;

describe('OTA-1576 — the noun resolver stops matching on the adjective alone', () => {
  const ctx = (nouns: string[]) => ({ recentNouns: nouns, inventory: [] });

  it('⚠⚠⚠ HIS EXACT LINE NO LONGER LANDS ON THE TRAP', () => {
    // `find the tartarian raider` with a Tartarian Trap in the room. The trap
    // shares "tartarian" and nothing else; "raider" is the head noun and the
    // trap does not contain it.
    const p = parseInput('find the tartarian raider', ctx(['Tartarian Trap', 'mud', 'catwalk']));
    expect(p.resolvedNoun).not.toBe('Tartarian Trap');
  });

  it('⚠⚠⚠ AND IT FINDS THE RAIDER WHEN ONE IS ACTUALLY THERE', () => {
    // The whole point: the fix must not simply refuse everything.
    const p = parseInput('find the tartarian raider', ctx(['Tartarian Trap', 'Tartarian Raider']));
    expect(p.resolvedNoun).toBe('Tartarian Raider');
  });

  it('⚠⚠⚠ FULL COVERAGE BEATS PARTIAL — ranking, not narrowing', () => {
    // Both nouns match "obsidian"; only one matches "pillar" too.
    const p = parseInput('climb the weathered obsidian pillar',
      ctx(['obsidian shard', 'weathered obsidian pillar']));
    expect(p.resolvedNoun).toBe('weathered obsidian pillar');
  });

  it('⚠⚠ LEGITIMATE SHORTHAND STILL WORKS — the head noun is what matters', () => {
    // Every one of these is a real line from his logs. Refusing partial matches
    // outright would have broken all of them.
    expect(parseInput('investigate the cloth', ctx(['blood-spotted cloth'])).resolvedNoun)
      .toBe('blood-spotted cloth');
    expect(parseInput('climb to the cache', ctx(['snagged climbing cache'])).resolvedNoun)
      .toBe('snagged climbing cache');
    expect(parseInput('investigate the mud', ctx(['mud', 'mud wave'])).resolvedNoun)
      .toBe('mud');
  });

  it('⚠⚠ a single-token target is unchanged — 1 of 1 either way', () => {
    expect(parseInput('investigate the ladder', ctx(['ladder'])).resolvedNoun).toBe('ladder');
    expect(parseInput('investigate the banner', ctx(['banner', 'crate'])).resolvedNoun).toBe('banner');
  });

  it('⚠ nothing matching still resolves to nothing, so the refusal can speak', () => {
    const p = parseInput('investigate the aqueduct', ctx(['Tartarian Trap', 'mud']));
    expect(p.resolvedNoun).toBeUndefined();
  });
});

describe('OTA-1576 — the false summit stops spawning the boss it says is gone', () => {
  const HUNTS_JSON = src('app/data/quests/hunts.json');

  it('⚠⚠⚠ THE ENEMY THE PROSE NAMES NOW EXISTS', () => {
    // "jaw-marked Tartarian raiders" appeared in the narration of a shipped
    // hunt and in no catalog anywhere.
    const raider = enemies.find((e) => e.name === 'Tartarian Raider');
    expect(raider).toBeDefined();
    expect(raider!.type).toBe('Human');
    // A tier-2 escort, not a second boss. The Reaver it serves has 310.
    expect(raider!.hp).toBeLessThan(60);
  });

  it('⚠⚠⚠ BOTH FALSE SUMMITS NAME THEIR OWN SPAWN, and neither is the hunt boss', () => {
    const hunts = JSON.parse(HUNTS_JSON) as { hunts?: unknown } | unknown[];
    const rows = (Array.isArray(hunts) ? hunts : (hunts as { hunts: unknown[] }).hunts) as Array<{
      title: string; targetEnemyName: string;
      stages: Array<{ stageType?: string; checkKind?: string | null; spawn?: { enemyName: string; count?: number } }>;
    }>;
    const summits = rows.flatMap((h) => h.stages
      .filter((s) => s.stageType === 'false_summit' && s.checkKind === 'boss')
      .map((s) => ({ hunt: h.title, boss: h.targetEnemyName, spawn: s.spawn })));
    expect(summits).toHaveLength(2);
    for (const s of summits) {
      expect(s.spawn).toBeDefined();
      // The point of the beat: what turns up is NOT the thing you came for.
      expect(s.spawn!.enemyName).not.toBe(s.boss);
      expect(s.spawn!.count).toBe(3);
      // …and whatever it names has to exist.
      expect(enemies.some((e) => e.name === s.spawn!.enemyName)).toBe(true);
    }
  });

  it('⚠⚠⚠ THE STAGE HE WAS ON PUTS THREE RAIDERS IN FRONT OF HIM', () => {
    const hunt = HUNTS.find((h) => h.title === 'Silence the Doubter')!;
    const stage = hunt.stages.find((s) => s.stageType === 'false_summit')!;
    expect(stage.spawn).toEqual({ enemyName: 'Tartarian Raider', count: 3 });
    const pack = scaleHuntEscort(player, stage.spawn!.enemyName, undefined, stage.spawn!.count);
    expect(pack).toHaveLength(3);
    expect(pack.every((e) => e.name === 'Tartarian Raider')).toBe(true);
  });

  it('⚠⚠ an escort is scaled like a boss but NOT named like one', () => {
    // "(hunted)" is how the player reads "this is the one you came for". Three
    // of those would say the opposite of what the beat means.
    const pack = scaleHuntEscort(player, 'Tartarian Raider', undefined, 3);
    expect(pack.every((e) => !e.name.includes('hunted'))).toBe(true);
    // Scaled, though — a tier-2 pack still has to bite at end-game.
    const late = scaleHuntEscort({ ...player, hpMax: 90 } as PlayerCharacter, 'Tartarian Raider');
    expect(late[0]!.hp).toBeGreaterThan(pack[0]!.hp);
  });

  it('⚠⚠ the count is bounded, and an unknown name spawns nothing rather than crashing', () => {
    expect(scaleHuntEscort(player, 'Tartarian Raider', undefined, 99)).toHaveLength(5);
    expect(scaleHuntEscort(player, 'Tartarian Raider', undefined, 0)).toHaveLength(1);
    expect(scaleHuntEscort(player, 'No Such Creature', undefined, 3)).toEqual([]);
  });

  it('⚠⚠ the APEX stages are untouched — they SHOULD spawn the hunt boss', () => {
    // This changed what a false_summit does, not what a boss stage is.
    const QS = src('app/state/slices/questSlice.ts');
    // (OTA-1600 supersede: `peaceful` now reaches the boss scale too — the
    // OTA-1581 contract, finally honoured. Apex stages still spawn on a
    // normal advance; only a landed persuade stands nobody up.)
    expect(QS).toContain('const boss = peaceful || override ? null : scaleHuntBoss(player, hunt, deps.scalePowerOf(player));');
    for (const h of HUNTS) {
      const apex = h.stages.filter((s) => s.stageType === 'apex');
      for (const a of apex) expect(a.spawn).toBeUndefined();
    }
  });
});

describe('OTA-1577 — the keyboard latch outlives the component', () => {
  const KB = src('app/components/KeyboardInputBar.tsx');

  it('⚠⚠⚠ THE HIGH-WATER MARK IS MODULE SCOPE, like the three values beside it', () => {
    // OTA-1551 declared it inside the effect, so its real lifetime was one MOUNT
    // while its own comment claimed the keyboard's. A remount with Gboard still
    // standing reset it to 0 and the next short frame buried the bar.
    const decl = KB.indexOf('let sessionMaxHeight = 0;');
    const firstEffect = KB.indexOf('useEffect(');
    expect(decl).toBeGreaterThan(0);
    expect(decl).toBeLessThan(firstEffect);
    // It sits with the other survivors, not alone.
    expect(KB).toContain('let lastKeyboardHeight = 0;');
    expect(KB).toContain("let bottomLoggedFor = '';");
  });

  it('⚠⚠ it is still cleared by the committed hide — the latch is not permanent', () => {
    // A genuinely shorter next keyboard (another language, a rotation) must
    // measure itself from nothing.
    expect(KB).toContain('sessionMaxHeight = 0;');
  });

  it('⚠⚠ and still one-way: it can only ever hold the bar HIGHER', () => {
    // The failure being fixed is a bar sitting too low. The cure must not be
    // able to manufacture the opposite one.
    expect(KB).toContain('const latched = Math.max(h, sessionMaxHeight);');
  });
});

describe('OTA-1578 — the escort has to be dealt with, not walked away from', () => {
  const QS = src('app/state/slices/questSlice.ts');
  const GS = src('app/state/gameStore.ts');
  const hunt = HUNTS.find((h) => h.title === 'Silence the Doubter')!;
  const stage = hunt.stages[1]!;

  it('⚠⚠⚠ THE STAGE NO LONGER ADVANCES THE MOMENT THEY APPEAR', () => {
    // OTA-1576 gave the stage its own spawn but left the old advance-on-spawn,
    // so three raiders could be left standing and the hunt moved on regardless.
    // Owner's ruling: "have someone there waiting to fight to resolve that
    // stage to move to the next."
    // ⚠ RETARGETED BY OTA-1581, and the claim is UNCHANGED — only the line it
    // sits on moved. 1581 wrapped `freezeForKill` in `!peaceful && (...)` so a
    // persuade that removed the fight, and TAKE after the bodies are down, can
    // advance without waiting on a kill that will never come. The freeze this
    // test exists for still fires for every ordinary spawn stage.
    expect(QS).toContain('|| !!stageDef.spawn');
    expect(QS).toContain('const willFreezeForKill = !peaceful && ('); // OTA-1601: computed early so the route gate can read it
  });

  it('⚠⚠⚠ AND CLEARING THEM IS WHAT MOVES IT ON', () => {
        // ⚠ RETARGETED BY OTA-1583 — GS → QS. The escort clear moved out of
    // gameStore's resolveEnemyDefeat and into questSlice.resolveStageEscortClear:
    // ninety lines of contract-stage logic that happened to sit in the combat
    // path, and gameStore's shrink-only line ratchet is what forced the issue.
    // Every claim below is unchanged; only the address moved.
    expect(QS).toContain("def?.stages[rec.stage]?.spawn?.enemyName === enemy.name");
    expect(QS).toContain('The last of them is down.');
  });

  it('⚠⚠⚠ THE LAST ONE DECIDES — killing raider 1 of 3 resolves nothing', () => {
    // Read from the LIVE scene rather than a spawn count, so a wandering third
    // party joining the fight can never resolve the stage on its own.
    // ⚠ OTA-1612 added the CONSCIOUS clause on a second line (a pack subdued
    // rather than killed reaches here with live HP on every sleeping body, and
    // without it a player who wins by mercy could never close the stage). The
    // rule 1578 pinned is unchanged and is what is checked: the count comes off
    // the LIVE scene, excludes the body being resolved, and matches by name.
    expect(QS).toContain("(e, i) => i !== activeIdx && e.name === enemy.name && (live!.enemyHps[i] ?? 0) > 0");
    expect(QS).toContain("&& !(live!.enemyKnockedOut?.[i] ?? false),");
    expect(QS).toContain('if (!stillUp) {');
  });

  it('⚠⚠ the next beat is announced on the spot — its direction, not its prose (OTA-1687 re-anchor)', () => {
    // The clear used to print `nextDef.narration` on the spot; the contrary
    // walker read Mira "reads the locket" 46 tiles from her holding and the
    // Dragon uncoiling from the steeple while standing on the Mud Seas, then
    // read both again on the ground. The clear now says the clear and the
    // "▸ Next" direction; the beat's own prose prints where the beat happens.
    // ⚠ The one case that keeps the prose on the spot: a next stage on the SAME
    // ground — no arrival will ever narrate it, so the clear must (OTA-1622's
    // card carries it there too).
    expect(QS.includes("if (!movedGround) get().appendLog('world', nextDef.narration);")).toBe(true);
    expect(QS.includes("if (dir) get().appendLog('system', dir);")).toBe(true);
    expect(QS.includes("line: `The last of them is down.${nextDef && !movedGround ? `")).toBe(true);
  });
});

describe('OTA-1578 — the stage text says who is there and what to do', () => {
  const hunt = HUNTS.find((h) => h.title === 'Silence the Doubter')!;
  const stage = hunt.stages[1]!;

  it('⚠⚠⚠ IT NAMES THE COUNT AND THE CREATURE THE ENGINE ACTUALLY SPAWNS', () => {
    // The old text said "Three of his sworn followers rise" and the engine
    // spawned one Reaver. Prose and spawn now agree, and the test reads both.
    expect(stage.spawn).toEqual({ enemyName: 'Tartarian Raider', count: 3 });
    expect(stage.narration).toContain('three of his sworn');
    expect(stage.narration.toLowerCase()).toContain('jaw-marked');
  });

  it('⚠⚠⚠ AND IT TELLS THE PLAYER THE STAGE IS RESOLVED BY FIGHTING', () => {
    // His whole report was not knowing what the tile wanted from him. The beat
    // now says there is no way past and no one to talk to.
    expect(stage.narration).toMatch(/no way past them/i);
    expect(stage.narration).toMatch(/put them down/i);
  });

  it('⚠⚠ the Reaver is still gone — the false summit is still a false summit', () => {
    expect(stage.narration).toMatch(/Reaver long gone/i);
    expect(stage.stageType).toBe('false_summit');
  });

  it('⚠⚠ the Siren stage got the same treatment, since it had the same defect', () => {
    const siren = HUNTS.find((h) => h.title === "The Siren Queen of Zharak's Teeth")!;
    const ss = siren.stages.find((s) => s.stageType === 'false_summit' && s.checkKind === 'boss')!;
    expect(ss.spawn?.enemyName).toBe('Mud Siren');
    // ⚠ RETARGETED BY OTA-1584, and the claim GREW rather than moved. 1578 wanted
    // the stage to say the Queen is absent and something of hers is present.
    // "three of her daughters" did that obliquely — good prose a player could not
    // connect to "Mud Siren" in the combat log, which is the very class 1576 was
    // filed for surviving inside 1576's own fix. It now says both.
    expect(ss.narration).toMatch(/three Mud Sirens/i);
    expect(ss.narration).toMatch(/her daughters/i);
    expect(ss.narration).toMatch(/silence them first/i);
  });
});
