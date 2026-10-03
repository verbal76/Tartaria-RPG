// The Hot Attic Games studio card — the ONE image it paints.
//
// ⚠⚠ THE CANONICAL ASSET IS NOT IN THIS REPOSITORY. The owner's brief names
// `branding/Hot_Attic_Games_Master_Logo.png`; as of this commit no such file
// exists on any ref (git history, all remote branches) or on disk, and no
// `branding/` directory has ever been committed. It was not redrawn, regenerated
// or substituted — the card's rules are "that exact asset, uncropped,
// unstretched, unrecolored", and a stand-in would break all of them.
//
// WHY THIS IS A SEPARATE MODULE AND NOT A `require()` IN THE COMPONENT. Metro
// resolves `require()` statically, so `require('../../branding/…png')` with the
// file absent fails the WHOLE bundle at export time — it would take every OTA
// down with it. Keeping the require in this one-line leaf means the component,
// its timing, its lifecycle and its tests all ship now, inert, and the card
// goes live by changing exactly one line once the file is committed:
//
//     export const STUDIO_SPLASH_SOURCE: ImageSourcePropType | null =
//       require('../../branding/Hot_Attic_Games_Master_Logo.png');
//
// While this is `null` the studio card renders nothing and the launch sequence
// is byte-for-byte the one players have today.
import type { ImageSourcePropType } from 'react-native';

export const STUDIO_SPLASH_SOURCE: ImageSourcePropType | null = null;
