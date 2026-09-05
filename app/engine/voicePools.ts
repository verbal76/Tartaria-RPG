// OTA-1461 — THE LINES YOU HEAR TEN TIMES AN HOUR.
//
// Owner, after a long session: *"most of the 6,700 lines are single fire
// emission texts… what I'm worried about is just the random things they say to
// try to describe the scene or just to put some flavor in there. You're going to
// hear it all the time. It's like when your friend asks you every time he sees
// you: hey man, what you up to?"*
//
// ⚠⚠⚠ THE CENSUS THAT PROMPTED THIS, counted off his own device log. The library
// is ~6,700 authored strings and almost all of them are ONE-SHOT — an item
// description, a hunt stage, a lore entry. They are read once and never repeat.
// The repetition he actually feels comes from a handful of lines with NO POOL AT
// ALL:
//
//     "The thread you were following waits where you left it."   ~25 fires · 1 line
//     "<Dog> circles three times and curls beside you."          ~12 fires · 1 line
//     "You take the <thing> from where it lay."                  ~15 fires · 1 line
//     "You break away across the open ground…"                    ~9 fires · 2 lines
//
// Multiplying those by three, as first proposed, yields three. The instrument had
// to be a FLOOR keyed to fire-rate, not a multiplier on what happened to exist.
//
// ⚠⚠ AND VARIETY MEANS DIFFERENT IN KIND, NOT DIFFERENT IN WORDING. Forty
// rephrasings of one thought fail the owner's test exactly as hard as one line
// repeated forty times. So every pool here is grouped by ANGLE — what the line is
// ABOUT — and consecutive entries deliberately come at the moment from different
// directions: the object, the body, the weather, the time, the silence, the
// player's own attention.
//
// This is not a new idea in this codebase; it is the method the overland travel
// pool already proved. Its comment records the measurement: *"the audit's
// Groundhog Day test — across 15 same-tile re-entries, 10 of 105 pairs were >80%
// similar. Expanded to 16 variants grouped loosely by sensory focus."* That pool
// is the only healthy one in the census, and it is healthy because somebody
// already did this job once.
//
// ⚠ EVERY POOL HERE IS CONSUMED THROUGH `rotatingPick`, which cycles in ORDER and
// refuses an immediate repeat — so a pool of forty is forty distinct fires before
// anything comes round again. A pool of one, cycled, is still one.
import { rotatingPick } from './rng';
import { pluralizeNoun } from './grammar';

/** ⚠ THE HOOK IS STILL HERE, said forty ways.
 *
 *  Fires when the player wanders a tile that already carries an unresolved hook.
 *  In the owner's log this was ONE sentence, roughly twenty-five times.
 *
 *  ⚠ The angles, in rotation order, so consecutive fires never share a lens:
 *  the thing itself · the player's attention · time · the body · the weather ·
 *  the silence · scale · consequence. */
export const UNRESOLVED_HOOK_LINES: readonly string[] = Object.freeze([
  // the thing itself
  'The thread you were following waits where you left it.',
  'What you started here has not finished itself in your absence.',
  'The loose end is exactly as loose as you left it.',
  'Whatever you turned over here is still turned over.',
  'It sits where it sat. Patient is the wrong word — it simply does not move.',
  // the player's attention
  'Your eye goes back to it before you decide to look.',
  'You had a question here. You still have it.',
  'Some part of you has been keeping the place bookmarked.',
  'You catch yourself checking, the way you check a pocket you already know is empty.',
  'The thought you set down here is right where you set it down.',
  // time
  'Long enough has passed that it should have changed. It has not.',
  'The hours you spent elsewhere did nothing to this.',
  'Whatever clock this place runs on, it has not ticked since you left.',
  'Time went somewhere. It did not come here.',
  // the body
  'Your hands remember the shape of what you were doing before your head does.',
  'You are standing the way you stood last time, without meaning to.',
  'Something in your shoulders drops back into the same set.',
  'Your feet have taken you to the same three paces of ground.',
  // the weather / the air
  'The air over it has the same weight it had before.',
  'Dust has settled on it and settled evenly. Nothing disturbed it.',
  'The damp has been at it and got no further than it had.',
  'Whatever the wind has done out there, it has not come in here.',
  // the silence
  'Nothing about the place has anything to add.',
  'The quiet here is the specific quiet of a thing left half-done.',
  'No one came. Nothing spoke. It simply kept.',
  'The silence has the shape of an unanswered question.',
  // scale / the buried country
  'A country this old is not troubled by one unfinished thing.',
  'The flood waited a thousand years. This can wait for you.',
  'Everything down here is unfinished. Yours is merely the nearest.',
  'Tartaria keeps its loose ends the way it keeps everything else — indefinitely.',
  // consequence
  'It will keep. That is not the same as it being safe to leave.',
  'Nothing has come for it yet. Nothing is a poor guarantee.',
  'Whatever you left undone is undone in your name.',
  'You could walk on. It would still be here, and still be yours.',
  // return / recognition
  'You have circled back to it, whether or not that was the plan.',
  'The road bent and put you in front of it again.',
  'Here it is again, or here you are again — the difference stops mattering.',
  'You have made a small orbit and arrived at the centre of it.',
  'Whatever pulled you back, it worked.',
  'Second look. Same thing. Still waiting.',
]);

/** ⚠ THE DOG SETTLES FOR THE NIGHT, said forty ways.
 *
 *  ⚠⚠ PRONOUN-TEMPLATED — every entry must survive `applyDogPronouns`, which the
 *  owner's dog can be he, she or they. `{Possessive}` / `{pronoun}` / `{object}`
 *  are substituted; a line that hardcodes "his" misgenders a companion the player
 *  named and chose for. The rest beat fires on EVERY rest, and the owner rested
 *  fifteen times in four real minutes.
 *
 *  ⚠ Angles: the ritual · breathing · warmth · watchfulness · the dog's own
 *  tiredness · sound · the place · the bond. */
export const DOG_SETTLE_LINES: readonly string[] = Object.freeze([
  // the ritual
  '{Name} circles three times and curls beside you. {Possessive} breathing slows to yours.',
  '{Name} turns twice, thinks about a third, and drops where {pronoun} stands.',
  '{Name} paws the ground flat before trusting it, then folds down onto it.',
  '{Name} tests three spots and settles on the one nearest your boot.',
  '{Name} does the old circle — some instinct about grass that has not been grass in a thousand years.',
  // breathing
  '{Possessive} ribs rise and fall and slow until you cannot hear them.',
  'You listen for {possessive} breathing and lose it in the wind, which means {pronoun} {isOrAre} asleep.',
  'Two breaths in the dark: yours, and one shorter.',
  '{Possessive} breathing finds your rhythm and then falls behind it, deeper.',
  // warmth
  '{Name} presses a shoulder against your leg and leaves it there.',
  'The cold comes up out of the ground and stops at the length of {object}.',
  '{Name} takes the side the wind is on. {Pronoun} did not make a show of it.',
  'Somewhere in the night {pronoun} {hasOrHave} moved closer without waking.',
  // watchfulness
  '{Name} lies down facing the way you came in.',
  'One ear stays up. It does not come down all night.',
  '{Name} sleeps the way a working animal sleeps — most of the way, and no further.',
  'Twice {pronoun} lifts {possessive} head at nothing, and twice puts it back.',
  '{Name} settles, but {possessive} eyes take a while to agree to it.',
  // the dog's own tiredness
  '{Name} {isOrAre} asleep before {pronoun} {hasOrHave} finished lying down.',
  'The day catches up with {object} all at once.',
  '{Name} groans like an old door and goes still.',
  'Whatever {pronoun} spent today, {pronoun} {isOrAre} spending none of it now.',
  // sound
  '{Name} makes a small sound that is not quite a complaint and not quite anything else.',
  'A tail thumps twice against the mud and stops.',
  '{Name} sighs — the whole body kind, from the ribs out.',
  'Something in {possessive} sleep works at a chase {pronoun} will not remember.',
  // the place
  '{Name} does not like this ground. {Pronoun} lies on it anyway, because you did.',
  '{Name} sniffs the air once more, files it, and lies down.',
  'The buried country is a bad place to sleep. {Name} makes it look otherwise.',
  '{Name} finds the only dry patch in forty feet and gives you half of it.',
  // the bond
  '{Name} waits until you are down before {pronoun} {isOrAre}.',
  '{Name} watches you get comfortable, then copies it, badly.',
  'Whatever contract the two of you signed, {pronoun} {isOrAre} keeping {possessive} half of it.',
  '{Name} settles close enough that moving would wake {object}. You do not move.',
  '{Pronoun} chose this spot because you are in it.',
  // weather / the long night
  'The wind gets up and {Name} turns {possessive} back to it.',
  'Rain starts somewhere in the small hours. {Name} does not comment.',
  'Cold night. {Name} makes it survivable and does not know it.',
  'The dark goes on a long time. You are not in it alone.',
  '{Name} sleeps. It is the most convincing argument for rest anyone has made all day.',
]);

/** ⚠ PICKING SOMETHING UP, said thirty ways.
 *
 *  `{thing}` is the item's display name. Fires on every take — fifteen times in
 *  the owner's session, from one line.
 *
 *  ⚠ Angles: the lift · where it lay · weight and feel · how it came free ·
 *  what it leaves · your own motion. */
export const TAKE_LINES: readonly string[] = Object.freeze([
  // the lift
  'You take the {thing} from where it lay.',
  'You pick up the {thing}.',
  'You lift the {thing} clear.',
  'You get a hand under the {thing} and take it.',
  'You claim the {thing}.',
  // where it lay
  'The {thing} comes up out of the silt with a small sucking protest.',
  'The {thing} was half under something. It is not now.',
  'You work the {thing} loose from where the mud had it.',
  'The {thing} had settled into the ground. You unsettle it.',
  'Whatever the {thing} was lying against, it lets go without much argument.',
  // weight and feel
  'The {thing} is heavier than it looks. Most things down here are.',
  'The {thing} is lighter than it looks, which is its own kind of warning.',
  'The {thing} is cold through your glove.',
  'The {thing} fits the hand better than it has any right to.',
  'You turn the {thing} over once, then keep it.',
  // how it came free
  'The {thing} comes away clean.',
  'It takes two pulls. The {thing} is yours on the second.',
  'The {thing} resists, then does not.',
  'You brace a foot and the {thing} gives.',
  'One good tug and the {thing} is out.',
  // what it leaves
  'The {thing} leaves a shape behind it in the mud, filling slowly.',
  'Where the {thing} was, the ground is a shade darker.',
  'You take the {thing}. The hollow it came out of starts closing.',
  'The {thing} goes in your pack. Its outline stays in the silt a while.',
  // your own motion
  'You crouch, take the {thing}, and are moving again before you have straightened up.',
  'You do not think about it. The {thing} is simply in your hand now.',
  'Old habit: see it, take it, keep walking. The {thing} is yours.',
  'You take the {thing} the way you take everything out here — quickly, and without ceremony.',
  'You pocket the {thing} and check the horizon, in that order.',
  'The {thing} goes into the pack by feel. You have done this a great many times.',
]);

/** ⚠ BREAKING CONTACT IN THE OPEN, said thirty ways.
 *
 *  The successful-escape line. Fired nine times in the owner's session from TWO
 *  variants (indoors and out).
 *
 *  ⚠ Angles: the break · the pursuit ending · the body's cost · the ground ·
 *  what you leave · the aftermath. */
export const FLEE_OPEN_LINES: readonly string[] = Object.freeze([
  // the break
  'You break away across the open ground. Behind you the thing you ran from gives up the chase.',
  'You get your legs under you and go, and it does not follow far.',
  'Three long strides and the distance is yours to keep.',
  'You turn and run and the running works.',
  'You take the gap while there is a gap to take.',
  // the pursuit ending
  'It follows to the edge of whatever it calls its own, and no further.',
  'The sound behind you falls off, then stops, then does not start again.',
  'Something decides you are not worth the ground it would have to give up.',
  'The chase lasts about as long as its appetite does.',
  'It watches you go. That is the whole of its answer.',
  // the body's cost
  'Your lungs are burning by the time you dare look back. There is nothing to look at.',
  'You do not stop until your legs make the decision for you.',
  'You run badly, and far enough.',
  'Your heart is still going long after the danger stopped.',
  'You come to a halt with your hands on your knees and the horizon empty.',
  // the ground
  'The mud takes two of your strides and gives back one. It is enough.',
  'You cross forty feet of bad footing without falling, which is its own kind of luck.',
  'The silt drags at you the whole way and lets go at the last.',
  'You put a rise between you and it, then another.',
  // what you leave
  'You leave the ground to it. It seemed to want the ground more than it wanted you.',
  'Whatever you were standing on, it is no longer worth standing on.',
  'You go, and take nothing with you but the going.',
  'Something is left behind you. You do not itemise it.',
  // the aftermath
  'Quiet, after. The kind that takes a while to trust.',
  'You walk the last of it, because running any further would be for your benefit and not your safety.',
  'The country closes behind you the way water closes.',
  'You are somewhere else now. That was the entire objective.',
  'Nothing follows. You check twice anyway.',
  'The fear catches up with you about a minute after the danger does not.',
  'You are alive and moving. Out here that counts as a result.',
]);

/** ⚠ BREAKING CONTACT INDOORS — a smaller pool because it fires less, and because
 *  a chamber gives you fewer honest angles than open country does. */
export const FLEE_INDOOR_LINES: readonly string[] = Object.freeze([
  'You break for the entrance. Behind you the chamber settles back into silence.',
  'You get out through the way you came in, and nothing comes with you.',
  'The doorway takes you and the room lets you go.',
  'You put a wall between the two of you and keep walking.',
  'Stone and dark behind you; whatever it was stays in both.',
  'You are out. The room goes back to being a room.',
  'The passage swallows the sound of it before you reach the end.',
  'You leave by the nearest gap and do not look at what you are leaving.',
  'Your shoulder finds the frame, then the air, then the outside.',
  'The chamber keeps what it had. You are not part of it any more.',
  'You come out into the open with the dark still on your back.',
  'It does not follow past the threshold. Something down here still respects one.',
  'You take the stairs badly and quickly.',
  'The last of the room is a sound behind you, and then it is not.',
  'You are through, and breathing, and elsewhere.',
]);

/**
 * ⚠⚠⚠ THE ONE PLACE THAT DECIDES WHICH FLEE POOL THE PLAYER HEARS.
 *
 * OTA-1301's defect: the owner fled a Drowned Aetherkin on open mud-flats and
 * was told he broke for "the entrance" while "the chamber" settled behind him.
 * There was no entrance and no chamber. The fix split one line into an indoor
 * line and an outdoor line — and the pin that guarded it asserted that the
 * literal sentence `'You break for the entrance'` appeared in gameStore.ts with
 * a particular `const fleeIndoors = …` line within 400 characters above it.
 *
 * ⚠⚠ THAT PIN BROKE THE MOMENT OTA-1461 MOVED THE SENTENCE INTO A POOL, without
 * a single behaviour changing — the eighth quoting-pin failure in four days. It
 * also could never have caught the regression that actually matters: SWAPPING
 * THE TWO ARMS OF THE TERNARY. Both literals would still be present, in the same
 * file, in the same order, and every outdoor flee would name a chamber again —
 * the original defect restored, under a green test.
 *
 * The decision had no name, so the only thing a test could reach for was the
 * text around it. Naming it is what makes the claim checkable: a caller says
 * WHERE the player is, and this says what they hear. The whole permutation space
 * is one boolean wide and can now be exercised directly, on every line in both
 * pools, instead of inferred from a character window.
 *
 * ⚠ THE ROTATION KEYS LIVE IN HERE, not at the call site. They were parameters
 * for exactly one OTA, and in that time the only thing a caller could do with
 * them was pass the wrong one — two callers sharing a key silently share a
 * cursor, which is how a pool of thirty starts repeating like a pool of three.
 */
export function fleeLine(indoors: boolean): string {
  return indoors
    ? rotatingPick(FLEE_INDOOR_LINES, 'flee-indoor')
    : rotatingPick(FLEE_OPEN_LINES, 'flee-open');
}

/**
 * ⚠⚠⚠ OTA-1467 — COMING BACK SOMEWHERE, WITHOUT RECITING A NUMBER.
 *
 * Owner: *"instead of saying 'hey, I've been here before' — you can't say 'this
 * is my second time here'. I think I've been here more than once cuz you're
 * saying the same thing. find some other kind of flavour."*
 *
 * The line was `You've stood here ${tag}. (visit ${n})` — one sentence, three
 * possible tags, and a literal counter bolted on the end. It fires on EVERY
 * re-entry to EVERY tile, which on his own logs is the single most frequent
 * string in the game: he crosses the same ground constantly, and every crossing
 * printed the same seven words and a number.
 *
 * ⚠⚠ THE COUNTER IS THE PART HE OBJECTED TO, AND IT IS THE PART THAT LOOKS LIKE
 * INFORMATION. "(visit 2)" is a debug readout wearing narration's clothes: it
 * tells the player something the character would never think, in a register
 * nothing else in the game uses. Familiarity is a FEELING — the ground knows
 * your weight, you stop reading the walls, you catch yourself taking the same
 * line through the rubble. None of that needs an integer.
 *
 * ⚠ Three tiers because returning twice and returning twelve times are different
 * experiences, and the old code already knew that (before / again / many times)
 * — it just spent the distinction on one adjective. Angles rotate the way
 * UNRESOLVED_HOOK_LINES does: the ground · the body · what changed · what did
 * not · time · your own habits · the company you keep.
 */

/** Second time here. The recognition is still an event. */
export const RETURN_AGAIN_LINES: readonly string[] = Object.freeze([
  // recognition
  'You have been here. The shape of it comes back before the details do.',
  'Something about this ground is already familiar.',
  'You know this place. Not well, but you know it.',
  'The look of it lands a half-second before the memory does.',
  'You have stood on this exact patch of ground before.',
  // the body
  'Your feet find the dry line without being asked.',
  'You step around something that is no longer there.',
  'Your shoulders drop a fraction. Whatever this place is, it is not new.',
  'You breathe easier here than you did the first time.',
  'Some part of you already knew where the footing was bad.',
  // what changed
  'The mud has moved since you were last through. Not much. Some.',
  'Something has shifted here, and you cannot say what.',
  'It is a little emptier than you remember, or you are.',
  'The light is different. The place is not.',
  'Whatever was making the noise last time has stopped.',
  // what did not
  'Nothing here has bothered to change on your account.',
  'Same silt, same lean, same everything.',
  'The place has been waiting exactly where you left it.',
  'It has not aged a day, which in Tartaria means nothing at all.',
  'Everything is where it was. That is either comfort or warning.',
  // time
  'It has been a while. Not long enough for the ground to forget you.',
  'Days have gone by out there. In here it may as well be the same afternoon.',
  'Time has passed. This ground has no opinion on it.',
  // your own habits
  'You catch yourself walking the same line through the wreckage.',
  'You look for the same landmark you looked for last time, and find it.',
  'You almost check a corner you have already checked.',
  'You do not bother reading the walls. You read them already.',
  // the company
  'Pike lifts his head, then puts it down. He has been here too.',
  'The quiet here is one you have already learned the shape of.',
  'You have an opinion about this place now. That is new.',
]);

/** Many visits. Familiarity has curdled into routine. */
export const RETURN_FAMILIAR_LINES: readonly string[] = Object.freeze([
  // routine
  'You could walk this stretch with your eyes shut, and nearly do.',
  'This ground has stopped being a place and started being a route.',
  'You know this patch better than you ever meant to.',
  'You stopped looking at this place some visits ago.',
  'Familiar to the point of invisibility.',
  // the body
  'Your feet do the thinking here. You are just along for it.',
  'You cross it without deciding to.',
  'No part of you tenses any more. Whether that is wisdom or habit is not clear.',
  'You are through it before you notice you have started.',
  // wear
  'Your own tracks are still here, layered over each other.',
  'The ground remembers you in the plural.',
  'There is a path worn here now, and it is yours.',
  'Whatever this place was to you the first time, it is furniture now.',
  // the cost of knowing
  'Nothing about this ground can surprise you, which is its own kind of danger.',
  'You have taken everything worth taking from here, and then some.',
  'You have run out of questions to ask this place.',
  'The novelty went a long time ago. The mud stayed.',
  // time
  'You measure your time out here partly in crossings of this ground.',
  'This place has become one of the things your days are made of.',
  'It goes on being here, and you go on coming back.',
]);

/**
 * ⚠⚠ THE PICKER, AND THE REASON THE TIERS LIVE IN HERE. `visitCount` is a
 * number, and every previous version of this line let the number leak to the
 * player. Handing it to a function that returns PROSE and nothing else makes
 * that structurally impossible — there is no argument a caller can pass through
 * to the screen. Same reasoning as `fleeLine`: the decision had no name, so the
 * only thing a test could reach for was the text around it.
 *
 * ⚠ `visitCount` is the number of PRIOR visits, so 1 means "this is the second
 * time". The old call site read `visitCount + 1` to build its counter, which is
 * exactly the off-by-one that made OTA-1104's phantom shell record surface as
 * "(visit 2)" on a first entry.
 */
export const RETURN_MANY_THRESHOLD = 5;

export function returnLine(visitCount: number): string {
  const n = Number.isFinite(visitCount) ? visitCount : 1;
  return n >= RETURN_MANY_THRESHOLD
    ? rotatingPick(RETURN_FAMILIAR_LINES, 'return-familiar')
    : rotatingPick(RETURN_AGAIN_LINES, 'return-again');
}

// ⚠⚠ OTA-1691 — THE ROOM NAMES ITS DEAD. The narrative-agency audit (hole 3):
// `enemiesCleared` was written on every kill and read only for the respawn
// quiet window, and the one line that read it — "The bodies you left are
// still here" — never said whose. After the window nothing was said at all,
// so a place the player had emptied of Mud Wasps read as any other place.
// One writer for the clause: inside the quiet window the bodies are named;
// after it the clearing is remembered as a fact about the place. Two names at
// most, pluralised by the one pluraliser (OTA-1686's rule).

/** The clause that rides the return line, or '' when the room holds no clears.
 *  `recent` is the respawn quiet window: the bodies are still on the floor. */
export function clearedBodiesNote(cleared: ReadonlyArray<string> | undefined, recent: boolean): string {
  const names = (cleared ?? []).filter((n) => !!n);
  if (names.length === 0) return '';
  // A hunted apex carries its "(hunted)" tag in the ledger; it is one named
  // beast, not a kind — "the Bog Dragon", never "Bog Dragon (hunted)s".
  const shown = names.slice(-2).map((n) => (/\s\(hunted\)$/.test(n) ? `the ${n.replace(/\s\(hunted\)$/, '')}` : pluralizeNoun(n)));
  const who = shown.length === 2 ? `${shown[0]} and ${shown[1]}` : shown[0]!;
  return recent
    ? ` The ${who} you left are still here. Nothing has moved in to replace them.`
    : ` You cleared this place of ${who} once; the floor has been swept since, one way or another.`;
}
