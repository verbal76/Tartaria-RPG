// arb76 — "aged artifact" palette (Phase 1 prototype). Warm umber base + faded
// cream ink + tarnished gold/bronze, replacing the near-black "vacuum of space"
// look with something that reads like a lost Tartarian ledger held in shadow.
//
// Used by the Exploration screen prototype; the root background layers
// (parchment + vignette) live in App.tsx's AppShell. Full rollout to the other
// screens is Phase 2.
export const theme = {
  base: '#16242a',          // warm umber — the root background (lightened from #1A1412)
  surface: 'rgba(32,24,20,0.62)', // translucent umber card, lets the texture show
  surfaceSolid: '#16242a',
  ink: '#EAE0C8',           // faded-cream body text (was harsh near-white)
  inkDim: '#C9BBA0',        // secondary / muted text
  gold: '#6ab0c9',          // existing brand amber — kept for continuity
  bronze: '#A97C50',        // tarnished bronze — headers / item names / highlights
  border: '#6E5A3A',        // muted gold border
  borderDim: '#2b3a3e',     // existing dim border — kept
} as const;
