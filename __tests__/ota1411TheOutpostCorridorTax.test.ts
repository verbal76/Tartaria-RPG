/**
 * OTA-1411 — 72.8 SECONDS SPENT ON EIGHT SENTENCES NOBODY READ.
 *
 * From the owner's second 4.31.5 session, walking the Asgardar outpost:
 *
 *   narration:scene_intro n9 avg9.5s max13.1s read8.6s/write0.2s
 *                         in748t→out4t ⏸8 ✂8/72.8s
 *   ⚠ Native queue: 13 generations thrown away (92.2s)
 *
 * NINE live scene intros started, EIGHT preempted and discarded. Every one fired
 * in an outpost interior, and that is structural rather than unlucky:
 *
 *   · Hub rooms have NO BANK — `introPrefetchCandidates` returns [] inside a hub
 *     (OTA-1258), so each room entry takes the LIVE path and pays a full ~9-12s
 *     prefill on an ~840-token prompt.
 *   · Hub rooms are where the player moves FASTEST — his corridor cadence was
 *     1.4 seconds a room.
 *   · The room is ALREADY DESCRIBED. Every outpost room prints authored prose
 *     before the Arbiter speaks.
 *
 * The slowest path in the game was wired to the quickest movement in the game,
 * to add an aside to a room that already had one.
 *
 * ⚠ AND THE ONE THAT SURVIVED WAS WRONG. The single scene_intro that landed in
 * the previous session narrated the Unaligned Poacher — dead 51 seconds and a
 * tile away (OTA-1409). Measured value of this path across two logs: eight
 * discards, one wrong line, seventy-plus seconds of the one native lock.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { canonicalSynthKind } from '../app/engine/itemSynthesisQwen';
import { blockAt } from '../test-utils/srcBlock';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const NARRATION = read('app', 'ai', 'narration.ts');
const SYNTH = read('app', 'engine', 'itemSynthesisQwen.ts');

describe('OTA-1411 — an outpost room takes the authored line, not a 12-second one', () => {
  it('⚠⚠ the gate exists and is scoped to scene intros ONLY', () => {
    // A travel or diplomacy narration inside an outpost is a REACTION the player
    // is waiting on. Gating those would be a different, worse change.
    expect(NARRATION).toContain(
      "const inOutpostRoom = intent === 'scene_intro' && !!get().player?.hubRoomId;",
    );
    expect(NARRATION).toContain('|| burnedRecently || inOutpostRoom)');
  });

  it('⚠⚠ the player still GETS an Arbiter line — this routes, it does not silence', () => {
    // The gate below appends `templateFallback`, which is the authored
    // `buildArbiterSceneIntro` output — the same path cooldown and sprinting take.
    // Nothing goes quiet; what stops is paying twelve seconds for a discard.
    const i = NARRATION.indexOf('const inOutpostRoom =');
    const body = blockAt(NARRATION, 'const inOutpostRoom =');
    expect(body).toContain("get().appendLog('debug', `arbiter: template (reason=${reason})`);");
  });

  it('⚠ it names itself in the log, like every other gate', () => {
    // Every reason in this ladder is readable in a device log, so the next
    // capture can say which gate stopped a generation without a source dive.
    expect(NARRATION).toContain("'outpost-room'");
    expect(NARRATION).toContain("? 'sprinting'");
    expect(NARRATION).toContain("? 'burned-recently'");
  });

  it('⚠⚠ the reason ladder stays exhaustive — a gate with no name is a silent one', () => {
    // Each condition in the `if` must have a matching arm, or a gated generation
    // reports the wrong cause. Checked by counting both sides.
    const i = NARRATION.indexOf('const inOutpostRoom =');
    const gate = NARRATION.slice(NARRATION.indexOf('if (!qwen.isReady()', i), NARRATION.indexOf('const reason =', i));
    for (const cond of ['inCombat', 'cooldownActive', 'sprinting', 'burnedRecently', 'inOutpostRoom']) {
      expect(gate).toContain(cond);
    }
    const ladder = NARRATION.slice(NARRATION.indexOf('const reason =', i), NARRATION.indexOf('appendLog(\'debug\', `arbiter: template', i));
    for (const arm of ['combat', 'cooldown', 'sprinting', 'burned-recently', 'outpost-room']) {
      expect(ladder).toContain(arm);
    }
  });

  it('⚠ the measurement that justified it is written down, not asserted', () => {
    expect(NARRATION).toContain('⏸8 ✂8/72.8s');
    expect(NARRATION).toContain('Hub rooms have NO BANK');
  });
});

describe('OTA-1411 — a near-miss kind is coerced instead of throwing the work away', () => {
  it('⚠⚠ the owner\'s row: a rope came back as a "tool", twice', () => {
    // `item_synth:rejected-by-clamp bad-kind="tool"` for "Reclaimer's Rope", and
    // again 45 seconds later on the same item. A rope IS a tool; `tool` was
    // simply not a word in KNOWN_KINDS, so a correct answer died on vocabulary.
    expect(canonicalSynthKind('tool')).toBe('misc');
  });

  it('⚠⚠ …and this is the FIFTH OTA on this job, the first not aimed at the prompt', () => {
    // The previous four rewrote the brief — token cap, then shape, then the pipe
    // loop, then the nesting — all on the premise that the model was wrong. Here
    // the validator's dictionary was the short one, and a fifth prompt rewrite
    // would not have touched it.
    expect(SYNTH).toContain('NEAR-MISS KINDS ARE COERCED, NOT BINNED');
    // ⚠ one line's worth: the sentence wraps in the source, and asserting across
    // the wrap would pin the line width rather than the claim.
    expect(SYNTH).toContain('dictionary is the thing that is short');
  });

  it('⚠ every synonym has an unambiguous home, and none of them change behaviour', () => {
    expect(canonicalSynthKind('potion')).toBe('consumable');
    expect(canonicalSynthKind('food')).toBe('consumable');
    expect(canonicalSynthKind('artifact')).toBe('relic');
    expect(canonicalSynthKind('trinket')).toBe('accessory');
    expect(canonicalSynthKind('material')).toBe('misc');
  });

  it('⚠⚠ a legal kind passes through untouched', () => {
    for (const k of ['weapon', 'armor', 'accessory', 'consumable', 'misc', 'relic']) {
      expect(canonicalSynthKind(k)).toBe(k);
    }
    expect(canonicalSynthKind('WEAPON')).toBe('weapon');
    expect(canonicalSynthKind('  relic  ')).toBe('relic');
  });

  it('⚠⚠ a genuinely unknown kind STILL fails, and still says what it saw', () => {
    // Coercion must not become "accept anything". The OTA-1115 pipe loop
    // (`"kind":"misc|invented|lorem|quest|tool|misc"`) has to keep failing.
    expect(canonicalSynthKind('passive')).toBe('');
    expect(canonicalSynthKind('misc|invented|lorem|quest')).toBe('');
    expect(canonicalSynthKind('')).toBe('');
    expect(canonicalSynthKind(undefined)).toBe('');
    expect(canonicalSynthKind(42)).toBe('');
    expect(SYNTH).toContain('bad-kind="${kindSeen}"');
  });

  it('⚠ the clamp and the discard-reason ask the SAME function', () => {
    // They disagreed before this OTA by construction: one compared against
    // KNOWN_KINDS, the other lowercased the raw string separately. Two readings
    // of one rule is the drift this session has fixed four times elsewhere.
    expect(SYNTH).toContain('const kindRaw = canonicalSynthKind(raw.kind);');
    expect(SYNTH).toContain('const why = !canonicalSynthKind(obj.kind)');
  });
});
