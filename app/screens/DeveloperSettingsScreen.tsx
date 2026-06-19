// engine_Dev — Developer / Content-Pack console. Paste-JSON upload boxes for every
// content table and the three lore blocks (world / faction / race). Loading an
// override reskins the engine without code changes; "Reset" drops back to the
// built-in Tartaria pack. (Paste-JSON works on every platform with no native file
// dependency; a real file picker can be layered on the web/desktop builds later.)

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { useContentPackStore } from '../state/contentPackStore';
import {
  CONTENT_TABLES,
  LORE_BLOCKS,
  tableOverrideCount,
  hasLoreOverride,
  getWorldTone,
  type ContentTableId,
  type LoreBlockId,
} from '../engine/contentPack';

type Status = { kind: 'ok' | 'err'; msg: string } | null;

function TableBox({ id, label, hint }: { id: ContentTableId; label: string; hint: string }) {
  const loadTableJson = useContentPackStore((s) => s.loadTableJson);
  const clearTable = useContentPackStore((s) => s.clearTable);
  const count = useContentPackStore((s) => s.tables[id]?.length ?? 0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={count > 0 ? styles.badgeOn : styles.badgeOff}>
          {count > 0 ? `● override · ${count} rows` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste table JSON here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadTableJson(id, text);
            setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} rows.` } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        {tableOverrideCount(id) > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={() => { clearTable(id); setStatus({ kind: 'ok', msg: 'Reset to built-in.' }); }}>
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

function LoreBox({ id, label, hint }: { id: LoreBlockId; label: string; hint: string }) {
  const loadLoreJson = useContentPackStore((s) => s.loadLoreJson);
  const clearLore = useContentPackStore((s) => s.clearLore);
  const on = useContentPackStore((s) => s.lore[id] != null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={on ? styles.badgeOn : styles.badgeOff}>{on ? '● override' : '○ built-in'}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
      {id === 'world' && <Text style={styles.toneLine}>Active tone: “{getWorldTone()}”</Text>}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste lore JSON here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadLoreJson(id, text);
            setStatus(r.ok ? { kind: 'ok', msg: 'Loaded.' } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        {hasLoreOverride(id) && (
          <TouchableOpacity style={styles.resetBtn} onPress={() => { clearLore(id); setStatus({ kind: 'ok', msg: 'Reset to built-in.' }); }}>
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

export function DeveloperSettingsScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const clearAll = useContentPackStore((s) => s.clearAll);
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('title')}>
          <Text style={styles.backText}>‹ BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CONTENT PACKS</Text>
        <View style={{ width: 70 }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.blurb}>
          This is the engine's developer console. Paste a JSON table or lore block to override the
          built-in Tartaria content at runtime — reskin the engine into a different game with no
          code changes. Empty boxes use the built-in defaults.
        </Text>

        <Text style={styles.sectionLabel}>LORE</Text>
        {LORE_BLOCKS.map((b) => <LoreBox key={b.id} id={b.id} label={b.label} hint={b.hint} />)}

        <Text style={styles.sectionLabel}>TABLES</Text>
        {CONTENT_TABLES.map((t) => <TableBox key={t.id} id={t.id} label={t.label} hint={t.hint} />)}

        <TouchableOpacity style={styles.resetAll} onPress={() => clearAll()}>
          <Text style={styles.resetAllText}>RESET EVERYTHING TO TARTARIA</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0c0b', paddingHorizontal: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 6, minWidth: 70 },
  backText: { color: '#c9a86a', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#c9a86a', fontSize: 15, fontWeight: '700', letterSpacing: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  blurb: { color: '#9a8f78', fontSize: 12, lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  sectionLabel: { color: '#7a705c', fontSize: 11, fontWeight: '700', letterSpacing: 3, marginTop: 12, marginBottom: 6 },
  card: { backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 10, marginBottom: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  badgeOn: { color: '#9ec96a', fontSize: 10, fontWeight: '700' },
  badgeOff: { color: '#7a705c', fontSize: 10 },
  hint: { color: '#7a705c', fontSize: 10, marginTop: 3, lineHeight: 14 },
  toneLine: { color: '#b88ce0', fontSize: 11, marginTop: 5, fontStyle: 'italic', lineHeight: 15 },
  input: {
    color: '#e6d8b3', backgroundColor: '#0a0908', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
    padding: 8, marginTop: 6, minHeight: 70, maxHeight: 160, fontSize: 11, fontFamily: 'monospace', textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  loadBtn: { backgroundColor: '#2a3a22', borderColor: '#9ec96a', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 18 },
  loadBtnText: { color: '#9ec96a', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  resetBtn: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  resetBtnText: { color: '#a89a7a', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  ok: { color: '#9ec96a', fontSize: 11, marginTop: 6 },
  err: { color: '#e07a5f', fontSize: 11, marginTop: 6 },
  resetAll: { marginTop: 18, borderColor: '#e07a5f', borderWidth: 1, borderRadius: 4, paddingVertical: 12, alignItems: 'center' },
  resetAllText: { color: '#e07a5f', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
});
