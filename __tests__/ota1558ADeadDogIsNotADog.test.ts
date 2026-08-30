/**
 * OTA-1558 — A DEAD DOG IS NOT A DOG.
 *
 * ⚠⚠⚠ THE OWNER: *"yesterday we were working on giving a one off dog reset to
 * all players who do not currently have a dog since we identified an issue in
 * the mission granting text gate. make sure that issue is fixed and silently
 * reset all players dog count if they currently do not have one active when they
 * load their character. make them be able to find the mission again. remember
 * silently, we don't want to advertise a fix broke the dog system."*
 *
 * ⚠⚠⚠ THE ISSUE, FOUND: FOUR GATES ASKED `!player.dog` WHEN THEY MEANT "NO
 * LIVING DOG". `player.dog` is deliberately KEPT after a death or an
 * abandonment — the record survives with status 'dead' / 'abandoned' so grief
 * narration, the COPY SAVE highlights and the still-open death-write
 * verification can read it. OTA-346 wrote `hasActiveDog` for exactly this
 * distinction, and said so in its own comment: *"The puppy-vendor replacement arc
 * was gated on a raw `!player.dog`, so once a dog died the slot was never 'empty'
 * and the replacement vendor could never fire."*
 *
 * The puppy-vendor paths were fixed then. FOUR OTHERS WERE NOT, three of them
 * written afterwards by people (me) who did not know the rule existed:
 *   · the rescue-PROP seeding (OTA-1243) — stops staging cages and wagons, so
 *     the quest has no visible surface in the world at all;
 *   · the TEXT/INTENT dispatch — the gate the owner named. Even with a prop in
 *     front of him, `investigate the cage` was refused;
 *   · the Arbiter's day-5 RUMOUR — the backstop for a player who never crosses a
 *     hook noun, which is precisely a player whose dog just died;
 *   · the LEAD CONTEXT, twice (screen and salvage slice) — so a snare stopped
 *     being marked as a lead and SALVAGE would happily strip it for scrap.
 *
 * Together: lose a dog once, and the rescue quest is sealed for the rest of that
 * save. That is the dog system being broken, and it is four copies of one
 * misunderstanding.
 *
 * ⚠⚠ AND FIXING THE PREDICATE IS NOT ENOUGH, which is why the amnesty exists. A
 * save can also be wedged by state those broken gates already WROTE — a
 * `pendingDogOnboarding` standing from a rescue that could never finish, a
 * `dogRescueTipFired` spent on a rumour the player could no longer act on.
 * Correcting a boolean does not clear a flag already on disk.
 *
 * ⚠ SILENT, on instruction. No world line, no Arbiter line. Only a debug entry,
 * which lands in the on-disk log where support can find it and a player cannot.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { dogRescueAmnesty } from '../app/engine/worldMemory';
import type { WorldMemory } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const STORE = src('app/state/gameStore.ts');
const SLOT = src('app/state/slices/slotSlice.ts');
const INV = src('app/state/slices/inventorySlice.ts');
const EXPLORE = src('app/screens/ExplorationScreen.tsx');

const mem = (over: Partial<WorldMemory> = {}): WorldMemory => (over as WorldMemory);

describe('OTA-1558 — the amnesty', () => {
  it('⚠⚠⚠ a dogless save is cleaned up: the stale onboarding goes, the rumour re-arms', () => {
    const patch = dogRescueAmnesty(false, mem({
      pendingDogOnboarding: { scenarioId: 'snare' } as never,
      dogRescueTipFired: true,
    }));
    expect(patch).not.toBeNull();
    expect(patch!.pendingDogOnboarding).toBeNull();
    expect(patch!.dogRescueTipFired).toBe(false);
    expect(patch!.dogRescueAmnestyDone).toBe(true);
  });

  it('⚠⚠⚠ a player WITH a living dog is never touched', () => {
    // The amnesty must not reach into a working save and re-arm a hint for
    // somebody who already has the companion.
    expect(dogRescueAmnesty(true, mem({ dogRescueTipFired: true }))).toBeNull();
    expect(dogRescueAmnesty(true, mem({}))).toBeNull();
  });

  it('⚠⚠⚠ ONCE PER SAVE — the latch is the difference between a fix and a nag', () => {
    // Without it the rumour flag would clear on EVERY load for any dogless
    // player, turning a deliberately single-shot hint into a recurring one.
    const after = dogRescueAmnesty(false, mem({ dogRescueAmnestyDone: true, dogRescueTipFired: true }));
    expect(after).toBeNull();
  });

  it('⚠⚠ it is PURE — it returns a patch and narrates nothing', () => {
    // "remember silently, we don't want to advertise a fix broke the dog
    // system." A function that cannot speak cannot leak.
    const patch = dogRescueAmnesty(false, mem({}))!;
    for (const v of Object.values(patch)) {
      expect(typeof v === 'string' && v.length > 20).toBe(false);
    }
    expect(Object.keys(patch).sort()).toEqual(
      ['dogRescueAmnestyDone', 'dogRescueTipFired', 'pendingDogOnboarding'],
    );
  });

  it('⚠ a legacy save with none of the fields still gets its one run', () => {
    expect(dogRescueAmnesty(false, mem({}))).not.toBeNull();
  });
});

describe('OTA-1558 — every gate asks the same question now', () => {
  it('⚠⚠⚠ THE PROP SEEDING — the reason the world stopped staging the quest', () => {
    expect(STORE).toContain('if (hasActiveDog(get().player) || get().worldMemory.pendingDogOnboarding) return [];');
    expect(STORE).not.toContain('if (get().player?.dog || get().worldMemory.pendingDogOnboarding) return [];');
  });

  it('⚠⚠⚠ THE TEXT GATE — the one the owner named by hand', () => {
    expect(STORE).toContain('const dogAcquired = hasActiveDog(get().player);');
    expect(STORE).not.toContain('const dogAcquired = !!get().player?.dog;');
  });

  it('⚠⚠⚠ THE ARBITER RUMOUR — the backstop for a player with no hook noun in sight', () => {
    expect(STORE).toContain('&& !hasActiveDog(livePlayer)');
    expect(STORE).not.toMatch(/livePlayer\s*\n\s*&& !livePlayer\.dog/);
  });

  it('⚠⚠⚠ THE LEAD CONTEXT, BOTH COPIES — or SALVAGE strips the snare you needed', () => {
    expect(INV).toContain('rescueEligible: !deps.hasActiveDog(get().player) && !get().worldMemory.pendingDogOnboarding,');
    expect(EXPLORE).toContain('rescueEligible: !hasActiveDog(player) && !worldMemory.pendingDogOnboarding,');
    expect(INV).not.toContain('rescueEligible: !get().player?.dog');
    expect(EXPLORE).not.toContain('rescueEligible: !player?.dog');
  });

  it('⚠⚠ hasActiveDog still means what OTA-346 made it mean — living AND present', () => {
    // If this ever widened to include a dead dog, all five gates would break
    // again at once and in silence.
    expect(STORE).toContain("return !!dog && (dog.status === 'with_player' || dog.status === 'waiting_at_base');");
  });
});

describe('OTA-1558 — the amnesty runs at load, and says nothing', () => {
  it('⚠⚠⚠ it is wired into the load beat', () => {
    expect(SLOT).toContain('const amnesty = dogRescueAmnesty(deps.hasActiveDog(get().player), get().worldMemory);');
    expect(SLOT).toContain('set((s2) => ({ worldMemory: { ...s2.worldMemory, ...amnesty } }));');
  });

  it('⚠⚠⚠ SILENT — the only line it writes is on the debug channel', () => {
    // A `world` or `arbiter` line here would be exactly the advertisement the
    // owner ruled out. The debug channel lands in the on-disk log only.
    const block = SLOT.slice(SLOT.indexOf('const amnesty = dogRescueAmnesty('));
    const stanza = block.slice(0, block.indexOf('// arb38'));
    expect(stanza).toContain("get().appendLog('debug'");
    expect(stanza).not.toContain("appendLog('world'");
    expect(stanza).not.toContain("appendLog('arbiter'");
  });

  it('⚠⚠ it runs OUTSIDE the greeting block — every load, not only chatty ones', () => {
    // The welcome-back greeting is debounced to once a minute. Riding inside it
    // would mean a quick reload never got the cleanup.
    const greetAt = SLOT.indexOf('const spireNotice = spireMoveNoticeLine(get().worldMemory);');
    const closeAt = SLOT.indexOf('\n      }\n', greetAt);
    const amnestyAt = SLOT.indexOf('const amnesty = dogRescueAmnesty(');
    expect(greetAt).toBeGreaterThan(-1);
    expect(amnestyAt).toBeGreaterThan(closeAt);
  });

  it('⚠ legacy saves default the latch to false, so they each get their one run', () => {
    expect(STORE).toContain('dogRescueAmnestyDone: wm.dogRescueAmnestyDone ?? false,');
  });
});
