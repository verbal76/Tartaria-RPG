# CANONICAL WALKER — QUALIFICATION FREEZE RECEIPT

**Qualification date/time**: 2026-09-28T15:21:20Z
**Production SHA**: `6f8110099e4ebcd8cc0adf32efd0f81bdeff8da3` (branch `golem-line`)
**CANONICAL_WALKER_QUALIFIED_ID**: `sha256:908ecd47ebd7ca9c7f4eddbdd33ad4bf1d1ecef836ea0b93470491cc652fda5d`

**Verdict: QUALIFIED FOR CANONICAL LIFE 4**

See the companion `canonical-walker-qualification-freeze.json` for the full machine-readable receipt (per-file manifest hashes, complete qualification summaries by dimension, known nonblocking limitations, preserved evidence index).

## How to recompute the ID before Life 4

```
node scripts/canonicalWalkerQualifiedId.mjs
```

The last line printed must read exactly:

```
CANONICAL_WALKER_QUALIFIED_ID = sha256:908ecd47ebd7ca9c7f4eddbdd33ad4bf1d1ecef836ea0b93470491cc652fda5d
```

If it does not, the qualified apparatus has changed since this freeze and Life 4 must NOT start until either the drift is reconciled or the owner explicitly authorizes requalification.

## The two identities Life 4 evidence must carry

1. **PRODUCTION_SHA** — which game was exercised: `6f8110099e4ebcd8cc0adf32efd0f81bdeff8da3`
2. **CANONICAL_WALKER_QUALIFIED_ID** — which investigative apparatus exercised it: `sha256:908ecd47ebd7ca9c7f4eddbdd33ad4bf1d1ecef836ea0b93470491cc652fda5d`

## Manifest (19 files, sorted)

| SHA-256 | Path | Bytes |
|---|---|---|
| dc6ac2db3a9dcf2e71be03044ff686e87a90ba83dd9d5cc0ae18dfedfa622018 | test-utils/canonical/CanonicalWalker.ts | 18687 |
| c2499b96623afaae0ecd39958ba449bd96ca01d7d60e60dcbc458bbc20b28c43 | test-utils/canonical/actionExecutor.ts | 31947 |
| b1ffac3dad73045cce79eabf52ef5b9ff9f2149369a984bd567dce37848c2fdd | test-utils/canonical/artifactIdentity.ts | 2832 |
| ffefb9e0da913e60ef762b7d26674fece50e4d29169c6f60979056e3b74038b8 | test-utils/canonical/bootHelpers.ts | 4632 |
| 87928db7ab059e404ab4731b1fc4e5ac219ae56712a3e590b56f856ca81f7d67 | test-utils/canonical/combatLoop.ts | 9546 |
| c703675606c3d1b2a43f228f5846ef8fa74c0673034ae3316699b352e87c660a | test-utils/canonical/decisionJournal.ts | 1453 |
| b1ddb5f0b2580b9dac589a660834928a492cbbb82695b422a9cc6d7d937fafbd | test-utils/canonical/dice.ts | 1864 |
| acf9c616891c4950e15592812b0e20cb9a20ed3da43e5fab0de152519183684a | test-utils/canonical/guardianApproachOptions.ts | 4065 |
| a49b7b759ee7d647b6d0de76766be2882bc2921be3b80ff182c3bff46d3a0e71 | test-utils/canonical/hostProfile.ts | 9831 |
| 8ab6165ab1eb11f6193ca92e96eff059691a995cea003bd682d22da5c64c0126 | test-utils/canonical/logMirror.ts | 1969 |
| 6c582f23fe5c44f6a09a0c79c5d097982d41a459cddaaa4201fa9b323c9300c2 | test-utils/canonical/playerView.ts | 12798 |
| a9c90243355719dedc2ab799c5162be9c22cdcbc5b44503bc857262b19952eb4 | test-utils/canonical/policy.ts | 27308 |
| df9b0a58df65201dbd9bac8ef6b01fcacd58ccba376c486412db9e4d39838aac | test-utils/canonical/presentation.ts | 2615 |
| f2517aada351b386a3a2a928fa9efe946eb76b43bbb20644daa214e1baa74626 | test-utils/canonical/qualification.ts | 1359 |
| 148215943e89ffe7538bf7264aa60f4888294835aed605640ca4d29d52585eca | test-utils/canonical/rngLedger.ts | 2564 |
| 774cdff26b5f54131485d03475507966b6543f10764c894070b9fdcf79b6c43a | test-utils/canonical/snapshot.ts | 2600 |
| fcbe40ff4bd8a3a38a2786e358a776a07d2750f34bc847ef371f1cccee715e27 | test-utils/canonical/storeDiffer.ts | 4083 |
| bb2609712ac226777758fbfe7178ebfa6cafba5c24aece8c9b1c7f67b8678510 | test-utils/canonical/virtualClock.ts | 3781 |
| d5461c5952ce4a177f55e5b2d00fce18d4d30a9d0aebefefa1b0c12cfd7842db | test-utils/playerWalker.ts | 85790 |

**Deliberately excluded** from this manifest (real and valuable, but not executed by a Life driver): all `__tests__/canonical*.test.ts` regression/qualification tests; `qualificationHelpers.ts`, `qualify.ts`, `qualificationPredicates.ts` (qualification-framework tooling never wired into a Life driver); `guardianCombatIsolationFixture.ts` (explicitly test-setup-only — Life 4 must travel for real); `docs/cartography/*` (documentation); all `scratchpad/canonical-life-reports/*` evidence artifacts (volatile, UUID-bearing, not apparatus identity).

## Governance

Remains **investigative/untracked**, per existing project practice. This freeze is cryptographic/evidentiary, not a commit. Nothing in this task was committed or pushed.
