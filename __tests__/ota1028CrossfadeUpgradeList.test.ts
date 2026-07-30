jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// OTA-1028 — a faithful little expo-av double: every created Sound records its
// call history so the tests can tell a PAUSE (position kept — resumable) from
// a STOP (position reset), and a fresh start (pos:0) from a resume.
const createdSounds: any[] = [];
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(async () => {}),
    Sound: {
      createAsync: jest.fn(async (_src: any, opts: any) => {
        const s = {
          volume: (opts && typeof opts.volume === 'number') ? opts.volume : 0,
          playing: false,
          position: 7777,
          loaded: true,
          calls: [] as string[],
          async getStatusAsync() { return { isLoaded: this.loaded, isPlaying: this.playing, volume: this.volume }; },
          async setVolumeAsync(v: number) { this.volume = v; },
          async playAsync() { this.playing = true; this.calls.push('play'); },
          async pauseAsync() { this.playing = false; this.calls.push('pause'); },
          async stopAsync() { this.playing = false; this.position = 0; this.calls.push('stop'); },
          async setPositionAsync(p: number) { this.position = p; this.calls.push(`pos:${p}`); },
          async unloadAsync() { this.loaded = false; },
        };
        createdSounds.push(s);
        return { sound: s };
      }),
    },
  },
}));

// OTA-1028 — MUSIC CROSSFADE + THE UPGRADE LIST. Owner: tracks "should
// Crossfade into each other" instead of cutting each other off, with the
// boss and market music arriving as a NOTICEABLE shift; and the Crucible
// upgrade target list should show all armor then all weapons, flagging
// what's currently equipped.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { bootAudio, setActiveContext, activeTrackForDiagnostics } from '../app/audio/AudioManager';

const EXPLORE_IDS = [
  'menu-misty-compass', 'explore-map-of-the-wild-2', 'explore-dusty-threshold',
  'explore-map-of-ashes', 'explore-tartar-steppe-adagio', 'explore-catacomb-overture',
];
let bedId: string | null = null;

describe('OTA-1028 — crossfade + resume behavior', () => {
  beforeAll(async () => {
    console.log = () => {};
    console.warn = () => {};
    await bootAudio();
  });

  it('explore starts one reflective bed and fades it up to its mix', async () => {
    await setActiveContext('explore');
    const diag = activeTrackForDiagnostics();
    expect(diag.context).toBe('explore');
    expect(EXPLORE_IDS).toContain(diag.trackId);
    bedId = diag.trackId;
    expect(createdSounds.length).toBe(1);
    const bed = createdSounds[0];
    expect(bed.playing).toBe(true);
    // baseVolume 0.4 × default master 0.7
    expect(bed.volume).toBeCloseTo(0.28, 5);
  });

  it('combat arrives as a fast shift: the bed PAUSES in place, the fight track starts from the top', async () => {
    await setActiveContext('combat');
    const diag = activeTrackForDiagnostics();
    expect(['combat-moon-map-1', 'combat-map-of-echoes']).toContain(diag.trackId);
    expect(createdSounds.length).toBe(2);
    const bed = createdSounds[0];
    const fight = createdSounds[1];
    expect(fight.playing).toBe(true);
    expect(fight.calls).toContain('pos:0'); // combat always hits from the opening bars
    expect(fight.volume).toBeCloseTo(0.42, 5); // 0.6 × 0.7
    expect(bed.playing).toBe(false);
    expect(bed.calls).toContain('pause');
    expect(bed.calls).not.toContain('stop'); // paused in place — resumable, never reset
  });

  it('returning to explore RESUMES the same bed mid-phrase (no new sound, no position reset)', async () => {
    await setActiveContext('explore');
    expect(activeTrackForDiagnostics().trackId).toBe(bedId);
    expect(createdSounds.length).toBe(2); // nothing new created — the bed came back
    const bed = createdSounds[0];
    expect(bed.playing).toBe(true);
    // Exactly ONE pos:0 total: the original fresh start. The resume added none.
    expect(bed.calls.filter((c: string) => c === 'pos:0').length).toBe(1);
  });

  it('the market is the single happy track', async () => {
    await setActiveContext('shop');
    expect(activeTrackForDiagnostics().trackId).toBe('shop-quiet-back-alley');
  });
});

describe('OTA-1028 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const audioSrc = read('app', 'audio', 'AudioManager.ts');
  const modalSrc = read('app', 'components', 'FusionPickerModal.tsx');

  it('boss/combat/market arrive as a SHIFT; beds crossfade and resume', () => {
    expect(audioSrc).toMatch(/SHIFT_CONTEXTS: ReadonlySet<Context> = new Set\(\['boss', 'combat', 'shop'\]\)/);
    expect(audioSrc).toMatch(/RESUME_CONTEXTS: ReadonlySet<Context> = new Set\(\['explore', 'menu', 'shop'\]\)/);
    expect(audioSrc).toMatch(/async function crossfadeTo\(/);
    expect(audioSrc).toMatch(/async function pauseInPlace\(/);
    // The old stop-then-fade-in transition is gone.
    expect(audioSrc).not.toMatch(/async function playWithFade\(/);
    expect(audioSrc).not.toMatch(/stopWithFade/);
  });

  it('the pools keep the owner\'s upload labels: boss tracks, one happy market song, reflective beds', () => {
    expect(audioSrc).toMatch(/boss: \[\s*\{ id: 'boss-iron-boss'/);
    // shop pool = exactly the one happy track
    const shopPool = /shop: \[\s*\{ id: 'shop-quiet-back-alley'[^\]]*\]/.exec(audioSrc)?.[0] ?? '';
    expect(shopPool).toBeTruthy();
    expect((shopPool.match(/id: '/g) ?? []).length).toBe(1);
  });

  it('the upgrade list is grouped armor-then-weapons with EQUIPPED badges', () => {
    expect(modalSrc).toMatch(/ARMOR & VESTS/);
    expect(modalSrc).toMatch(/\{ label: 'ARMOR & VESTS', items: upgradeableArmor \},\s*\{ label: 'WEAPONS', items: upgradeableWeapons \},/);
    expect(modalSrc).toMatch(/equippedInstanceIds/);
    expect(modalSrc).toMatch(/equippedTag/);
    // Worn pieces sort first in each group.
    expect(modalSrc).toMatch(/const wornFirst = /);
    // The dog's vest is badged too (worn on the dog, not in a player slot).
    expect(modalSrc).toMatch(/ON \$\{\(player\?\.dog\?\.name/);
  });
});
