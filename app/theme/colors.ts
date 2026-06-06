// arb76 — "aged artifact" palette (Phase 1 prototype). Warm umber base + faded
// cream ink + tarnished gold/bronze, replacing the near-black "vacuum of space"
// look with something that reads like a lost Tartarian ledger held in shadow.
//
// Used by the Exploration screen prototype; the root background layers
// (parchment + vignette) live in App.tsx's AppShell. Full rollout to the other
// screens is Phase 2.
export const theme = {
  base: '#1A1412',          // deep espresso umber — the root background
  surface: 'rgba(32,24,20,0.62)', // translucent umber card, lets the texture show
  surfaceSolid: '#211A16',
  ink: '#EAE0C8',           // faded-cream body text (was harsh near-white)
  inkDim: '#C9BBA0',        // secondary / muted text
  gold: '#C9A86A',          // existing brand amber — kept for continuity
  bronze: '#A97C50',        // tarnished bronze — headers / item names / highlights
  border: '#6E5A3A',        // muted gold border
  borderDim: '#3A342C',     // existing dim border — kept
} as const;
