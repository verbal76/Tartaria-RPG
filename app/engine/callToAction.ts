// callToAction — backstory-fill flavor for evocative "call to action"
// verbs that don't land on an active hook.
//
// A scene's prose often invites an action — "knock on the steeple door",
// "ring the bells", "touch the pillar", "pray at the altar". When one of
// those nouns is wired to a hook the hook resolver handles it. But most
// of them are pure atmosphere with no hook behind them, and before this
// module the verb either went silent (knock) or demoted to 'unknown' and
// drew the generic "Try: look around" refusal. Playtest feedback: "if
// there's a call to action, the call to action has to actually DO
// something — even if it's only a line of backstory."
//
// So every such verb now resolves to a short, in-world response keyed to
// the VERB FAMILY (knock / sound / vocal / touch / reverent / manipulate)
// and the noun the player named. The lines lean into the drowned-country
// mood: the action reaches out, and the buried world answers with silence,
// memory, or the faint sense of being the first to try in a long time.

export type GestureFamily =
  | 'knock'
  | 'sound'
  | 'vocal'
  | 'touch'
  | 'reverent'
  | 'manipulate';

/** Map a raw verb (matchedVerb) to its flavor family. Falls back to
 *  'touch' — the most neutral "you interact with it" family — so an
 *  unrecognized-but-evocative verb still gets a sensible line. */
export function gestureFamily(verb: string | null | undefined): GestureFamily {
  const v = (verb ?? '').toLowerCase().trim();
  if (['knock', 'rap', 'tap', 'pound', 'thump', 'bang'].includes(v)) return 'knock';
  if (['ring', 'sound', 'signal', 'clap', 'strike a note'].includes(v)) return 'sound';
  if (['whistle', 'shout', 'chant', 'hum', 'answer', 'respond', 'sing', 'call'].includes(v)) return 'vocal';
  if (['pray', 'kneel', 'salute', 'bow', 'beckon'].includes(v)) return 'reverent';
  if (['touch', 'feel', 'stroke', 'caress'].includes(v)) return 'touch';
  if (['push', 'pull', 'turn', 'twist', 'press', 'rotate', 'tilt', 'shove', 'nudge', 'tug', 'yank', 'crank', 'wind', 'wrench', 'torque', 'depress', 'mash', 'spin', 'revolve'].includes(v)) return 'manipulate';
  return 'touch';
}

// {noun} is replaced with the player's named target, or a neutral
// "it" phrasing when they named nothing (handled by fillNoun below).
const LINES: Record<GestureFamily, string[]> = {
  knock: [
    'You knock at {noun}. The sound travels a long way in and comes back thinner — the knock of someone who suspects no one has answered in years, and is right.',
    'You rap on {noun}. Somewhere past it, dust settles. If anyone waited on the other side, they stopped waiting a long time before you arrived.',
    'You pound on {noun}. The echo runs off into the dark and does not return with company. The buried country keeps its doors, and its silences.',
  ],
  sound: [
    'You set {noun} sounding. The note hangs, thins, and is gone — a signal thrown out to a country that stopped listening when the flood came.',
    'You sound {noun}. For a breath the old world seems to lean in to hear it. Then the water-heavy quiet folds back over everything.',
    'You ring out from {noun}. No answer rises to meet it, but the note lingers in your chest longer than it has any right to.',
  ],
  vocal: [
    'You call out toward {noun}. The dark takes the sound whole and gives back only the shape of your own voice, worn smooth.',
    'You raise your voice at {noun}. Nothing answers — but the listening feels different now, as though the room has turned its attention to you.',
    'You speak to {noun} the way you would to something that might still be there. The silence that follows is patient, and not entirely empty.',
  ],
  touch: [
    'You lay a hand on {noun}. It is colder than the air, and under your palm you feel the faint memory of the hands that made it, and then let it go.',
    'You run your fingers over {noun}. Grit, old varnish, the ghost of a carved line — a whole life pressed into a surface no one has touched since the water rose.',
    'You touch {noun}. Something almost stirs at the contact — not warmth, not sound, just the sense that the drowned world noticed, and remembered being noticed.',
  ],
  reverent: [
    'You bow your head at {noun}. No god of the drowned country answers, but the stillness has a weight to it, and you leave a little of your unease behind.',
    'You pay {noun} its due. Whatever was worshipped here is long gone under the silt — yet the gesture steadies you, the way old gestures do.',
    'You kneel before {noun}. The buried world does not bless you. It simply lets you rest a moment in the shape of something older than the flood.',
  ],
  manipulate: [
    'You work {noun} with both hands. It shifts a hair, groans, and holds — set in place by a thousand years of silt and patience. But it moved, and it remembers you tried.',
    'You lean into {noun}. It resists the way everything down here resists: not with malice, only with the sheer stubborn weight of time. Nothing gives, but something is noted.',
    'You test {noun}. Whatever mechanism it once served has long since seized, but your effort dislodges a fine rain of dust — and, for a moment, the sense of a room waking up.',
  ],
};

function fillNoun(noun: string | null | undefined): string {
  const n = (noun ?? '').trim();
  if (!n) return 'the dark ahead';
  // Strip a leading article the player may have typed so "{noun}" reads
  // cleanly inside the sentence ("knock at the door", not "knock at the
  // the door").
  return n.replace(/^(the|a|an)\s+/i, '');
}

/** Deterministic-ish flavor line for a call-to-action gesture that found
 *  no hook. `verb` is the parsed matchedVerb; `noun` is the player's
 *  target (may be empty). Pure aside from Math.random line-selection,
 *  matching the rest of the flavor pools in this engine. */
export function callToActionLine(verb: string | null | undefined, noun: string | null | undefined): string {
  const family = gestureFamily(verb);
  const pool = LINES[family];
  const line = pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!;
  const filled = fillNoun(noun);
  // "the dark ahead" already reads as a phrase; for a named noun, prefix
  // "the" so it slots grammatically ("knock at the steeple door").
  const nounPhrase = filled === 'the dark ahead' ? filled : `the ${filled}`;
  return line.replace(/\{noun\}/g, nounPhrase);
}
