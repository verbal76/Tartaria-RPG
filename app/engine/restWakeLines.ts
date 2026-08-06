// OTA-1135 — THE OUTDOOR HALF OF OTA-1055.
//
// Owner, from a device log where two consecutive rests were ambushed: both
// printed the IDENTICAL beat. The rate was measured and is fine (22% wild /
// 8% hub, ×1.3 night / ×0.85 day — two hits in one session is a ~5%
// coincidence). The repetition was the real complaint, and it is not a content
// gap — it is a job left half-done.
//
// OTA-1055 re-voiced the rest ambush for INDOOR scenes, because "circled" and
// "closes the distance" are open-ground images and the unsettling part of
// waking in a sealed room is that it was already in with you. It gave the
// indoor path THREE lines for the wake beat and THREE for the arrival
// (engine/indoorAmbush.ts). It never came back for the outdoor path, which has
// been a single hardcoded string for both beats ever since — so the more
// common case, resting in the open, is the one with no variety at all.
//
// ⚠ AND WHY THIS IS AUTHORED RATHER THAN GENERATED, which the owner asked
// about directly. Three reasons, in order of weight:
//   1. IT FIRES AS THE FIGHT STARTS. On this device the model's fastest job
//      lands in ~2s and its slowest in ~19s; ambient averages 11.6s. A line
//      that is supposed to be the moment you wake to something standing over
//      you cannot arrive after the first attack roll. The headroom track's own
//      hard rule: the model never runs in front of a tap.
//   2. IT IS UNRELIABLE AT EXACTLY THE WRONG MOMENT. Two of three ambient
//      generations in the last log were discarded (stale, filtered). A beat
//      this dramatic getting nothing two times in three is worse than a
//      repeat.
//   3. EVERY GENERATED SLOT NEEDS AN AUTHORED FALLBACK ANYWAY. That is the
//      standing rule for the whole headroom track, so this pool has to exist
//      whether or not the model ever touches it.
// Where the model COULD help later: rest is the single best candidate in the
// game for the bank-and-spend slot, because it is eight in-game hours during
// which the player is provably busy. Generate during the sleep, spend on
// waking, fall back to these lines when the bank is empty. That is the shape
// the track already wants; it needs the bank built first.

const OUTDOOR_WAKE: readonly string[] = [
  `The Arbiter goes still. "You weren't alone. Something circled while you were out — and it stopped circling."`,
  `The Arbiter goes still. "It watched you sleep from the treeline and made up its mind about you."`,
  `The Arbiter goes still. "There are prints in the silt that were not there when you lay down. They come in and they do not go out."`,
  `The Arbiter goes still. "Whatever found you had all night to leave. It stayed."`,
  `The Arbiter goes still. "The quiet you slept through was not the quiet of an empty place. It was something being patient."`,
];

const OUTDOOR_ARRIVAL: readonly string[] = [
  `{name} closes the distance through the dark. The rest is over.`,
  `{name} comes out of the open ground at a walk, in no particular hurry. The rest is over.`,
  `{name} is already inside the reach of your fire. The rest is over.`,
  `{name} rises out of the silt where you took it for a ridge. The rest is over.`,
  `{name} crosses the last of the open and does not stop coming. The rest is over.`,
];

/** Deliberately Math.random rather than a rotation cursor: rest ambushes are
 *  rare and scattered across a run, so a cursor would need persisting to be
 *  worth anything, and five lines make a back-to-back repeat a 1-in-5 rather
 *  than the certainty it was. Mirrors indoorAmbush.ts exactly, which is the
 *  point — the two paths should not diverge again. */
function pick(lines: readonly string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]!;
}

/** The wake beat for a rest ambushed under open sky. */
export function outdoorRestWakeLine(): string {
  return pick(OUTDOOR_WAKE);
}

/** The arrival beat. `nameWithArticle` is the enemy, already capitalised and
 *  articled by the caller (withArticleCap). */
export function outdoorRestArrivalLine(nameWithArticle: string): string {
  return pick(OUTDOOR_ARRIVAL).replace('{name}', nameWithArticle);
}

/** Tests only — the pools are the whole feature, so their sizes are asserted
 *  rather than trusted. */
export const _OUTDOOR_POOLS = { wake: OUTDOOR_WAKE, arrival: OUTDOOR_ARRIVAL };
