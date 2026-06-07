// arb78 — player-tunable background ("make it their own"). Persisted, reactive
// (mirrors voiceSettings). Controls the AppShell's "aged artifact" background:
// the base color (hue / richness / brightness), the parchment-texture opacity,
// and the edge-vignette strength. AppShell subscribes via useDisplaySettings()
// so changes apply live behind the Settings screen.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DisplaySettings {
  bgHue: number;            // 0..360  — base color family (default warm umber ~24)
  bgSat: number;            // 0..1    — richness (0 = grey, 1 = saturated)
  bgLight: number;          // 0..1    — HSL lightness of the base (kept dark-ish)
  textureOpacity: number;   // 0..0.20 — parchment grain opacity
  vignetteStrength: number; // 0..1    — edge-shadow (vignette) opacity multiplier
}

// Defaults reproduce the shipped Clay Anvil look (~#241C17, 6% paper, full vignette).
const DEFAULTS: DisplaySettings = {
  bgHue: 24,
  bgSat: 0.22,
  bgLight: 0.115,
  textureOpacity: 0.06,
  vignetteStrength: 1.0,
};

const KEY = '@tartaria/displaySettings';
let cache: DisplaySettings | null = null;
const listeners = new Set<(s: DisplaySettings) => void>();

const clamp = (v: number, lo: number, hi: number, fallback: number): number =>
  !Number.isFinite(v) ? fallback : Math.max(lo, Math.min(hi, v));

export async function loadDisplaySettings(): Promise<DisplaySettings> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<DisplaySettings>;
      cache = {
        bgHue: typeof p.bgHue === 'number' ? clamp(p.bgHue, 0, 360, DEFAULTS.bgHue) : DEFAULTS.bgHue,
        bgSat: typeof p.bgSat === 'number' ? clamp(p.bgSat, 0, 1, DEFAULTS.bgSat) : DEFAULTS.bgSat,
        bgLight: typeof p.bgLight === 'number' ? clamp(p.bgLight, 0.02, 0.30, DEFAULTS.bgLight) : DEFAULTS.bgLight,
        textureOpacity: typeof p.textureOpacity === 'number' ? clamp(p.textureOpacity, 0, 0.20, DEFAULTS.textureOpacity) : DEFAULTS.textureOpacity,
        vignetteStrength: typeof p.vignetteStrength === 'number' ? clamp(p.vignetteStrength, 0, 1, DEFAULTS.vignetteStrength) : DEFAULTS.vignetteStrength,
      };
    } else {
      cache = { ...DEFAULTS };
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  // Notify any already-mounted subscriber (AppShell) so a player's saved
  // background applies once storage resolves, not just after the next change.
  for (const l of listeners) { try { l(cache); } catch { /* ignore */ } }
  return cache;
}

export function getDisplaySettings(): DisplaySettings {
  return cache ?? { ...DEFAULTS };
}

export async function setDisplaySettings(patch: Partial<DisplaySettings>): Promise<DisplaySettings> {
  const cur = cache ?? (await loadDisplaySettings());
  const next: DisplaySettings = {
    bgHue: patch.bgHue !== undefined ? clamp(patch.bgHue, 0, 360, cur.bgHue) : cur.bgHue,
    bgSat: patch.bgSat !== undefined ? clamp(patch.bgSat, 0, 1, cur.bgSat) : cur.bgSat,
    bgLight: patch.bgLight !== undefined ? clamp(patch.bgLight, 0.02, 0.30, cur.bgLight) : cur.bgLight,
    textureOpacity: patch.textureOpacity !== undefined ? clamp(patch.textureOpacity, 0, 0.20, cur.textureOpacity) : cur.textureOpacity,
    vignetteStrength: patch.vignetteStrength !== undefined ? clamp(patch.vignetteStrength, 0, 1, cur.vignetteStrength) : cur.vignetteStrength,
  };
  cache = next;
  try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  for (const l of listeners) { try { l(next); } catch { /* ignore */ } }
  return next;
}

export function resetDisplaySettings(): Promise<DisplaySettings> {
  return setDisplaySettings({ ...DEFAULTS });
}

export function onDisplaySettingsChange(fn: (s: DisplaySettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// HSL → #RRGGBB. h 0..360, s/l 0..1.
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** The computed base background color from the current settings. */
export function baseColorOf(s: DisplaySettings): string {
  return hslToHex(s.bgHue, s.bgSat, s.bgLight);
}

/** Reactive hook — re-renders the consumer whenever the player adjusts a slider. */
export function useDisplaySettings(): DisplaySettings {
  const [s, setS] = useState<DisplaySettings>(() => getDisplaySettings());
  useEffect(() => {
    setS(getDisplaySettings());
    return onDisplaySettingsChange(setS);
  }, []);
  return s;
}

// arb103 → shared. Perceived luminance of a #rrggbb color (0..1). Lifted out of
// InventoryScreen so any text that sits directly on the player's tuned
// background can pick a readable color the same way the inventory legend does.
export function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// The legend/secondary text tone that stays legible on ANY tuned background:
// dark ink on a light background, faded parchment on a dark one. Same pair the
// inventory legend shipped with (arb103), now the single source of truth.
export function readableMutedOf(s: DisplaySettings): string {
  return hexLuminance(baseColorOf(s)) > 0.5 ? '#241c14' : '#d8cba8';
}

/** Reactive hook — the auto-contrast muted/secondary text color for whatever
 *  the player has set their background to. Use for any text that renders
 *  directly on the tuned background (title screen, transparent screens). */
export function useReadableMuted(): string {
  const s = useDisplaySettings();
  return readableMutedOf(s);
}
