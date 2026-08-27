// OTA-1525 — THE DOG CARD GETS THE SWITCH TOO.
//
// ⚠⚠⚠ THE OWNER OVERRULED THE EXEMPTION: "push the dog card tips button too."
// OTA-1524 had left DogOnboardingModal out on the grounds that it ASKS rather
// than tells — its own contract, from OTA-1027, is "No dismiss-without-answering:
// the dog is already rescued; it needs a name" — and a plain dismiss there would
// leave the save wedged exactly where that OTA found it, mid-naming.
//
// ⚠⚠ HIS CALL STANDS, AND THE CONFLICT WAS FALSE. What a player reaching for
// that link actually wants is "stop showing me these", not "close this one". So
// the button is here, in the same words, writing the same global flag — and it
// does NOT dismiss. Every future tip goes quiet; this one question stays up,
// because the dog still needs an answer. Honouring the request and protecting the
// save turn out not to be in tension once the button stops meaning "close this".
//
// ⚠ AND IT LATCHES ITS LABEL, because it is the only control on this card that
// does not change the screen. A link that appears to do nothing reads as broken,
// so once tapped it says so and goes inert.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const DOG = readFileSync(join(ROOT, 'app', 'components', 'DogOnboardingModal.tsx'), 'utf8');

describe('OTA-1525 — the switch is offered on the dog card', () => {
  it('⚠⚠⚠ IT WRITES THE SAME GLOBAL FLAG EVERY OTHER CARD WRITES', () => {
    expect(DOG).toContain("import { setHintsDisabled, getHintsDisabled } from './useFirstTimeHint';");
    expect(DOG).toContain('void setHintsDisabled(true); setTipsOff(true);');
  });

  it('⚠⚠⚠ AND IT DOES NOT DISMISS — the dog still needs a name', () => {
    // The whole reason 1524 exempted this card. The onPress must not call the
    // commit path or any close, or a player silencing tips loses their dog's
    // naming beat and the save wedges where OTA-1027 found it.
    const at = DOG.indexOf('void setHintsDisabled(true); setTipsOff(true);');
    const press = DOG.slice(DOG.lastIndexOf('<Pressable', at), DOG.indexOf('</Pressable>', at));
    expect(press).not.toContain('commit');
    expect(press).not.toContain('onClose');
  });

  it('⚠⚠ the confirm is STILL gated on an answer', () => {
    // Unchanged by this OTA and pinned so it stays that way: the card cannot be
    // completed without the one field the engine actually needs.
    expect(DOG).toContain('disabled={!sex}');
    expect(DOG).toContain('onPress={commit}');
  });

  it('⚠⚠ the tap is visibly acknowledged, then goes inert', () => {
    // The only control here that does not change the screen — so it says what it
    // did and stops accepting taps rather than looking broken.
    expect(DOG).toContain('const [tipsOff, setTipsOff] = useState(false);');
    expect(DOG).toContain('disabled={tipsOff || getHintsDisabled()}');
    expect(DOG).toMatch(/Tips off — the dog still needs a name/);
  });

  it('⚠ and the card itself is still NOT gated on the flag', () => {
    // Turning tips off must silence tips, not questions. This modal is raised
    // from worldMemory.pendingDogOnboarding and must keep being raised.
    expect(DOG).not.toMatch(/useHintsDisabled\(\)/);
    expect(DOG).not.toMatch(/if \(getHintsDisabled\(\)\) return null/);
  });
});
