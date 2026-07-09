// OTA-728 — paid vendor services: pay-to-train + companion care. Costs are shaped
// so money has MEANING (training scales + is capped; care scales with injury).

import {
  PAY_TRAIN_CAP,
  PAY_TRAIN_PER_POINT,
  REVIVE_DOG_COST,
  payTrainCost,
  canPayTrain,
  companionHealCost,
} from '../app/engine/vendorServices';

describe('OTA-728 — pay-to-train is a sink, not a cheat', () => {
  it('each point costs more than the last (scales with current value)', () => {
    expect(payTrainCost(10)).toBe(PAY_TRAIN_PER_POINT * 10);
    expect(payTrainCost(14)).toBeGreaterThan(payTrainCost(10));
    // monotonic non-decreasing up the ladder
    for (let v = 1; v < PAY_TRAIN_CAP; v++) {
      expect(payTrainCost(v + 1)).toBeGreaterThanOrEqual(payTrainCost(v));
    }
  });
  it('caps out — you cannot BUY a stat past the cap', () => {
    expect(canPayTrain(PAY_TRAIN_CAP - 1)).toBe(true);
    expect(canPayTrain(PAY_TRAIN_CAP)).toBe(false);
    expect(canPayTrain(PAY_TRAIN_CAP + 3)).toBe(false);
  });
  it('the last buyable point is expensive (real coin, not pocket change)', () => {
    expect(payTrainCost(PAY_TRAIN_CAP - 1)).toBeGreaterThanOrEqual(500);
  });
});

describe('OTA-728 — companion care scales with injury', () => {
  it('costs more the more hurt the companion is, with a floor', () => {
    expect(companionHealCost(0, 'dog')).toBeGreaterThan(0);      // floor, not free
    expect(companionHealCost(40, 'dog')).toBeGreaterThan(companionHealCost(10, 'dog'));
    // golems cost a touch more to mend than dogs for the same wound
    expect(companionHealCost(30, 'golem')).toBeGreaterThan(companionHealCost(30, 'dog'));
  });
  it('reviving a dog is a steep flat fee', () => {
    expect(REVIVE_DOG_COST).toBeGreaterThanOrEqual(200);
  });
});
