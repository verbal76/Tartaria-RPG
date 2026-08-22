/**
 * OTA-1437 — A TOPIC THAT CANNOT PAY OUT DOES NOT GET SPOKEN AT ALL.
 *
 * Owner, with a device log: *"talking to this vendor went weird."*
 *
 * What the log shows, at 2026-08-22T01:09 and again at 22:43: the player raises
 * "Ask where he stopped setting traps", reads Bran's entire nine-line reveal
 * about the valley where he pulled every trap — and is then told *"You are
 * already chasing something. Bran the Beastmaster's tip will keep — ask again
 * when your hands are free."* Twenty-five times in ninety seconds. Same
 * paragraph, verbatim, every time.
 *
 * ⚠⚠ THE CAUSE IS A CORRECT FIX WITH THE PRESENTATION LEFT BEHIND IT. OTA-1064
 * stopped a bounced lead from spending the topic — right, because the player
 * holds one pending lead at a time and overwriting an unclaimed one deletes
 * something they were told to go and find. But an unspent topic is permanently
 * `asked === 0`, and `asked === 0` is what the handler uses to mean "first
 * raise". So every re-ask replayed the whole first-raise path: the full speech,
 * a sentence saying the speech had not happened yet, and a fresh flourish.
 *
 * It is OTA-1402's defect wearing new clothes — the game knew it could not
 * deliver and said the payload anyway. The fix is to ask BEFORE speaking.
 */
import { topicGrantWouldDefer } from '../app/engine/dialogue';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const STORE = read('app', 'state', 'gameStore.ts');

describe('OTA-1437 — the look-ahead', () => {
  it('⚠⚠ only a LEAD can bounce, and only when one is already pending', () => {
    const lead = { lead: { hint: 'north valley', rewardTc: 20 } };
    expect(topicGrantWouldDefer(lead, true)).toBe(true);
    expect(topicGrantWouldDefer(lead, false)).toBe(false);
  });

  it('⚠⚠ whispers and coin NEVER defer — they always land', () => {
    // A duplicate whisper is skipped in silence and coin is coin. Deferring
    // either would withhold something that would have worked.
    expect(topicGrantWouldDefer({ whisper: 'chain_id' }, true)).toBe(false);
    expect(topicGrantWouldDefer({ tc: 25 }, true)).toBe(false);
    expect(topicGrantWouldDefer({ whisper: 'chain_id', tc: 25 }, true)).toBe(false);
  });

  it('⚠ a topic with no grants at all never defers', () => {
    expect(topicGrantWouldDefer(undefined, true)).toBe(false);
    expect(topicGrantWouldDefer({}, true)).toBe(false);
  });

  it('⚠⚠ NO authored topic pairs a lead with a whisper or a payment', () => {
    // This is what makes deferring the WHOLE topic safe. If it ever stops being
    // true, holding a topic back would silently withhold a whisper or coin that
    // would have landed — so it fails here rather than in someone's save.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('../app/data/npcs/dialogue_topics.json');
    const grants: Record<string, unknown>[] = [];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        const rec = o as Record<string, unknown>;
        if (rec.grants && typeof rec.grants === 'object') grants.push(rec.grants as Record<string, unknown>);
        Object.values(rec).forEach(walk);
      }
    };
    walk(data);
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      if (!g.lead) continue;
      expect({ lead: true, whisper: g.whisper ?? null, tc: g.tc ?? null })
        .toEqual({ lead: true, whisper: null, tc: null });
    }
  });
});

describe('OTA-1437 — the handler asks before it speaks', () => {
  it('⚠⚠ the deferral check comes BEFORE the reply is logged', () => {
    // The whole defect is ordering. Speaking first and checking second is what
    // put a nine-line reveal in front of "that has not happened yet", 25 times.
    const label = STORE.indexOf("get().appendLog('player', topic.label);");
    expect(label).toBeGreaterThan(-1);
    const check = STORE.indexOf('topicGrantWouldDefer(topic.grants,', label);
    const reply = STORE.indexOf('const reply = topicReply(topic, asked);', label);
    expect(check).toBeGreaterThan(label);
    expect(reply).toBeGreaterThan(check);
  });

  it('⚠⚠ it returns — no reply, no flourish, no spend', () => {
    const check = STORE.indexOf('topicGrantWouldDefer(topic.grants,');
    const ret = STORE.indexOf('return;', check);
    const flourish = STORE.indexOf('if (asked === 0) emitFlourish(', check);
    // The early return sits between the check and the flourish, so a deferred
    // raise cannot reach either the reply or the stage business.
    expect(ret).toBeGreaterThan(check);
    expect(ret).toBeLessThan(flourish);
  });

  it('⚠ it still SAYS something — a refusal that explains itself', () => {
    // OTA-1402's rule: the game must not know a thing and stay quiet about it.
    // The player learns there is something to come back for, and why not now.
    expect(STORE).toContain('has something worth hearing, but you are already chasing one lead');
    expect(STORE).toContain('Come back when your hands are free.');
  });

  it('⚠⚠ and the topic is STILL not spent, so the tip really does keep', () => {
    // OTA-1064's guarantee, unchanged: the deferral path never touches
    // talkedTopics, so the lead can genuinely be collected later.
    const check = STORE.indexOf('topicGrantWouldDefer(topic.grants,');
    const ret = STORE.indexOf('return;', check);
    const between = STORE.slice(check, ret);
    expect(between).not.toContain('talkedTopics');
  });

  it('⚠ the raise is still RECORDED — asking is a thing you did', () => {
    // The question already went into the player channel above; the turn is
    // recorded too, so the transcript shows the ask and the honest answer as a
    // pair rather than an answer arriving unprompted.
    const check = STORE.indexOf('topicGrantWouldDefer(topic.grants,');
    const ret = STORE.indexOf('return;', check);
    expect(STORE.slice(check, ret)).toContain('recordTalkTurn(set, t.npcId, topic.label, line);');
  });
});
