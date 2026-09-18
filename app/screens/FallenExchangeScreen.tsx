// ⚠⚠⚠ OTA-1842 — FALLEN EXCHANGE, AS A FEATURE INSTEAD OF A PROCEDURE.
//
// The exchange has worked for a long time and has been unusable for just as
// long. Everything it needed a player to do, it asked in the vocabulary of the
// thing underneath: copy this payload, paste their ledger, read the result as a
// row of counts. Owner: trading a Fallen with a friend should feel closer to
// trading in Pokémon GO than to moving a save file.
//
// ⚠ NOTHING BELOW DECIDES ANYTHING. Every question of trust — is this house
// paired, does the seal verify, may this house speak for these dead — is
// answered in `fallenLedgerStore`, exactly as it was before this screen
// existed. This file asks those questions earlier (so the player can see the
// answer before committing) and says them in words. It does not re-ask them,
// soften them, or add a second opinion.
//
// ⚠ TWO DEVICES, NO SERVER. Send hands the payload to the OS share sheet;
// receive takes whatever arrived — pasted, shared into the app, or read off the
// clipboard. A player may choose a destination that uses the internet; that is
// their transport, not Tartaria's infrastructure.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { TScreenHeader, TButton, T } from '../ui/tartariaKit';
import { useGameStore } from '../state/gameStore';
import {
  loadHouseName,
  setHouseName,
  loadPaired,
  myHouseCode,
  acceptHouseCode,
  revokeHouse,
  buildExportPayload,
  previewPayloadText,
  importPayloadText,
  isFallenPersistError,
  isFallenPayloadTooLargeError,
  loadLedger,
  foreignPool,
  type ExchangePreview,
} from '../engine/fallenLedgerStore';
import { fallenTitle, restRollLine, type PairedHouse, type ForeignFallen, type RestRecord } from '../engine/fallenLedger';

/** ⚠ Bounded on purpose — this is a roll, not an archive. §13's own rule. */
const RESTS_SHOWN = 25;

/** ⚠ THE TRUST WORDS. Each is a translation of one state the engine already
 *  computes — never a judgement made here. `verified` is a seal this install
 *  could check against a key the paired house handed over; `legacy` is a house
 *  paired before seals existed, which the engine still admits deliberately and
 *  which the player deserves to be told about rather than reassured about. */
export const TRUST_LABEL: Record<ExchangePreview['trust'], string> = {
  verified: 'VERIFIED HOUSE',
  legacy: 'LEGACY HOUSE — no signature to check',
  refused: 'COULD NOT BE VERIFIED',
};

/** ⚠ Refusals say what happened in the player's terms and nothing about how the
 *  check works. "Wrong key" and "bad HMAC" are our problem, not theirs. */
export function refusalLine(p: ExchangePreview): string {
  switch (p.refusal) {
    case 'forged':
      return 'This exchange could not be verified. It does not match any house you ride with.';
    case 'unpaired':
      return p.fromHouse
        ? `These dead belong to ${p.fromHouse}, a house you do not ride with. Trade house cards first.`
        : 'These dead belong to a house you do not ride with. Trade house cards first.';
    case 'too-large':
      return 'That is far too large to be an exchange. Nothing was read.';
    default:
      return 'That was not an exchange. Nothing was read.';
  }
}

export function FallenExchangeScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const inSession = useGameStore((s) => s.player !== null);
  const [house, setHouse] = useState('');
  const [paired, setPaired] = useState<PairedHouse[]>([]);
  const [codeIn, setCodeIn] = useState('');
  const [incoming, setIncoming] = useState('');
  const [preview, setPreview] = useState<ExchangePreview | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  /* ⚠⚠ OTA-1843 — THE ROLL, READ-ONLY, OUT OF STATE THAT ALREADY PERSISTS.
   * `walking` is the un-rested foreign dead; `rested` is the append-only rest
   * roll. Both come straight off the ledger this screen already loads — no new
   * key, no new record, no migration. That is the whole reason this history
   * could ship at all: the two things the save durably knows are WHO IS STILL
   * HERE and WHO HAS BEEN PUT DOWN, so those are the two things it shows.
   * ⚠ "encountered" and "defeated" are NOT here, and their absence is honest:
   * nothing durable distinguishes them. Defeat IS the rest — the store writes
   * the rest record on the same beat it prints the closing lines — so a
   * "defeated" row would either duplicate "rested" or need a new persisted
   * counter. Deferred rather than faked. */
  const [walking, setWalking] = useState<ForeignFallen[]>([]);
  const [rested, setRested] = useState<RestRecord[]>([]);

  const refresh = useCallback(async () => {
    setHouse(await loadHouseName());
    setPaired(await loadPaired());
    try {
      // ⚠ `loadLedger` first so the sync cache is hydrated; `foreignPool` then
      // answers "who is still walking" through the SAME authority the spawner
      // draws from, rather than this screen re-deriving it and drifting.
      const l = await loadLedger();
      setWalking(foreignPool());
      setRested([...l.rests].sort((x, y) => y.ts - x.ts).slice(0, RESTS_SHOWN));
    } catch { setWalking([]); setRested([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // ---- pairing -------------------------------------------------------------
  const shareMyCard = useCallback(async () => {
    setBusy(true);
    try {
      const code = await myHouseCode();
      await Share.share({ message: code, title: 'My house card — Tartaria' });
      setNote('Your house card is on its way. When they accept it, have them send you theirs.');
    } catch { setNote('Could not share your house card.'); } finally { setBusy(false); }
  }, []);

  const acceptCard = useCallback(async () => {
    setBusy(true);
    try {
      const text = codeIn.trim() || (await Clipboard.getStringAsync()) || '';
      const out = await acceptHouseCode(text);
      if (!out.ok) {
        setNote(out.reason === 'self'
          ? 'That is your own house card.'
          : 'That house card could not be read. Ask them to send it again.');
      } else {
        setNote(out.already ? `You already ride with ${out.house.player}.` : `You now ride with ${out.house.player}.`);
        setCodeIn('');
        await refresh();
      }
    } catch { setNote('That house card could not be read.'); } finally { setBusy(false); }
  }, [codeIn, refresh]);

  const cutOff = useCallback(async (h: PairedHouse) => {
    setBusy(true);
    try {
      await revokeHouse(h.installId);
      setNote(`You no longer ride with ${h.player}. Their Hollowed already here still walk.`);
      await refresh();
    } finally { setBusy(false); }
  }, [refresh]);

  // ---- send ----------------------------------------------------------------
  const sendMyDead = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await buildExportPayload();
      await Share.share({ message: payload, title: 'My fallen — Tartaria' });
      setNote('Sent. When they put your dead down, ask them to send the result back.');
    } catch { setNote('Could not gather your dead. Try again.'); } finally { setBusy(false); }
  }, []);

  // ---- receive: look first --------------------------------------------------
  const look = useCallback(async () => {
    setBusy(true);
    setPreview(null);
    try {
      const text = incoming.trim() || (await Clipboard.getStringAsync()) || '';
      if (!text) { setNote('Nothing to read yet. Paste what they sent, or copy it first.'); return; }
      const p = await previewPayloadText(text);
      setIncoming(text);
      setPreview(p);
      setNote('');
    } catch { setNote('That could not be read.'); } finally { setBusy(false); }
  }, [incoming]);

  /** ⚠ THE ONLY PLACE THIS SCREEN CHANGES ANYTHING. Reached only from a preview
   *  the player has already seen and confirmed. */
  const acceptPreviewed = useCallback(async () => {
    setBusy(true);
    try {
      const out = await importPayloadText(incoming);
      setPreview(null);
      setIncoming('');
      // ⚠⚠ OTA-1843 — ARRIVAL IS A MOMENT, NOT A COUNT. This used to read
      // "2 added, 1 rest" in effect: true, and it told the player nothing about
      // what had just happened to their world. The arrivals are already titled
      // "<name> child of <house>", so the only thing missing was the sentence
      // that says what those names now MEAN — that someone else's dead are in
      // the mud here, and the player will meet them.
      setNote(out.added === 0 && out.rests === 0
        ? 'Nothing new in that one — you already had them.'
        : [
          out.arrivals.length > 0
            ? `${out.arrivals.join(', ')} walk your wastes now. They died in another player's world and the mud here has them. You will meet them.`
            : '',
          out.rests > 0
            ? `${out.rests === 1 ? 'One of your own dead has' : `${out.rests} of your own dead have`} been put down out there. Their story came back with this.`
            : '',
        ].filter(Boolean).join(' '));
      await refresh();
    } catch (e) {
      setPreview(null);
      setNote(isFallenPayloadTooLargeError(e)
        ? 'That is far too large to be an exchange. Nothing was read.'
        : isFallenPersistError(e)
          ? 'They arrived, but could not be written down. Free some space and try again.'
          : 'That could not be read.');
    } finally { setBusy(false); }
  }, [incoming, refresh]);

  /** ⚠ CANCEL MUST COST NOTHING. Dropping the preview is the whole of it: no
   *  import ran, so there is nothing to undo. */
  const cancelPreview = useCallback(() => {
    setPreview(null);
    setNote('Nothing was taken in.');
  }, []);

  return (
    <View style={styles.container}>
      <TScreenHeader
        title="FALLEN EXCHANGE"
        onBack={() => setScreen(inSession ? 'exploration' : 'title')}
        accessibilityLabel="Back"
      />
      {/* ⚠⚠ OTA-1718's RULE, ON A NEW SURFACE. Three text fields, and LOOK AT IT
          sits BELOW the paste box — so an open keyboard can cover the primary
          action, which is the exact defect that suite was written for. This is
          a screen, not a native <Modal>, so iOS's own inset is the right
          mechanism (the ActionReferenceScreen precedent); inside a Modal it is
          unreliable and those surfaces measure instead. `keyboardShouldPersistTaps`
          is the other half: a control below the keyboard must work on the FIRST
          tap, not on a tap that only dismisses. */}
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* ---- who am I ---- */}
        <Text style={styles.heading}>YOUR HOUSE</Text>
        <Text style={styles.desc}>
          Your dead ride out named &quot;&lt;name&gt; child of {house || 'your house'}&quot;. It is how other
          players&apos; worlds know them.
        </Text>
        <TextInput
          style={styles.input}
          value={house}
          onChangeText={setHouse}
          onEndEditing={() => { void setHouseName(house); }}
          onBlur={() => { void setHouseName(house); }}
          placeholder="name your house"
          placeholderTextColor="#7a705c"
          maxLength={32}
          accessibilityLabel="Your house name"
        />

        {/* ---- who I ride with ---- */}
        <Text style={styles.heading}>HOUSES YOU RIDE WITH</Text>
        {paired.length === 0 ? (
          <Text style={styles.desc}>
            You ride alone. Send a friend your house card and accept theirs — then your dead can cross.
          </Text>
        ) : (
          paired.map((h) => (
            <View key={h.installId} style={styles.row}>
              <Text style={styles.rowName}>⚔ {h.player}</Text>
              <Text style={styles.rowTrust}>{h.key ? 'verified' : 'legacy'}</Text>
              <Pressable onPress={() => { void cutOff(h); }} accessibilityRole="button" disabled={busy}>
                <Text style={styles.cut}>CUT OFF</Text>
              </Pressable>
            </View>
          ))
        )}
        <View style={styles.actions}>
          <TButton label="SEND MY HOUSE CARD" variant="utility" compact disabled={busy} onPress={() => { void shareMyCard(); }} />
          <TButton label="ACCEPT THEIR CARD" variant="utility" compact disabled={busy} onPress={() => { void acceptCard(); }} />
        </View>
        <TextInput
          style={styles.input}
          value={codeIn}
          onChangeText={setCodeIn}
          placeholder="paste their house card (or leave blank to use the clipboard)"
          placeholderTextColor="#7a705c"
          maxLength={200}
          accessibilityLabel="Their house card"
        />

        {/* ---- send ---- */}
        <Text style={styles.heading}>SEND YOUR DEAD</Text>
        <Text style={styles.desc}>
          Hands your fallen to whichever app you choose — messages, mail, AirDrop, anything on the sheet.
        </Text>
        <TButton label="SEND MY DEAD" variant="utility" compact disabled={busy} onPress={() => { void sendMyDead(); }} />

        {/* ---- receive ---- */}
        <Text style={styles.heading}>RECEIVE</Text>
        {preview === null ? (
          <>
            <Text style={styles.desc}>
              Paste what they sent you and look at it first — nothing is taken in until you say so.
            </Text>
            <TextInput
              style={styles.payloadBox}
              value={incoming}
              onChangeText={setIncoming}
              placeholder="paste what they sent (or leave blank to use the clipboard)"
              placeholderTextColor="#7a705c"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Incoming exchange"
            />
            <TButton label="LOOK AT IT" variant="utility" compact disabled={busy} onPress={() => { void look(); }} />
          </>
        ) : (
          /* ⚠⚠ THE PREVIEW. This is the screen the whole OTA exists for: who is
             arriving, from whom, and whether that house could be checked —
             before a single record is written. */
          <View style={styles.preview}>
            <Text style={preview.trust === 'refused' ? styles.trustBad : preview.trust === 'legacy' ? styles.trustWarn : styles.trustGood}>
              {TRUST_LABEL[preview.trust]}
            </Text>
            {preview.trust === 'refused' ? (
              <>
                <Text style={styles.desc}>{refusalLine(preview)}</Text>
                <TButton label="CLOSE" variant="utility" compact onPress={cancelPreview} />
              </>
            ) : (
              <>
                <Text style={styles.from}>from {preview.fromHouse || 'an unnamed house'}</Text>
                {preview.arrivals.length > 0 ? (
                  preview.arrivals.map((a) => <Text key={a} style={styles.arrival}>{a}</Text>)
                ) : (
                  <Text style={styles.desc}>No new dead in this one.</Text>
                )}
                {preview.rests > 0 && (
                  <Text style={styles.desc}>
                    {preview.rests} of your own dead have been put down. Their story comes back with this.
                  </Text>
                )}
                {preview.turnedAway > 0 && (
                  <Text style={styles.desc}>
                    {preview.turnedAway} will be turned away — this house cannot speak for them.
                  </Text>
                )}
                <View style={styles.actions}>
                  <TButton label="TAKE THEM IN" variant="utility" compact disabled={busy} onPress={() => { void acceptPreviewed(); }} />
                  <TButton label="CANCEL" variant="utility" compact disabled={busy} onPress={cancelPreview} />
                </View>
              </>
            )}
          </View>
        )}

        {!!note && <Text style={styles.note}>{note}</Text>}

        {/* ---- the roll: who is here, and who has been put down ---- */}
        <Text style={styles.heading}>THE ROLL</Text>
        {walking.length === 0 && rested.length === 0 ? (
          <Text style={styles.desc}>
            No one else&apos;s dead have walked here yet. When they do, they are named here until you put them down.
          </Text>
        ) : (
          <>
            {walking.length > 0 && (
              <>
                <Text style={styles.desc}>
                  {walking.length === 1 ? 'One of them walks' : `${walking.length} of them walk`} your wastes. Each was a real
                  character in someone else&apos;s game.
                </Text>
                {walking.map((h) => (
                  <View key={`w_${h.origin.installId}_${h.ts}`} style={styles.rollRow}>
                    <Text style={styles.rollName}>☗ {fallenTitle(h)}</Text>
                    <Text style={styles.rollMeta}>{h.raceName} • fell at {h.locationName} • {h.kills} foes</Text>
                    {!!h.epitaph && <Text style={styles.rollEpitaph}>{h.epitaph}</Text>}
                  </View>
                ))}
              </>
            )}
            {rested.length > 0 && (
              <>
                <Text style={styles.subHeading}>PUT TO REST</Text>
                {rested.map((r) => (
                  <Text key={`r_${r.fallenKey}_${r.ts}`} style={styles.rollRested}>† {restRollLine(r)}</Text>
                ))}
                {/* ⚠ Bounded, and it says so rather than pretending to be complete. */}
                <Text style={styles.rollNote}>The last {RESTS_SHOWN} closings. Send your dead across and this news goes with them.</Text>
              </>
            )}
          </>
        )}

        {/* ---- the old road, kept but demoted ---- */}
        <Pressable
          onPress={() => setAdvanced((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Manual exchange"
          accessibilityState={{ expanded: advanced }}
        >
          <Text style={styles.advToggle}>{advanced ? '▾ MANUAL EXCHANGE' : '▸ MANUAL EXCHANGE'}</Text>
        </Pressable>
        {advanced && (
          <View>
            {/* ⚠ Kept for recovery, for a device whose share sheet cannot carry
                this, and for the day something goes wrong and the raw text is
                the only thing that helps. It is no longer the normal road. */}
            <Text style={styles.desc}>
              Copies the same thing SEND MY DEAD shares, as plain text, for when the share sheet cannot carry it.
            </Text>
            <TButton
              label="COPY RAW EXCHANGE"
              variant="utility"
              compact
              disabled={busy}
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await Clipboard.setStringAsync(await buildExportPayload());
                    setNote('Copied.');
                  } catch { setNote('Could not copy.'); } finally { setBusy(false); }
                })();
              }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  body: { paddingBottom: 28 },
  heading: { color: '#c9a86a', fontSize: 13, letterSpacing: 1.2, marginTop: 16, marginBottom: 6 },
  desc: { color: '#a89a80', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: T.rim, color: '#e8dcc0', paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, marginBottom: 10, borderRadius: 3,
  },
  payloadBox: {
    borderWidth: 1, borderColor: T.rim, color: '#e8dcc0', paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 11, minHeight: 84, marginBottom: 10, borderRadius: 3, textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  rowName: { color: '#e8dcc0', fontSize: 13, flex: 1 },
  rowTrust: { color: '#8aa0a4', fontSize: 11, marginRight: 12 },
  cut: { color: '#9c5b52', fontSize: 11, letterSpacing: 0.8 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  preview: { borderWidth: 1, borderColor: T.rim, borderRadius: 3, padding: 12, marginBottom: 10 },
  trustGood: { color: '#7fa05a', fontSize: 12, letterSpacing: 1.1, marginBottom: 4 },
  trustWarn: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.1, marginBottom: 4 },
  trustBad: { color: '#9c5b52', fontSize: 12, letterSpacing: 1.1, marginBottom: 4 },
  from: { color: '#a89a80', fontSize: 12, marginBottom: 8 },
  arrival: { color: '#e8dcc0', fontSize: 14, marginBottom: 3 },
  note: { color: '#c9a86a', fontSize: 12, lineHeight: 17, marginTop: 10 },
  advToggle: { color: '#7a705c', fontSize: 11, letterSpacing: 1, marginTop: 22 },
  subHeading: { color: '#8aa0a4', fontSize: 11, letterSpacing: 1.1, marginTop: 14, marginBottom: 6 },
  rollRow: { borderLeftWidth: 2, borderLeftColor: T.rim, paddingLeft: 8, marginBottom: 10 },
  rollName: { color: '#e8dcc0', fontSize: 14, marginBottom: 2 },
  rollMeta: { color: '#a89a80', fontSize: 11, marginBottom: 2 },
  rollEpitaph: { color: '#8a8069', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  rollRested: { color: '#a89a80', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  rollNote: { color: '#7a705c', fontSize: 11, lineHeight: 16, marginTop: 6 },
});
