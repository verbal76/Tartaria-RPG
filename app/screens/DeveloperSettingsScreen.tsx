// engine_Dev — Developer / Content-Pack console. Paste-JSON upload boxes for every
// content table and the three lore blocks (world / faction / race). Loading an
// override reskins the engine without code changes; "Reset" drops back to the
// built-in Tartaria pack. (Paste-JSON works on every platform with no native file
// dependency; a real file picker can be layered on the web/desktop builds later.)

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../state/gameStore';
import { useContentPackStore } from '../state/contentPackStore';
import {
  CONTENT_TABLES,
  LORE_BLOCKS,
  tableOverrideCount,
  hasTableOverride,
  hasLoreOverride,
  hasNarratorNameOverride,
  hasGameTitleOverride,
  hasGameTaglineOverride,
  getWorldTone,
  getNarratorName,
  getGameTitle,
  getGameTagline,
  DEFAULT_NARRATOR_NAME,
  DEFAULT_GAME_TITLE,
  type ContentTableId,
  type LoreBlockId,
} from '../engine/contentPack';
import { getTableTemplate, getLoreTemplate, TEMPLATE_SAMPLE_ROWS } from '../engine/contentTemplates';
import { getRaces, getFactions } from '../engine/character';
import { OTA_BUILD_ID } from '../buildInfo';
import { useCustomMusicStore } from '../state/customMusicStore';
import { MAX_TRACKS_PER_CATEGORY, RECOMMENDED_AUDIO_SPECS, type MusicCategory } from '../audio/customMusic';

/** Build a full content-pack diagnostic snapshot (store vs engine registry vs the
 *  raw persisted blob) so a paste can pinpoint any desync. */
async function buildContentDiagnostics(): Promise<string> {
  const s = useContentPackStore.getState();
  let rawPersisted = '(read failed)';
  try { rawPersisted = (await AsyncStorage.getItem('tartaria.contentPack.v1')) ?? '(none)'; } catch { /* ignore */ }
  const registry: Record<string, number> = {};
  for (const t of CONTENT_TABLES) registry[t.id] = hasTableOverride(t.id) ? tableOverrideCount(t.id) : 0;
  const diag = {
    build: OTA_BUILD_ID,
    hydrated: s.hydrated,
    contentVersion: s.contentVersion,
    devMode: s.devMode,
    published: s.published,
    store_tables: Object.fromEntries(Object.entries(s.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : `NON-ARRAY:${typeof v}`])),
    store_lore: Object.keys(s.lore),
    registry_counts: registry,
    engine_reads: {
      races: getRaces().map((r) => r.name),
      factions: getFactions().map((f) => f.name),
      narrator: getNarratorName(),
      gameTitle: getGameTitle(),
    },
    persisted_blob_length: rawPersisted.length,
    persisted_blob_head: rawPersisted.slice(0, 400),
  };
  return JSON.stringify(diag, null, 2);
}

type Status = { kind: 'ok' | 'err'; msg: string } | null;

/** Generic single-line rename card (narrator name, game title, tagline). */
function RenameBox({
  title, hint, defaultLabel, active, isCustom, initial, placeholder, multiline, autoCapitalize, maxLength, onSave,
}: {
  title: string;
  hint: string;
  /** Shown in the badge + RESET copy as the fallback name. */
  defaultLabel: string;
  /** The currently-resolved value (after fallbacks). */
  active: string;
  isCustom: boolean;
  /** The raw stored override text to seed the input. */
  initial: string;
  placeholder: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  maxLength?: number;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={isCustom ? styles.badgeOn : styles.badgeOff}>
          {isCustom ? '● custom' : '○ default'}
        </Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
      <Text style={styles.toneLine}>Currently: “{active}”</Text>
      <TextInput
        style={[styles.input, !multiline && { minHeight: 0 }]}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor="#5c5446"
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        maxLength={maxLength ?? 60}
        multiline={multiline}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            onSave(text);
            const finalName = text.trim().length > 0 ? text.trim() : defaultLabel;
            setStatus({ kind: 'ok', msg: `Saved — now “${finalName}”.` });
          }}
        >
          <Text style={styles.loadBtnText}>SAVE</Text>
        </TouchableOpacity>
        {isCustom && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => { onSave(''); setText(''); setStatus({ kind: 'ok', msg: 'Reset to default.' }); }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

function GameIdentitySection() {
  const gameTitle = useContentPackStore((s) => s.gameTitle);
  const gameTagline = useContentPackStore((s) => s.gameTagline);
  const narratorName = useContentPackStore((s) => s.narratorName);
  const setGameTitle = useContentPackStore((s) => s.setGameTitle);
  const setGameTagline = useContentPackStore((s) => s.setGameTagline);
  const setNarratorName = useContentPackStore((s) => s.setNarratorName);
  return (
    <>
      <Text style={styles.sectionLabel}>GAME</Text>
      <RenameBox
        title="Game name"
        hint="Shown big under the icon on the start screen. Leave blank for the default."
        defaultLabel={DEFAULT_GAME_TITLE}
        active={getGameTitle()}
        isCustom={hasGameTitleOverride()}
        initial={gameTitle}
        placeholder={DEFAULT_GAME_TITLE}
        autoCapitalize="words"
        maxLength={40}
        onSave={setGameTitle}
      />
      <RenameBox
        title="Tagline"
        hint="The line under the title. Auto-fills from your World lore’s “tagline” field once you upload one; set it here to override."
        defaultLabel="the default"
        active={getGameTagline()}
        isCustom={hasGameTaglineOverride()}
        initial={gameTagline}
        placeholder={getGameTagline()}
        autoCapitalize="sentences"
        maxLength={120}
        multiline
        onSave={setGameTagline}
      />

      <Text style={styles.sectionLabel}>NARRATOR</Text>
      <RenameBox
        title="Narrator name"
        hint="The voice that narrates the game — renamed everywhere the player sees or hears it, and in how the storyteller refers to itself."
        defaultLabel={DEFAULT_NARRATOR_NAME}
        active={getNarratorName()}
        isCustom={hasNarratorNameOverride()}
        initial={narratorName}
        placeholder={DEFAULT_NARRATOR_NAME}
        autoCapitalize="words"
        maxLength={40}
        onSave={setNarratorName}
      />
    </>
  );
}

function MusicBox({ category, label, hint }: { category: MusicCategory; label: string; hint: string }) {
  const tracks = useCustomMusicStore((s) => (category === 'battle' ? s.battle : s.ambient));
  const addFromPicker = useCustomMusicStore((s) => s.addFromPicker);
  const removeTrack = useCustomMusicStore((s) => s.remove);
  const clearCategory = useCustomMusicStore((s) => s.clearCategory);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const full = tracks.length >= MAX_TRACKS_PER_CATEGORY;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={tracks.length > 0 ? styles.badgeOn : styles.badgeOff}>
          {tracks.length} / {MAX_TRACKS_PER_CATEGORY}
        </Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
      <Text style={styles.specLine}>{RECOMMENDED_AUDIO_SPECS}</Text>
      {tracks.map((t) => (
        <View key={t.id} style={styles.trackRow}>
          <Text style={styles.trackName} numberOfLines={1}>♪ {t.name}</Text>
          <TouchableOpacity style={styles.trackRemove} onPress={() => { removeTrack(category, t.id); setStatus({ kind: 'ok', msg: `Removed “${t.name}”.` }); }}>
            <Text style={styles.trackRemoveText}>REMOVE</Text>
          </TouchableOpacity>
        </View>
      ))}
      {tracks.length === 0 && <Text style={styles.emptyLine}>No uploads — the built-in score plays here.</Text>}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.loadBtn, (full || busy) && styles.btnDisabled]}
          disabled={full || busy}
          onPress={async () => {
            setBusy(true);
            const r = await addFromPicker(category);
            setBusy(false);
            if (r.canceled) return;
            setStatus(r.ok ? { kind: 'ok', msg: 'Track added.' } : { kind: 'err', msg: r.error ?? 'Failed.' });
          }}
        >
          <Text style={styles.loadBtnText}>{busy ? 'ADDING…' : full ? 'LIMIT REACHED' : '＋ ADD TRACK'}</Text>
        </TouchableOpacity>
        {tracks.length > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={() => { clearCategory(category); setStatus({ kind: 'ok', msg: 'Cleared — built-in score restored.' }); }}>
            <Text style={styles.resetBtnText}>CLEAR ALL</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

function TableBox({ id, label, hint }: { id: ContentTableId; label: string; hint: string }) {
  const loadTableJson = useContentPackStore((s) => s.loadTableJson);
  const clearTable = useContentPackStore((s) => s.clearTable);
  const count = useContentPackStore((s) => s.tables[id]?.length ?? 0);
  const current = useContentPackStore((s) => s.tables[id]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  // engine_Dev — TEMPLATE shows YOUR current upload (full, editable) when one is
  // loaded so you never lose work or have to retype it; otherwise the built-in
  // sample. The button relabels to EDIT CURRENT so it's obvious which you'll get.
  const hasUpload = Array.isArray(current) && current.length > 0;
  const templateText = () => (hasUpload ? JSON.stringify(current, null, 2) : getTableTemplate(id));
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
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(templateText());
            setStatus({ kind: 'ok', msg: hasUpload
              ? `Loaded your current ${count} uploaded rows — edit, then LOAD to save changes.`
              : `Loaded the first ${TEMPLATE_SAMPLE_ROWS} built-in rows as a template — edit, then LOAD.` });
          }}
        >
          <Text style={styles.tmplBtnText}>{hasUpload ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : templateText();
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: hasUpload
              ? 'Copied your current upload to the clipboard and cleared the box.'
              : 'Copied to clipboard and cleared the box — paste your filled-in JSON here, then LOAD.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
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
  const current = useContentPackStore((s) => s.lore[id]);
  const on = current != null;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  // engine_Dev — show YOUR current upload (full, editable) when one is loaded.
  const templateText = () => (on ? JSON.stringify(current, null, 2) : getLoreTemplate(id));
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
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(templateText());
            setStatus({ kind: 'ok', msg: on
              ? 'Loaded your current upload — edit, then LOAD to save changes.'
              : 'Loaded a template — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{on ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : templateText();
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: on
              ? 'Copied your current upload to the clipboard and cleared the box.'
              : 'Copied to clipboard and cleared the box — paste your filled-in JSON here, then LOAD.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
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

export function DeveloperConsole({ embedded = false }: { embedded?: boolean }) {
  const setScreen = useGameStore((s) => s.setScreen);
  const clearAll = useContentPackStore((s) => s.clearAll);
  const published = useContentPackStore((s) => s.published);
  const publish = useContentPackStore((s) => s.publish);
  const unpublish = useContentPackStore((s) => s.unpublish);
  const setDevMode = useContentPackStore((s) => s.setDevMode);
  const reapply = useContentPackStore((s) => s.reapply);
  const [confirmPub, setConfirmPub] = useState(false);
  const [confirmDevOff, setConfirmDevOff] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  // engine_Dev — re-read when the pack changes so the banner stays accurate.
  useContentPackStore((s) => s.contentVersion);
  const racesLoaded = hasTableOverride('races');
  const factionsLoaded = hasTableOverride('factions');

  return (
    <>
      {(!racesLoaded || !factionsLoaded) && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerTitle}>⚠ PLAYABLE TABLES (character creation)</Text>
          <Text style={styles.warnBannerLine}>
            Races: {racesLoaded ? `● ${tableOverrideCount('races')} loaded` : '○ built-in (Tartaria) — load yours in the “Races (playable…)” box under TABLES'}
          </Text>
          <Text style={styles.warnBannerLine}>
            Factions: {factionsLoaded ? `● ${tableOverrideCount('factions')} loaded` : '○ built-in (Tartaria) — load yours in the “Factions (playable…)” box under TABLES'}
          </Text>
          <Text style={styles.warnBannerNote}>
            These are TABLE boxes, not the “Race lore / Faction lore” boxes. Until they’re loaded,
            character creation shows the built-in races/factions.
          </Text>
        </View>
      )}
      {!embedded && (
        <Text style={styles.blurb}>
          This is the engine's developer console. Hit TEMPLATE on any box to drop in the first
          couple of built-in (Tartaria) rows as a starter schema, edit them into your own game,
          then LOAD to override at runtime — reskin the engine with no code changes. Empty boxes
          use the built-in defaults.
        </Text>
      )}

      {/* engine_Dev — APPLY ALL: re-read every uploaded pack into the live engine. */}
      <TouchableOpacity
        style={styles.applyBtn}
        onPress={() => {
          reapply();
          setApplyMsg('Applied — the engine re-read every uploaded JSON. Start a NEW game to see world/character/enemy changes.');
        }}
      >
        <Text style={styles.applyBtnText}>↻ APPLY ALL — re-read every JSON</Text>
      </TouchableOpacity>
      <Text style={styles.publishNote}>
        Forces the engine to re-read every uploaded pack right now. Uploads already apply as you
        LOAD them; this is the “make sure everything’s live” switch. A game already in progress
        keeps the content it was created with — start a NEW game (or new character) to see world,
        race/faction, enemy, and location changes.
      </Text>
      {applyMsg && <Text style={styles.ok}>{applyMsg}</Text>}

      {/* engine_Dev — COPY DIAGNOSTICS: dumps store vs registry vs persisted blob
          to the clipboard so the dev can paste it for analysis. */}
      <TouchableOpacity
        style={styles.copyBtn}
        onPress={async () => {
          const dump = await buildContentDiagnostics();
          await Clipboard.setStringAsync(dump);
          setApplyMsg('Diagnostics copied to clipboard — paste them back to share the exact engine state.');
        }}
      >
        <Text style={styles.copyBtnText}>⧉ COPY DIAGNOSTICS</Text>
      </TouchableOpacity>

      <GameIdentitySection />

      <Text style={styles.sectionLabel}>LORE</Text>
      {LORE_BLOCKS.map((b) => <LoreBox key={b.id} id={b.id} label={b.label} hint={b.hint} />)}

      <Text style={styles.sectionLabel}>TABLES</Text>
      {CONTENT_TABLES.map((t) => <TableBox key={t.id} id={t.id} label={t.label} hint={t.hint} />)}

      <Text style={styles.sectionLabel}>MUSIC</Text>
      <MusicBox
        category="battle"
        label="Battle Music"
        hint="Plays during combat and boss fights. Uploads replace the built-in battle score."
      />
      <MusicBox
        category="ambient"
        label="Ambient Music"
        hint="Plays while exploring. Uploads replace the built-in exploration score."
      />

      <Text style={styles.sectionLabel}>FAMILY BUILD</Text>
      {!published ? (
        <>
          <TouchableOpacity
            style={styles.publishBtn}
            onPress={() => {
              if (!confirmPub) { setConfirmPub(true); return; }
              publish();
              setConfirmPub(false);
              if (!embedded) setScreen('title');
            }}
          >
            <Text style={styles.publishBtnText}>
              {confirmPub ? 'TAP AGAIN — HIDE THE DEV PILL FOR A FAMILY BUILD' : '★ PUBLISH (hide dev for testers)'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.publishNote}>
            Hides the title DEV pill so testers see a clean game. You keep your way back in —
            name a character “Verbal” to return here anytime — so you can keep editing after
            their feedback. (This only hides the pill; full removal happens at the signed
            go-live build.)
          </Text>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.unpublishBtn} onPress={() => { unpublish(); setConfirmPub(false); }}>
            <Text style={styles.unpublishBtnText}>↺ UN-PUBLISH — show the DEV pill again</Text>
          </TouchableOpacity>
          <Text style={styles.publishNote}>
            The DEV pill is hidden (family build). You're still in via the “Verbal” backdoor.
            Tap above to bring the pill back while you keep iterating.
          </Text>
        </>
      )}

      <Text style={styles.sectionLabel}>DEV MODE</Text>
      <TouchableOpacity
        style={styles.unpublishBtn}
        onPress={() => {
          if (!confirmDevOff) { setConfirmDevOff(true); return; }
          setDevMode(false);
          setConfirmDevOff(false);
          if (!embedded) setScreen('title');
        }}
      >
        <Text style={styles.unpublishBtnText}>
          {confirmDevOff ? 'TAP AGAIN — TURN OFF DEV MODE' : '⏻ TURN OFF DEV MODE'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.publishNote}>
        While dev mode is on, this console is the first tab in Settings and opens by default.
        Turn it off for a clean Settings screen. To get back in any time, create a character
        named “Verbal”.
      </Text>

      <TouchableOpacity style={styles.resetAll} onPress={() => clearAll()}>
        <Text style={styles.resetAllText}>RESET EVERYTHING TO TARTARIA</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </>
  );
}

export function DeveloperSettingsScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
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
        <DeveloperConsole />
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
  specLine: { color: '#6a9bbf', fontSize: 10, marginTop: 5, lineHeight: 14, fontStyle: 'italic' },
  toneLine: { color: '#b88ce0', fontSize: 11, marginTop: 5, fontStyle: 'italic', lineHeight: 15 },
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, backgroundColor: '#0a0908', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  trackName: { color: '#e6d8b3', fontSize: 12, flex: 1, marginRight: 8 },
  trackRemove: { borderColor: '#e07a5f', borderWidth: 1, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8 },
  trackRemoveText: { color: '#e07a5f', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  emptyLine: { color: '#5c5446', fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  btnDisabled: { opacity: 0.4 },
  input: {
    color: '#e6d8b3', backgroundColor: '#0a0908', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
    padding: 8, marginTop: 6, minHeight: 70, maxHeight: 160, fontSize: 11, fontFamily: 'monospace', textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  loadBtn: { backgroundColor: '#2a3a22', borderColor: '#9ec96a', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 18 },
  loadBtnText: { color: '#9ec96a', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  tmplBtn: { backgroundColor: '#1a1714', borderColor: '#6a9bbf', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  tmplBtnText: { color: '#6a9bbf', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  copyBtn: { backgroundColor: '#1a1714', borderColor: '#cdbf99', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  copyBtnText: { color: '#cdbf99', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  resetBtn: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  resetBtnText: { color: '#a89a7a', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  ok: { color: '#9ec96a', fontSize: 11, marginTop: 6 },
  err: { color: '#e07a5f', fontSize: 11, marginTop: 6 },
  applyBtn: { marginTop: 4, marginBottom: 2, backgroundColor: '#243a3f', borderColor: '#6ad0c9', borderWidth: 1, borderRadius: 4, paddingVertical: 13, alignItems: 'center' },
  warnBanner: { backgroundColor: '#2a2410', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, padding: 10, marginBottom: 10 },
  warnBannerTitle: { color: '#e6c96a', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  warnBannerLine: { color: '#e6d8b3', fontSize: 11, lineHeight: 16, marginTop: 2 },
  warnBannerNote: { color: '#a89776', fontSize: 10, lineHeight: 14, marginTop: 6, fontStyle: 'italic' },
  applyBtnText: { color: '#7fe3da', fontSize: 13, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  publishBtn: { marginTop: 6, backgroundColor: '#2a3a22', borderColor: '#9ec96a', borderWidth: 1, borderRadius: 4, paddingVertical: 12, alignItems: 'center' },
  publishBtnText: { color: '#9ec96a', fontSize: 12, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  publishNote: { color: '#7a705c', fontSize: 10, lineHeight: 14, marginTop: 6, fontStyle: 'italic' },
  unpublishBtn: { marginTop: 6, backgroundColor: '#1a1714', borderColor: '#6a9bbf', borderWidth: 1, borderRadius: 4, paddingVertical: 12, alignItems: 'center' },
  unpublishBtnText: { color: '#6a9bbf', fontSize: 12, fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  resetAll: { marginTop: 18, borderColor: '#e07a5f', borderWidth: 1, borderRadius: 4, paddingVertical: 12, alignItems: 'center' },
  resetAllText: { color: '#e07a5f', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
});
