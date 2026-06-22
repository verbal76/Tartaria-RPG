// engine_Dev — Developer / Content-Pack console. Paste-JSON upload boxes for every
// content table and the three lore blocks (world / faction / race). Loading an
// override reskins the engine without code changes; "Reset" drops back to the
// built-in Tartaria pack. (Paste-JSON works on every platform with no native file
// dependency; a real file picker can be layered on the web/desktop builds later.)

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../state/gameStore';
import { useContentPackStore, type LoadResult } from '../state/contentPackStore';
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
  getCrucibleName,
  hasCrucibleNameOverride,
  getWorldName,
  hasWorldNameOverride,
  getCorruptionName,
  hasCorruptionNameOverride,
  DEFAULT_NARRATOR_NAME,
  DEFAULT_GAME_TITLE,
  DEFAULT_CRUCIBLE_NAME,
  DEFAULT_WORLD_NAME,
  DEFAULT_CORRUPTION_NAME,
  type ContentTableId,
  type LoreBlockId,
} from '../engine/contentPack';
import { getTableTemplate, getLoreTemplate, buildGameBundleTemplate, buildMissionsTemplate, buildHooksTemplate, buildWhispersTemplate, buildWastelandTemplate, buildInteractionTagsTemplate, buildStartingAreasTemplate, buildTitlesTemplate, buildCollectablesTemplate, buildSummonsTemplate, buildDevGuide, TEMPLATE_SAMPLE_ROWS } from '../engine/contentTemplates';
import { TRACKABLE_VARS } from '../engine/customTitles';
import { MAIN_QUEST_ACTIONS, mainQuestLocations, describeStep, type MainQuestStep } from '../engine/customMainQuest';
import { BOSS_SPAWN_CONDITIONS, mainQuestBosses, type CustomBoss } from '../engine/customBosses';
import { getRaces, getFactions } from '../engine/character';
import { OTA_BUILD_ID } from '../buildInfo';
import { useCustomMusicStore } from '../state/customMusicStore';
import { useCustomMapsStore } from '../state/customMapsStore';
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
  const crucibleName = useContentPackStore((s) => s.crucibleName);
  const crucibleEnabled = useContentPackStore((s) => s.crucibleEnabled);
  const setCrucibleName = useContentPackStore((s) => s.setCrucibleName);
  const setCrucibleEnabledFn = useContentPackStore((s) => s.setCrucibleEnabled);
  const worldName = useContentPackStore((s) => s.worldName);
  const setWorldName = useContentPackStore((s) => s.setWorldName);
  const corruptionName = useContentPackStore((s) => s.corruptionName);
  const setCorruptionName = useContentPackStore((s) => s.setCorruptionName);
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

      <Text style={styles.sectionLabel}>WORLD</Text>
      <RenameBox
        title="World name"
        hint="The setting's proper noun. The built-in narration says “Tartaria” in dozens of lines (“…full of objects waiting to be remembered”); set yours and the engine swaps it everywhere the player reads it. In your JSON you can also write {world}. Leave blank to keep Tartaria."
        defaultLabel={DEFAULT_WORLD_NAME}
        active={getWorldName()}
        isCustom={hasWorldNameOverride()}
        initial={worldName}
        placeholder={DEFAULT_WORLD_NAME}
        autoCapitalize="words"
        maxLength={40}
        onSave={setWorldName}
      />
      <RenameBox
        title="Corruption / affliction name"
        hint="The plague mechanic the engine calls “Corruption” (the stat that builds up and penalizes you). Rename it for your world — Phase-Sickness, Chronal Decay, Static-burn — and the word + the player-sheet label + the threshold lines all use it. In your JSON, write {corruption}. Rename the three tiers in the World-lore block: corruptionTiers: { tainted, corrupted, hollowed }."
        defaultLabel={DEFAULT_CORRUPTION_NAME}
        active={getCorruptionName()}
        isCustom={hasCorruptionNameOverride()}
        initial={corruptionName}
        placeholder={DEFAULT_CORRUPTION_NAME}
        autoCapitalize="words"
        maxLength={40}
        onSave={setCorruptionName}
      />

      <Text style={styles.sectionLabel}>NARRATOR</Text>
      <RenameBox
        title="Narrator name"
        hint="The voice that narrates the game — renamed everywhere the player sees or hears it, and in how the storyteller refers to itself. In your JSON, write {narrator} (or {arbiter}) in any line and it fills in this name."
        defaultLabel={DEFAULT_NARRATOR_NAME}
        active={getNarratorName()}
        isCustom={hasNarratorNameOverride()}
        initial={narratorName}
        placeholder={DEFAULT_NARRATOR_NAME}
        autoCapitalize="words"
        maxLength={40}
        onSave={setNarratorName}
      />

      <Text style={styles.sectionLabel}>FEATURES</Text>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Item fusion ({getCrucibleName()})</Text>
          <Text style={crucibleEnabled ? styles.badgeOn : styles.badgeOff}>
            {crucibleEnabled ? '● on' : '○ disabled'}
          </Text>
        </View>
        <Text style={styles.hint}>
          The fusion feature lets players reserve items and forge them into a unique piece — the
          built-in “{DEFAULT_CRUCIBLE_NAME}”. Rename it for your world, or turn it off entirely if
          your game has no item fusion (the chip, the vendor offer, and the fuse action all
          disappear).
        </Text>
        <TouchableOpacity
          style={[styles.applyBtn, !crucibleEnabled && styles.resetBtn]}
          onPress={() => setCrucibleEnabledFn(!crucibleEnabled)}
        >
          <Text style={crucibleEnabled ? styles.applyBtnText : styles.resetBtnText}>
            {crucibleEnabled ? `✓ ${getCrucibleName()} ENABLED — tap to DISABLE` : `✕ DISABLED — tap to ENABLE`}
          </Text>
        </TouchableOpacity>
      </View>
      <RenameBox
        title="Fusion feature name"
        hint="What the fusion station is called everywhere the player sees it (chip, vendor offer, narration). In your JSON, write {crucible} (or {fuse}) in any line and it fills in this name. Leave blank for “Crucible”."
        defaultLabel={DEFAULT_CRUCIBLE_NAME}
        active={getCrucibleName()}
        isCustom={hasCrucibleNameOverride()}
        initial={crucibleName}
        placeholder={DEFAULT_CRUCIBLE_NAME}
        autoCapitalize="words"
        maxLength={40}
        onSave={setCrucibleName}
      />
    </>
  );
}

// engine_Dev — MAPS upload. A world map image (the overworld backdrop) + an
// optional per-faction starting-area map, plus the world's coordinate size so
// location pins can be plotted on the uploaded image.
function MapsSection() {
  const worldMap = useCustomMapsStore((s) => s.worldMap);
  const factionMaps = useCustomMapsStore((s) => s.factionMaps);
  const worldWidth = useCustomMapsStore((s) => s.worldWidth);
  const worldHeight = useCustomMapsStore((s) => s.worldHeight);
  const pickWorldMap = useCustomMapsStore((s) => s.pickWorldMap);
  const pickFactionMap = useCustomMapsStore((s) => s.pickFactionMap);
  const clearWorldMap = useCustomMapsStore((s) => s.clearWorldMap);
  const clearFactionMap = useCustomMapsStore((s) => s.clearFactionMap);
  const setWorldSize = useCustomMapsStore((s) => s.setWorldSize);
  const [w, setW] = useState(String(worldWidth));
  const [h, setH] = useState(String(worldHeight));
  const [status, setStatus] = useState<Status>(null);
  const factions = getFactions();
  const onPick = async (fn: () => Promise<{ ok: boolean; error?: string; canceled?: boolean }>, label: string) => {
    const r = await fn();
    if (r.canceled) return;
    setStatus(r.ok ? { kind: 'ok', msg: `${label} uploaded.` } : { kind: 'err', msg: r.error ?? 'Failed.' });
  };
  return (
    <View style={styles.card}>
      <Text style={styles.hint}>
        Upload your own map art. The world map is the overworld backdrop; each faction can have its
        own starting-area map (shown while a member is in their base). The Tartaria map art has been
        removed — with nothing uploaded, the map shows a neutral grid. Set the world size (the
        coordinate space your location x/y values are in) so pins plot correctly. PNG / JPG / WEBP.
      </Text>

      {/* World map */}
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>World map</Text>
        <Text style={worldMap ? styles.badgeOn : styles.badgeOff}>{worldMap ? '● uploaded' : '○ none'}</Text>
      </View>
      <View style={styles.row}>
        <TouchableOpacity style={styles.loadBtn} onPress={() => void onPick(pickWorldMap, 'World map')}>
          <Text style={styles.loadBtnText}>{worldMap ? 'REPLACE IMAGE' : '⬆ UPLOAD WORLD MAP'}</Text>
        </TouchableOpacity>
        {worldMap && (
          <TouchableOpacity style={styles.resetBtn} onPress={() => { clearWorldMap(); setStatus({ kind: 'ok', msg: 'World map removed.' }); }}>
            <Text style={styles.resetBtnText}>REMOVE</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* World grid size */}
      <Text style={[styles.hint, { marginTop: 10 }]}>
        Grid size. WIDTH = number of columns (left→right), HEIGHT = number of rows (top→bottom). The
        map screen draws this grid (over your map if one is uploaded, or on its own if not) and
        plots each location’s number in its square. Give each location a "x" (column, 1…width) and
        "y" (row, 1…height) field in the Locations table; (1,1) is the top-left square.
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.specLine}>WIDTH (columns)</Text>
          <TextInput
            style={[styles.input, { minHeight: 0 }]}
            value={w}
            onChangeText={setW}
            placeholder="columns"
            placeholderTextColor="#5c5446"
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.specLine}>HEIGHT (rows)</Text>
          <TextInput
            style={[styles.input, { minHeight: 0 }]}
            value={h}
            onChangeText={setH}
            placeholder="rows"
            placeholderTextColor="#5c5446"
            keyboardType="number-pad"
          />
        </View>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            const nw = parseInt(w, 10); const nh = parseInt(h, 10);
            if (!nw || !nh || nw < 1 || nh < 1) { setStatus({ kind: 'err', msg: 'Enter positive width and height.' }); return; }
            setWorldSize(nw, nh);
            setStatus({ kind: 'ok', msg: `World size set to ${nw} × ${nh}.` });
          }}
        >
          <Text style={styles.tmplBtnText}>SET SIZE</Text>
        </TouchableOpacity>
      </View>

      {/* Per-faction starting-area maps */}
      <Text style={[styles.sectionLabel, { marginTop: 14 }]}>FACTION STARTING-AREA MAPS</Text>
      {factions.map((f) => {
        const has = !!factionMaps[f.id];
        return (
          <View key={f.id} style={styles.trackRow}>
            <Text style={styles.trackName} numberOfLines={1}>{has ? '🗺 ' : '○ '}{f.name}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={() => void onPick(() => pickFactionMap(f.id), `${f.name} map`)}>
              <Text style={styles.copyBtnText}>{has ? 'REPLACE' : 'UPLOAD'}</Text>
            </TouchableOpacity>
            {has && (
              <TouchableOpacity style={styles.trackRemove} onPress={() => { clearFactionMap(f.id); setStatus({ kind: 'ok', msg: `${f.name} map removed.` }); }}>
                <Text style={styles.resetBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
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
            const skip = r.skipped && r.skipped.length > 0 ? ` (skipped ${r.skipped.length})` : '';
            setStatus(r.ok ? { kind: 'ok', msg: `Added ${r.added ?? 1} track${(r.added ?? 1) === 1 ? '' : 's'}${skip}.` } : { kind: 'err', msg: r.error ?? 'Failed.' });
          }}
        >
          <Text style={styles.loadBtnText}>{busy ? 'ADDING…' : full ? 'LIMIT REACHED' : '＋ ADD TRACKS'}</Text>
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

// engine_Dev — WHOLE-GAME file. One JSONC file holding every section (tables +
// lore + title/tagline/narrator). Two actions: SAVE FILE TO DEVICE (the blank
// commented template while empty, else your built game) and UPLOAD FILE FROM
// DEVICE; plus a RESET that wipes all uploads back to the built-in defaults.
function GameBundleBox() {
  const loadGameBundle = useContentPackStore((s) => s.loadGameBundle);
  const [status, setStatus] = useState<Status>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // engine_Dev — does the author have ANYTHING loaded yet? exportGameBundle emits
  // only the sections that have been uploaded, so an empty game serialises to "{}".
  const hasContent = (): boolean => {
    try { return Object.keys(JSON.parse(useContentPackStore.getState().exportGameBundle())).length > 0; }
    catch { return false; }
  };

  // engine_Dev — SAVE to a file on the device. Smart: if the author has loaded
  // anything, save THEIR game (the file they hand back for an APK bake); if the
  // game is still empty, save the blank fillable TEMPLATE to start from. One button,
  // the right file either way.
  const saveToDevice = async () => {
    const built = hasContent();
    const out = built ? useContentPackStore.getState().exportGameBundle() : buildGameBundleTemplate();
    const filename = built ? 'my-game.json' : 'game-template.json';
    const what = built ? 'your game' : 'the blank template';
    try {
      if (Platform.OS === 'android') {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perm.granted) { setStatus({ kind: 'err', msg: 'Save cancelled — no folder chosen.' }); return; }
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, filename, 'application/json');
        await FileSystem.writeAsStringAsync(uri, out);
        setStatus({ kind: 'ok', msg: `Saved ${what} as ${filename} (${(out.length / 1024).toFixed(0)} KB) to the folder you picked. Find it in Files — edit it, then UPLOAD FILE FROM DEVICE.` });
      } else {
        const uri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, out);
        setStatus({ kind: 'ok', msg: `Saved ${what} to ${uri}` });
      }
    } catch (e) {
      setStatus({ kind: 'err', msg: `Save failed: ${e instanceof Error ? e.message : String(e)}.` });
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Whole-game file</Text>
        <Text style={styles.badgeOff}>one file is the whole game</Text>
      </View>
      <Text style={styles.hint}>
        Your entire game in one .json. Hit{' '}
        <Text style={{ fontWeight: 'bold' }}>SAVE FILE TO DEVICE</Text> to get the file: the blank
        fillable template while your game is still empty, or YOUR built game once you’ve loaded
        anything (that’s the file you hand back for an APK bake). Edit it anywhere, then{' '}
        <Text style={{ fontWeight: 'bold' }}>UPLOAD FILE FROM DEVICE</Text> to load it — every section
        it contains is applied at once; anything omitted keeps its built-in default. // and /* */
        comments are allowed. <Text style={{ fontWeight: 'bold' }}>RESET</Text> wipes all uploaded
        content back to the built-in defaults if you need a clean slate.
      </Text>
      <View style={styles.stackCol}>
        <TouchableOpacity style={[styles.copyBtn, styles.stackBtn]} onPress={() => { setConfirmReset(false); void saveToDevice(); }}>
          <Text style={styles.copyBtnText}>⬇ SAVE FILE TO DEVICE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.loadBtn, styles.stackBtn]}
          onPress={() => { setConfirmReset(false); void (async () => {
            const picked = await pickJsonFile();
            if (picked.canceled) { setStatus({ kind: 'err', msg: 'Upload cancelled — no file chosen.' }); return; }
            if (!picked.ok || !picked.content) { setStatus({ kind: 'err', msg: picked.msg ?? 'Could not read that file.' }); return; }
            const r = loadGameBundle(picked.content);
            setStatus(r.ok ? { kind: 'ok', msg: r.summary ?? 'Loaded.' } : { kind: 'err', msg: r.error ?? 'Failed.' });
          })(); }}
        >
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE FROM DEVICE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.resetBtn, styles.stackBtn]}
          onPress={() => {
            if (!confirmReset) { setConfirmReset(true); setStatus({ kind: 'err', msg: 'Tap RESET again to wipe ALL uploaded content back to the built-in defaults.' }); return; }
            useContentPackStore.getState().clearAll();
            setConfirmReset(false);
            setStatus({ kind: 'ok', msg: 'Reset — every section is back to its built-in default.' });
          }}
        >
          <Text style={styles.resetBtnText}>{confirmReset ? 'RESET — SURE?' : 'RESET'}</Text>
        </TouchableOpacity>
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — MISSIONS upload. One object holding hunts / mysteries / faction
// quests / storylines (designed multi-stage missions) + objectives / complications
// / rewards (procedural-lead seeds). Replaces the built-in Tartaria quests.
function MissionsBox() {
  const loadMissionsJson = useContentPackStore((s) => s.loadMissionsJson);
  const missions = useContentPackStore((s) => s.missions);
  const loaded = Object.keys(missions).length;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Missions</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded} types` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        One JSON object holding your missions: <Text style={{ fontWeight: 'bold' }}>hunts</Text>,
        <Text style={{ fontWeight: 'bold' }}> mysteries</Text>,
        <Text style={{ fontWeight: 'bold' }}> factionQuests</Text>,
        <Text style={{ fontWeight: 'bold' }}> storylines</Text> (designed multi-stage quests accepted
        from vendors), plus <Text style={{ fontWeight: 'bold' }}>objectives / complications / rewards</Text>
        {' '}(the seeds the engine mixes into procedural lead quests). Each is an array. Any sub-table you
        omit keeps its built-in default. Hit TEMPLATE for the shape.
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste your missions JSON object here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadMissionsJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: r.summary ?? 'Loaded.' } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(loaded > 0 ? JSON.stringify(missions, null, 2) : buildMissionsTemplate());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your current missions — edit, then LOAD.' : 'Loaded the missions template — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(missions, null, 2) : buildMissionsTemplate());
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: 'Copied to clipboard and cleared the box.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              useContentPackStore.getState().clearMissions();
              setStatus({ kind: 'ok', msg: 'Reset missions to built-in.' });
            }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — HOOKS upload. One object { plants, chains, weights?, indoor? } of
// atmospheric multi-stage leads, using the effect-verb language.
function HooksBox() {
  const loadHooksJson = useContentPackStore((s) => s.loadHooksJson);
  const hooks = useContentPackStore((s) => s.hooks);
  const loaded = hooks.plants ? Object.keys(hooks.plants).length : (hooks.chains ? Object.keys(hooks.chains).length : 0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Hooks (atmospheric leads)</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded} hooks` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Multi-stage leads the player stumbles on while exploring (a column of smoke, a half-buried
        spire). One object: <Text style={{ fontWeight: 'bold' }}>plants</Text> (the discovery line +
        matchable nouns per hook id) and <Text style={{ fontWeight: 'bold' }}>chains</Text> (the
        staged outcomes; each stage carries a list of effects). Effect verbs: grant_tc, grant_item,
        spawn_enemy_tag, heal, damage, unlock_location, rep_change, advance_time, memo, spawn_vendor.
        Optional weights + indoor list. Hit TEMPLATE for the shape.
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste your hooks JSON object here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadHooksJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: r.summary ?? 'Loaded.' } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(loaded > 0 ? JSON.stringify(hooks, null, 2) : buildHooksTemplate());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your current hooks — edit, then LOAD.' : 'Loaded the hooks template — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(hooks, null, 2) : buildHooksTemplate());
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: 'Copied to clipboard and cleared the box.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              useContentPackStore.getState().clearHooks();
              setStatus({ kind: 'ok', msg: 'Reset hooks to built-in.' });
            }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — WHISPERS upload. An array of overheard-tip chains (plant → travel
// to a tile in a time window → meetLine + meetEffects payoff).
function WhispersBox() {
  const loadWhispersJson = useContentPackStore((s) => s.loadWhispersJson);
  const whispers = useContentPackStore((s) => s.whispers);
  const loaded = whispers.length;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Whispers (overheard tips)</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded} chains` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        An array of overheard-tip chains. Each plants at a plant location (plantLocations), points to
        a nearby tile (targetOffset) in a time window (activeHours), and pays off via{' '}
        <Text style={{ fontWeight: 'bold' }}>meetLine</Text> +{' '}
        <Text style={{ fontWeight: 'bold' }}>meetEffects</Text> (same effect verbs as hooks) when the
        player arrives. plantLocations may be a built-in hub-room id (e.g. "outpost_messhall") OR one
        of your own location ids — it plants in that hub room or at that location. You can use{' '}
        <Text style={{ fontWeight: 'bold' }}>{'{narrator}'}</Text> /{' '}
        <Text style={{ fontWeight: 'bold' }}>{'{crucible}'}</Text> tokens in any line. Hit TEMPLATE for
        the shape.
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste your whispers JSON array here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadWhispersJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} whisper chain(s).` } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(loaded > 0 ? JSON.stringify(whispers, null, 2) : buildWhispersTemplate());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your current whispers — edit, then LOAD.' : 'Loaded the whispers template — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(whispers, null, 2) : buildWhispersTemplate());
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: 'Copied to clipboard and cleared the box.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              useContentPackStore.getState().clearWhispers();
              setStatus({ kind: 'ok', msg: 'Reset whispers to built-in.' });
            }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — WASTELAND upload. Object of between-locations travel encounters
// keyed by archetype id.
function WastelandBox() {
  const loadWastelandJson = useContentPackStore((s) => s.loadWastelandJson);
  const wasteland = useContentPackStore((s) => s.wasteland);
  const loaded = Object.keys(wasteland).filter((k) => !k.startsWith('_')).length;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Travel encounters</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded}` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Random encounters while traveling long-distance between named locations. One JSON object
        keyed by archetype id; each: <Text style={{ fontWeight: 'bold' }}>type</Text>{' '}
        (treasure / npc / skirmish / mini_dungeon / fusion_bench),{' '}
        <Text style={{ fontWeight: 'bold' }}>weight</Text>,{' '}
        <Text style={{ fontWeight: 'bold' }}>matchers</Text> (location tags it can fire in — a
        matcher of <Text style={{ fontWeight: 'bold' }}>"any"</Text> / "*" fires it at ANY location
        during travel, alongside tag-targeted ones),{' '}
        <Text style={{ fontWeight: 'bold' }}>narration</Text>, plus optional loot / npc_lines /
        lore_note / enemyPool. An encounter fires roughly every 7-8 travel steps. You can use{' '}
        <Text style={{ fontWeight: 'bold' }}>{'{narrator}'}</Text> /{' '}
        <Text style={{ fontWeight: 'bold' }}>{'{crucible}'}</Text> tokens in any line. Hit TEMPLATE for
        the shape.
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste your wasteland encounters JSON object here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadWastelandJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: r.summary ?? 'Loaded.' } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(loaded > 0 ? JSON.stringify(wasteland, null, 2) : buildWastelandTemplate());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your current encounters — edit, then LOAD.' : 'Loaded the encounters template — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(wasteland, null, 2) : buildWastelandTemplate());
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: 'Copied to clipboard and cleared the box.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              useContentPackStore.getState().clearWasteland();
              setStatus({ kind: 'ok', msg: 'Reset encounters to built-in.' });
            }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — shared file save / pick helpers for big lists that are painful to
// paste (e.g. the per-noun interaction tags). Save writes JSON to a folder you pick
// (Downloads) via SAF on Android; pick reads a chosen .json back in.
async function saveJsonToFile(filename: string, content: string): Promise<{ ok: boolean; msg: string }> {
  try {
    if (Platform.OS === 'android') {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return { ok: false, msg: 'Save cancelled — no folder chosen.' };
      const uri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, filename, 'application/json');
      await FileSystem.writeAsStringAsync(uri, content);
      return { ok: true, msg: `Saved ${filename} (${(content.length / 1024).toFixed(0)} KB) to the folder you picked. Edit it in Files, then UPLOAD FILE.` };
    }
    const uri = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, content);
    return { ok: true, msg: `Saved to ${uri}` };
  } catch (e) {
    return { ok: false, msg: `Save failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
async function pickJsonFile(): Promise<{ ok: boolean; content?: string; canceled?: boolean; msg?: string }> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
    if (res.canceled) return { ok: false, canceled: true };
    const asset = res.assets?.[0];
    if (!asset) return { ok: false, msg: 'No file was returned by the picker.' };
    const content = await FileSystem.readAsStringAsync(asset.uri);
    return { ok: true, content };
  } catch (e) {
    return { ok: false, msg: `Pick failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// engine_Dev — INTERACTION TAGS upload. Keyword lists per verb (climbable /
// swimmable / breakable / searchable / salvageable); the author's words add to the
// built-in generic set.
function InteractionTagsBox() {
  const loadInteractionTagsJson = useContentPackStore((s) => s.loadInteractionTagsJson);
  const interactionTags = useContentPackStore((s) => s.interactionTags);
  const loaded = Object.values(interactionTags).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Interaction tags</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● +${loaded} words` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Tag each interactable in YOUR world with the verbs it accepts —{' '}
        <Text style={{ fontWeight: 'bold' }}>climbable</Text>,{' '}
        <Text style={{ fontWeight: 'bold' }}>swimmable</Text>,{' '}
        <Text style={{ fontWeight: 'bold' }}>breakable</Text>,{' '}
        <Text style={{ fontWeight: 'bold' }}>searchable</Text>,{' '}
        <Text style={{ fontWeight: 'bold' }}>salvageable</Text>. Tap{' '}
        <Text style={{ fontWeight: 'bold' }}>↻ FROM LOCATIONS</Text> to pull every interactable from
        your loaded Locations into a list, each pre-filled with a best-guess tag — edit the arrays
        (e.g. add "climbable" to "rusted t-34 tank"), then LOAD. Hit ↻ again after changing your
        locations to pull in new items (your existing tags are kept).
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Tap ↻ FROM LOCATIONS to build the taggable list…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadInteractionTagsJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: r.summary ?? 'Loaded.' } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            // Merge the author's existing tags (whatever's in the box, else the
            // loaded override) with a fresh pull of all current interactables.
            let current: Record<string, string[]> | undefined;
            try { const t = text.trim(); if (t) current = JSON.parse(t); } catch { /* ignore */ }
            if (!current && loaded > 0) current = interactionTags as Record<string, string[]>;
            const built = buildInteractionTagsTemplate(current);
            const count = Object.keys(JSON.parse(built)).length;
            setText(built);
            setStatus({ kind: 'ok', msg: `Pulled ${count} interactables from your locations — edit the tags, then LOAD.` });
          }}
        >
          <Text style={styles.tmplBtnText}>↻ FROM LOCATIONS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(interactionTags, null, 2) : buildInteractionTagsTemplate());
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: 'Copied to clipboard and cleared the box.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              useContentPackStore.getState().clearInteractionTags();
              setStatus({ kind: 'ok', msg: 'Reset to built-in keywords.' });
            }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* engine_Dev — file path: the per-noun list is long; save it to a file, edit
          in a real editor, and upload the file back (no giant paste). */}
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={async () => {
            // Save the FROM-LOCATIONS list (or current edits) to a file.
            let current: Record<string, string[]> | undefined;
            try { const t = text.trim(); if (t) current = JSON.parse(t); } catch { /* ignore */ }
            if (!current && loaded > 0) current = interactionTags as Record<string, string[]>;
            const content = buildInteractionTagsTemplate(current);
            const r = await saveJsonToFile('interaction-tags.json', content);
            setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg });
          }}
        >
          <Text style={styles.copyBtnText}>⬇ SAVE FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={async () => {
            const r = await pickJsonFile();
            if (r.canceled) return;
            if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; }
            const res = loadInteractionTagsJson(r.content);
            setStatus(res.ok ? { kind: 'ok', msg: res.summary ?? 'Loaded from file.' } : { kind: 'err', msg: res.error ?? 'Failed.' });
          }}
        >
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text>
        </TouchableOpacity>
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — STARTING AREAS upload. Per-faction 4-room instances + placement.
function StartingAreasBox() {
  const loadStartingAreasJson = useContentPackStore((s) => s.loadStartingAreasJson);
  const startingAreas = useContentPackStore((s) => s.startingAreas);
  const loaded = startingAreas.length;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Starting areas</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded}` : '○ none'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Per-faction starting areas — a SEPARATE list, one small instance per faction. Each:{' '}
        <Text style={{ fontWeight: 'bold' }}>factionId</Text>,{' '}
        <Text style={{ fontWeight: 'bold' }}>name</Text>,{' '}
        <Text style={{ fontWeight: 'bold' }}>locationId</Text> (WHERE on the map to place it), and{' '}
        <Text style={{ fontWeight: 'bold' }}>rooms</Text> (a tiny graph — each exit points to another
        room’s id, null, or <Text style={{ fontWeight: 'bold' }}>"world"</Text> to leave to the map;
        the first room is the entry). A member of that faction spawns inside it and walks room-to-room;
        a "world" exit steps back out onto the map. Whispers can plant in a room by naming its room id.
        Hit TEMPLATE for a 4-room example, then SAVE/UPLOAD FILE if it gets long.
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste your starting-areas JSON array here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadStartingAreasJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} starting area(s).` } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(loaded > 0 ? JSON.stringify(startingAreas, null, 2) : buildStartingAreasTemplate());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your current areas — edit, then LOAD.' : 'Loaded a 4-room example — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const out = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(startingAreas, null, 2) : buildStartingAreasTemplate());
            void Clipboard.setStringAsync(out);
            setText('');
            setStatus({ kind: 'ok', msg: 'Copied to clipboard and cleared the box.' });
          }}
        >
          <Text style={styles.copyBtnText}>COPY</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => { useContentPackStore.getState().clearStartingAreas(); setStatus({ kind: 'ok', msg: 'Cleared starting areas.' }); }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={async () => {
            const content = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(startingAreas, null, 2) : buildStartingAreasTemplate());
            const r = await saveJsonToFile('starting-areas.json', content);
            setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg });
          }}
        >
          <Text style={styles.copyBtnText}>⬇ SAVE FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={async () => {
            const r = await pickJsonFile();
            if (r.canceled) return;
            if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; }
            const res = loadStartingAreasJson(r.content);
            setStatus(res.ok ? { kind: 'ok', msg: `Loaded ${res.count} starting area(s) from file.` } : { kind: 'err', msg: res.error ?? 'Failed.' });
          }}
        >
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text>
        </TouchableOpacity>
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — IMPORTABLE TITLES. Build achievements by picking a trackable
// variable, naming the title, and setting a threshold — or upload/paste the JSON.
function TitlesBox() {
  const loadTitlesJson = useContentPackStore((s) => s.loadTitlesJson);
  const customTitles = useContentPackStore((s) => s.customTitles) as Array<{ id: string; name: string; track: string; threshold: number; description?: string }>;
  const loaded = customTitles.length;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  // Builder state.
  const [bVar, setBVar] = useState<string>(TRACKABLE_VARS[0]?.id ?? '');
  const [bName, setBName] = useState('');
  const [bThresh, setBThresh] = useState('');

  const applyList = (list: unknown[], okMsg: string) => {
    const r = loadTitlesJson(JSON.stringify(list));
    setStatus(r.ok ? { kind: 'ok', msg: okMsg } : { kind: 'err', msg: r.error ?? 'Failed.' });
  };
  const addBuilderTitle = () => {
    const name = bName.trim();
    const threshold = Number(bThresh);
    if (!name) { setStatus({ kind: 'err', msg: 'Give the title a name.' }); return; }
    if (!bVar || !Number.isFinite(threshold)) { setStatus({ kind: 'err', msg: 'Pick a variable and a numeric threshold.' }); return; }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `title_${Date.now()}`;
    const next = [...customTitles.filter((t) => t.id !== id), { id, name, track: bVar, threshold }];
    applyList(next, `Added “${name}” — ${TRACKABLE_VARS.find((v) => v.id === bVar)?.label} ≥ ${threshold}. (${next.length} total)`);
    setBName(''); setBThresh('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Titles (achievements)</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded}` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Importable titles. Each is earned when a <Text style={{ fontWeight: 'bold' }}>trackable variable</Text>{' '}
        reaches a <Text style={{ fontWeight: 'bold' }}>threshold</Text>. Build one below — pick a variable, name
        it, set the number — or hit TEMPLATE / UPLOAD FILE to author the JSON directly.
      </Text>

      {/* BUILDER — pick a trackable variable (checkbox), name + threshold, ADD. */}
      <Text style={styles.hint}>1 · Pick a variable to track:</Text>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {TRACKABLE_VARS.map((v) => (
          <TouchableOpacity
            key={v.id}
            style={[styles.tmplBtn, bVar === v.id && styles.loadBtn, { marginBottom: 4 }]}
            onPress={() => setBVar(v.id)}
          >
            <Text style={bVar === v.id ? styles.loadBtnText : styles.tmplBtnText}>
              {bVar === v.id ? '☑ ' : '☐ '}{v.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 2, minHeight: 0, height: 40 }]}
          value={bName}
          onChangeText={setBName}
          placeholder="Title name (e.g. Veteran of the Fold)"
          placeholderTextColor="#5c5446"
          autoCapitalize="words"
        />
        <TextInput
          style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]}
          value={bThresh}
          onChangeText={setBThresh}
          placeholder="threshold"
          placeholderTextColor="#5c5446"
          keyboardType="number-pad"
        />
        <TouchableOpacity style={styles.loadBtn} onPress={addBuilderTitle}>
          <Text style={styles.loadBtnText}>+ ADD</Text>
        </TouchableOpacity>
      </View>

      {/* Current titles list with remove. */}
      {loaded > 0 && customTitles.map((t) => (
        <View key={t.id} style={styles.titleRowDev}>
          <Text style={styles.hint}>
            ◆ <Text style={{ fontWeight: 'bold' }}>{t.name}</Text> — {TRACKABLE_VARS.find((v) => v.id === t.track)?.label ?? t.track} ≥ {t.threshold}
          </Text>
          <TouchableOpacity
            onPress={() => applyList(customTitles.filter((x) => x.id !== t.id), `Removed “${t.name}”.`)}
          >
            <Text style={styles.resetBtnText}> ✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* JSON path. */}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="…or paste a titles JSON array here"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadTitlesJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} title(s).` } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(loaded > 0 ? JSON.stringify(customTitles, null, 2) : buildTitlesTemplate());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your titles — edit, then LOAD.' : 'Loaded the template (lists every trackable variable).' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={async () => {
            const content = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify(customTitles, null, 2) : buildTitlesTemplate());
            const r = await saveJsonToFile('titles.json', content);
            setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg });
          }}
        >
          <Text style={styles.copyBtnText}>⬇ SAVE FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={async () => {
            const r = await pickJsonFile();
            if (r.canceled) return;
            if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; }
            const res = loadTitlesJson(r.content);
            setStatus(res.ok ? { kind: 'ok', msg: `Loaded ${res.count} title(s) from file.` } : { kind: 'err', msg: res.error ?? 'Failed.' });
          }}
        >
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => { useContentPackStore.getState().clearTitles(); setStatus({ kind: 'ok', msg: 'Cleared custom titles.' }); }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — COLLECTABLES upload. Character stories the player reassembles from
// loot fragments; the uploaded set replaces the built-in stories wholesale.
function CollectablesBox() {
  const loadCollectablesJson = useContentPackStore((s) => s.loadCollectablesJson);
  const collectables = useContentPackStore((s) => s.collectables) as Array<{ id: string; characterName?: string; fragments?: unknown[] }>;
  const loaded = collectables.length;
  const fragCount = collectables.reduce((n, s) => n + (Array.isArray(s.fragments) ? s.fragments.length : 0), 0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Collectables (character stories)</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded} stories / ${fragCount} fragments` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Character stories the player reassembles from loot. Each story is one named character
        with a chain of <Text style={{ fontWeight: 'bold' }}>fragments</Text> (note / letter /
        journal / fragment). A fragment drops in place of normal loot where the scene's location
        tags overlap its <Text style={{ fontWeight: 'bold' }}>biomeTags</Text>. The Contracts screen's
        Collectables tab shows per-character completion. Top level is{' '}
        <Text style={{ fontWeight: 'bold' }}>{'{ "stories": [ … ] }'}</Text> (a bare array also works).
        The uploaded set replaces the built-in stories. Hit TEMPLATE for the shape.
      </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste your collectables JSON here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadCollectablesJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} character stor${r.count === 1 ? 'y' : 'ies'}.` } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(loaded > 0 ? JSON.stringify({ stories: collectables }, null, 2) : buildCollectablesTemplate());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your current stories — edit, then LOAD.' : 'Loaded the collectables template — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={async () => {
            const content = text.trim().length > 0 ? text : (loaded > 0 ? JSON.stringify({ stories: collectables }, null, 2) : buildCollectablesTemplate());
            const r = await saveJsonToFile('collectables.json', content);
            setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg });
          }}
        >
          <Text style={styles.copyBtnText}>⬇ SAVE FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={async () => {
            const r = await pickJsonFile();
            if (r.canceled) return;
            if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; }
            const res = loadCollectablesJson(r.content);
            setStatus(res.ok ? { kind: 'ok', msg: `Loaded ${res.count} character stor${res.count === 1 ? 'y' : 'ies'} from file.` } : { kind: 'err', msg: res.error ?? 'Failed.' });
          }}
        >
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => { useContentPackStore.getState().clearCollectables(); setStatus({ kind: 'ok', msg: 'Reset collectables to built-in.' }); }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — SUMMONED SIDEKICKS builder. The buildable companion family (the
// engine's "golems", reskinnable). An uploaded pack replaces the built-in golems
// wholesale and can rename the category ("automaton", "construct", …). Also holds
// the rescuable DOG companion on/off toggle.
function SummonsBox() {
  const loadSummonsJson = useContentPackStore((s) => s.loadSummonsJson);
  const summons = useContentPackStore((s) => s.summons) as { noun?: string; defs: unknown[] } | null;
  const dogEnabled = useContentPackStore((s) => s.dogEnabled);
  const setDogCompanionEnabled = useContentPackStore((s) => s.setDogCompanionEnabled);
  const loaded = summons?.defs?.length ?? 0;
  const noun = summons?.noun?.trim() || 'golem';
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const current = () => loaded > 0 ? JSON.stringify(summons, null, 2) : buildSummonsTemplate();
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Summoned Sidekicks</Text>
        <Text style={loaded > 0 ? styles.badgeOn : styles.badgeOff}>
          {loaded > 0 ? `● override · ${loaded} ${noun}${loaded === 1 ? '' : 's'}` : '○ built-in golems'}
        </Text>
      </View>
      <Text style={styles.hint}>
        The buildable companion family — the engine's “golems”, fully reskinnable. Set a{' '}
        <Text style={{ fontWeight: 'bold' }}>noun</Text> (what the player types after “summon”, e.g.
        “automaton”) and a list of <Text style={{ fontWeight: 'bold' }}>summons</Text>, each with its
        fuel, combat profile, summon DC, and aliases. The player summons by typing “summon &lt;alias&gt;”.
        Fuel names must exist in your materials/gear catalog. The uploaded pack replaces the built-in
        golems. Hit TEMPLATE for the shape.
      </Text>

      {/* DOG TOGGLE — independent of the summon pack. */}
      <View style={[styles.row, { alignItems: 'center', marginBottom: 6 }]}>
        <Text style={[styles.hint, { flex: 1, marginBottom: 0 }]}>
          Rescuable <Text style={{ fontWeight: 'bold' }}>dog companion</Text> — {dogEnabled ? 'ON (players can rescue & keep a dog)' : 'OFF (no dog in this game)'}.
        </Text>
        <TouchableOpacity
          style={dogEnabled ? styles.loadBtn : styles.tmplBtn}
          onPress={() => { setDogCompanionEnabled(!dogEnabled); setStatus({ kind: 'ok', msg: !dogEnabled ? 'Dog companion ON.' : 'Dog companion OFF — no rescue scenarios will fire.' }); }}
        >
          <Text style={dogEnabled ? styles.loadBtnText : styles.tmplBtnText}>{dogEnabled ? '☑ DOG ON' : '☐ DOG OFF'}</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste your summons JSON here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => {
            const r = loadSummonsJson(text);
            setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} summon${r.count === 1 ? '' : 's'}.` } : { kind: 'err', msg: r.error ?? 'Failed.' });
            if (r.ok) setText('');
          }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(current());
            setStatus({ kind: 'ok', msg: loaded > 0 ? 'Loaded your current summons — edit, then LOAD.' : 'Loaded the summons template — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{loaded > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={async () => {
            const content = text.trim().length > 0 ? text : current();
            const r = await saveJsonToFile('summons.json', content);
            setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg });
          }}
        >
          <Text style={styles.copyBtnText}>⬇ SAVE FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={async () => {
            const r = await pickJsonFile();
            if (r.canceled) return;
            if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; }
            const res = loadSummonsJson(r.content);
            setStatus(res.ok ? { kind: 'ok', msg: `Loaded ${res.count} summon${res.count === 1 ? '' : 's'} from file.` } : { kind: 'err', msg: res.error ?? 'Failed.' });
          }}
        >
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text>
        </TouchableOpacity>
        {loaded > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => { useContentPackStore.getState().clearSummons(); setStatus({ kind: 'ok', msg: 'Reset summons to built-in golems.' }); }}
          >
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — generic JSON-rules uploader for the advanced combat/crafting tables
// (damage types, enemy resistances, fusion tags, coatings). Same LOAD / TEMPLATE /
// SAVE FILE / UPLOAD FILE / RESET contract as the other boxes, parameterised by the
// store loader/clearer so each rule set is one short declaration below.
function RulesBox({ title, hint, badge, hasData, currentJson, template, filename, onLoad, onClear }: {
  title: string;
  hint: React.ReactNode;
  badge: string | null;
  hasData: boolean;
  currentJson: () => string;
  template: string;
  filename: string;
  onLoad: (json: string) => LoadResult;
  onClear: () => void;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const editOrTemplate = () => (hasData ? currentJson() : template);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={hasData ? styles.badgeOn : styles.badgeOff}>{hasData ? (badge ?? '● override') : '○ built-in'}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste JSON here…"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity style={styles.loadBtn} onPress={() => {
          const r = onLoad(text);
          setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} entr${r.count === 1 ? 'y' : 'ies'}.` } : { kind: 'err', msg: r.error ?? 'Failed.' });
          if (r.ok) setText('');
        }}>
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tmplBtn} onPress={() => {
          setText(editOrTemplate());
          setStatus({ kind: 'ok', msg: hasData ? 'Loaded your current entries — edit, then LOAD.' : 'Loaded the template — edit, then LOAD.' });
        }}>
          <Text style={styles.tmplBtnText}>{hasData ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.copyBtn} onPress={async () => {
          const content = text.trim().length > 0 ? text : editOrTemplate();
          const r = await saveJsonToFile(filename, content);
          setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg });
        }}>
          <Text style={styles.copyBtnText}>⬇ SAVE FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.loadBtn} onPress={async () => {
          const r = await pickJsonFile();
          if (r.canceled) return;
          if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; }
          const res = onLoad(r.content);
          setStatus(res.ok ? { kind: 'ok', msg: `Loaded ${res.count} entr${res.count === 1 ? 'y' : 'ies'} from file.` } : { kind: 'err', msg: res.error ?? 'Failed.' });
        }}>
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text>
        </TouchableOpacity>
        {hasData && (
          <TouchableOpacity style={styles.resetBtn} onPress={() => { onClear(); setStatus({ kind: 'ok', msg: 'Reset to built-in.' }); }}>
            <Text style={styles.resetBtnText}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

const DAMAGE_TYPES_TEMPLATE = JSON.stringify([{ name: 'frost', keywords: ['frost', 'ice', 'freeze', 'cold', 'chill'] }], null, 2);
const RESISTANCES_TEMPLATE = JSON.stringify({ 'REPLACE-with-your-enemy-type': { resist: ['piercing'], weak: ['frost'] } }, null, 2);
const FUSION_TAGS_TEMPLATE = JSON.stringify(['servo', 'fold-core', 'bakelite'], null, 2);
const COATINGS_TEMPLATE = JSON.stringify({ corruption: { label: 'Phase-etched', blurb: 'seeps phase-rot into the wound (damage over time + worsening stacks)', lootLabel: 'Phase-etched' } }, null, 2);

function AdvancedRulesBoxes() {
  const damageTypes = useContentPackStore((s) => s.damageTypes);
  const damageResistances = useContentPackStore((s) => s.damageResistances);
  const fusionTags = useContentPackStore((s) => s.fusionTags);
  const coatings = useContentPackStore((s) => s.coatings);
  const store = useContentPackStore;
  return (
    <>
      <RulesBox
        title="Damage types (extra)"
        badge={`● ${damageTypes.length} added`}
        hasData={damageTypes.length > 0}
        filename="damage-types.json"
        currentJson={() => JSON.stringify(damageTypes, null, 2)}
        template={DAMAGE_TYPES_TEMPLATE}
        onLoad={(j) => store.getState().loadDamageTypesJson(j)}
        onClear={() => store.getState().clearDamageTypes()}
        hint={<>Add damage types beyond the built-in 10 (e.g. <Text style={{ fontWeight: 'bold' }}>frost</Text>, sonic). Array of {'{ name, keywords? }'}; keywords let the engine infer the type from a bare attack string. Then give enemies resistances to it below.</>}
      />
      <RulesBox
        title="Enemy resistances"
        badge={`● ${damageResistances ? Object.keys(damageResistances).length : 0} types`}
        hasData={!!damageResistances && Object.keys(damageResistances).length > 0}
        filename="enemy-resistances.json"
        currentJson={() => JSON.stringify(damageResistances ?? {}, null, 2)}
        template={RESISTANCES_TEMPLATE}
        onLoad={(j) => store.getState().loadDamageResistancesJson(j)}
        onClear={() => store.getState().clearDamageResistances()}
        hint={<>Which damage types each <Text style={{ fontWeight: 'bold' }}>enemy type</Text> resists (½ damage) or is weak to (1.5×). Object keyed by YOUR enemy types. Replaces the built-in Tartaria map.</>}
      />
      <RulesBox
        title="Fusion material tags (extra)"
        badge={`● ${fusionTags.length} added`}
        hasData={fusionTags.length > 0}
        filename="fusion-tags.json"
        currentJson={() => JSON.stringify(fusionTags, null, 2)}
        template={FUSION_TAGS_TEMPLATE}
        onLoad={(j) => store.getState().loadFusionTagsJson(j)}
        onClear={() => store.getState().clearFusionTags()}
        hint={<>Extra material tag words that count toward the Crucible’s fusion-diversity gate, on top of the built-ins (metal/cloth/wood/stone/bone/crystal/…). Array of strings.</>}
      />
      <RulesBox
        title="Weapon coatings (rename)"
        badge={`● ${coatings ? Object.keys(coatings).length : 0} renamed`}
        hasData={!!coatings && Object.keys(coatings).length > 0}
        filename="coatings.json"
        currentJson={() => JSON.stringify(coatings ?? {}, null, 2)}
        template={COATINGS_TEMPLATE}
        onLoad={(j) => store.getState().loadCoatingsJson(j)}
        onClear={() => store.getState().clearCoatings()}
        hint={<>Rename the five coating mechanics (the combat effects stay). Object keyed by mechanic — <Text style={{ fontWeight: 'bold' }}>poison / acid / corruption / electrical / burn</Text> — each {'{ label?, blurb?, lootLabel? }'}.</>}
      />
    </>
  );
}

// engine_Dev — BOSSES builder. Named, faction-affiliated bosses with stats, loot,
// a quest item, and spawn rules — referenced by main-quest "kill" steps.
function BossesBox() {
  const customBosses = useContentPackStore((s) => s.customBosses) as CustomBoss[];
  const setBosses = useContentPackStore((s) => s.setBosses);
  const loadBossesJson = useContentPackStore((s) => s.loadBossesJson);
  const factions = (getFactions() as Array<{ id: string; name: string }>);
  const locations = mainQuestLocations();
  const [status, setStatus] = useState<Status>(null);
  const [text, setText] = useState('');
  const [f, setF] = useState({ name: '', factionId: '', hp: '', attack: '', damage: '', ac: '', abilityPoint: '', drops: '', questItem: '', spawnLocationId: '', spawnCondition: 'main_quest', spawnChance: '' });
  const up = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const add = () => {
    if (!f.name.trim()) { setStatus({ kind: 'err', msg: 'Boss needs a name.' }); return; }
    if (!Number(f.hp)) { setStatus({ kind: 'err', msg: 'Boss needs HP.' }); return; }
    const id = f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `boss_${Date.now()}`;
    const boss: CustomBoss = {
      id, name: f.name.trim(), hp: Number(f.hp),
      attack: Number(f.attack) || 5, damage: f.damage.trim() || '2d8+3',
      ...(Number(f.ac) ? { ac: Number(f.ac) } : {}),
      ...(Number(f.abilityPoint) ? { abilityPoint: Number(f.abilityPoint) } : {}),
      ...(f.factionId ? { factionId: f.factionId } : {}),
      ...(f.drops.trim() ? { drops: f.drops.split(',').map((d) => d.trim()).filter(Boolean) } : {}),
      ...(f.questItem.trim() ? { questItem: f.questItem.trim() } : {}),
      ...(f.spawnCondition !== 'random' && f.spawnLocationId ? { spawnLocationId: f.spawnLocationId } : {}),
      ...(f.spawnCondition === 'random' && Number(f.spawnChance) ? { spawnChance: Number(f.spawnChance) } : {}),
      spawnCondition: f.spawnCondition,
    };
    if (f.spawnCondition !== 'random' && !f.spawnLocationId) { setStatus({ kind: 'err', msg: 'Pick a spawn location (or switch to Random spawn).' }); return; }
    const next = [...customBosses.filter((b) => b.id !== id), boss];
    setBosses(next);
    setStatus({ kind: 'ok', msg: `Boss saved: ${boss.name} (${next.length} total).` });
    setF((p) => ({ ...p, name: '', hp: '', damage: '', drops: '', questItem: '' }));
  };

  const chipRow = (label: string, items: Array<{ id: string; name: string }>, sel: string, onPick: (id: string) => void) => (
    <>
      <Text style={styles.hint}>{label}</Text>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {items.map((it) => (
          <TouchableOpacity key={it.id} style={[styles.tmplBtn, sel === it.id && styles.loadBtn, { marginBottom: 4 }]} onPress={() => onPick(it.id)}>
            <Text style={sel === it.id ? styles.loadBtnText : styles.tmplBtnText}>{sel === it.id ? '☑ ' : '☐ '}{it.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Bosses</Text>
        <Text style={customBosses.length > 0 ? styles.badgeOn : styles.badgeOff}>
          {customBosses.length > 0 ? `● ${customBosses.length}` : '○ none'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Named bosses with stats, loot, a quest item they drop (e.g. dog tags) and spawn rules.
        A main-quest “Kill the boss at …” step points at one of these.
      </Text>
      {customBosses.map((b) => (
        <View key={b.id} style={styles.titleRowDev}>
          <Text style={styles.hint}>◆ <Text style={{ fontWeight: 'bold' }}>{b.name}</Text> — HP {b.hp}{b.questItem ? ` · drops ${b.questItem}` : ''}{b.spawnLocationId ? ` @ ${locations.find((l) => l.id === b.spawnLocationId)?.name ?? b.spawnLocationId}` : ''}</Text>
          <TouchableOpacity onPress={() => { setBosses(customBosses.filter((x) => x.id !== b.id)); setStatus({ kind: 'ok', msg: `Removed ${b.name}.` }); }}>
            <Text style={styles.resetBtnText}> ✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 2, minHeight: 0, height: 40 }]} value={f.name} onChangeText={(v) => up('name', v)} placeholder="Boss name" placeholderTextColor="#5c5446" />
        <TextInput style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]} value={f.hp} onChangeText={(v) => up('hp', v)} placeholder="HP" placeholderTextColor="#5c5446" keyboardType="number-pad" />
      </View>
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]} value={f.attack} onChangeText={(v) => up('attack', v)} placeholder="ATK" placeholderTextColor="#5c5446" keyboardType="number-pad" />
        <TextInput style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]} value={f.damage} onChangeText={(v) => up('damage', v)} placeholder="dmg (2d8+3)" placeholderTextColor="#5c5446" />
        <TextInput style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]} value={f.ac} onChangeText={(v) => up('ac', v)} placeholder="AC" placeholderTextColor="#5c5446" keyboardType="number-pad" />
        <TextInput style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]} value={f.abilityPoint} onChangeText={(v) => up('abilityPoint', v)} placeholder="tier" placeholderTextColor="#5c5446" keyboardType="number-pad" />
      </View>
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]} value={f.questItem} onChangeText={(v) => up('questItem', v)} placeholder="Quest item drop (dog tags)" placeholderTextColor="#5c5446" />
        <TextInput style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]} value={f.drops} onChangeText={(v) => up('drops', v)} placeholder="Other drops (comma-sep)" placeholderTextColor="#5c5446" />
      </View>
      {factions.length > 0 && chipRow('Faction affiliation:', factions, f.factionId, (id) => up('factionId', id === f.factionId ? '' : id))}
      {chipRow('Spawn mode:', BOSS_SPAWN_CONDITIONS.map((c) => ({ id: c.id, name: c.label })), f.spawnCondition, (id) => up('spawnCondition', id))}
      {f.spawnCondition !== 'random' && chipRow('Spawn location:', locations, f.spawnLocationId, (id) => up('spawnLocationId', id))}
      {f.spawnCondition === 'random' && (
        <TextInput style={[styles.input, { minHeight: 0, height: 40 }]} value={f.spawnChance} onChangeText={(v) => up('spawnChance', v)} placeholder="Random spawn chance % (e.g. 8)" placeholderTextColor="#5c5446" keyboardType="number-pad" />
      )}
      <View style={styles.row}>
        <TouchableOpacity style={styles.loadBtn} onPress={add}><Text style={styles.loadBtnText}>+ SAVE BOSS</Text></TouchableOpacity>
      </View>
      <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="…or paste a bosses JSON array" placeholderTextColor="#5c5446" multiline autoCapitalize="none" autoCorrect={false} />
      <View style={styles.row}>
        <TouchableOpacity style={styles.loadBtn} onPress={() => { const r = loadBossesJson(text); setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} boss(es).` } : { kind: 'err', msg: r.error ?? 'Failed.' }); if (r.ok) setText(''); }}><Text style={styles.loadBtnText}>LOAD</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tmplBtn} onPress={() => { setText(customBosses.length > 0 ? JSON.stringify(customBosses, null, 2) : JSON.stringify([{ id: 'a_boss', name: 'The Warlord', factionId: 'a-faction-id', hp: 90, attack: 7, damage: '2d8+4', ac: 16, abilityPoint: 7, questItem: 'Dog Tags', drops: ['Doomsday Chronometer'], spawnLocationId: 'a-location-id', spawnCondition: 'main_quest' }], null, 2)); setStatus({ kind: 'ok', msg: customBosses.length > 0 ? 'Loaded your bosses — edit, then LOAD.' : 'Loaded an example boss — edit, then LOAD.' }); }}><Text style={styles.tmplBtnText}>{customBosses.length > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.copyBtn} onPress={async () => { const content = text.trim().length > 0 ? text : JSON.stringify(customBosses, null, 2); const r = await saveJsonToFile('bosses.json', content); setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg }); }}><Text style={styles.copyBtnText}>⬇ SAVE FILE</Text></TouchableOpacity>
        <TouchableOpacity style={styles.loadBtn} onPress={async () => { const r = await pickJsonFile(); if (r.canceled) return; if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; } const res = loadBossesJson(r.content); setStatus(res.ok ? { kind: 'ok', msg: `Loaded ${res.count} boss(es) from file.` } : { kind: 'err', msg: res.error ?? 'Failed.' }); }}><Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text></TouchableOpacity>
        {customBosses.length > 0 && <TouchableOpacity style={styles.resetBtn} onPress={() => { useContentPackStore.getState().clearBosses(); setStatus({ kind: 'ok', msg: 'Cleared bosses.' }); }}><Text style={styles.resetBtnText}>RESET</Text></TouchableOpacity>}
      </View>
      {status && <Text style={status.kind === 'ok' ? styles.ok : styles.err}>{status.msg}</Text>}
    </View>
  );
}

// engine_Dev — MAIN QUEST builder. Compose the win-condition objective list line by
// line: pick an action, a target, a location (+ optional reward to collect), ADD.
function MainQuestBox() {
  const customMainQuest = useContentPackStore((s) => s.customMainQuest) as { title?: string; steps?: MainQuestStep[] } | null;
  const setMainQuest = useContentPackStore((s) => s.setMainQuest);
  const loadMainQuestJson = useContentPackStore((s) => s.loadMainQuestJson);
  const steps: MainQuestStep[] = customMainQuest?.steps ?? [];
  const locations = mainQuestLocations();
  const [status, setStatus] = useState<Status>(null);
  const [qTitle, setQTitle] = useState(customMainQuest?.title ?? '');
  const [bAction, setBAction] = useState<string>(MAIN_QUEST_ACTIONS[0]?.id ?? 'kill');
  const [bTarget, setBTarget] = useState('');
  const [bLoc, setBLoc] = useState<string>('');
  const [bReward, setBReward] = useState('');
  const [bBoss, setBBoss] = useState<string>('');
  const [text, setText] = useState('');
  const questBosses = mainQuestBosses();

  const actionDef = MAIN_QUEST_ACTIONS.find((a) => a.id === bAction);
  const isKill = bAction === 'kill';
  // Picking a boss auto-fills the target (its name), the location (its spawn tile),
  // and the reward (its quest item) so a kill step lines up with the boss.
  const pickBoss = (id: string) => {
    const b = questBosses.find((x) => x.id === id);
    setBBoss(id);
    if (b) { setBTarget(b.name); if (b.spawnLocationId) setBLoc(b.spawnLocationId); if (b.questItem) setBReward(b.questItem); }
  };
  const save = (next: { title?: string; steps: MainQuestStep[] }, msg: string) => {
    setMainQuest(next.steps.length > 0 ? next : null);
    setStatus({ kind: 'ok', msg });
  };
  const addStep = () => {
    if (isKill && !bBoss) { setStatus({ kind: 'err', msg: 'Pick the boss this step requires (add one in the BOSSES box first).' }); return; }
    if (actionDef?.needsTarget && !bTarget.trim()) { setStatus({ kind: 'err', msg: `“${actionDef.label}” needs a target.` }); return; }
    if (!bLoc) { setStatus({ kind: 'err', msg: 'Pick a location.' }); return; }
    const step: MainQuestStep = {
      id: `step_${Date.now()}`,
      action: bAction,
      ...(actionDef?.needsTarget ? { target: bTarget.trim() } : {}),
      locationId: bLoc,
      ...(bReward.trim() ? { reward: bReward.trim() } : {}),
      ...(isKill && bBoss ? { bossId: bBoss } : {}),
    };
    save({ title: qTitle.trim() || undefined, steps: [...steps, step] }, `Step added: ${describeStep(step)}`);
    setBTarget(''); setBReward(''); setBBoss('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Main quest</Text>
        <Text style={steps.length > 0 ? styles.badgeOn : styles.badgeOff}>
          {steps.length > 0 ? `● ${steps.length} step(s)` : '○ built-in'}
        </Text>
      </View>
      <Text style={styles.hint}>
        Build your win condition line by line. Each step: pick an <Text style={{ fontWeight: 'bold' }}>action</Text>,
        a <Text style={{ fontWeight: 'bold' }}>target</Text>, a <Text style={{ fontWeight: 'bold' }}>location</Text>,
        and optionally something to <Text style={{ fontWeight: 'bold' }}>collect</Text>. Add as many as you want —
        they run in order, the last completes the quest.
      </Text>

      <TextInput
        style={[styles.input, { minHeight: 0, height: 40 }]}
        value={qTitle}
        onChangeText={(t) => { setQTitle(t); if (steps.length > 0) save({ title: t.trim() || undefined, steps }, 'Title updated.'); }}
        placeholder="Quest title (e.g. Take the Fold)"
        placeholderTextColor="#5c5446"
      />

      {/* current steps */}
      {steps.map((s, i) => (
        <View key={s.id} style={styles.titleRowDev}>
          <Text style={styles.hint}>{i + 1}. {describeStep(s)}</Text>
          <TouchableOpacity onPress={() => save({ title: qTitle.trim() || undefined, steps: steps.filter((x) => x.id !== s.id) }, 'Step removed.')}>
            <Text style={styles.resetBtnText}> ✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* builder */}
      <Text style={styles.hint}>Action:</Text>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {MAIN_QUEST_ACTIONS.map((a) => (
          <TouchableOpacity key={a.id} style={[styles.tmplBtn, bAction === a.id && styles.loadBtn, { marginBottom: 4 }]} onPress={() => setBAction(a.id)}>
            <Text style={bAction === a.id ? styles.loadBtnText : styles.tmplBtnText}>{bAction === a.id ? '☑ ' : '☐ '}{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {isKill && (
        questBosses.length === 0 ? (
          <Text style={styles.err}>Add a main-quest boss in the BOSSES box first — a kill step has to point at one.</Text>
        ) : (
          <>
            <Text style={styles.hint}>Boss (main-quest bosses only):</Text>
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              {questBosses.map((b) => (
                <TouchableOpacity key={b.id} style={[styles.tmplBtn, bBoss === b.id && styles.loadBtn, { marginBottom: 4 }]} onPress={() => pickBoss(b.id)}>
                  <Text style={bBoss === b.id ? styles.loadBtnText : styles.tmplBtnText}>{bBoss === b.id ? '☑ ' : '☐ '}{b.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )
      )}
      {actionDef?.needsTarget && !isKill && (
        <TextInput
          style={[styles.input, { minHeight: 0, height: 40 }]}
          value={bTarget}
          onChangeText={setBTarget}
          placeholder="Target (e.g. the dog tags, an officer)"
          placeholderTextColor="#5c5446"
        />
      )}
      <Text style={styles.hint}>Location:</Text>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {locations.map((l) => (
          <TouchableOpacity key={l.id} style={[styles.tmplBtn, bLoc === l.id && styles.loadBtn, { marginBottom: 4 }]} onPress={() => setBLoc(l.id)}>
            <Text style={bLoc === l.id ? styles.loadBtnText : styles.tmplBtnText}>{bLoc === l.id ? '☑ ' : '☐ '}{l.name}</Text>
          </TouchableOpacity>
        ))}
        {locations.length === 0 && <Text style={styles.hint}>Upload your Locations table first.</Text>}
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1, minHeight: 0, height: 40 }]}
          value={bReward}
          onChangeText={setBReward}
          placeholder="…and collect (optional item)"
          placeholderTextColor="#5c5446"
        />
        <TouchableOpacity style={styles.loadBtn} onPress={addStep}>
          <Text style={styles.loadBtnText}>+ ADD STEP</Text>
        </TouchableOpacity>
      </View>

      {/* JSON path */}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="…or paste a main-quest JSON ({ title, steps: [...] })"
        placeholderTextColor="#5c5446"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => { const r = loadMainQuestJson(text); setStatus(r.ok ? { kind: 'ok', msg: `Loaded ${r.count} step(s).` } : { kind: 'err', msg: r.error ?? 'Failed.' }); if (r.ok) setText(''); }}
        >
          <Text style={styles.loadBtnText}>LOAD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tmplBtn}
          onPress={() => {
            setText(steps.length > 0
              ? JSON.stringify(customMainQuest, null, 2)
              : JSON.stringify({ title: 'Take the Fold', steps: [{ id: 'step_1', action: 'kill', target: 'the boss', bossId: 'a-boss-id', locationId: 'a-location-id', reward: 'dog tags' }, { id: 'step_2', action: 'return_to', locationId: 'your-base-id' }, { id: 'step_3', action: 'claim', locationId: 'your-base-id' }] }, null, 2));
            setStatus({ kind: 'ok', msg: steps.length > 0 ? 'Loaded your quest — edit, then LOAD.' : 'Loaded an example quest — edit, then LOAD.' });
          }}
        >
          <Text style={styles.tmplBtnText}>{steps.length > 0 ? 'EDIT CURRENT' : 'TEMPLATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={async () => {
            const content = text.trim().length > 0 ? text : JSON.stringify(customMainQuest ?? { title: 'My Main Quest', steps: [] }, null, 2);
            const r = await saveJsonToFile('main-quest.json', content);
            setStatus({ kind: r.ok ? 'ok' : 'err', msg: r.msg });
          }}
        >
          <Text style={styles.copyBtnText}>⬇ SAVE FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={async () => { const r = await pickJsonFile(); if (r.canceled) return; if (!r.ok || !r.content) { setStatus({ kind: 'err', msg: r.msg ?? 'Pick failed.' }); return; } const res = loadMainQuestJson(r.content); setStatus(res.ok ? { kind: 'ok', msg: `Loaded ${res.count} step(s) from file.` } : { kind: 'err', msg: res.error ?? 'Failed.' }); }}
        >
          <Text style={styles.loadBtnText}>⬆ UPLOAD FILE</Text>
        </TouchableOpacity>
        {steps.length > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={() => { useContentPackStore.getState().clearMainQuest(); setStatus({ kind: 'ok', msg: 'Cleared main quest.' }); }}>
            <Text style={styles.resetBtnText}>RESET</Text>
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
  const [guideMsg, setGuideMsg] = useState<string | null>(null);
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

      {/* engine_Dev — WHOLE-GAME upload sits at the very top so it's the first
          thing you see: build everything in one file, or skip it and use the
          per-section boxes below. */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Build guide</Text>
          <Text style={styles.badgeOff}>start here</Text>
        </View>
        <Text style={styles.hint}>
          New here? This explains every section and the order to fill them so a game comes together
          cleanly. Save it and read it on the side, or just follow the sections top to bottom.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={async () => { const r = await saveJsonToFile('build-guide.md', buildDevGuide()); setGuideMsg(r.msg); }}
          >
            <Text style={styles.copyBtnText}>⬇ SAVE BUILD GUIDE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tmplBtn}
            onPress={() => { void Clipboard.setStringAsync(buildDevGuide()); setGuideMsg('Build guide copied to clipboard.'); }}
          >
            <Text style={styles.tmplBtnText}>COPY</Text>
          </TouchableOpacity>
        </View>
        {guideMsg && <Text style={styles.ok}>{guideMsg}</Text>}
      </View>

      <Text style={styles.sectionLabel}>★ WHOLE GAME — build it all in one file</Text>
      <GameBundleBox />

      <Text style={styles.sectionLabel}>MAIN QUEST</Text>
      <MainQuestBox />
      <BossesBox />

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

      <Text style={styles.sectionLabel}>MISSIONS</Text>
      <MissionsBox />

      <Text style={styles.sectionLabel}>HOOKS</Text>
      <HooksBox />

      <Text style={styles.sectionLabel}>WHISPERS</Text>
      <WhispersBox />

      <Text style={styles.sectionLabel}>TRAVEL ENCOUNTERS</Text>
      <WastelandBox />

      <Text style={styles.sectionLabel}>INTERACTION TAGS</Text>
      <InteractionTagsBox />

      <Text style={styles.sectionLabel}>STARTING AREAS</Text>
      <StartingAreasBox />
      <TitlesBox />

      <Text style={styles.sectionLabel}>COLLECTABLES</Text>
      <CollectablesBox />

      <Text style={styles.sectionLabel}>SUMMONED SIDEKICKS</Text>
      <SummonsBox />

      <Text style={styles.sectionLabel}>ADVANCED COMBAT &amp; CRAFTING RULES</Text>
      <AdvancedRulesBoxes />

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

      <Text style={styles.sectionLabel}>MAPS</Text>
      <MapsSection />

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
  // engine_Dev — full-width stacked buttons (the whole-game actions are too wide to
  // sit side by side). Column container + centered, stretched buttons.
  stackCol: { flexDirection: 'column', gap: 8, marginTop: 8 },
  stackBtn: { alignItems: 'center', alignSelf: 'stretch' },
  loadBtn: { backgroundColor: '#2a3a22', borderColor: '#9ec96a', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 18 },
  loadBtnText: { color: '#9ec96a', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  tmplBtn: { backgroundColor: '#1a1714', borderColor: '#6a9bbf', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  tmplBtnText: { color: '#6a9bbf', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  copyBtn: { backgroundColor: '#1a1714', borderColor: '#cdbf99', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  copyBtnText: { color: '#cdbf99', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  resetBtn: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  resetBtnText: { color: '#a89a7a', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  titleRowDev: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
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
