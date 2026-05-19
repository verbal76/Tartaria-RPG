# Literary & Atmosphere Audit — On-Device Path

`__tests__/literaryAudit.test.ts` runs four narrative-quality
protocols against the world-channel output:

1. **Token Diet** — words per line, flag >75
2. **Groundhog Day** — pairwise Jaccard similarity on re-entry
3. **Sensory Shift** — same `look` under HP / time deltas
4. **Trope Tracker** — adjective/verb frequency, burnout list

## What the Jest version measures vs. doesn't

In Jest, `llama.rn` is mocked to return an empty completion. So the
audit reads **templated narration only**:

- `rotatingPick` pools in `engine/narrativeGenerator.ts`
- Hand-authored scene descriptions in `data/locations/*.json`
- Fixed strings in `gameStore.ts` (`narrateCasualLook`,
  `travelTo`, `stepDirection`, weather ticks, etc.)
- Re-entry surfacing (`On the ground:`, `Still open from before:`)

It does **not** measure live Qwen output. The Arbiter channel
remains empty in Jest. To audit the actual LLM behavior the same
harness runs on-device with one small change.

## On-device run procedure

The audit metrics (verbosity, Jaccard similarity, lexical density,
burnout list) are pure functions of the world-channel text — they
don't care whether the source was a template or a generated string.
Two ways to get them on-device:

### Option A — Dev build with the harness wired to App.tsx

1. Build the app with `EXPO_PUBLIC_AUDIT=1` (a new env flag).
2. In `App.tsx`, when that flag is set, schedule
   `runLiteraryAudit()` after `bootQwen()` resolves.
3. `runLiteraryAudit()` is the same loop body from
   `literaryAudit.test.ts`, lifted into `app/diagnostics/literary.ts`
   so it can run against live state with Qwen producing real
   `arbiter` channel completions.
4. The audit writes its report to
   `FileSystem.documentDirectory + 'tartaria-literary-audit.txt'`
   and surfaces a "Copy audit report" button in the About screen.

Trade-offs: requires shipping a dev build with the auditor wired in;
adds ~250 LOC to the production bundle (gated behind the env flag).

### Option B — Recorder + replay (recommended)

Easier and avoids touching the production bundle:

1. Add a `recordWorldText: boolean` flag to `gameSettings`.
2. When enabled, every `appendLog('world', text)` and every Qwen
   completion delta appends a line to
   `FileSystem.documentDirectory + 'world-log.jsonl'` with
   `{ts, channel, text, scene_key, player_state}`.
3. Play the game normally for a session — the recorder captures
   the LIVE Qwen narration alongside the templates.
4. Pull the file off the device:
   - via the existing "share log" button in About (extend it to
     also share `world-log.jsonl`), or
   - `adb pull /data/data/com.verbal76.tartariarealms/files/world-log.jsonl`
5. Run a small Node script in `scripts/audit-from-recording.ts`
   that takes the JSONL, applies the four protocols, and writes
   the same report format the Jest test produces.

Trade-offs: no audit-pass during play; analysis is offline. But
the recorder is a 20-line addition and the analysis script reuses
all the metric helpers from `literaryAudit.test.ts`.

## Comparing template vs. live LLM

Once Option B is in place, the same audit can be run against three
corpora and the reports compared side-by-side:

- **Templated only** (Jest run — what we have today)
- **Live LLM** (on-device recording, Qwen enabled)
- **System TTS narration** (what the player actually hears with
  read-aloud on)

Headline metrics that should improve dramatically when Qwen is
live: lexical density (templates produced 6%; healthy generative
text should hit 25%+) and the "burnout list" length (templates lean
on a small recurring NPC line; Qwen should spread vocabulary across
the corpus).

## Open questions for the on-device pass

- Does Qwen's output respect the `cleanForSpeech` lore-respelling
  pass before going to the world log? (It shouldn't — the lexicon
  is TTS-only — but worth confirming the recording shows raw text.)
- Do hooks / scene-intro proactive lines get tagged on the same
  channel? If not, the audit will under-sample LLM output relative
  to total LLM activity.
- Should the recorder also capture the prompt context Qwen was given
  for each completion? That enables a follow-up "did the LLM respect
  the prompt's lore / character voice" check, but it doubles file
  size.
