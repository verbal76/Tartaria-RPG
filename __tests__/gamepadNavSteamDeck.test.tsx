/**
 * @jest-environment jsdom
 */
/**
 * The real GamepadNav component, driven by a fake controller: the glue between the pad, the highlight, the
 * text-entry route, input mode and the glyph strip. (Pure pieces are covered in gamepadTextEntry.test.ts.)
 */
import React from 'react';
import { GamepadNav } from '../app/components/GamepadNav.web';
import { resetInputModeForTest, getInputMode, isHumanInput } from '../app/components/gamepad/inputMode';
import { activeOnScreenKeyboard } from '../app/components/gamepad/onScreenKeyboard';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as { act(cb: () => void): void; create(el: React.ReactElement): { unmount(): void } };

type Pad = { buttons: Array<{ pressed: boolean }>; axes: number[] };
const newPad = (): Pad => ({ buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] });
let pad: Pad;
let rafCb: ((t: number) => void) | null = null;
let now = 0;

// jsdom has no layout: give every element a box from its data-box="x,y,w,h".
const origRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    const raw = (this as HTMLElement).getAttribute?.('data-box');
    if (!raw) return origRect.call(this);
    const [x, y, w, h] = raw.split(',').map(Number) as [number, number, number, number];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() { return {}; } } as DOMRect;
  };
});
afterAll(() => { Element.prototype.getBoundingClientRect = origRect; });

beforeEach(() => {
  document.body.innerHTML = '';
  resetInputModeForTest();
  pad = newPad();
  now = 0;
  rafCb = null;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  window.requestAnimationFrame = ((cb: (t: number) => void) => { rafCb = cb; return 1; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { rafCb = null; }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  delete (window as unknown as { tartariaDesktop?: unknown }).tartariaDesktop;
});

const frame = (ms = 130) => { now += ms; const cb = rafCb; rafCb = null; renderer.act(() => { cb?.(now); }); };
const press = (b: number) => { pad.buttons[b]!.pressed = true; frame(); pad.buttons[b]!.pressed = false; frame(); };
const mount = () => {
  let t!: ReturnType<typeof renderer.create>;
  renderer.act(() => { t = renderer.create(<GamepadNav />); }); // act flushes the component's effects
  return t;
};
const unmount = (t: { unmount(): void }) => { renderer.act(() => { t.unmount(); }); };
const add = (html: string, box: string): HTMLElement => {
  const d = document.createElement('div');
  d.innerHTML = html;
  const el = d.firstElementChild as HTMLElement;
  el.setAttribute('data-box', box);
  document.body.appendChild(el);
  return el;
};

describe('GamepadNav on the Steam Deck build', () => {
  it('a pad press switches to controller mode: cursor hidden, glyph strip shown; a real mouse move switches back', () => {
    const t = mount();
    add('<button>Go</button>', '10,10,100,40');
    expect(getInputMode()).toBe('kbm');
    expect((document.querySelector('[data-controller-hints]') as HTMLElement).style.display).toBe('none');
    press(13); // D-pad down
    expect(getInputMode()).toBe('gamepad');
    expect(document.body.classList.contains('gp-mode')).toBe(true);
    expect((document.querySelector('[data-controller-hints]') as HTMLElement).style.display).toBe('flex');
    // Our own synthetic events (B sends an Escape) are NOT a person at a keyboard: the mode must hold.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(getInputMode()).toBe('gamepad');
    // …and what counts as a person is exactly a trusted event.
    expect(isHumanInput({ isTrusted: true })).toBe(true);
    expect(isHumanInput({ isTrusted: false })).toBe(false);
    expect(isHumanInput(undefined)).toBe(false);
    unmount(t);
  });

  it('D-pad moves spatially between buttons and A activates the highlighted one', () => {
    const t = mount();
    const a = add('<button id="a">One</button>', '10,10,100,40');
    const b = add('<button id="b">Two</button>', '10,100,100,40');
    let clicked = '';
    a.addEventListener('click', () => { clicked = 'a'; });
    b.addEventListener('click', () => { clicked = 'b'; });
    // The first frame's layer sync highlights the first control (a); the same frame's Down press then moves
    // to the one below it (b).
    press(13);
    expect(b.classList.contains('gp-focus')).toBe(true);
    expect(a.classList.contains('gp-focus')).toBe(false);
    press(0);                        // A
    expect(clicked).toBe('b');
    press(12);                       // up → back to a
    expect(a.classList.contains('gp-focus')).toBe(true);
    unmount(t);
  });

  it('A on a text field opens the built-in keyboard when Steam is not available, and Done writes the text', async () => {
    const t = mount();
    const input = add('<input type="text" placeholder="Type a command" />', '10,700,600,40') as HTMLInputElement;
    press(13);                       // highlight the field
    press(0);                        // A → text entry
    await Promise.resolve(); await Promise.resolve();
    expect(activeOnScreenKeyboard()).not.toBeNull();
    // While the keyboard is open the hints switch to the keyboard set.
    frame();
    expect(document.querySelector('[data-controller-hints]')!.textContent).toContain('Done');
    const key = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-osk] button')).find((x) => x.textContent === label)!;
    key('n').click();
    pad.buttons[9]!.pressed = true; frame(); pad.buttons[9]!.pressed = false; frame(); // Menu = Done
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(input.value).toBe('n');
    expect(activeOnScreenKeyboard()).toBeNull();
    unmount(t);
  });

  it("A on a text field uses Steam's keyboard when the desktop bridge opens it (no built-in keyboard shown)", async () => {
    const calls: unknown[] = [];
    (window as unknown as { tartariaDesktop: unknown }).tartariaDesktop = {
      steamTextInput: async (o: unknown) => { calls.push(o); return { ok: true, text: 'look' }; },
    };
    const t = mount();
    const input = add('<input type="text" aria-label="Command" />', '10,700,600,40') as HTMLInputElement;
    press(13); press(0);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(calls.length).toBe(1);
    expect(input.value).toBe('look');
    expect(activeOnScreenKeyboard()).toBeNull();
    unmount(t);
  });

  it('Y jumps straight to the lowest text field (the typed-command box) and opens text entry', async () => {
    (window as unknown as { tartariaDesktop: unknown }).tartariaDesktop = {
      steamTextInput: async () => ({ ok: true, text: 'rest' }),
    };
    const t = mount();
    add('<input type="text" aria-label="Name" />', '10,50,300,40');
    const cmd = add('<input type="text" aria-label="Command" />', '10,720,600,40') as HTMLInputElement;
    add('<button>Other</button>', '10,300,100,40');
    press(3);                        // Y
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(cmd.value).toBe('rest');
    unmount(t);
  });

  it('the right stick scrolls the feed and LB/RB page it', () => {
    const t = mount();
    const feed = add('<div style="overflow-y:auto"><button>x</button></div>', '0,0,600,400');
    Object.defineProperty(feed, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(feed, 'clientHeight', { configurable: true, value: 400 });
    feed.scrollTop = 0;
    press(13);                        // highlight the button inside the feed
    pad.axes[3] = 1; frame(); pad.axes[3] = 0; frame();
    expect(feed.scrollTop).toBeGreaterThan(0);
    const after = feed.scrollTop;
    press(5);                         // RB = page down
    expect(feed.scrollTop).toBeGreaterThan(after + 200);
    press(4);                         // LB = page up
    expect(feed.scrollTop).toBeLessThan(after + 400);
    unmount(t);
  });

  it('unmount removes the glyph strip, the cursor rule and any controller mode', () => {
    const t = mount();
    press(13);
    unmount(t);
    expect(document.querySelector('[data-controller-hints]')).toBeNull();
    expect(document.body.classList.contains('gp-mode')).toBe(false);
  });
});
