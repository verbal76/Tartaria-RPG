/**
 * The Hot Attic Games studio card — additive, black, contained, ~1.5 s, once per
 * launch, never stranding, and honest about the missing canonical asset.
 */
import React from 'react';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../app/components/SplashOverlay', () => ({
  SplashOverlay: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('react');
    return R.createElement(View, { testID: 'tartaria-splash' });
  },
}));

import { StudioSplash, LaunchSplashes, STUDIO_SPLASH_MS, resetStudioSplashForTest, studioSplashWillShow } from '../app/components/StudioSplash';
import { STUDIO_SPLASH_SOURCE } from '../app/ui/studioSplashArt';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void; root: { findAllByProps(p: Record<string, unknown>): Array<{ props: Record<string, unknown> }> } };
};
const mount = (el: React.ReactElement) => {
  let t!: ReturnType<typeof renderer.create>;
  renderer.act(() => { t = renderer.create(el); });
  return t;
};
const json = (t: { toJSON(): unknown }) => JSON.stringify(t.toJSON());
// Code only — the component's own comments say "silent" and "hydration" on purpose.
const code = (file: string) => readFileSync(join(__dirname, '..', 'app', 'components', file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const FAKE_ART = 1 as unknown as number; // a bundler asset id, as `require()` yields on device

beforeEach(() => { resetStudioSplashForTest(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('the asset — never fabricated', () => {
  const asset = join(__dirname, '..', 'branding', 'Hot_Attic_Games_Master_Logo.png');
  it('the card is live if and only if the canonical file is committed', () => {
    // Dropping the file in without wiring studioSplashArt.ts (or wiring it
    // without the file, which fails the whole Metro bundle) both fail here.
    expect(STUDIO_SPLASH_SOURCE !== null).toBe(existsSync(asset));
  });
  it('the leaf requires exactly the named path and nothing else', () => {
    const raw = readFileSync(join(__dirname, '..', 'app', 'ui', 'studioSplashArt.ts'), 'utf8');
    expect(raw).toContain("branding/Hot_Attic_Games_Master_Logo.png"); // documented in the leaf
    // Live code only: while the asset is absent there must be no require at all.
    const live = raw.replace(/\/\/.*$/gm, '');
    expect(live.match(/require\(/g)?.length ?? 0).toBe(existsSync(asset) ? 1 : 0);
  });
});

describe('while the asset is absent the launch is exactly today\'s', () => {
  it('StudioSplash renders nothing and LaunchSplashes shows only the Tartaria splash, immediately', () => {
    expect(studioSplashWillShow(null)).toBe(false);
    const t = mount(<LaunchSplashes />);
    expect(json(t)).toContain('tartaria-splash');
    expect(json(t)).not.toContain('studio-splash');
    renderer.act(() => t.unmount());
  });
});

describe('with the artwork present', () => {
  it('paints solid black, centred, `contain`, full-bleed card — no crop, stretch or tint', () => {
    const t = mount(<StudioSplash source={FAKE_ART} />);
    const s = json(t);
    expect(s).toContain('"backgroundColor":"#000000"');
    expect(s).toContain('"alignItems":"center"');
    expect(s).toContain('"justifyContent":"center"');
    expect(s).toContain('"resizeMode":"contain"');
    expect(s).not.toMatch(/"resizeMode":"(cover|stretch)"/);
    expect(s).not.toMatch(/tintColor|opacity|blur/i);
    renderer.act(() => t.unmount());
  });

  it('is silent — it never touches audio', () => {
    expect(code('StudioSplash.tsx')).not.toMatch(/expo-av|Audio|Speech|TTS|Sound/);
  });

  it('lasts ~1.5 s, then calls onDone exactly once and unmounts the card', () => {
    expect(STUDIO_SPLASH_MS).toBe(1500);
    const onDone = jest.fn();
    const t = mount(<StudioSplash source={FAKE_ART} onDone={onDone} />);
    renderer.act(() => { jest.advanceTimersByTime(STUDIO_SPLASH_MS - 50); });
    expect(json(t)).toContain('studio-splash');
    expect(onDone).not.toHaveBeenCalled();
    renderer.act(() => { jest.advanceTimersByTime(100); });
    expect(t.toJSON()).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => { jest.advanceTimersByTime(5000); });
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => t.unmount());
  });

  it('never strands the player: an image that fails to load dismisses at once', () => {
    const onDone = jest.fn();
    const t = mount(<StudioSplash source={FAKE_ART} onDone={onDone} />);
    const img = t.root.findAllByProps({ resizeMode: 'contain' })[0];
    expect(img).toBeDefined();
    renderer.act(() => { (img!.props.onError as () => void)(); });
    expect(t.toJSON()).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => t.unmount());
  });

  it('does not wait on the network, the OTA check or hydration: the timer starts at mount', () => {
    expect(code('StudioSplash.tsx')).not.toMatch(/fetch\(|Updates|useGameStore|hydrat|NetInfo/);
  });

  it('is once per launch: a remount in the same process (navigation, Settings, resume) does not replay it', () => {
    const first = mount(<StudioSplash source={FAKE_ART} />);
    renderer.act(() => { jest.advanceTimersByTime(STUDIO_SPLASH_MS + 10); });
    renderer.act(() => first.unmount());
    const again = mount(<StudioSplash source={FAKE_ART} />);
    expect(again.toJSON()).toBeNull();
    expect(studioSplashWillShow(FAKE_ART)).toBe(false);
    renderer.act(() => again.unmount());
    resetStudioSplashForTest(); // a new JS process (cold launch / OTA reload) shows it again
    expect(studioSplashWillShow(FAKE_ART)).toBe(true);
  });
});

describe('the sequence is additive: studio card, THEN the existing splash', () => {
  it('the Tartaria splash is not mounted until the studio card is done', () => {
    // LaunchSplashes reads the real (null) asset, so drive the same state machine
    // through the exported pieces: the card is shown first for a launch where it will show.
    const onDone = jest.fn();
    const t = mount(<StudioSplash source={FAKE_ART} onDone={onDone} />);
    expect(json(t)).not.toContain('tartaria-splash');
    renderer.act(() => { jest.advanceTimersByTime(STUDIO_SPLASH_MS + 10); });
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => t.unmount());
  });

  it('LaunchSplashes gates SplashOverlay on the studio card and is what App mounts', () => {
    const comp = readFileSync(join(__dirname, '..', 'app', 'components', 'StudioSplash.tsx'), 'utf8');
    expect(comp).toContain('{studioDone ? <SplashOverlay /> : null}');
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('<LaunchSplashes />');
    expect(app).not.toMatch(/<SplashOverlay\s*\/>/);
  });

  it('layers: above the Tartaria splash, below the applying-update overlay', () => {
    const z = (f: string, re: RegExp) => Number(readFileSync(join(__dirname, '..', 'app', 'components', f), 'utf8').match(re)?.[1]);
    const studio = z('StudioSplash.tsx', /zIndex: (\d+)/);
    const splash = z('SplashOverlay.tsx', /zIndex: (\d+)/);
    const ota = z('OtaApplyingOverlay.tsx', /zIndex: (\d+)/);
    expect(splash).toBeLessThan(studio);
    expect(studio).toBeLessThan(ota);
  });
});
