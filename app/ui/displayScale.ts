// ⚠⚠ OTA-1250 — THE GAME STOPS BEING A PHONE ON A MONITOR.
//
// Owner, looking at the PC build: *"on a PC it's a slice down the middle or is
// it resolution aware, and do we have a resolution picker?"* It was a slice,
// and there was no picker. Two separate faults, fixed together here:
//
//  1. THE COLUMN WAS PHONE-WIDTH EVERYWHERE. Five screens hard-capped at
//     `maxWidth: 600` — correct on a phone (a no-op; phones are narrower than
//     that) and a mobile assumption nobody revisited when the PC port landed.
//     On a 1920-wide monitor that is a 600px ribbon of game with two-thirds of
//     the window empty. CONTENT_MAX_WIDTH below is now platform-aware, and it
//     is ONE constant so the five screens can never drift apart again.
//
//  2. THERE WAS NO SCALE CONTROL. Deliberately NOT a "resolution picker" —
//     inside a maximized Electron window the OS already owns the resolution,
//     and a dropdown that fights it is a mobile-porting anti-pattern. What a
//     desktop player actually wants is UI SCALE, which is what this is.
//
// ⚠ MOBILE IS UNTOUCHED, BY CONSTRUCTION. `Platform.OS` is 'ios'/'android' on
// the HAL line, so the width resolves to the same 600 it always was and the
// scale setter is a no-op without the desktop bridge. This ships through the
// normal HAL → golem → steam flow rather than living only on steam, so the
// branches cannot diverge — but only the PC build can observe any of it.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠ OTA-1252 — the two pure layout numbers moved to ./layoutConstants, and are
// RE-EXPORTED here so the five screens keep the import OTA-1250 gave them.
// Reason for the move: this module needs AsyncStorage for the scale setting, so
// a component that wanted nothing but a width paid for a storage dependency —
// which broke `healthCardTint` on a native-module require for a StatsPanel that
// stores nothing. Layout constants must be importable from a pure render path.
export { CONTENT_MAX_WIDTH, STAT_ROW_MAX_WIDTH } from './layoutConstants';

export type UiScale = 'small' | 'medium' | 'large';
export const UI_SCALES: readonly UiScale[] = ['small', 'medium', 'large'] as const;

/** Electron zoom factors. 1.0 is the browser default; the steps are deliberately
 *  gentle — a 4K monitor wants 'large', a 1080p laptop wants 'small' or
 *  'medium', and nothing here should reflow the layout into a new shape. */
export const ZOOM_FOR_SCALE: Record<UiScale, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.25,
};

const SCALE_KEY = 'tartaria.ui.scale.v1';
let scaleCache: UiScale | null = null;
const listeners = new Set<(v: UiScale) => void>();

function isUiScale(v: string | null | undefined): v is UiScale {
  return v === 'small' || v === 'medium' || v === 'large';
}

/** The desktop bridge, feature-detected. Undefined on mobile and in a plain
 *  browser, so every caller degrades to "the setting is remembered but nothing
 *  zooms", which is the honest behaviour off-desktop. */
function desktopBridge(): { setZoom?: (z: number) => void } | null {
  try {
    const w = globalThis as unknown as { tartariaDesktop?: { isDesktop?: boolean; setZoom?: (z: number) => void } };
    return w.tartariaDesktop?.isDesktop ? w.tartariaDesktop : null;
  } catch {
    return null;
  }
}

/** True when a scale control can actually DO anything — the Settings row hides
 *  itself otherwise rather than offering a switch that moves nothing. */
export function displayScaleSupported(): boolean {
  return !!desktopBridge()?.setZoom;
}

export function applyUiScale(scale: UiScale): void {
  const bridge = desktopBridge();
  try { bridge?.setZoom?.(ZOOM_FOR_SCALE[scale]); } catch { /* never break the UI over a zoom */ }
}

export async function loadUiScale(): Promise<UiScale> {
  if (scaleCache !== null) return scaleCache;
  try {
    const raw = await AsyncStorage.getItem(SCALE_KEY);
    scaleCache = isUiScale(raw) ? raw : 'medium';
  } catch {
    scaleCache = 'medium';
  }
  // Re-apply on boot: Electron does not remember the zoom across launches.
  applyUiScale(scaleCache);
  for (const l of listeners) { try { l(scaleCache); } catch { /* ignore */ } }
  return scaleCache;
}

export function getUiScale(): UiScale {
  return scaleCache ?? 'medium';
}

export async function setUiScale(v: UiScale): Promise<void> {
  scaleCache = v;
  applyUiScale(v);
  for (const l of listeners) { try { l(v); } catch { /* ignore */ } }
  try { await AsyncStorage.setItem(SCALE_KEY, v); } catch { /* best-effort */ }
}

export function onUiScaleChange(fn: (v: UiScale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reactive hook for the Settings control. */
export function useUiScale(): UiScale {
  const [v, setV] = useState<UiScale>(getUiScale());
  useEffect(() => {
    void loadUiScale().then(setV);
    return onUiScaleChange(setV);
  }, []);
  return v;
}
