// engine_Dev — multi-stage whisper missions (the data-driven runner). A chain
// with stages[] runs leg-by-leg: reach a tile -> (optional foe) -> next tile ->
// ... -> last leg completes. Covers the pure engine helpers.

import {
  isMultiStageWhisper,
  currentWhisperStage,
  whisperStageIndex,
  stageTargetTile,
  findReadyStageWhisper,
  findChain,
} from '../app/engine/whispers';
import { setWhispersOverride, clearAllOverrides } from '../app/engine/contentPack';
import type { WhisperRecord } from '../app/engine/types';

const MULTI = {
  id: 'pier_run',
  title: 'The Pier Run',
  plantLocations: ['dock'],
  plantChance: 0.2,
  plantLines: ['A dockhand mutters about a job.'],
  targetOffset: { dxRange: [1, 1] as [number, number], dyRange: [0, 0] as [number, number] },
  stages: [
    { line: 'You reach the gantry.', effects: [{ type: 'grant_tc' as const, amount: 5 }] },
    { line: 'A tough blocks the hold.', targetOffset: { dxRange: [1, 1] as [number, number], dyRange: [0, 0] as [number, number] }, enemyName: 'Fog Wraith', effects: [{ type: 'grant_item' as const, name: 'Manifest' }] },
    { line: 'You slip back out with it.', targetOffset: { dxRange: [-1, -1] as [number, number], dyRange: [0, 0] as [number, number] }, effects: [{ type: 'grant_tc' as const, amount: 30 }] },
  ],
};

const rec = (over: Partial<WhisperRecord>): WhisperRecord => ({
  id: 'pier_run', stage: 'planted', plantedAtHour: 0,
  targetMapX: 6, targetMapY: 5, targetLocationId: 'dock', ...over,
} as WhisperRecord);

describe('engine_Dev — multi-stage whisper runner (helpers)', () => {
  beforeEach(() => setWhispersOverride([MULTI]));
  afterEach(() => clearAllOverrides());

  it('recognizes a multi-stage chain (and a one-hop one is not)', () => {
    expect(isMultiStageWhisper(findChain('pier_run'))).toBe(true);
    expect(isMultiStageWhisper(undefined)).toBe(false);
  });

  it('stageTargetTile applies the leg offset, or stays put when there is none', () => {
    expect(stageTargetTile(undefined, 5, 5)).toEqual({ x: 5, y: 5 });
    expect(stageTargetTile({ line: 'x' }, 5, 5)).toEqual({ x: 5, y: 5 }); // no offset = same tile
    expect(stageTargetTile({ line: 'x', targetOffset: { dxRange: [2, 2], dyRange: [-1, -1] } }, 5, 5)).toEqual({ x: 7, y: 4 });
  });

  it('whisperStageIndex + currentWhisperStage track the ctx leg', () => {
    expect(whisperStageIndex(rec({ ctx: { stageIndex: 1 } }))).toBe(1);
    expect(currentWhisperStage(findChain('pier_run'), rec({ ctx: { stageIndex: 1 } }))?.enemyName).toBe('Fog Wraith');
    expect(currentWhisperStage(findChain('pier_run'), rec({ ctx: { stageIndex: 0 } }))?.enemyName).toBeUndefined();
  });

  it('findReadyStageWhisper fires on the current leg tile, but NOT while blocked on a foe', () => {
    const atTile = rec({ ctx: { stageIndex: 0 } });
    expect(findReadyStageWhisper([atTile], 12, 6, 5)?.id).toBe('pier_run');
    expect(findReadyStageWhisper([atTile], 12, 9, 9)).toBeNull();         // wrong tile
    const blocked = rec({ ctx: { stageIndex: 1, awaitEnemy: 'Fog Wraith' } });
    expect(findReadyStageWhisper([blocked], 12, 6, 5)).toBeNull();        // kill-gated
  });
});
