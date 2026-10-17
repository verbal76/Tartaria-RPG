// Built-in controller-only on-screen keyboard — the fallback half of Valve's Deck/Machine text-input rule
// ("have your own built-in entry that allows users to enter text … using only a controller"). Used when
// Steam's own keyboard is not available (outside Steam, or a browser). Plain DOM so GamepadNav's existing
// spatial D-pad navigation and popup focus capture drive it with no special wiring: it sits on the
// highest stacking layer, so focus jumps into it and A presses a key.
//
// English (the game's language): letters, digits and the punctuation a typed command needs.

export interface OskOptions {
  initial?: string;
  maxLength?: number;
  label?: string;
  multiline?: boolean;
  password?: boolean;
}

export interface OskHandle {
  /** Resolves with the typed text on Done, or null on Cancel. */
  result: Promise<string | null>;
  isOpen(): boolean;
  /** A controller button pressed while the keyboard is open. Returns true if it was consumed. */
  pressButton(index: number): boolean;
  close(value: string | null): void;
}

const ROWS_LOWER: readonly string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
];
const SYMBOL_SHIFT: Record<string, string> = {
  '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '&', '7': '*', '8': '(', '9': ')', '0': '-',
  "'": '"', ',': ';', '.': ':', '?': '/',
};

// Standard-gamepad buttons the keyboard claims while open (A/B/D-pad are GamepadNav's own).
export const OSK_BUTTON_X = 2;
export const OSK_BUTTON_Y = 3;
export const OSK_BUTTON_MENU = 9;

let active: OskHandle | null = null;
export function activeOnScreenKeyboard(): OskHandle | null { return active && active.isOpen() ? active : null; }

export function openOnScreenKeyboard(doc: Document, opts: OskOptions = {}): OskHandle {
  if (active && active.isOpen()) active.close(null);
  const max = opts.maxLength && opts.maxLength > 0 ? opts.maxLength : 500;
  let text = (opts.initial ?? '').slice(0, max);
  let shift = false;
  let open = true;
  let resolve!: (v: string | null) => void;
  const result = new Promise<string | null>((r) => { resolve = r; });

  const overlay = doc.createElement('div');
  overlay.setAttribute('data-osk', '1');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', opts.label || 'On-screen keyboard');
  // Highest layer in the document, so GamepadNav's popup focus capture lands inside it.
  overlay.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483000', 'padding:12px 16px 52px',
    'background:rgba(10,9,8,0.97)', 'border-top:2px solid #c9a86a', 'color:#e8dcc0',
    'font-size:20px', 'font-weight:600', 'line-height:1.2', 'font-family:system-ui,sans-serif', 'display:flex', 'flex-direction:column', 'gap:8px',
  ].join(';');

  const title = doc.createElement('div');
  title.textContent = opts.label || 'Enter text';
  title.style.cssText = 'font-size:14px;color:#c9a86a;letter-spacing:0.5px';
  const preview = doc.createElement('div');
  preview.setAttribute('data-osk-preview', '1');
  preview.style.cssText = 'min-height:34px;padding:6px 10px;border:1px solid #c9a86a;border-radius:6px;background:#15120f;font-size:20px;word-break:break-word';
  overlay.appendChild(title);
  overlay.appendChild(preview);

  const keyTarget: Window | null = doc.defaultView;
  const keyButtons: HTMLButtonElement[] = [];
  const refresh = (): void => {
    preview.textContent = opts.password ? '•'.repeat(text.length) : text;
    if (!preview.textContent) preview.textContent = ' ';
    for (const b of keyButtons) {
      const base = b.getAttribute('data-base');
      if (base) b.textContent = shift ? (SYMBOL_SHIFT[base] ?? base.toUpperCase()) : base;
    }
  };

  const type = (ch: string): void => {
    if (text.length >= max) return;
    text += ch;
    shift = false;
    refresh();
  };
  const backspace = (): void => { text = text.slice(0, -1); refresh(); };
  const close = (value: string | null): void => {
    if (!open) return;
    open = false;
    active = null;
    keyTarget?.removeEventListener('keydown', onKey as EventListener, true);
    try { overlay.remove(); } catch { /* ignore */ }
    resolve(value);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.stopPropagation(); close(null); }
  };

  const mkButton = (label: string, onPress: () => void, wide = false): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = `min-width:${wide ? 120 : 56}px;height:50px;padding:0 10px;border-radius:8px;border:1px solid #6b5a36;background:#1d1812;color:#e8dcc0;font-size:20px;font-weight:600;font-family:system-ui,sans-serif;cursor:pointer`;
    b.addEventListener('click', (ev) => { ev.preventDefault(); onPress(); });
    return b;
  };

  for (const row of ROWS_LOWER) {
    const r = doc.createElement('div');
    r.style.cssText = 'display:flex;gap:6px;justify-content:center';
    for (const ch of row) {
      const b = mkButton(ch, () => type(shift ? (SYMBOL_SHIFT[ch] ?? ch.toUpperCase()) : ch));
      b.setAttribute('data-base', ch);
      keyButtons.push(b);
      r.appendChild(b);
    }
    overlay.appendChild(r);
  }
  const bottom = doc.createElement('div');
  bottom.style.cssText = 'display:flex;gap:6px;justify-content:center';
  bottom.appendChild(mkButton('Shift', () => { shift = !shift; refresh(); }, true));
  bottom.appendChild(mkButton('Space', () => type(' '), true));
  bottom.appendChild(mkButton('Delete', backspace, true));
  bottom.appendChild(mkButton('Done', () => close(text), true));
  bottom.appendChild(mkButton('Cancel', () => close(null), true));
  overlay.appendChild(bottom);

  doc.body.appendChild(overlay);
  // On the WINDOW: GamepadNav's B button dispatches its Escape at window, which never reaches `document`.
  keyTarget?.addEventListener('keydown', onKey as EventListener, true);
  refresh();

  const handle: OskHandle = {
    result,
    isOpen: () => open,
    close,
    pressButton(index: number): boolean {
      if (!open) return false;
      if (index === OSK_BUTTON_X) { backspace(); return true; }
      if (index === OSK_BUTTON_Y) { type(' '); return true; }
      if (index === OSK_BUTTON_MENU) { close(text); return true; }
      return false;
    },
  };
  active = handle;
  return handle;
}
