// CrucibleGuardModal — OTA-1552. The "are you sure about that?" the game never asked.
//
// ⚠⚠⚠ WHY THIS IS A PICKER AND NOT A YES/NO. The owner asked for it in one
// sentence: *"some of these items are for the crucible would you like to save
// them? and then I see you there get a pop-up asking which ones I want to save or
// a save all button for crucible."* A bare confirm would technically close the
// hole — he'd stop losing material without knowing — but it would put the whole
// decision on a single tap made at the worst possible moment, mid-repair, with a
// list of eight names he has to hold in his head. The picker lets the answer be
// partial, which is what the real answer usually is: keep the two curiosities you
// were saving, let the tar go.
//
// ⚠⚠ EVERYTHING IS TICKED WHEN IT OPENS. The guard only ever fires on material
// the Crucible would have taken, so "save it" is the answer that matches why the
// modal exists at all. Untick what you're happy to burn.
//
// ⚠ SPENDING IS THE ONLY DESTRUCTIVE BUTTON AND IT LOOKS LIKE ONE. It sits last,
// alone, in red. Nothing about tapping past this modal quickly ends with material
// gone: the backdrop and the hardware back close it as CANCEL, which spends and
// saves nothing.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, TouchableWithoutFeedback } from 'react-native';
import { useGameStore } from '../state/gameStore';

export function CrucibleGuardModal() {
  const prompt = useGameStore((s) => s.crucibleGuardPrompt);
  const resolve = useGameStore((s) => s.resolveCrucibleGuard);

  // Ticked = "save this one". Re-seeded every time a new guard is raised, so a
  // second prompt in the same REPAIR ALL never inherits the last one's ticks.
  const [ticked, setTicked] = useState<string[]>([]);
  const seed = useMemo(() => (prompt ? prompt.atRisk.map((a) => a.id).join('|') : ''), [prompt]);
  useEffect(() => {
    setTicked(prompt ? prompt.atRisk.map((a) => a.id) : []);
  }, [seed, prompt]);

  if (!prompt) return null;

  const atRisk = prompt.atRisk;
  const spendUnits = atRisk.reduce((sum, a) => sum + a.quantity, 0);
  const verb = prompt.action === 'repair' ? 'Repairing' : 'Crafting';
  const allTicked = ticked.length === atRisk.length;
  const noneTicked = ticked.length === 0;

  const toggle = (id: string) =>
    setTicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const close = () => resolve('cancel');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.card}>
              <Text style={styles.kicker}>♥ CRUCIBLE STOCK</Text>
              <Text style={styles.title}>Save these for the forge?</Text>
              <Text style={styles.body}>
                {verb} the {prompt.label} would spend {spendUnits}{' '}
                {spendUnits === 1 ? 'piece' : 'pieces'} of material the Fusing Crucible
                accepts. Tick what you want held back.
              </Text>

              <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
                {atRisk.map((a) => {
                  const on = ticked.includes(a.id);
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => toggle(a.id)}
                      style={[styles.row, on && styles.rowOn]}
                    >
                      <Text style={[styles.box, on && styles.boxOn]}>{on ? '♥' : '☐'}</Text>
                      <View style={styles.rowText}>
                        <Text style={[styles.rowName, on && styles.rowNameOn]}>{a.name}</Text>
                        <Text style={styles.rowMeta}>
                          {a.quantity} would be spent{a.held > a.quantity ? ` · you hold ${a.held}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.note}>
                Saving reserves the whole stack and stops here — nothing is mended and
                nothing is spent.
              </Text>

              <Pressable style={styles.saveAll} onPress={() => resolve('save-all')}>
                <Text style={styles.saveAllText}>♥ SAVE ALL FOR THE CRUCIBLE</Text>
              </Pressable>

              <Pressable
                style={[styles.saveSome, (noneTicked || allTicked) && styles.dim]}
                disabled={noneTicked || allTicked}
                onPress={() => resolve('save', ticked)}
              >
                <Text style={styles.saveSomeText}>
                  SAVE TICKED ({ticked.length}) · SPEND THE REST
                </Text>
              </Pressable>

              <View style={styles.footRow}>
                <Pressable style={styles.cancel} onPress={close}>
                  <Text style={styles.cancelText}>CANCEL</Text>
                </Pressable>
                <Pressable style={styles.spend} onPress={() => resolve('spend')}>
                  <Text style={styles.spendText}>SPEND IT ALL</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#161310',
    borderColor: '#8a6a2f',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  kicker: { color: '#d99b4e', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  title: { color: '#f0c96a', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  body: { color: '#c9bda9', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  list: { maxHeight: 220, marginBottom: 10 },
  listInner: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#3a332a',
    backgroundColor: '#1e1a15',
  },
  rowOn: { borderColor: '#a8763a', backgroundColor: '#2a2117' },
  box: { color: '#6c6255', fontSize: 15, width: 18, textAlign: 'center' },
  boxOn: { color: '#f0c96a' },
  rowText: { flex: 1 },
  rowName: { color: '#b9ae9c', fontSize: 13, fontWeight: '600' },
  rowNameOn: { color: '#f0c96a' },
  rowMeta: { color: '#7e7466', fontSize: 11 },
  note: { color: '#8b8172', fontSize: 11, fontStyle: 'italic', lineHeight: 16, marginBottom: 12 },
  saveAll: {
    backgroundColor: '#f0c96a',
    borderRadius: 5,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveAllText: { color: '#241a09', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  saveSome: {
    borderWidth: 1,
    borderColor: '#8a6a2f',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveSomeText: { color: '#d99b4e', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  dim: { opacity: 0.35 },
  footRow: { flexDirection: 'row', gap: 10 },
  cancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4a4238',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: '#9a9080', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  spend: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#7d3535',
    backgroundColor: '#2a1616',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  spendText: { color: '#d97a7a', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});
