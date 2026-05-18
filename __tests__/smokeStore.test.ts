import { useGameStore } from '../app/state/gameStore';
test('smoke', () => {
  expect(typeof useGameStore.getState).toBe('function');
});
