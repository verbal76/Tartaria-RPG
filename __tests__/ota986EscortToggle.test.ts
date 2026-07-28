// OTA-986 — the Contracts-screen ACTIVATE / DEACTIVATE toggle names the escort
// party it stands down or recalls (owner: "I like the naming the escort party
// polish touch"). Non-escort contracts keep the plain labels.
import { escortToggleLabel } from '../app/engine/escort';

describe('OTA-986 — escort-aware contract toggle label', () => {
  it('names the living party on both sides of the toggle', () => {
    expect(escortToggleLabel(true, { label: 'Surveyors' })).toBe('▮▮ DEACTIVATE (stand down your Surveyors)');
    expect(escortToggleLabel(false, { label: 'Surveyors' })).toBe('▶ SET ACTIVE (recall your Surveyors)');
  });

  it('keeps the plain labels when there is no party', () => {
    expect(escortToggleLabel(true, null)).toBe('▮▮ DEACTIVATE');
    expect(escortToggleLabel(false, undefined)).toBe('▶ SET ACTIVE — the mission you’re on');
  });
});
