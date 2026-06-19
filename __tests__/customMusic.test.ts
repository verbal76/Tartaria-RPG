// engine_Dev — pure custom-music helpers: cap enforcement, category→context
// mapping, filename hygiene, and audio-type validation. The store's file IO /
// picker side is exercised on-device; these lock the lore-agnostic logic.

import {
  MAX_TRACKS_PER_CATEGORY,
  DEFAULT_BASE_VOLUME,
  contextsForCategory,
  canAddTrack,
  addTrack,
  removeTrack,
  sanitizeTrackName,
  extensionOf,
  isAcceptableAudio,
  type CustomTrack,
} from '../app/audio/customMusic';

function track(id: string): CustomTrack {
  return { id, name: id, uri: `file:///m/${id}.mp3`, baseVolume: 0.5 };
}

describe('customMusic — limits', () => {
  test('canAddTrack is true below the cap and false at it', () => {
    const below = Array.from({ length: MAX_TRACKS_PER_CATEGORY - 1 }, (_, i) => track(`t${i}`));
    expect(canAddTrack(below)).toBe(true);
    const atCap = Array.from({ length: MAX_TRACKS_PER_CATEGORY }, (_, i) => track(`t${i}`));
    expect(canAddTrack(atCap)).toBe(false);
  });

  test('addTrack refuses to grow past the cap', () => {
    const atCap = Array.from({ length: MAX_TRACKS_PER_CATEGORY }, (_, i) => track(`t${i}`));
    const after = addTrack(atCap, track('overflow'));
    expect(after.length).toBe(MAX_TRACKS_PER_CATEGORY);
    expect(after.some((t) => t.id === 'overflow')).toBe(false);
  });

  test('addTrack appends and removeTrack drops by id', () => {
    let list: CustomTrack[] = [];
    list = addTrack(list, track('a'));
    list = addTrack(list, track('b'));
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
    list = removeTrack(list, 'a');
    expect(list.map((t) => t.id)).toEqual(['b']);
  });
});

describe('customMusic — category mapping', () => {
  test('battle drives combat AND boss; ambient drives explore', () => {
    expect(contextsForCategory('battle').sort()).toEqual(['boss', 'combat']);
    expect(contextsForCategory('ambient')).toEqual(['explore']);
  });

  test('battle mixes hotter than ambient by default', () => {
    expect(DEFAULT_BASE_VOLUME.battle).toBeGreaterThan(DEFAULT_BASE_VOLUME.ambient);
  });
});

describe('customMusic — filename hygiene', () => {
  test('sanitizeTrackName strips extension and tidies separators', () => {
    expect(sanitizeTrackName('Epic_Battle-Theme.mp3')).toBe('Epic Battle Theme');
    expect(sanitizeTrackName('   .m4a')).toBe('Track');
  });

  test('extensionOf reads the lowercased extension', () => {
    expect(extensionOf('song.MP3')).toBe('mp3');
    expect(extensionOf('file:///x/clip.m4a')).toBe('m4a');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('customMusic — audio validation', () => {
  test('accepts known audio mime types', () => {
    expect(isAcceptableAudio('audio/mpeg', 'x.mp3')).toBe(true);
    expect(isAcceptableAudio('audio/mp4', 'x.m4a')).toBe(true);
  });

  test('falls back to extension when mime is missing/odd', () => {
    expect(isAcceptableAudio(null, 'song.wav')).toBe(true);
    expect(isAcceptableAudio('application/octet-stream', 'song.ogg')).toBe(true);
  });

  test('rejects clearly non-audio files', () => {
    expect(isAcceptableAudio('image/png', 'pic.png')).toBe(false);
    expect(isAcceptableAudio(null, 'notes.txt')).toBe(false);
  });
});
