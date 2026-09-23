import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BrandedModal } from './BrandedModal';
import { T } from '../ui/tartariaKit';
import type { DogCompanion } from '../engine/types';
import type { ProspectiveDog } from '../engine/dogBreeds';
import { comparableDog, comparisonRows, hpLine, replacementCost } from '../engine/dogComparison';

/** ⚠⚠⚠ THE SURFACE THE OWNER'S HEADLINE IS ABOUT.
 *
 *  *"It is a one-active-companion system in which the player can deliberately
 *   replace a living dog AFTER SEEING EXACTLY WHAT IS BEING GAINED AND LOST."*
 *
 *  Everything on this card exists to make the second half of that sentence
 *  true, and the rules it is built to are the owner's, by number:
 *
 *  §14 EXACT CURRENT / MAXIMUM FOR BOTH DOGS. Not "high potential", not a bar,
 *      not a band — four numbers per stat, printed. `dogComparison.ts` computes
 *      them from the TRAINER's own ceiling authority, so the card cannot
 *      promise a maximum the trainer will not honour.
 *
 *  §15 NO VERDICT. *"The UI must not call one dog 'better.' The player
 *      decides."* There is no winner mark, no delta, no arrow, no green/red on
 *      any stat — and the rows this renders carry no field that could become
 *      one. A Greyhound out-runs a Rottweiler and loses the fight; which of
 *      those you need is not the interface's business.
 *
 *  §16 AFFORDABILITY IS SHOWN, NOT ENFORCED AT THE DOOR. Being short of the
 *      coin greys the confirm and says the shortfall; it never stops the player
 *      opening the card and reading the animal. Window shopping is the feature.
 *
 *  §17/§20 WHAT IS LOST IS NAMED FIRST. The dog's name, that the release is
 *      permanent, and the exact vest that leaves with it.
 *
 *  §19 THE UNEQUIP CONTROL IS HERE, on the surface that tells you the gear
 *      goes. Being told a thing will be lost and having no way to prevent it is
 *      not a choice. It routes through the store's ONE dog-equipment path
 *      (`setDogVest`), not a second hand-written one, and the warning above it
 *      recomputes on the next render — so the player watches the line change.
 *
 *  ⚠⚠ THE SECOND CONFIRM IS NOT CEREMONY. This card is a READING surface; it
 *  can be opened, scrolled and closed all day and nothing moves. The
 *  irreversible write sits behind a separate confirmation that repeats the
 *  price, the name and the permanence — and `confirmLatch` is the OTA-1873
 *  remedy, which applies HERE and not in the store: this guard lives in React
 *  state, which does not update inside the frame, so two taps really would
 *  re-enter on stale truth. (vendorSlice carries the measurement for why the
 *  store layer needs no latch of its own.) */

interface Props {
  visible: boolean;
  /** The animal on the counter. Held by the CALLER across the whole flow, so
   *  the card and the confirm are looking at one individual. */
  prospective: ProspectiveDog | null;
  dog: DogCompanion | null | undefined;
  inventory: ReadonlyArray<{ id: string; name: string; kind?: string; quantity?: number; tags?: readonly string[]; uniqueStats?: { kind?: string } }>;
  tc: number;
  vendorName: string;
  /** Takes the worn vest off, through the store's one dog-equipment path. */
  onUnequipVest: () => void;
  /** The final, irreversible confirmation. Called with the offer's identity so
   *  the store re-finds the animal rather than trusting this card's copy. */
  onAdopt: (offerId: string) => void;
  onClose: () => void;
}

export function DogComparisonModal({
  visible, prospective, dog, inventory, tc, vendorName, onUnequipVest, onAdopt, onClose,
}: Props) {
  /** Two-stage: read, then commit. `null` = reading. */
  const [confirming, setConfirming] = React.useState(false);
  /** ⚠ SYNCHRONOUS. See the header — this is the layer the latch is for. */
  const confirmLatch = useRef<string | null>(null);

  React.useEffect(() => {
    if (!visible) { setConfirming(false); confirmLatch.current = null; }
  }, [visible]);

  if (!visible || !prospective) return null;

  const mine = comparableDog(dog);
  const rows = comparisonRows(dog, prospective);
  const hp = hpLine(dog, prospective);
  const cost = replacementCost({ dog, inventory });
  const afford = tc >= prospective.price;
  const short = prospective.price - tc;

  /* ⚠ THE CONFIRMATION SAYS EVERY IRREVERSIBLE THING, IN THE PLAYER'S OWN
   *  NOUNS. Price, the dog's name, that the release is permanent, and the gear.
   *  A confirmation that says "are you sure?" is not a disclosure. */
  if (confirming) {
    const lines = [
      `${prospective.price} TC leaves your purse.`,
      ...(cost ? [`${cost.dogName} is set free — permanently. ${cost.dogName} is not coming back, and this is not a death: ${cost.dogName} walks away alive.`] : []),
      ...(cost?.vest ? [`The ${cost.vest.name} goes with ${cost.dogName}. You will not have it afterwards.`] : []),
      `You take on the ${prospective.breedLabel} and name it.`,
    ];
    return (
      <BrandedModal
        visible
        title={cost ? `LET ${cost.dogName.toUpperCase()} GO?` : `TAKE ON THE ${prospective.breedLabel.toUpperCase()}?`}
        body={lines.join('\n\n')}
        buttons={[
          { label: 'BACK', onPress: () => setConfirming(false), tone: 'neutral' },
          {
            label: cost ? 'LET GO AND TAKE ON' : 'TAKE ON',
            tone: 'destructive',
            onPress: () => {
              if (confirmLatch.current === prospective.offerId) return;
              confirmLatch.current = prospective.offerId;
              onAdopt(prospective.offerId);
              setConfirming(false);
              onClose();
            },
          },
        ]}
        onRequestClose={() => setConfirming(false)}
      />
    );
  }

  const head = (label: string, sub: string | null) => (
    <View style={s.col}>
      <Text style={s.colHead} numberOfLines={1}>{label}</Text>
      <Text style={s.colSub} numberOfLines={1}>{sub ?? ' '}</Text>
    </View>
  );

  return (
    <BrandedModal
      visible
      title={prospective.breedLabel.toUpperCase()}
      scrollContent={(
        <View style={s.wrap}>
          <Text style={s.trait}>{prospective.trait}</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{prospective.price} TC</Text>
            <Text style={afford ? s.purse : s.purseShort}>
              {afford ? `you have ${tc} TC` : `you have ${tc} TC — ${short} short`}
            </Text>
          </View>
          {prospective.faction ? (
            <Text style={s.faction}>{vendorName} only sells these to their own.</Text>
          ) : null}

          {/* ⚠ THE HEADER SAYS WHICH COLUMN IS WHICH, BY NAME. "Your dog" is
              not a column head when the dog has a name the player chose. */}
          <View style={s.headRow}>
            <View style={s.statCell}><Text style={s.statHeadLabel}> </Text></View>
            {head(mine ? mine.name.toUpperCase() : 'NO DOG', mine ? mine.breed : 'none at your side')}
            {head('ON OFFER', prospective.breedLabel)}
          </View>

          {rows.map((r) => (
            <View key={r.stat} style={s.row}>
              <View style={s.statCell}><Text style={s.statLabel}>{r.label}</Text></View>
              <View style={s.col}>
                {/* ⚠ A BLANK, NOT A ZERO. With no companion there is nothing
                    on this side, and printing 0/0 would be a claim about a dog
                    that does not exist. */}
                <Text style={s.val}>{r.current ? `${r.current.now} / ${r.current.max}` : '—'}</Text>
              </View>
              <View style={s.col}>
                <Text style={s.val}>{r.prospective.now} / {r.prospective.max}</Text>
              </View>
            </View>
          ))}
          <View style={s.row}>
            <View style={s.statCell}><Text style={s.statLabel}>HP</Text></View>
            <View style={s.col}>
              <Text style={s.val}>{hp.current ? `${hp.current.hp} / ${hp.current.hpMax}` : '—'}</Text>
            </View>
            <View style={s.col}><Text style={s.val}>{hp.prospective}</Text></View>
          </View>
          <Text style={s.legend}>
            now / most it can ever reach. A dog on a shelf is never finished — what you are buying is the second number.
          </Text>

          {/* ⚠⚠ WHAT IT COSTS BEYOND COIN, AND THE ONE CONTROL THAT CHANGES IT. */}
          {cost ? (
            <View style={s.lossBox}>
              <Text style={s.lossHead}>IF YOU TAKE THIS DOG</Text>
              <Text style={s.lossLine}>
                {cost.dogName} is set free — permanently, and alive. Nothing of {cost.dogName} carries over.
              </Text>
              {cost.vest ? (
                <>
                  <Text style={s.lossLine}>
                    {cost.dogName} is wearing the {cost.vest.name}. It goes too.
                  </Text>
                  <TouchableOpacity
                    onPress={onUnequipVest}
                    style={s.unequip}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Take the ${cost.vest.name} off ${cost.dogName}`}
                  >
                    <Text style={s.unequipText}>TAKE THE {cost.vest.name.toUpperCase()} OFF FIRST</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={s.lossQuiet}>{cost.dogName} is carrying nothing of yours.</Text>
              )}
            </View>
          ) : null}
        </View>
      )}
      buttons={[
        { label: 'WALK AWAY', onPress: onClose, tone: 'neutral' },
        {
          /* ⚠ THE LABEL SAYS WHICH OF THE TWO THINGS THIS IS. Short of the
             coin it says the shortfall rather than vanishing — the refusal
             speaks, and the card stays readable either way. */
          label: !afford
            ? `${short} TC SHORT`
            : cost ? `REPLACE ${cost.dogName.toUpperCase()}…` : 'TAKE THIS DOG…',
          tone: afford ? 'primary' : 'neutral',
          onPress: () => { if (afford) setConfirming(true); },
        },
      ]}
      onRequestClose={onClose}
    />
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 4 },
  trait: { color: T.inkDim, fontSize: 13, lineHeight: 18, fontStyle: 'italic', marginBottom: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  price: { color: T.gold, fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  purse: { color: T.inkDim, fontSize: 12 },
  purseShort: { color: T.rust, fontSize: 12 },
  faction: { color: T.inkDim, fontSize: 12, marginTop: 4 },
  headRow: {
    flexDirection: 'row', alignItems: 'flex-end', marginTop: 14, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.rim,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  statCell: { width: 44 },
  statHeadLabel: { fontSize: 11 },
  statLabel: { color: T.inkDim, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  col: { flex: 1, alignItems: 'center' },
  colHead: { color: T.ink, fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  colSub: { color: T.inkQuiet, fontSize: 10 },
  // ⚠ tabular-style alignment matters here: four numbers the player is reading
  // ACROSS a row, so they line up rather than drift with glyph width.
  val: { color: T.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  legend: { color: T.inkQuiet, fontSize: 11, lineHeight: 15, marginTop: 8 },
  lossBox: {
    marginTop: 14, padding: 10, borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.rustRim, backgroundColor: 'rgba(90,42,38,0.14)',
  },
  lossHead: { color: T.rust, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  lossLine: { color: T.ink, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  lossQuiet: { color: T.inkDim, fontSize: 12, lineHeight: 17 },
  unequip: {
    marginTop: 6, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.rimAlloy, alignSelf: 'flex-start',
  },
  unequipText: { color: T.ink, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
});
