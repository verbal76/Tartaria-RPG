/**
 * @jest-environment jsdom
 */
/**
 * Controller text entry, glyphs and input mode for the Steam Deck / Machine build.
 * Valve: text input must open Steam's keyboard or ship a controller-only entry; glyphs must match the
 * input in use; no mouse/keyboard prompts under a controller.
 */
import { openOnScreenKeyboard, activeOnScreenKeyboard, OSK_BUTTON_X, OSK_BUTTON_Y, OSK_BUTTON_MENU } from '../app/components/gamepad/onScreenKeyboard';
import { enterTextWithController, setNativeValue, isTextField } from '../app/components/gamepad/textEntry';
import { hintsFor, mountControllerHints } from '../app/components/gamepad/controllerHints';
import { getInputMode, setInputMode, subscribeInputMode, resetInputModeForTest } from '../app/components/gamepad/inputMode';

const key = (label: string): HTMLButtonElement => {
  const b = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-osk] button')).find((x) => x.textContent === label);
  if (!b) throw new Error(`no key ${label}`);
  return b;
};
const baseKey = (base: string): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>(`[data-osk] button[data-base="${base}"]`)!;
const preview = () => document.querySelector('[data-osk-preview]')!.textContent!.replace(/\u00a0/g, '');

beforeEach(() => { document.body.innerHTML = ''; resetInputModeForTest(); });

describe('the built-in on-screen keyboard (controller-only text entry)', () => {
  it('types with key presses and returns the text on Done', async () => {
    const osk = openOnScreenKeyboard(document, { label: 'Character name' });
    key('k').click(); key('a').click(); key('i').click();
    expect(preview()).toBe('kai');
    key('Done').click();
    await expect(osk.result).resolves.toBe('kai');
    expect(document.querySelector('[data-osk]')).toBeNull();
  });
  it('Cancel returns null and Escape (what the B button sends, at window) cancels', async () => {
    const a = openOnScreenKeyboard(document);
    key('Cancel').click();
    await expect(a.result).resolves.toBeNull();
    const b = openOnScreenKeyboard(document, { initial: 'x' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(b.result).resolves.toBeNull();
    expect(activeOnScreenKeyboard()).toBeNull();
  });
  it('Shift is one-shot and gives capitals and the punctuation a command needs', async () => {
    const osk = openOnScreenKeyboard(document);
    key('Shift').click(); baseKey('q').click();   // Q
    baseKey('w').click();                         // w (shift cleared)
    key('Shift').click(); baseKey('1').click();   // !
    expect(baseKey('q').textContent).toBe('q');   // the labels went back to lowercase
    expect(preview()).toBe('Qw!');
    osk.close('x');
  });
  it('honours maxLength and the initial text; Delete and Space work', async () => {
    const osk = openOnScreenKeyboard(document, { initial: 'ab', maxLength: 4 });
    key('c').click(); key('d').click(); key('e').click(); // capped at 4
    expect(preview()).toBe('abcd');
    key('Delete').click();
    key('Space').click();
    expect(preview()).toBe('abc ');
    osk.close(null);
  });
  it('the controller buttons it claims: X deletes, Y spaces, Menu is Done, others are left alone', async () => {
    const osk = openOnScreenKeyboard(document, { initial: 'hi' });
    expect(osk.pressButton(OSK_BUTTON_X)).toBe(true);
    expect(osk.pressButton(OSK_BUTTON_Y)).toBe(true);
    expect(preview()).toBe('h ');
    expect(osk.pressButton(0)).toBe(false);
    expect(osk.pressButton(OSK_BUTTON_MENU)).toBe(true);
    await expect(osk.result).resolves.toBe('h ');
  });
  it('sits on the highest layer so GamepadNav\'s popup focus capture lands inside it, and every key is a real button', () => {
    openOnScreenKeyboard(document);
    const z = parseInt((document.querySelector('[data-osk]') as HTMLElement).style.zIndex, 10);
    expect(z).toBeGreaterThan(1_000_000);
    const keys = document.querySelectorAll('[data-osk] button');
    expect(keys.length).toBeGreaterThanOrEqual(40);
    keys.forEach((k) => expect((k as HTMLButtonElement).type).toBe('button'));
  });
  it('a password is masked in the preview', () => {
    const osk = openOnScreenKeyboard(document, { password: true });
    key('s').click(); key('e').click();
    expect(preview()).toBe('••');
    osk.close(null);
  });
  it('opening a second keyboard closes the first (never two on screen)', async () => {
    const a = openOnScreenKeyboard(document);
    openOnScreenKeyboard(document);
    await expect(a.result).resolves.toBeNull();
    expect(document.querySelectorAll('[data-osk]').length).toBe(1);
  });
});

describe('writing the result into a React-controlled field', () => {
  it('setNativeValue fires the input and change events React listens for', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(`input:${input.value}`));
    input.addEventListener('change', () => seen.push(`change:${input.value}`));
    setNativeValue(input, 'look around');
    expect(input.value).toBe('look around');
    expect(seen).toEqual(['input:look around', 'change:look around']);
  });
  it('knows which elements take text', () => {
    const mk = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
    expect(isTextField(mk('<input type="text">'))).toBe(true);
    expect(isTextField(mk('<textarea></textarea>'))).toBe(true);
    expect(isTextField(mk('<input type="checkbox">'))).toBe(false);
    expect(isTextField(mk('<button>x</button>'))).toBe(false);
  });
});

describe('text entry route: Steam first, built-in keyboard second', () => {
  const field = () => { const i = document.createElement('input'); i.maxLength = 30; i.placeholder = 'Type a command'; i.value = 'old'; document.body.appendChild(i); return i; };

  it("uses Steam's keyboard when the bridge opened it, passing the field's context", async () => {
    const i = field();
    const calls: unknown[] = [];
    const out = await enterTextWithController(i, { steamTextInput: async (o) => { calls.push(o); return { ok: true, text: 'north' }; } });
    expect(out).toBe('steam');
    expect(i.value).toBe('north');
    expect(calls[0]).toMatchObject({ description: 'Type a command', maxCharacters: 30, existingText: 'old', multiline: false, password: false });
    expect(document.querySelector('[data-osk]')).toBeNull();
  });
  it('a cancelled Steam dialog leaves the field untouched', async () => {
    const i = field();
    expect(await enterTextWithController(i, { steamTextInput: async () => ({ ok: true, text: null }) })).toBe('cancelled');
    expect(i.value).toBe('old');
  });
  it('falls back to the built-in keyboard when Steam is not running (ok:false), throws, or there is no bridge', async () => {
    for (const bridge of [
      { steamTextInput: async () => ({ ok: false, text: null }) },
      { steamTextInput: async () => { throw new Error('boom'); } },
      null,
    ]) {
      const i = field();
      const pending = enterTextWithController(i, bridge);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      key('Cancel').click(); // the keyboard is up; the player cancels
      expect(await pending).toBe('cancelled');
      i.remove();
    }
  });
  it('the fallback keyboard types into the field', async () => {
    const i = field();
    const pending = enterTextWithController(i, null);
    key('Delete').click(); key('Delete').click(); key('Delete').click();
    key('g').click(); key('o').click();
    key('Done').click();
    expect(await pending).toBe('keyboard');
    expect(i.value).toBe('go');
  });
});

describe('controller glyphs and input mode', () => {
  it('input mode starts on keyboard/mouse and notifies subscribers once per change', () => {
    const seen: string[] = [];
    const off = subscribeInputMode((m) => seen.push(m));
    expect(getInputMode()).toBe('kbm');
    setInputMode('gamepad'); setInputMode('gamepad'); setInputMode('kbm');
    expect(seen).toEqual(['gamepad', 'kbm']);
    off();
  });
  it('the strip is ABSENT under keyboard/mouse and shown under a controller', () => {
    const h = mountControllerHints(document);
    const bar = () => document.querySelector('[data-controller-hints]') as HTMLElement;
    h.update('kbm', 'browse');
    expect(bar().style.display).toBe('none');
    h.update('gamepad', 'browse');
    expect(bar().style.display).toBe('flex');
    expect(Array.from(bar().querySelectorAll('[data-glyph]')).map((g) => g.getAttribute('data-glyph'))).toEqual(['DPAD', 'A', 'B', 'Y', 'STICK']);
    h.update('gamepad', 'keyboard');
    expect(Array.from(bar().querySelectorAll('[data-glyph]')).map((g) => g.getAttribute('data-glyph'))).toContain('MENU');
    h.destroy();
    expect(document.querySelector('[data-controller-hints]')).toBeNull();
  });
  it('NO keyboard or mouse prompts anywhere in the controller hints (Valve: no non-controller glyphs under a pad)', () => {
    const everything = [...hintsFor('browse'), ...hintsFor('keyboard')].map((h) => `${h.glyph} ${h.label}`).join(' ');
    expect(everything).not.toMatch(/mouse|click|enter key|\besc\b|ctrl|alt|tap|swipe|keyboard shortcut/i);
  });
  it('hint text is 12px or larger; the face glyphs are the A/B/X/Y every Deck, Steam Controller and Xbox pad shares', () => {
    const h = mountControllerHints(document);
    h.update('gamepad', 'browse');
    const bar = document.querySelector('[data-controller-hints]') as HTMLElement;
    expect(bar.style.fontSize).toBe('14px');
    // …and no font in either surface is below Valve's 12px recommendation (9px is the hard floor).
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('[data-controller-hints], [data-controller-hints] *'))
      .map((n) => parseFloat(n.style.fontSize)).filter((n) => Number.isFinite(n));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    const faces = Array.from(bar.querySelectorAll('[data-glyph]')).map((g) => g.getAttribute('data-glyph')).filter((g) => ['A', 'B', 'X', 'Y'].includes(g!));
    expect(faces).toEqual(['A', 'B', 'Y']);
    h.destroy();
  });
});
