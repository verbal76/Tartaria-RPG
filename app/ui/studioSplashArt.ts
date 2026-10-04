// The Hot Attic Games studio card — the ONE image it paints.
//
// CANONICAL FILE: Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png, at the repository
// ROOT. It is the owner-supplied studio artwork (1536×1024, RGBA — about 30% of its
// pixels are genuinely transparent). It is used as supplied: not redrawn, recoloured,
// cropped or re-encoded. The earlier name `branding/Hot_Attic_Games_Master_Logo.png`
// is OBSOLETE and must not be looked for or reintroduced.
//
// This is studio-wide Hot Attic Games product policy (CLAUDE.md, "Studio splash"):
// every Hot Attic Games application opens with this card before its own title.
//
// Why this stays a one-line leaf rather than a `require()` inside the component:
// Metro resolves `require()` statically, so the asset path lives in exactly one place
// that the tests can pin to the file on disk.
import type { ImageSourcePropType } from 'react-native';

export const STUDIO_SPLASH_FILENAME = 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png';

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const STUDIO_SPLASH_SOURCE: ImageSourcePropType | null = require('../../Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
