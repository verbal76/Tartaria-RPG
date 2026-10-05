/**
 * The Hot Attic Games studio card — the owner-supplied canonical artwork
 * (Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png), contained and un-recoloured, ~2.5 s with fades,
 * once per launch, resumed (not restarted) across the hydration swap, never stranding.
 */
import React from 'react';
import { createHash } from 'crypto';
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

import {
  StudioSplash, LaunchSplashes, STUDIO_SPLASH_MS, STUDIO_FADE_IN_MS, STUDIO_FADE_OUT_MS,
  resetStudioSplashForTest, studioSplashWillShow, studioCardSettled,
} from '../app/components/StudioSplash';
import { STUDIO_SPLASH_SOURCE, STUDIO_SPLASH_FILENAME } from '../app/ui/studioSplashArt';

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
const root = join(__dirname, '..');
// Code only — the component's own comments say "silent" and "hydration" on purpose.
const code = (...p: string[]) => readFileSync(join(root, ...p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const ART = 1 as unknown as number; // a bundler asset id, as `require()` yields on device
// The card is "on screen" once the native side has laid it out; its clock starts there.
const paint = (t: { root: { findAllByProps(p: Record<string, unknown>): Array<{ props: Record<string, unknown> }> } }) => {
  const card = t.root.findAllByProps({ testID: 'studio-splash' }).find((n) => typeof n.props.onLayout === 'function');
  if (!card) throw new Error('studio card has no onLayout');
  renderer.act(() => { (card.props.onLayout as () => void)(); });
};
const advance = (ms: number) => renderer.act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => { resetStudioSplashForTest(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('the canonical asset', () => {
  const file = join(root, 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
  const png = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);

  it('is the exact owner-supplied file, at the repository root, byte for byte', () => {
    expect(STUDIO_SPLASH_FILENAME).toBe('Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
    expect(existsSync(file)).toBe(true);
    // A deliberate replacement of the artwork updates this hash on purpose.
    expect(createHash('sha256').update(png).digest('hex'))
      .toBe('e3d9bb5653eafb783eede827606e7ac73a4e45564a1c25b1ed13ad1429f48c4e');
  });

  it('is a 1536×1024 RGBA PNG — it has an alpha channel, and transparent pixels', () => {
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1536);
    expect(png.readUInt32BE(20)).toBe(1024);
    expect(png[25]).toBe(6); // IHDR colour type 6 = truecolour with alpha
  });

  it('is the artwork the card paints: the leaf requires exactly this file, and the obsolete path is gone', () => {
    const live = code('app', 'ui', 'studioSplashArt.ts');
    expect(live.match(/require\(/g)?.length).toBe(1);
    expect(live).toContain(STUDIO_SPLASH_FILENAME);
    expect(live).not.toMatch(/branding\//);
    expect(STUDIO_SPLASH_SOURCE).not.toBeNull();
    const t = mount(<StudioSplash />);
    expect(json(t)).toContain('studio-splash');
    renderer.act(() => t.unmount());
  });

  it('no stale "logo missing" claim survives in the code that ships it', () => {
    for (const f of [['app', 'ui', 'studioSplashArt.ts'], ['app', 'components', 'StudioSplash.tsx']]) {
      const raw = readFileSync(join(root, ...f), 'utf8');
      expect(raw).not.toMatch(/NOT IN THIS REPOSITORY|asset is absent|until the canonical|inert/i);
    }
  });
});

describe('what the card paints', () => {
  it('shows the whole artwork: `contain` and full-size — never cropped, stretched, zoomed or tinted', () => {
    const t = mount(<StudioSplash source={ART} />);
    const s = json(t);
    expect(s).toContain('"resizeMode":"contain"');
    expect(s).not.toMatch(/"resizeMode":"(cover|stretch|center)"/);
    expect(s).not.toMatch(/tintColor|blur|transform/);
    expect(s).toContain('"width":"100%"');
    expect(s).toContain('"height":"100%"');
    renderer.act(() => t.unmount());
  });

  it('sits on the app\'s own window colour, so the native window, this card and the loading view are one ground', () => {
    const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
    const t = mount(<StudioSplash source={ART} />);
    expect(json(t)).toContain(`"backgroundColor":"${appJson.backgroundColor}"`);
    expect(code('App.tsx')).toContain(`backgroundColor: '${appJson.backgroundColor}'`);
    renderer.act(() => t.unmount());
  });

  it('adds no text, buttons or effects over the artwork, and no audio', () => {
    const c = code('app', 'components', 'StudioSplash.tsx');
    expect(c).not.toMatch(/<Text|Pressable|TouchableOpacity|Button|expo-av|Audio|Speech|TTS|Sound/);
    expect(c).not.toMatch(/Animated\.(loop|spring|sequence|parallel)/);
  });
});

describe('timing: 2–3 s with a fade in and a fade out', () => {
  it('is inside the owner\'s window', () => {
    expect(STUDIO_SPLASH_MS).toBeGreaterThanOrEqual(2000);
    expect(STUDIO_SPLASH_MS).toBeLessThanOrEqual(3000);
    expect(STUDIO_FADE_IN_MS + STUDIO_FADE_OUT_MS).toBeLessThan(STUDIO_SPLASH_MS / 2);
  });

  it('is on screen until the fade-out has run, then calls onDone exactly once and unmounts', () => {
    const onDone = jest.fn();
    const t = mount(<StudioSplash source={ART} onDone={onDone} />);
    paint(t);
    // Fully shown through the hold; the fade-out only starts FADE_OUT ms before the end.
    // (Jest's mocked native driver completes a fade instantly, so the hold is what is pinned here.)
    advance(STUDIO_SPLASH_MS - STUDIO_FADE_OUT_MS - 100);
    expect(json(t)).toContain('studio-splash');
    expect(onDone).not.toHaveBeenCalled();
    advance(STUDIO_FADE_OUT_MS + 400); // the hard stop (duration + 250 ms) backs the fade-out callback
    expect(t.toJSON()).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => t.unmount());
  });

  it('never outlives 3 s even if the animation callback never fires', () => {
    const onDone = jest.fn();
    const t = mount(<StudioSplash source={ART} onDone={onDone} />);
    paint(t);
    advance(3000);
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => t.unmount());
  });
});

describe('it cannot strand the player', () => {
  it('an artwork that fails to load dismisses at once', () => {
    const onDone = jest.fn();
    const t = mount(<StudioSplash source={ART} onDone={onDone} />);
    const img = t.root.findAllByProps({ resizeMode: 'contain' })[0];
    expect(img).toBeDefined();
    renderer.act(() => { (img!.props.onError as () => void)(); });
    expect(t.toJSON()).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => t.unmount());
  });

  it('waits on nothing: not the network, the OTA check, hydration or the models', () => {
    expect(code('app', 'components', 'StudioSplash.tsx')).not.toMatch(/fetch\(|Updates|useGameStore|hydrat|NetInfo|AppState/);
  });
});

describe('cold launch vs resume', () => {
  it('is once per launch: a remount in the same process (navigation, Settings, background → foreground) does not replay it', () => {
    const first = mount(<StudioSplash source={ART} />);
    paint(first);
    advance(STUDIO_SPLASH_MS + 300);
    renderer.act(() => first.unmount());
    const again = mount(<StudioSplash source={ART} />);
    expect(again.toJSON()).toBeNull();
    expect(studioSplashWillShow(ART)).toBe(false);
    renderer.act(() => again.unmount());
    resetStudioSplashForTest(); // a new JS process — cold launch, or an OTA activation reload
    expect(studioSplashWillShow(ART)).toBe(true);
  });

  it('the pre-hydration → hydrated swap RESUMES the card: it ends at 2.5 s in total, not 2.5 s after the swap', () => {
    const onDoneA = jest.fn();
    const loading = mount(<StudioSplash source={ART} onDone={onDoneA} />);
    paint(loading);
    advance(1500);
    renderer.act(() => loading.unmount()); // hydration finished: the loading view is replaced
    const onDoneB = jest.fn();
    const main = mount(<StudioSplash source={ART} onDone={onDoneB} />);
    expect(json(main)).toContain('studio-splash'); // still up
    advance(STUDIO_SPLASH_MS - 1500 + 300);        // 1.0 s of its life remained, plus the hard-stop slack
    expect(main.toJSON()).toBeNull();
    expect(onDoneB).toHaveBeenCalledTimes(1);
    renderer.act(() => main.unmount());
  });
});

describe('the launch sequence: studio card, THEN the existing splash, then the product', () => {
  it('the Tartaria splash is not mounted until the studio card is done', () => {
    const t = mount(<LaunchSplashes />);
    paint(t);
    expect(json(t)).toContain('studio-splash');
    expect(json(t)).not.toContain('tartaria-splash');
    advance(STUDIO_SPLASH_MS + 300);
    expect(json(t)).not.toContain('studio-splash');
    expect(json(t)).toContain('tartaria-splash');
    renderer.act(() => t.unmount());
  });

  it('a card that finished in the loading view lets the Tartaria splash mount the moment the tree hydrates', () => {
    const loading = mount(<StudioSplash source={ART} />);
    paint(loading);
    advance(STUDIO_SPLASH_MS + 300);
    renderer.act(() => loading.unmount());
    const main = mount(<LaunchSplashes />);
    expect(json(main)).toContain('tartaria-splash');
    expect(json(main)).not.toContain('studio-splash');
    renderer.act(() => main.unmount());
  });

  it('App mounts the card in the pre-hydration view and LaunchSplashes in the main tree', () => {
    const app = code('App.tsx');
    expect(app).toMatch(/<StudioSplash\s*\/>/);
    expect(app).toMatch(/<LaunchSplashes\s*\/>/);
    expect(app).not.toMatch(/<SplashOverlay\s*\/>/);
    expect(app.indexOf('<StudioSplash />')).toBeLessThan(app.indexOf('<LaunchSplashes />'));
  });

  it('layers: above the Tartaria splash, below the applying-update overlay', () => {
    const z = (f: string) => Number(readFileSync(join(root, 'app', 'components', f), 'utf8').match(/zIndex: (\d+)/)?.[1]);
    expect(z('SplashOverlay.tsx')).toBeLessThan(z('StudioSplash.tsx'));
    expect(z('StudioSplash.tsx')).toBeLessThan(z('OtaApplyingOverlay.tsx'));
  });
});

describe('the card is seen for its whole 2.5 s even when boot work blocks the JS thread', () => {
  it('time spent BEFORE the first paint does not count: boot work blocks 4 s, the hydration swap remounts the card, and it still shows its full hold', () => {
    const loading = mount(<StudioSplash source={ART} />);
    // Hydration/bundle work holds the thread: wall-clock passes, no timer or layout runs.
    jest.setSystemTime(Date.now() + 4000);
    renderer.act(() => loading.unmount()); // hydrated: the loading view is replaced
    const onDone = jest.fn();
    const main = mount(<StudioSplash source={ART} onDone={onDone} />);
    expect(json(main)).toContain('studio-splash'); // not already "spent"
    expect(onDone).not.toHaveBeenCalled();
    paint(main); // the first frame is laid out NOW
    advance(STUDIO_SPLASH_MS - STUDIO_FADE_OUT_MS - 100);
    expect(json(main)).toContain('studio-splash');
    expect(onDone).not.toHaveBeenCalled();
    advance(STUDIO_FADE_OUT_MS + 400);
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => main.unmount());
  });

  it('a layout that never reports still starts the clock, so the card cannot strand the player', () => {
    const onDone = jest.fn();
    const t = mount(<StudioSplash source={ART} onDone={onDone} />);
    advance(1200 + STUDIO_SPLASH_MS + 400);
    expect(onDone).toHaveBeenCalledTimes(1);
    renderer.act(() => t.unmount());
  });
});

describe('order: studio card → update check → Tartaria splash', () => {
  it('studioCardSettled resolves only when the card has finished', async () => {
    const t = mount(<StudioSplash source={ART} />);
    let settled = false;
    void studioCardSettled(ART).then(() => { settled = true; });
    paint(t);
    advance(1000);
    await Promise.resolve();
    expect(settled).toBe(false);
    advance(STUDIO_SPLASH_MS + 300);
    await Promise.resolve();
    expect(settled).toBe(true);
    renderer.act(() => t.unmount());
  });

  it('resolves at once when the card already ran or has no artwork', async () => {
    await expect(studioCardSettled(null)).resolves.toBeUndefined();
    const t = mount(<StudioSplash source={ART} />);
    paint(t);
    advance(STUDIO_SPLASH_MS + 300);
    await expect(studioCardSettled(ART)).resolves.toBeUndefined();
    renderer.act(() => t.unmount());
  });

  it('App waits for the card BEFORE the boot update check, and caps the wait', () => {
    const app = code('App.tsx');
    const wait = app.indexOf('studioCardSettled()');
    const check = app.indexOf("setStage('ota:check')");
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThan(check);
    expect(app).toMatch(/STUDIO_CARD_WAIT_CAP_MS\s*=\s*\d/);
    expect(app).toMatch(/Promise\.race\(\[studioCardSettled\(\)/);
  });
});
