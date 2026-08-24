// ⚠⚠ OTA-1488 — THE ONE-TIME CRASH-DELIVERY NOTICE.
//
// Owner: *"let's have a popup explaining the automatic crash reporting has been
// turned on and explain to them where to turn it off and here is an image of
// where it is so they can visually see where to turn it off. this is just a
// one time pop-up."* The image below IS his screenshot — the real SETTINGS →
// SESSION → REPORTING card off his own device, cropped, with the row framed in
// teal and the switch framed in gold — so what the popup shows is exactly what
// the player will find.
//
// ⚠⚠ AND THE NOTICE GATES THE FIRST SEND. OTA-1487 made delivery opt-out;
// App.tsx skips the boot flush while this notice is still owed, and the flush
// runs when the player dismisses it instead. So the sequence every player gets
// is: told first, sent second — never the other way around. Every later boot
// flushes normally (the flag is stored).
//
// ⚠ WHO SEES IT: players whose delivery is actually ON (configured + not
// opted out) and who have not seen it, once. A player with a recorded OFF —
// from any version — never sees it, because for them nothing changed.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import {
  crashNoticeNeeded, markCrashNoticeSeen, setReportingEnabled, flushCrashReports,
} from '../diagnostics/crashReporter';

export function CrashReportNoticeOverlay() {
  const [visible, setVisible] = useState(false);
  // ⚠⚠ OTA-1489 — EXPLICIT PIXELS, NOT A PERCENTAGE. The first shipped cut
  // styled the screenshot `width: '100%'` — but inside this card nothing above
  // it has a determinate width, so React Native fell back to the image's
  // NATIVE size (1020px) and the owner got a popup showing one corner of a
  // 2.4×-screen-wide picture ("waaaaaaaay to big"). Width is now computed
  // from the window and the height from the asset's real 1020×770 ratio.
  const { width: windowW } = useWindowDimensions();
  const shotW = Math.min(windowW - 44, 560); // card padding ×2; sane cap on tablets
  const shotH = Math.round(shotW * (770 / 1020));

  useEffect(() => {
    let live = true;
    void crashNoticeNeeded().then((need) => { if (live && need) setVisible(true); });
    return () => { live = false; };
  }, []);

  if (!visible) return null;

  const keepOn = () => {
    setVisible(false);
    void markCrashNoticeSeen().then(() => { void flushCrashReports(); });
  };
  const turnOff = () => {
    setVisible(false);
    // ⚠ Order matters: the preference lands before the seen-flag, so even a
    // kill between the two writes can never produce a boot that flushes.
    void setReportingEnabled(false).then(() => { void markCrashNoticeSeen(); });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={keepOn}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.kicker}>AUTOMATIC CRASH REPORTS</Text>
            <View style={styles.rule} />
            <Text style={styles.body}>
              Crash reporting is now ON by default. If the game crashes, a technical
              report — the error, which build you were on, and what the game was doing —
              is sent so the crash can be fixed. It never includes your saves, your
              characters, or anything you typed.
            </Text>
            <Text style={styles.body}>
              You can turn it off any time: SETTINGS → SESSION tab → REPORTING —
              the switch is right here:
            </Text>
            <Image
              source={require('../../assets/crash-notice-where.png')}
              style={[styles.shot, { width: shotW, height: shotH }]}
              resizeMode="contain"
              accessibilityLabel="The Settings screen, Session tab, Reporting section, with the Automatic Crash Reports row and its ON switch highlighted"
            />
            <Text style={styles.fine}>
              Turning it off is permanent until you turn it back on — the game never
              overrides your choice. You will only see this notice once.
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={turnOff}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Turn automatic crash reports off now"
              >
                <Text style={styles.btnGhostText}>TURN OFF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnMain}
                onPress={keepOn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Keep automatic crash reports on"
              >
                <Text style={styles.btnMainText}>KEEP ON</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 6, 8, 0.97)', justifyContent: 'center' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  card: { paddingHorizontal: 22 },
  kicker: {
    color: '#e8c766', fontSize: 14, letterSpacing: 4, fontWeight: '800', textAlign: 'center',
  },
  rule: { height: 1, backgroundColor: '#3a4448', marginVertical: 14, marginHorizontal: 40 },
  body: { color: '#d8cfc0', fontSize: 15, lineHeight: 23, marginBottom: 12 },
  shot: {
    alignSelf: 'center', borderRadius: 4,
    borderWidth: 1, borderColor: '#4a4136', marginBottom: 12,
  },
  fine: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  btnGhost: {
    borderWidth: 1, borderColor: '#6f93c4', borderRadius: 3,
    paddingVertical: 10, paddingHorizontal: 22,
  },
  btnGhostText: { color: '#9db8dd', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  btnMain: {
    backgroundColor: '#c9a86a', borderRadius: 3, paddingVertical: 10, paddingHorizontal: 22,
  },
  btnMainText: { color: '#13110f', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
