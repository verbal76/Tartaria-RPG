// GamepadNav (web/desktop) — controller navigation for the PC / Steam Deck build.
// Tartaria is button-driven, so a controller maps cleanly.
//
// v2 (this pass):
//  • DIRECTIONAL (spatial) movement — D-pad/stick go the way you press: Down drops
//    to the nearest control BELOW (next row), Right to the nearest on the right,
//    etc. No more tab-shuffling 30× to change rows.
//  • POPUP FOCUS CAPTURE — when a popup/modal opens it raises the stacking layer;
//    focus jumps INTO it immediately, and snaps back to the screen when it closes.
//  • A activates the highlighted control; a text field just focuses (physical
//    keyboard types — no virtual keyboard on PC). B blurs a field / sends Escape.
//
// Works at the DOM level (react-native-web renders buttons as focusable nodes), so
// no per-component wiring. Mounted once at the app root; renders nothing.
//
// NEXT: a Settings toggle for an on-screen keyboard (Auto/Always/Never) for
// controller-only setups, and an explicit Back-button target for B.

import { useEffect } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])';

export function GamepadNav(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.getGamepads) {
      return;
    }

    const style = document.createElement('style');
    style.textContent =
      '.gp-focus{outline:3px solid #c9a86a !important;outline-offset:2px;border-radius:6px;' +
      'box-shadow:0 0 10px rgba(201,168,106,0.7) !important;}';
    document.head.appendChild(style);

    let highlighted: HTMLElement | null = null;
    let lastTopLayer = -1;

    const isVisible = (el: HTMLElement): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
      const s = window.getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none' && s.opacity !== '0';
    };

    // Highest z-index among an element's positioned ancestors → its "stacking
    // layer". A popup/modal sits on a higher layer than the screen behind it.
    const layerOf = (el: HTMLElement): number => {
      let z = 0;
      let n: HTMLElement | null = el;
      while (n && n !== document.body) {
        const s = window.getComputedStyle(n);
        if (s.position !== 'static') {
          const zi = parseInt(s.zIndex, 10);
          if (!Number.isNaN(zi)) z = Math.max(z, zi);
        }
        n = n.parentElement;
      }
      return z;
    };

    // Visible focusables, reduced to leaf controls (drop wrappers that merely
    // contain another focusable).
    const collectAll = (): HTMLElement[] => {
      const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
      return all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
    };

    // The focusables on the TOP-MOST stacking layer (so a popup's controls win).
    const topLayer = (): { list: HTMLElement[]; layer: number } => {
      const all = collectAll();
      const layers = new Map<HTMLElement, number>();
      let max = 0;
      for (const el of all) {
        const l = layerOf(el);
        layers.set(el, l);
        if (l > max) max = l;
      }
      return { list: all.filter((el) => (layers.get(el) ?? 0) === max), layer: max };
    };

    const center = (el: HTMLElement): { x: number; y: number } => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    const readingOrder = (list: HTMLElement[]): HTMLElement[] =>
      [...list].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        if (Math.abs(ra.top - rb.top) > 12) return ra.top - rb.top;
        return ra.left - rb.left;
      });

    type Dir = 'up' | 'down' | 'left' | 'right';
    const pickDirectional = (cur: HTMLElement, list: HTMLElement[], dir: Dir): HTMLElement | null => {
      const c = center(cur);
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const el of list) {
        if (el === cur) continue;
        const p = center(el);
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        let ok = false;
        let primary = 0;
        let cross = 0;
        if (dir === 'down') { ok = dy > 4; primary = dy; cross = Math.abs(dx); }
        else if (dir === 'up') { ok = dy < -4; primary = -dy; cross = Math.abs(dx); }
        else if (dir === 'right') { ok = dx > 4; primary = dx; cross = Math.abs(dy); }
        else { ok = dx < -4; primary = -dx; cross = Math.abs(dy); }
        if (!ok) continue;
        // Prefer the closest in the travel axis; penalise cross-axis drift so a
        // press of Down lands on the element directly below, not a far diagonal.
        const score = primary + cross * 2;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      return best;
    };

    const setHighlight = (el: HTMLElement | null): void => {
      if (highlighted && highlighted !== el) highlighted.classList.remove('gp-focus');
      highlighted = el;
      if (el) {
        el.classList.add('gp-focus');
        try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ }
        try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    };

    const move = (dir: Dir): void => {
      const { list, layer } = topLayer();
      lastTopLayer = layer;
      if (!list.length) return;
      if (!highlighted || !list.includes(highlighted)) {
        setHighlight(readingOrder(list)[0]!);
        return;
      }
      const next = pickDirectional(highlighted, list, dir);
      if (next) setHighlight(next); // no-op if nothing lies that way (edge of screen)
    };

    // Popup open/close changes the top stacking layer → jump focus into the new
    // top layer (and back to the screen when the popup closes).
    const syncLayer = (): void => {
      const { list, layer } = topLayer();
      const layerChanged = layer !== lastTopLayer;
      const lostHighlight = highlighted != null && !document.contains(highlighted);
      if ((layerChanged || lostHighlight) && list.length) {
        lastTopLayer = layer;
        setHighlight(readingOrder(list)[0]!);
      } else {
        lastTopLayer = layer;
      }
    };

    const activate = (): void => {
      if (!highlighted || !document.contains(highlighted)) { syncLayer(); return; }
      const tag = highlighted.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        try { highlighted.focus(); } catch { /* ignore */ }
        return;
      }
      try { highlighted.click(); } catch { /* ignore */ }
    };

    const back = (): void => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        active.blur();
        return;
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    };

    const prev: Record<number, boolean> = {};
    let stickCd = 0;
    let lastSync = 0;
    let raf = 0;

    const tick = (t: number): void => {
      if (t - lastSync > 120) { lastSync = t; syncLayer(); } // detect popups ~8×/s
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(pads).find((p): p is Gamepad => !!p);
      if (gp) {
        const down = (b: number): boolean => !!gp.buttons[b]?.pressed;
        const edge = (b: number): boolean => { const now = down(b); const was = prev[b]; prev[b] = now; return now && !was; };
        // Standard gamepad: 0=A, 1=B, 12=up, 13=down, 14=left, 15=right.
        if (edge(12)) move('up');
        if (edge(13)) move('down');
        if (edge(14)) move('left');
        if (edge(15)) move('right');
        if (edge(0)) activate();
        if (edge(1)) back();
        // Left stick, with a step cooldown so it doesn't fly across the screen.
        const ax = gp.axes[0] ?? 0;
        const ay = gp.axes[1] ?? 0;
        if (stickCd > 0) stickCd -= 1;
        else if (Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6) {
          if (Math.abs(ay) >= Math.abs(ax)) move(ay > 0 ? 'down' : 'up');
          else move(ax > 0 ? 'right' : 'left');
          stickCd = 12;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      setHighlight(null);
      try { style.remove(); } catch { /* ignore */ }
    };
  }, []);

  return null;
}
