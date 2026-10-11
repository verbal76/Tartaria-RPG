// Text entry for controller players. Valve's Deck/Machine rule: a game that needs text (a character name,
// a typed command) must open Steam's on-screen keyboard (Steamworks text-entry API) or ship its own
// controller-only entry. We do both, in order: Steam's dialog when the desktop bridge reports it opened,
// otherwise the built-in on-screen keyboard — so it works under Steam, outside Steam, and in a browser.
import { openOnScreenKeyboard } from './onScreenKeyboard';

export interface SteamTextResult { ok: boolean; text: string | null }
export interface TextBridge {
  steamTextInput?: (opts: {
    description: string; maxCharacters: number; existingText: string; multiline: boolean; password: boolean;
  }) => Promise<SteamTextResult>;
}

/** Set a (React-controlled) input's value so React notices: the native setter, then a bubbling input event. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, text); else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Inputs that take typed text (not checkboxes, ranges, buttons…). */
export function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag !== 'input') return false;
  const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
  return ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].includes(t);
}

export type TextEntryOutcome = 'steam' | 'keyboard' | 'cancelled';

export async function enterTextWithController(
  el: HTMLInputElement | HTMLTextAreaElement,
  bridge: TextBridge | null | undefined,
): Promise<TextEntryOutcome> {
  const multiline = el.tagName.toLowerCase() === 'textarea';
  const password = !multiline && (el as HTMLInputElement).type === 'password';
  const max = el.maxLength > 0 ? el.maxLength : 500;
  const description = (el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || 'Enter text').slice(0, 64);

  if (bridge && typeof bridge.steamTextInput === 'function') {
    try {
      const r = await bridge.steamTextInput({ description, maxCharacters: max, existingText: el.value, multiline, password });
      if (r && r.ok) {
        if (r.text === null) return 'cancelled';
        setNativeValue(el, r.text);
        return 'steam';
      }
    } catch { /* fall through to the built-in keyboard */ }
  }

  const text = await openOnScreenKeyboard(el.ownerDocument, { initial: el.value, maxLength: max, label: description, multiline, password }).result;
  if (text === null) return 'cancelled';
  setNativeValue(el, text);
  return 'keyboard';
}
