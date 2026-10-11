// Controller glyph strip for the desktop / Steam Deck build. Shown ONLY while the player is using a
// controller (Valve: glyphs must match the input in use; no keyboard/mouse prompts under a controller).
// Steam Deck, Steam Controller and Xbox pads share the A/B/X/Y face layout, so these glyphs are the right
// ones on all three. Plain DOM, mounted once by GamepadNav.web.tsx.
import type { InputMode } from './inputMode';

export type HintContext = 'browse' | 'keyboard';
export type GlyphName = 'A' | 'B' | 'X' | 'Y' | 'DPAD' | 'STICK' | 'LB' | 'RB' | 'MENU';
export interface Hint { glyph: GlyphName; label: string }

const FACE: ReadonlySet<GlyphName> = new Set<GlyphName>(['A', 'B', 'X', 'Y']);
const FACE_COLOUR: Record<string, string> = { A: '#5fae4e', B: '#d4574a', X: '#4a86d4', Y: '#d4b84a' };
const PILL_TEXT: Record<GlyphName, string> = {
  A: 'A', B: 'B', X: 'X', Y: 'Y', DPAD: 'D-Pad', STICK: 'R-Stick', LB: 'LB', RB: 'RB', MENU: 'Menu',
};

export function hintsFor(context: HintContext): Hint[] {
  if (context === 'keyboard') {
    return [
      { glyph: 'DPAD', label: 'Move' }, { glyph: 'A', label: 'Press key' }, { glyph: 'X', label: 'Delete' },
      { glyph: 'Y', label: 'Space' }, { glyph: 'MENU', label: 'Done' }, { glyph: 'B', label: 'Cancel' },
    ];
  }
  return [
    { glyph: 'DPAD', label: 'Move' }, { glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Back' },
    { glyph: 'Y', label: 'Type' }, { glyph: 'STICK', label: 'Scroll' },
  ];
}

export function isFaceGlyph(g: GlyphName): boolean { return FACE.has(g); }

export interface HintsHandle {
  update(mode: InputMode, context: HintContext): void;
  destroy(): void;
}

export function mountControllerHints(doc: Document): HintsHandle {
  const bar = doc.createElement('div');
  bar.setAttribute('data-controller-hints', '1');
  bar.setAttribute('role', 'note');
  bar.setAttribute('aria-label', 'Controller hints');
  // 14px type, comfortably above Valve's 9px floor and near its 12px recommendation.
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:8px', 'transform:translateX(-50%)', 'z-index:2147483600',
    'display:none', 'gap:18px', 'align-items:center', 'padding:6px 16px', 'border-radius:999px',
    'background:rgba(10,9,8,0.88)', 'border:1px solid rgba(201,168,106,0.55)', 'color:#e8dcc0',
    'font-size:14px', 'font-weight:600', 'line-height:1.2', 'font-family:system-ui,sans-serif', 'pointer-events:none', 'white-space:nowrap',
  ].join(';');
  doc.body.appendChild(bar);

  const render = (context: HintContext): void => {
    bar.textContent = '';
    for (const h of hintsFor(context)) {
      const item = doc.createElement('span');
      item.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
      const g = doc.createElement('span');
      g.setAttribute('data-glyph', h.glyph);
      g.textContent = PILL_TEXT[h.glyph];
      if (FACE.has(h.glyph)) {
        g.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${FACE_COLOUR[h.glyph]};color:#0a0908;font-weight:800`;
      } else {
        g.style.cssText = 'display:inline-block;padding:1px 7px;border-radius:6px;border:1px solid #c9a86a;color:#c9a86a;font-size:12px';
      }
      const t = doc.createElement('span');
      t.textContent = h.label;
      item.appendChild(g);
      item.appendChild(t);
      bar.appendChild(item);
    }
  };

  return {
    update(mode, context) {
      // Mouse/keyboard glyphs are never drawn at all; the strip is simply absent unless a pad is in use.
      if (mode !== 'gamepad') { bar.style.display = 'none'; return; }
      render(context);
      bar.style.display = 'flex';
    },
    destroy() { try { bar.remove(); } catch { /* ignore */ } },
  };
}
