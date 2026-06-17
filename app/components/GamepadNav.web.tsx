// GamepadNav (web/desktop) — first-pass controller navigation for the PC / Steam
// Deck build. Tartaria is button-driven, so a controller maps cleanly: the D-pad
// (or left stick) moves a highlight LINEARLY between on-screen buttons; A activates
// the highlighted one; B goes back. A focused text field is just .focus()'d so the
// PHYSICAL keyboard types — no virtual keyboard popup on a PC. Steam Deck presents
// its controls as a standard gamepad, so this covers it too.
//
// It works at the DOM level (react-native-web renders buttons as focusable DOM
// nodes), so it needs no per-component wiring. Mounted once at the app root;
// renders nothing.
//
// NEXT passes: spatial (up/down/left/right by position) nav, an explicit Back
// button target for B, and a Settings toggle for an on-screen keyboard
// (Auto / Always / Never) for controller-only setups.

import { useEffect } from 'react';

// react-native-web makes pressables keyboard-focusable (tabindex) and many carry
// role="button"; inputs/links round it out. tabindex=-1 is explicitly skipped.
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
      'box-shadow:0 0 10px rgba(201,168,106,0.7) !important;transition:outline-color 80ms;}';
    document.head.appendChild(style);

    let highlighted: HTMLElement | null = null;

    const isVisible = (el: HTMLElement): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
      const s = window.getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none' && s.opacity !== '0';
    };

    const collect = (): HTMLElement[] => {
      const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const out: HTMLElement[] = [];
      for (const el of all) {
        if (!isVisible(el)) continue;
        // Skip ancestors that merely WRAP another focusable (keeps the list to leaf controls).
        if (out.some((o) => el.contains(o) || o.contains(el))) {
          // prefer the inner-most: if el is inside an already-added one, replace it
          const idx = out.findIndex((o) => o.contains(el));
          if (idx >= 0) { out[idx] = el; continue; }
          if (out.some((o) => el.contains(o))) continue;
        }
        out.push(el);
      }
      // Linear order = top-to-bottom, then left-to-right (reading order).
      out.sort((a, b) => {
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        const dy = ra.top - rb.top;
        if (Math.abs(dy) > 12) return dy;
        return ra.left - rb.left;
      });
      return out;
    };

    const setHighlight = (el: HTMLElement | null): void => {
      if (highlighted && highlighted !== el) highlighted.classList.remove('gp-focus');
      highlighted = el;
      if (el) {
        el.classList.add('gp-focus');
        try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ }
      }
    };

    const move = (dir: 1 | -1): void => {
      const list = collect();
      if (!list.length) return;
      let i: number;
      if (highlighted && list.includes(highlighted)) {
        i = (list.indexOf(highlighted) + dir + list.length) % list.length;
      } else {
        i = dir === 1 ? 0 : list.length - 1;
      }
      const el = list[i]!;
      setHighlight(el);
      try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    };

    const activate = (): void => {
      if (!highlighted || !document.contains(highlighted)) { move(1); return; }
      const tag = highlighted.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        // Focus the field; the physical keyboard takes it from here (no virtual kbd).
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
      // First pass: surface Escape so any modal listening for it can close.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    };

    const prev: Record<number, boolean> = {};
    let stickCooldown = 0;
    let raf = 0;

    const tick = (): void => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(pads).find((p): p is Gamepad => !!p);
      if (gp) {
        const down = (b: number): boolean => !!gp.buttons[b]?.pressed;
        const edge = (b: number): boolean => { const now = down(b); const was = prev[b]; prev[b] = now; return now && !was; };
        // Standard gamepad mapping: 0=A, 1=B, 12=up, 13=down, 14=left, 15=right.
        if (edge(13) || edge(15)) move(1);
        if (edge(12) || edge(14)) move(-1);
        if (edge(0)) activate();
        if (edge(1)) back();
        // Left stick vertical, with a repeat cooldown so it steps, not flies.
        const ly = gp.axes[1] ?? 0;
        if (stickCooldown > 0) stickCooldown -= 1;
        else if (Math.abs(ly) > 0.55) { move(ly > 0 ? 1 : -1); stickCooldown = 14; }
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
