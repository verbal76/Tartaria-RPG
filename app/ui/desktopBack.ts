// ⚠⚠ OTA-1229 — RIGHT-CLICK IS BACK ON A PC, AND THE GAME HAD NO "BACK" AT ALL.
//
// Owner, typed into the game while testing the desktop build: *"right click on
// the mouse should be the back button."* He is describing the desktop
// convention, and the request exposed something larger: this game has never had
// a global back. On a phone it did not need one — Android's hardware back is
// wired per-Modal through `onRequestClose`, and iOS has gestures. On a PC there
// is no hardware back, no gesture, and (until now) no Escape either: a player
// who opened TAKE had exactly one way out, which was finding and hitting the
// small CANCEL.
//
// ⚠ SO THIS IS A STACK, NOT A HANDLER. "Back" is only ever meaningful relative
// to what is on top: a modal closes, then a sub-screen returns to the game, and
// at the game itself back does NOTHING (a right-click that quits to the title
// screen mid-fight would be the worst possible reading of the convention).
// Registrants push in mount order and the LAST one registered wins — the same
// LIFO rule every navigation stack uses, and the reason a modal opened on top of
// a sub-screen closes itself rather than dismissing the screen underneath it.
//
// ⚠ ESCAPE TOO, and that is not scope creep: on a desktop, Escape and the back
// gesture are the same intent, and a player who tries Escape first and gets
// nothing concludes the window is stuck. Both routes call the same stack.
//
// ⚠ MOBILE IS UNTOUCHED. `initDesktopBack()` returns immediately off web, and
// the hook's registration is inert without it — nothing here ever fires on a
// phone, where the existing per-Modal Android back path stays in charge.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

type BackHandler = () => boolean | void;

const stack: BackHandler[] = [];
let installed = false;

/** Register a back handler. Returns true from the handler to consume the
 *  event; return false/undefined to fall through to the one beneath it. */
export function pushBackHandler(fn: BackHandler): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Run the stack, top down, until something consumes the event. Returns
 *  whether anything did — the caller uses that to decide whether to suppress
 *  the platform's own default (the browser context menu). */
export function fireBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    const handler = stack[i];
    try {
      if (handler?.() === true) return true;
    } catch {
      /* a throwing handler must not strand the player — try the next one down */
    }
  }
  return false;
}

/** Test/diagnostic hook — how many handlers are currently registered. */
export function backHandlerCount(): number {
  return stack.length;
}

/** ⚠ Wire the desktop routes. Idempotent, and a no-op anywhere but web. */
export function initDesktopBack(): void {
  if (installed || Platform.OS !== 'web') return;
  const w = globalThis as unknown as {
    addEventListener?: (t: string, f: (e: Event) => void) => void;
  };
  if (typeof w.addEventListener !== 'function') return;
  installed = true;
  w.addEventListener('contextmenu', (e: Event) => {
    // ⚠ ALWAYS preventDefault, even when nothing handles it. The browser's own
    // context menu ("Reload", "Save image as…") is a web artifact leaking
    // through a game window; it is never the right answer inside the app.
    try { (e as Event & { preventDefault(): void }).preventDefault(); } catch { /* ignore */ }
    fireBack();
  });
  w.addEventListener('keydown', (e: Event) => {
    const key = (e as Event & { key?: string }).key;
    if (key !== 'Escape') return;
    // ⚠ Only swallow the key if something actually took it — otherwise leave
    // Escape alone for whatever the browser/Electron does with it.
    if (fireBack()) {
      try { (e as Event & { preventDefault(): void }).preventDefault(); } catch { /* ignore */ }
    }
  });
}

/** Register `fn` as the back action while `active` is true.
 *
 *  ⚠ THE REF IS LOAD-BEARING, NOT TIDINESS. Callers pass inline closures over
 *  live state (`takeOpen`, `currentScreen`), and those closures are rebuilt on
 *  every render. Registering the closure itself would force a choice between
 *  two broken options: re-register every render, which churns the stack order
 *  that LIFO depends on, or register once and read state frozen at first mount
 *  — a right-click that closes a popup the player shut ten minutes ago. The
 *  stack holds one stable identity per caller; the ref keeps what it calls
 *  current. */
export function useBackAction(active: boolean, fn: BackHandler): void {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => latest.current());
  }, [active]);
}
