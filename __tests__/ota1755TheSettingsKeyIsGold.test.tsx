/**
 * OTA-1755 — THE SETTINGS KEY IS GOLD.
 *
 * Owner: *"as for the gear, go with our gold color we use not the gunmetal."*
 *
 * ⚠⚠⚠ THIS OVERRIDES A RULE THIS PROJECT OTHERWISE KEEPS, so the exception gets
 * written down instead of sitting in the code as a quiet contradiction. VIS-3
 * established that gold marks a LIVE OBLIGATION or a LIVE PROCESS and nothing
 * else — that is what took it off Exploration's place name, day, weather, nav
 * buttons and parser guesses, and it is why OTA-1748 made both gears ceramic. A
 * settings key is neither of those things.
 *
 * The owner has now seen it on the device and wants the brand gold. His game,
 * his call, and the useful thing a test can do is state the amended rule rather
 * than pretend the old one still holds:
 *
 *     GOLD MEANS A LIVE OBLIGATION, A LIVE PROCESS, OR THE SETTINGS KEY.
 *
 * ⚠⚠ AND "SETTINGS MUST NOT COMPETE" IS STILL SATISFIED — by the other half of
 * the VIS-3 change, which is the part that actually did the work. What made the
 * old gear shout was not only its colour: it was a BORDERED CHIP at the same
 * visual weight as the place name beside it, on a header where six classes of
 * information all wore the same gold. So this suite does not test the gear's
 * colour and stop; it tests that everything around it stayed demoted, which is
 * what makes one gold key legible instead of loud.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { T } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const EXP = read('app', 'screens', 'ExplorationScreen.tsx');

const styleBlock = (src: string, name: string) => {
  const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(src);
  if (one) return one[0];
  return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(src)?.[0] ?? '';
};

describe('the key is gold, on both screens', () => {
  test('both gears take the brand gold, and they still match each other', () => {
    expect(EXP).toContain('<TGear size={SCENE_GEAR_SIZE} color={T.gold} />');
    expect(TITLE).toContain('<TGear size={20} color={T.gold} />');
    expect(T.gold).toBe('#C9A86A');
    // ⚠ one mark in one colour across the app — OTA-1748's claim, unbroken. The
    // SIZE still differs, because a corner button and a header rail are
    // different amounts of room.
    const colours = [...TITLE.matchAll(/<TGear[^/]*color=\{T\.(\w+)\}/g)].map((m) => m[1])
      .concat([...EXP.matchAll(/<TGear[^/]*color=\{T\.(\w+)\}/g)].map((m) => m[1]));
    expect(colours).toHaveLength(2);
    expect(new Set(colours).size).toBe(1);
  });

  test('it is still the drawn mark, not the glyph OTA-1748 replaced', () => {
    // The colour changed; the icon did not go back to being a font's problem.
    expect(EXP).not.toContain('⚙');
    expect(TITLE).not.toContain('⚙');
    expect(read('app', 'ui', 'tartariaKit.tsx')).toContain('export function TGear');
  });
});

describe('the exception is stated, and bounded', () => {
  test('⚠⚠ the override is written down where the change was made', () => {
    /* A rule that gets silently broken stops being a rule. This is the whole
     * point of the suite: the next person to read TitleScreen finds the
     * exception and its reason, not a colour that contradicts the comment three
     * files away. */
    expect(TITLE).toContain('STATED EXCEPTION TO A RULE');
    expect(TITLE).toMatch(/GOLD ON\s+\* {0,10}THIS PROJECT MEANS A LIVE OBLIGATION, A LIVE PROCESS, OR THE SETTINGS|MEANS A LIVE OBLIGATION, A LIVE PROCESS, OR THE SETTINGS/);
  });

  test('⚠⚠⚠ and the rest of the rule still holds — the header did NOT follow', () => {
    /* The exception is one key, not an amnesty. Everything VIS-3 took the gold
     * off stays off it, which is what keeps a single gold mark readable. */
    for (const n of ['sceneName', 'sceneTime', 'sceneDot', 'sceneBarBtn', 'crestNavBtn', 'didYouMeanChip']) {
      expect(styleBlock(EXP, n).toLowerCase()).not.toContain('c9a86a');
    }
  });

  test('the socket it sits in is a recess, not a gold-bordered chip', () => {
    // ⚠ This is the half of VIS-3 that does the real work now. The old gear was
    // loud because it was a bordered chip AND gold; only one of those is back.
    const b = styleBlock(EXP, 'sceneBarBtn');
    expect(b.toLowerCase()).not.toContain('c9a86a');
    expect(b).toContain('borderBottomColor');   // lit on the BOTTOM edge = a recess
  });

  test('Exploration spends no more gold than it did before this pass', () => {
    /* The gear is drawn, so it declares no colour in the StyleSheet at all —
     * which means the screen's gold BUDGET (12 quoted declarations since
     * OTA-1746) is untouched by giving the key its colour back. */
    expect((EXP.match(/'#c9a86a'/g) ?? []).length).toBe(12);
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1755-the-settings-key-is-gold'");
  });
});
