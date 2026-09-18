/* ⚠⚠⚠ OTA-1844 — THE DOG'S TIME-BASED FATES, MOVED OUT OF THE STORE.
 *
 * Nothing below changed. This is `DOG_BLEED_OUT_HOURS` and `tickDogStatus`
 * exactly as they stood in `gameStore.ts`, in a file named for what they do.
 *
 * ⚠ WHY THEY MOVED, plainly: the Last Walk needed store lines the store did not
 * have, and the ceiling's own rule is *"new store code must displace old store
 * code, or the responsibility belongs in a module outside the file."* Deciding
 * when a benched dog bleeds out and when a starved one walks off is dog
 * lifecycle, not store plumbing — it takes `(get, set)` and touches one slice of
 * state, the same shape `combatResolution` already uses. The pass gives back
 * more than it takes, and the ceiling comes down to match.
 *
 * ⚠⚠ AND IT IS A MOVE, NOT A REWRITE. Every warning band, every latch, every
 * line of narration and the OTA-1715 off-bench invariant are byte-identical, so
 * the dog suites that guard them are the proof that nothing shifted. */
import { applyDogPronouns, DOG_LOYALTY_BANDS } from '../engine/dogCompanion';
import type { GameStore } from './gameStore';

export const DOG_BLEED_OUT_HOURS = 24;

/** Poplar Anvil — per-action reconciliation of the dog's time-based fates.
 *  Scheduled as a microtask off submitPlayerAction so it runs AFTER the
 *  action's own effects land — a `feed dog` / `rest` that heals or
 *  re-bonds the dog resolves first, so a rescue never races the reaper.
 *
 *  Two fates, both of which finally make the puppy-vendor / rubble-puppy
 *  replacement arc reachable (it was dead content while the dog could
 *  never permanently leave — its only gate, puppyVendorOwed, used to
 *  flip ONLY on a player-death-with-dog):
 *    1. Bleed-out — a dog benched at 0 HP for >= DOG_BLEED_OUT_HOURS
 *       without being healed above 0 dies (status -> dead).
 *    2. Abandonment — loyalty decays to 0 and the dog walks off
 *       (status -> abandoned), after escalating 50/30/15 warning beats. */
export function tickDogStatus(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): void {
  const player = get().player;
  const dog = player?.dog;
  if (!player || !dog) return;
  if (dog.status === 'dead' || dog.status === 'abandoned') return;
  const now = player.hoursElapsed ?? 0;

  // --- 1. Bleed-out (downed + benched at 0 HP) -----------------------
  if (dog.status === 'waiting_at_base' && dog.hp <= 0) {
    if (dog.downedAtHour == null) {
      // Benched at 0 with no stamp (legacy save / climb edge) — start
      // the clock NOW rather than killing it retroactively.
      set((s) => s.player?.dog
        ? { player: { ...s.player, dog: { ...s.player.dog, downedAtHour: now, bleedWarned: false } } }
        : s);
      return;
    }
    const downFor = now - dog.downedAtHour;
    // OTA-915 — surface the bleed-out HARD. Before, one mid-window line was the only warning
    // and there was no running clock, so players lost the dog without a fair shot. Now
    // escalating Arbiter beats fire at 1/4, 1/2, 3/4 of the window — each once — and every beat
    // states the hours left (StatsPanel also shows a live "⏳ Nh" countdown by the dog's name).
    if (downFor < DOG_BLEED_OUT_HOURS) {
      const hoursLeft = Math.max(1, Math.ceil(DOG_BLEED_OUT_HOURS - downFor));
      const marks = [DOG_BLEED_OUT_HOURS * 0.25, DOG_BLEED_OUT_HOURS * 0.5, DOG_BLEED_OUT_HOURS * 0.75];
      const lines = [
        `${dog.name} is down and bleeding — about ${hoursLeft}h before {pronoun} {isOrAre} gone for good. Feed {object} or work a poultice to bring {object} back up.`,
        `${dog.name} is fading — only about ${hoursLeft}h left. {Pronoun} need{verbS} food or a poultice, soon.`,
        `The Arbiter grips your arm. "${dog.name} has maybe ${hoursLeft}h. Last window — feed {object} now or {pronoun} do{verbES} not get up again."`,
      ];
      let stage = dog.bleedWarnStage ?? 0;
      let fired = false;
      while (stage < marks.length && downFor >= marks[stage]!) {
        get().appendLog('arbiter', applyDogPronouns(lines[stage]!, dog.sex.pronoun));
        stage++;
        fired = true;
      }
      if (fired) {
        set((s) => s.player?.dog
          ? { player: { ...s.player, dog: { ...s.player.dog, bleedWarnStage: stage, bleedWarned: true } } }
          : s);
        return;
      }
    }
    if (downFor >= DOG_BLEED_OUT_HOURS) {
      set((s) => s.player?.dog
        ? {
            player: { ...s.player, dog: { ...s.player.dog, status: 'dead' as const } },
            worldMemory: s.worldMemory.puppyVendorUsed
              ? s.worldMemory
              : { ...s.worldMemory, puppyVendorOwed: true },
          }
        : s);
      get().appendLog(
        'combat',
        applyDogPronouns(
          `${dog.name} never got back up. The wounds ran too deep and no hand tended them in time. {Pronoun} {isOrAre} gone.`,
          dog.sex.pronoun,
        ),
      );
      void get().persist();
      return;
    }
    return; // still down, still inside the window
  }

  // ⚠⚠⚠ OTA-1715 — OFF THE BENCH, not just off the clock: a healed dog kept
  // `waiting_at_base` and was refused by every command for the rest of the save.
  // An invariant, not a heal hook, so saves already stuck repair. See ota1715.
  const offBench = dog.status === 'waiting_at_base' && dog.hp > 0 && !get().currentScene?.elevatedOn;
  if (offBench || dog.downedAtHour != null || dog.bleedWarned || (dog.bleedWarnStage ?? 0) > 0) {
    set((s) => s.player?.dog
      ? { player: { ...s.player, dog: { ...s.player.dog, downedAtHour: undefined, bleedWarned: false, bleedWarnStage: 0, ...(offBench ? { status: 'with_player' as const } : {}) } } }
      : s);
    if (offBench) get().appendLog('world', `${dog.name} shakes off the worst of it and falls back in beside you.`);
  }

  // --- 2. Loyalty: warning beats + abandonment -----------------------
  if (dog.status !== 'with_player') return;
  const loy = dog.loyalty;
  const floor = dog.loyaltyBeatFloor ?? 101;

  if (loy <= 0) {
    // ⚠⚠ OTA-1717 — NEGLECT DOES NOT PAY A PUPPY, and this is not a new rule:
    // it is the rule the project already recorded ("hunger-abandonment does NOT
    // set puppyVendorOwed (spec: no bail-out)") and the one players already
    // live, because dogThresholdCheck reached this crossing first and never set
    // the flag. This branch was the losing half of the race and disagreed with
    // the half that won. Now there is one branch, and it agrees with the spec.
    // ⚠ Bleed-out DEATH keeps its owed replacement for the moment — pulling it
    // before the dog market exists would leave a player with no road back to a
    // companion at all. That is the owner's next piece of work, not a side
    // effect of this collapse.
    set((s) => s.player?.dog
      ? { player: { ...s.player, dog: { ...s.player.dog, status: 'abandoned' as const } } }
      : s);
    get().appendLog(
      'world',
      applyDogPronouns(
        `${dog.name} stops following. {Pronoun} watched you go hungry past too many fires. When you look back, the road is empty.`,
        dog.sex.pronoun,
      ),
    );
    void get().persist();
    return;
  }

  // Escalating warning beats at 50 / 30 / 15 — latched so each fires
  // once per crossing, not every tick.
  const bands: Array<{ at: number; line: string }> = [
    { at: DOG_LOYALTY_BANDS[0], line: `${dog.name} keeps eyeing your pack. {Pronoun} {isOrAre} hungry — feed {object} before the bond frays.` },
    { at: DOG_LOYALTY_BANDS[1], line: `${dog.name} lags a pace behind, ribs showing. {Pronoun} won't follow a starving road forever.` },
    { at: DOG_LOYALTY_BANDS[2], line: `${dog.name} won't meet your eye. One more empty day and {pronoun} walk{verbS}.` },
  ];
  for (const b of bands) {
    if (loy <= b.at && floor > b.at) {
      set((s) => s.player?.dog
        ? { player: { ...s.player, dog: { ...s.player.dog, loyaltyBeatFloor: b.at } } }
        : s);
      get().appendLog('arbiter', applyDogPronouns(`The Arbiter nods at the dog. "${b.line}"`, dog.sex.pronoun));
      break; // one beat per tick
    }
  }
}
