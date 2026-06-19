// engine_Dev — custom uploaded music (pure helpers + specs).
//
// The developer can upload their own BATTLE and AMBIENT tracks from the dev
// console; uploads replace the built-in Tartaria pools for the matching audio
// contexts so a re-skinned game (e.g. the Philadelphia experiment) plays the
// author's own score. This module holds the lore-agnostic, side-effect-free
// pieces — limits, recommended specs, accepted formats, and the small array
// reducers — so they can be unit-tested without expo-av / file-system / the
// document picker. The store (customMusicStore.ts) wraps these with file IO
// and persistence; AudioManager consumes the resolved pools.

/** The two upload buckets the dev console exposes. */
export type MusicCategory = 'battle' | 'ambient';

/** AudioManager context names a category maps onto. Subset of AudioManager's
 *  Context union (assignable to it). */
export type MusicContextName = 'combat' | 'boss' | 'explore';

/** One uploaded track. `uri` points at a file copied into the app's document
 *  directory (survives restarts); `baseVolume` is the authored mix level. */
export interface CustomTrack {
  id: string;
  /** Display name (sanitized original filename, sans extension). */
  name: string;
  /** file:// URI under the app document directory. */
  uri: string;
  /** Authored mix volume 0..1 — multiplied by the master settings volume. */
  baseVolume: number;
}

/** Hard cap per category. Bounds on-device storage and keeps the rotation
 *  sane. Surfaced in the UI as "N / MAX"; the ADD button disables at the cap. */
export const MAX_TRACKS_PER_CATEGORY = 8;

/** Per-category default mix level for a freshly uploaded track. Battle sits a
 *  touch hotter than ambient, matching the built-in pools (combat 0.6 / explore
 *  0.4). */
export const DEFAULT_BASE_VOLUME: Record<MusicCategory, number> = {
  battle: 0.6,
  ambient: 0.4,
};

/** Best-result specs shown in the console. expo-av plays these reliably on both
 *  Android and iOS; the size/length guidance keeps the family APK and on-device
 *  storage from ballooning. */
export const RECOMMENDED_AUDIO_SPECS =
  'Best results: MP3 or M4A/AAC · 44.1 kHz · stereo · 128–192 kbps · ' +
  'seamless loop · ≤ 5 MB each (~3–4 min). WAV/OGG also play but are larger.';

/** MIME types the picker accepts. Kept broad (audio/*) at the picker call; this
 *  list documents what actually plays well and is used to soft-validate the
 *  picked asset's reported mimeType. */
export const ACCEPTED_AUDIO_MIME: readonly string[] = [
  'audio/mpeg', // mp3
  'audio/mp3',
  'audio/mp4', // m4a / aac
  'audio/aac',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
];

/** File extensions accepted as a fallback when a picked asset reports no/odd
 *  mimeType (some Android providers do). */
export const ACCEPTED_AUDIO_EXT: readonly string[] = [
  'mp3', 'm4a', 'aac', 'mp4', 'wav', 'ogg',
];

/** Which AudioManager contexts a category drives. Battle covers both regular
 *  combat AND boss encounters (one upload bucket — boss/combat aren't split in
 *  the dev console). Ambient drives exploration. */
export function contextsForCategory(category: MusicCategory): MusicContextName[] {
  return category === 'battle' ? ['combat', 'boss'] : ['explore'];
}

/** True while there's room to add another track to this category's list. */
export function canAddTrack(list: readonly CustomTrack[]): boolean {
  return list.length < MAX_TRACKS_PER_CATEGORY;
}

/** Append a track if there's room; returns the new list (or the same list,
 *  unchanged, when full). Pure — caller decides what to do when it's full. */
export function addTrack(list: readonly CustomTrack[], track: CustomTrack): CustomTrack[] {
  if (!canAddTrack(list)) return list.slice();
  return [...list, track];
}

/** Remove a track by id; returns a new list. */
export function removeTrack(list: readonly CustomTrack[], id: string): CustomTrack[] {
  return list.filter((t) => t.id !== id);
}

/** Turn a picked filename into a clean display name: strip the extension,
 *  collapse separators/whitespace, trim, cap length. Falls back to "Track". */
export function sanitizeTrackName(rawFilename: string): string {
  const noExt = rawFilename.replace(/\.[A-Za-z0-9]+$/, '');
  const cleaned = noExt.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 48) : 'Track';
}

/** Lowercased file extension (no dot) from a filename/uri, or '' if none. */
export function extensionOf(filename: string): string {
  const m = filename.match(/\.([A-Za-z0-9]+)(?:\?|#|$)/);
  return m ? m[1]!.toLowerCase() : '';
}

/** Soft validation: accept when the reported mimeType is in the known-good set
 *  OR (mimeType missing/odd) the extension is one we accept. Picky enough to
 *  reject obviously-wrong files, lenient enough for flaky Android providers. */
export function isAcceptableAudio(mimeType: string | null | undefined, filename: string): boolean {
  const mt = (mimeType ?? '').toLowerCase();
  if (mt && ACCEPTED_AUDIO_MIME.includes(mt)) return true;
  if (mt.startsWith('audio/')) return true;
  return ACCEPTED_AUDIO_EXT.includes(extensionOf(filename));
}
