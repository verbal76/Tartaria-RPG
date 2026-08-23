/**
 * OTA-1442 — THE ROPE BEAT LETS YOU SEE WHAT YOU TYPE.
 *
 * Owner, on device: *"when you say take rope. it's already highlighting the
 * text box and when I type in it it doesn't push above the keyboard so I
 * can't see what I'm typing and I have to hit the send arrow instead of the
 * act button ... any other time ... 99 times out of 100 [it works]. there are
 * still a few that flake out. something in the tutorial is interrupting that
 * flow."* And: *"I don't want take rope pre-filled. I want the player to
 * still have to type it so they understand the concept."*
 *
 * ⚠⚠ THE TUTORIAL-SPECIFIC INTERRUPTION WAS OUR OWN ANIMATION. The rope beat
 * ran TWO JS-driven 700ms pulse loops at once (TutorialTarget's glow + the
 * input box's border pulse) — a style write across the bridge every frame,
 * precisely while the player taps the field. Under that load Android's New
 * Architecture drops keyboard events: the focus swap onto the floating bar
 * fires keyboardDidHide, the matching didShow is dropped, and the bar's
 * 200ms hide-timer retracted it (wiping the draft) with the keyboard still
 * standing. Result: typing blind into the covered in-flow field, no ACT.
 * OTA-1075 caught the first symptom of this same saturation and patched the
 * focus call; this OTA removes the load itself and makes the retract check.
 */
import { TUTORIAL_STEPS, type TutorialStep } from '../app/components/tutorialSteps';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const TARGET = read('app', 'components', 'TutorialTarget.tsx');
const INPUT = read('app', 'components', 'InputBox.tsx');
const BAR = read('app', 'components', 'KeyboardInputBar.tsx');
const STEPS = read('app', 'components', 'tutorialSteps.ts');
const STORE = read('app', 'state', 'gameStore.ts');

describe('OTA-1442 — no beat pre-fills the input, and the plumbing is gone', () => {
  it('⚠⚠ no step carries a pre-fill, and the field no longer exists to carry one', () => {
    // OTA-860 emptied the data; this removes the pipe. "I want the player to
    // still have to type it" is a rule about the future — with the field gone
    // from the type and the consumer gone from advanceTutorial, a pre-fill
    // cannot quietly return on the next beat someone authors.
    for (const s of TUTORIAL_STEPS) {
      expect((s as TutorialStep & { draftText?: string }).draftText).toBeUndefined();
    }
    expect(STEPS).not.toContain('draftText?:');
    expect(STORE).not.toContain('nextStep.draftText');
  });

  it('⚠ the rope beat still asks the player to type it themselves', () => {
    const rope = TUTORIAL_STEPS.find((s) => s.id === 'rope')!;
    expect(rope.inputPulse).toBe(true);
    expect(rope.body).toContain('type');
  });
});

describe('OTA-1442 — the tutorial pulses run on the NATIVE driver', () => {
  it('⚠⚠ neither pulse loop crosses the bridge per frame any more', () => {
    expect(TARGET).not.toContain('useNativeDriver: false');
    expect(INPUT).not.toContain('useNativeDriver: false');
    expect((TARGET.match(/useNativeDriver: true/g) ?? []).length).toBe(2);
    expect((INPUT.match(/useNativeDriver: true/g) ?? []).length).toBe(2);
  });

  it('⚠⚠ the crossfade shape: static dim border + bright overlay fading on opacity', () => {
    // borderColor cannot animate natively, so the pulse must be an OPACITY on
    // a bright overlay — if either file goes back to interpolating a colour,
    // the JS-per-frame load returns with it.
    expect(TARGET).toContain('opacity: pulse,');
    expect(TARGET).not.toContain("pulse.interpolate({ inputRange: [0, 1], outputRange: ['#c9a86a', '#ffe28a'] })");
    expect(INPUT).toContain('inputPulseOverlay');
    expect(INPUT).toContain('{ opacity: pulse }');
    expect(INPUT).not.toContain("outputRange: ['#c9a86a', '#ffe28a']");
  });

  it('⚠ reduce-motion still gets its static cue, no loop', () => {
    expect(INPUT).toContain("? '#ffe28a'  // static highlight — no motion, still clearly cued");
    expect(TARGET).toContain('shouldPulse ? 0.35 : 0.95');
  });
});

describe('OTA-1442 — the floating bar trusts the keyboard, not the event', () => {
  it('⚠⚠ the hide-timer asks the keyboard before retracting (Android)', () => {
    // The retract path wipes the draft and unmounts the bar. Doing that on a
    // didHide whose matching didShow was dropped is the "typing blind" bug —
    // so the timer now verifies the keyboard is actually gone first.
    const timer = BAR.indexOf('hideTimer = setTimeout(() => {');
    expect(timer).toBeGreaterThan(-1);
    const retract = BAR.indexOf('useGameStore.getState().setExplorationInputActive(false);', timer);
    const check = BAR.indexOf("typeof k.isVisible === 'function' && k.isVisible()", timer);
    expect(check).toBeGreaterThan(timer);
    expect(check).toBeLessThan(retract);
    // …and a still-standing keyboard re-syncs the height instead of retracting.
    const resync = BAR.indexOf('if (m?.height) applyHeight(m.height);', check);
    expect(resync).toBeGreaterThan(check);
    expect(resync).toBeLessThan(retract);
  });

  it('⚠ the check is Android-only — iOS metrics lie mid-dismiss (arb71 ghost)', () => {
    const timer = BAR.indexOf('hideTimer = setTimeout(() => {');
    const guard = BAR.indexOf("if (Platform.OS === 'android') {", timer);
    const retract = BAR.indexOf('useGameStore.getState().setExplorationInputActive(false);', timer);
    expect(guard).toBeGreaterThan(timer);
    expect(guard).toBeLessThan(retract);
  });
});
