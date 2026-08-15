// OTA-1110 — THE DEATH SCREEN, AND THE LOCKDOWN AT ZERO.
//
// Owner, in full: "The second my HP hits 0 for whatever reason there should be
// a crossfade between the game screen and a new screen like the intro screen
// that gives a brief description of my death lore style and how it ties to my
// reason for entering the mud world and after a few seconds to read it, it
// should go to the character collection screen. This should add immersion and
// a clean character death, and stop anything else from happening after I hit 0."
//
// Two halves, and the second is the one that was broken.
//
// THE SCREEN. The opening crawl (OTA-1018) asks why you came down and offers
// five motives. Nothing ever answered it: death was three log lines, a silent
// 3.5-second hold on the exploration screen, and a cut to the slot list. So
// the ending is now built from the SAME motive as the opening — an exile's
// death reads differently from a scholar's — and the overlay crossfades in
// over whatever screen you were on, holds long enough to read, and hands over
// to the character collection on its own.
//
// ⚠ THE LOCKDOWN. "Stop anything else from happening after I hit 0" was not
// rhetorical — the owner played at 0 HP. Two holes found:
//   1. The parley intimidate-an-animal failure deals 3+d6 with NO DEATH CHECK.
//      Every other damage site in the store (status DOTs, weather, falls,
//      enemy counters, effect damage) calls handlePlayerDeath at zero; this
//      one dealt the hit and moved on, and the enemy-counter volley that
//      follows bails instantly at hp<=0 — leaving a living character on zero
//      with no epitaph and no death.
//   2. FOUR `Math.max(1, …)` HP FLOORS silently resurrect. They exist so an
//      hpMax cut can't strand a living player on zero, which is right — but at
//      ZERO the same floor stands a corpse back up. Equipping gear was a
//      one-point revive.

jest.setTimeout(20000);

import { buildDeathScene, daysBelow } from '../app/engine/deathScene';
import { STORY_MOTIVE_IDS } from '../app/engine/story';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

const base = {
  name: 'Verbal',
  placeName: 'Obsidian Pillars',
  days: 7,
  kills: 6,
};

describe('OTA-1110 — the ending is written from the same motive as the opening', () => {
  it('⚠ every motive the opening crawl offers has an ending of its own', () => {
    // If a motive can be CHOSEN at creation it must be answerable at death;
    // a new motive added to story.ts without death lore would silently fall
    // through to the generic pool and nobody would notice.
    for (const id of STORY_MOTIVE_IDS) {
      const scene = buildDeathScene({ ...base, storyMotive: id }, 'seed');
      expect(scene.motiveKey).toBe(id);
    }
  });

  it('the five endings are genuinely different text, not one line reskinned', () => {
    const bodies = STORY_MOTIVE_IDS.map(
      (id) => buildDeathScene({ ...base, storyMotive: id }, 'seed').paragraphs[1],
    );
    expect(new Set(bodies).size).toBe(STORY_MOTIVE_IDS.length);
  });

  it('a character with no motive on file still gets a real ending, not a blank', () => {
    const scene = buildDeathScene({ ...base, storyMotive: undefined }, 'seed');
    expect(scene.motiveKey).toBe('unwritten');
    expect(scene.paragraphs[1]!.length).toBeGreaterThan(40);
    expect(scene.paragraphs[1]).toContain('Verbal');
  });

  it('an unknown motive id falls through to the same safety net', () => {
    const scene = buildDeathScene({ ...base, storyMotive: 'not-a-motive' }, 'seed');
    expect(scene.motiveKey).toBe('unwritten');
  });

  it('every token is filled — no {name} or {place} reaches the screen', () => {
    for (const id of [...STORY_MOTIVE_IDS, undefined]) {
      const scene = buildDeathScene({ ...base, storyMotive: id }, 'seed');
      const all = [...scene.paragraphs, scene.closing, scene.title].join(' ');
      expect(all).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('⚠ the same death keeps the same words — a re-render cannot reshuffle mid-read', () => {
    const a = buildDeathScene({ ...base, storyMotive: 'exile' }, 'death-42');
    const b = buildDeathScene({ ...base, storyMotive: 'exile' }, 'death-42');
    expect(b).toEqual(a);
  });

  it('…but two deaths do not read identically', () => {
    const seen = new Set(
      Array.from({ length: 24 }, (_, i) =>
        buildDeathScene({ ...base, storyMotive: 'debt' }, `death-${i}`).paragraphs[1]),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('the ledger states the run plainly, and gets its grammar right', () => {
    expect(buildDeathScene({ ...base, days: 1, kills: 1 }, 's').paragraphs[2])
      .toBe('1 day below. 1 thing put down. The buried world keeps the count.');
    expect(buildDeathScene({ ...base, days: 7, kills: 6 }, 's').paragraphs[2])
      .toBe('7 days below. 6 things put down. The buried world keeps the count.');
  });

  it('a pacifist run does not read as a bug', () => {
    expect(buildDeathScene({ ...base, kills: 0 }, 's').paragraphs[2])
      .toContain('nothing put down');
  });

  it('⚠ dying in the first hour is day ONE, not day zero', () => {
    expect(daysBelow(0)).toBe(1);
    expect(daysBelow(undefined)).toBe(1);
    expect(daysBelow(23)).toBe(1);
    expect(daysBelow(24)).toBe(2);
    expect(daysBelow(167)).toBe(7);
  });

  it('the name is the heading and the Arbiter gets the last word', () => {
    const scene = buildDeathScene({ ...base, storyMotive: 'calling' }, 's');
    expect(scene.title).toBe('Verbal');
    expect(scene.closing).toContain('Arbiter');
    expect(scene.paragraphs).toHaveLength(3);
  });
});

describe('OTA-1110 — the screen crossfades, holds, and leaves on its own', () => {
  const view = src('app/components/DeathOverlay.tsx');

  it('⚠ it is a CROSSFADE, not a cut — the owner asked for one by name', () => {
    expect(view).toContain('const FADE_IN_MS = 1600;');
    expect(view).toContain('Animated.timing(dark');
    expect(view).toContain("animationType=\"none\"");
  });

  it('⚠ it hands over to the character collection WITHOUT being touched', () => {
    // "after a few seconds to read it, it should go to the character
    // collection screen" — a player who put the phone down mid-fight must not
    // come back to a modal waiting on a tap nobody told them to make.
    // RETARGETED BY OTA-1119 — 11s → 16s on the owner's call: "increase the
    // delay on death before it goes to the character collection screen by 5
    // seconds. they can always tap to close if they want." The property this
    // test guards is the HANDOVER, not the number: the screen must still leave
    // on its own for a player who put the phone down.
    expect(view).toContain('const DWELL_MS = 16000;');
    expect(view).toContain('setTimeout(() => dismiss(), DWELL_MS)');
  });

  it('⚠ a tap cannot skip the ending before it is legible', () => {
    // The killing blow often lands mid-tap. Arming the tap only after the text
    // has faded in stops the player dismissing their own death unread.
    expect(view).toContain('const TAP_ARMS_AT_MS');
    expect(view).toContain('if (armed) dismiss()');
  });

  it('there is no SKIP button — an ending you can decline is not one', () => {
    // The word appears in the header comment explaining its absence, so this
    // asserts the CONTROL is missing, not the string.
    expect(view).not.toContain('skipBtn');
    expect(view).not.toContain('skipText');
    expect(view).not.toMatch(/accessibilityLabel="Skip/i);
  });

  it('it is styled as the intro overlay\'s sibling, and screen-readable', () => {
    expect(view).toContain('accessibilityLabel');
    expect(view).toContain('accessibilityRole="button"');
    expect(view).toContain('TAP TO CONTINUE');
  });

  it('⚠ it mounts globally and LAST — a death can land on any screen', () => {
    const app = src('App.tsx');
    expect(app).toContain('<DeathOverlay />');
    // Last sibling wins the stacking order, so it renders over whatever modal
    // was already on its way in when the killing blow landed.
    expect(app.indexOf('<DeathOverlay />')).toBeGreaterThan(app.indexOf('<StoryIntroOverlay />'));
  });
});

describe('OTA-1110 — nothing happens after zero', () => {
  const store = src('app/state/gameStore.ts');

  it('⚠ the parley intimidate-fail path now checks for death', () => {
    // 3+d6 straight to HP with no death call was the one damage site in the
    // file that never asked.
    expect(store).toContain('if (playerIsDownNotDead(get)) { void Promise.resolve().then(() => handlePlayerDeath(get, set)); return; }');
  });

  it('the check reads LIVE state, never a snapshot', () => {
    // The entire bug class here is code acting on a player captured before the
    // killing blow (cf. OTA-969, OTA-1103).
    expect(store).toContain('export function playerIsDownNotDead(get: () => GameStore): boolean {');
    expect(store).toContain('return !!p && p.hp <= 0 && !p.dead;');
  });

  it('⚠ no HP floor can resurrect a corpse — all four sites routed', () => {
    expect(store).not.toContain('hp: Math.max(1, Math.min(');
    expect(store).toContain('function hpAfterMaxChange(');
    expect(store).toContain('if (now <= 0) return 0;');
    // Four equip / displace sites plus the definition.
    expect(store.split('hpAfterMaxChange').length - 1).toBeGreaterThanOrEqual(5);
  });

  it('the floor still protects a LIVING player from an hpMax cut', () => {
    // Removing the floor entirely would strand someone on zero after taking
    // off +HP gear, which is the bug it was written for.
    expect(store).toContain('return Math.max(1, Math.min(now + delta, newMax));');
  });

  it('⚠ death raises the screen instead of a bare timer', () => {
    expect(store).toContain('set(() => ({ pendingDeath: scene }));');
    expect(store).not.toContain('}, 3500);');
  });

  it('the handover clears everything still queued behind the death', () => {
    // A chapter card or mission popup surfacing on the title screen over a
    // character who no longer exists IS "something else happening after 0".
    const d = store.slice(store.indexOf('dismissDeath() {'));
    const body = d.slice(0, d.indexOf('replayStoryIntro()'));
    for (const cleared of ['player: null', 'currentScene: null', 'chapterCard: null', 'pendingTalk: null', 'missionCompleteNotice: null']) {
      expect(body).toContain(cleared);
    }
    expect(body).toContain("currentScreen: 'title'");
  });

  it('⚠ the handover is idempotent — a tap racing the dwell timer runs it once', () => {
    const d = store.slice(store.indexOf('dismissDeath() {'));
    expect(d.slice(0, 200)).toContain('if (!get().pendingDeath) return;');
  });

  it('the save is written BEFORE the screen goes up, so nothing is lost by leaving it', () => {
    const death = store.slice(store.indexOf('function handlePlayerDeath('));
    expect(death.indexOf('void get().persist();'))
      .toBeLessThan(death.indexOf('set(() => ({ pendingDeath: scene }));'));
  });

  it('the typed-input guard that was already right is untouched', () => {
    expect(store).toContain('if (player.hp <= 0) {');
    expect(store).toContain('// Player is dead — the death handler is mid-flight');
  });
});
