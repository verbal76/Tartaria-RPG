// arb-fix (OTA-824) — "I used follow because resonance is a sound." The Aetheric Torch
// charges a lead that ANSWERS with a resonance, so the player types "follow/examine the
// resonance". Charging now stamps sound-synonyms (resonance/sound/ringing/hum/note) onto
// the hook's nouns, so those words resolve to the charged hook via matchHookNoun — and a
// "follow"-verb travel to a torch-charged hook advances it instead of walking off (wired
// in the travel handler; here we lock the resolution mechanic the wiring depends on).

import { matchHookNoun } from '../app/engine/hooks';
import type { Hook } from '../app/engine/hooks';

const chargedHook = (): Hook =>
  ({
    id: 'h1', kind: 'glint', nouns: ['crystal', 'resonance', 'sound', 'ringing', 'hum', 'note'],
    stage: 0, resolved: false, torchCharged: true, plantedLine: '',
  } as unknown as Hook);
const plainHook = (): Hook =>
  ({ id: 'h2', kind: 'glint', nouns: ['statue'], stage: 0, resolved: false, plantedLine: '' } as unknown as Hook);

describe('OTA-824 — a torch-charged lead answers to the resonance/sound word', () => {
  it('resolves the sound-synonyms to the charged hook', () => {
    const hooks = [plainHook(), chargedHook()];
    for (const word of ['resonance', 'the resonance', 'sound', 'ringing', 'hum']) {
      const hit = matchHookNoun(word, hooks);
      expect(hit?.id).toBe('h1');
      expect(hit?.torchCharged).toBe(true);
    }
  });

  it('still resolves the literal noun ("crystal") too', () => {
    expect(matchHookNoun('crystal', [chargedHook()])?.id).toBe('h1');
  });

  it('does not resolve a sound word to an unrelated plain hook', () => {
    expect(matchHookNoun('resonance', [plainHook()])).toBeNull();
  });
});
