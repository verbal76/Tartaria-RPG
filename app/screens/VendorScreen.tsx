import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from '../components/BrandedModal';
import { getItemPreview } from '../components/itemPreview';
import { sellPriceFor, isUnsellable } from '../engine/sellPrice';
import { availableFactionQuests, FACTION_QUESTS } from '../engine/factionQuests';
import { availableHunts, HUNTS } from '../engine/hunts';
import { availableMysteries, MYSTERIES } from '../engine/mysteries';
import { availableStorylines, STORYLINES } from '../engine/factionStorylines';
import { getStanding } from '../engine/factions';
import { corruptionTierOf, corruptionPriceMultiplier } from '../engine/corruption';

function rarityColor(rarity: string | null | undefined): string {
  switch (rarity) {
    case 'Legendary': return '#e07a5f';
    case 'Rare': return '#b88ce0';
    case 'Uncommon': return '#9ec96a';
    default: return '#c9a86a';
  }
}

type Mode = 'buy' | 'sell' | 'contracts';
type Pending =
  | { mode: 'buy'; itemName: string; price: number }
  | { mode: 'sell'; itemName: string; price: number }
  | { mode: 'steal'; itemName: string; dc: number }
  | { mode: 'dismiss' }
  | { mode: 'accept'; kind: 'faction' | 'hunt' | 'mystery' | 'storyline'; title: string; reward: string }
  | null;

export function VendorScreen() {
  const player = useGameStore((s) => s.player);
  const scene = useGameStore((s) => s.currentScene);
  const setScreen = useGameStore((s) => s.setScreen);
  const buyFromVendor = useGameStore((s) => s.buyFromVendor);
  const sellToVendor = useGameStore((s) => s.sellToVendor);
  const stealFromVendor = useGameStore((s) => s.stealFromVendor);
  const dismissVendor = useGameStore((s) => s.dismissVendor);
  const acceptFactionQuest = useGameStore((s) => s.acceptFactionQuest);
  const acceptHunt = useGameStore((s) => s.acceptHunt);
  const acceptMystery = useGameStore((s) => s.acceptMystery);
  const acceptStoryline = useGameStore((s) => s.acceptStoryline);
  const tutorialDemoVendor = useGameStore((s) => s.tutorialDemoVendor);

  const [mode, setMode] = useState<Mode>('buy');
  const [pending, setPending] = useState<Pending>(null);
  // v2.4.1 (OTA 022) — sellSort must live ABOVE the early-return guard
  // below. The prior position (line 104) made hook count depend on
  // vendor being non-null: when a vendor was dismissed mid-render
  // (e.g. caught stealing → vendor cleared → combat starts), the
  // early return fired and React saw 2 hooks instead of 3 — the
  // "Rendered fewer hooks than expected" crash. All hooks must
  // unconditionally precede any return statement in this component.
  const [sellSort, setSellSort] = useState<'name' | 'value' | 'rarity'>('value');

  const vendor = scene?.vendor ?? null;

  if (!player || !vendor) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No vendor is present.</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setScreen('exploration')}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const openBuy = (itemName: string, price: number) => setPending({ mode: 'buy', itemName, price });
  const openSell = (itemName: string, price: number) => setPending({ mode: 'sell', itemName, price });
  // OTA 030 — steal DC is tiered by vendor source. Hub vendors have no
  // demeanor and default to DC 16 (alert, help nearby). Roadside
  // sketchy = DC 11, honest = DC 14. Pre-compute here so the
  // confirmation modal can show DEX vs DC up-front.
  const stealDc = vendor.demeanor === 'sketchy' ? 11 : vendor.demeanor === 'honest' ? 14 : 16;
  const openSteal = (itemName: string) => setPending({ mode: 'steal', itemName, dc: stealDc });
  const openDismiss = () => setPending({ mode: 'dismiss' });
  const cancel = () => setPending(null);
  const confirmAction = () => {
    if (!pending) return;
    if (pending.mode === 'buy') buyFromVendor(pending.itemName);
    else if (pending.mode === 'sell') sellToVendor(pending.itemName);
    else if (pending.mode === 'steal') stealFromVendor(pending.itemName);
    else if (pending.mode === 'dismiss') dismissVendor();
    else if (pending.mode === 'accept') {
      if (pending.kind === 'faction') acceptFactionQuest(pending.title);
      else if (pending.kind === 'hunt') acceptHunt(pending.title);
      else if (pending.kind === 'mystery') acceptMystery(pending.title);
      else if (pending.kind === 'storyline') acceptStoryline(pending.title);
    }
    setPending(null);
  };

  const preview = pending && (pending.mode === 'buy' || pending.mode === 'sell')
    ? getItemPreview(pending.itemName)
    : null;
  const canAffordPending = pending?.mode === 'buy' ? player.tc >= pending.price : true;
  // OTA 039 — corruption-tier markup. Multiplied into every BUY
  // display price + applied for real in gameStore.buyFromVendor.
  const corruptionTier = corruptionTierOf(player.corruption ?? 0);
  const corruptionMult = corruptionPriceMultiplier(corruptionTier);
  const corruptionMarkupPct = Math.round((corruptionMult - 1) * 100);
  // Inventory items the player can sell — exclude equipped + unsellable.
  const equippedNames = new Set(
    Object.values(player.equipped ?? {}).filter((n): n is string => !!n),
  );
  // HANDOFF #12 — sell-back UI polish. Sort options so the player can
  // surface the most valuable junk first (default), alphabetize for
  // hunting, or group by rarity for clearing low-tier clutter.
  const RARITY_ORDER: Record<string, number> = { Legendary: 0, Rare: 1, Uncommon: 2, Common: 3 };
  const sellable = player.inventory
    .filter((i) => i.quantity > 0 && !equippedNames.has(i.name) && !isUnsellable(i))
    .map((i) => ({ item: i, price: sellPriceFor(i, vendor) }))
    .filter((x) => x.price > 0)
    .sort((a, b) => {
      if (sellSort === 'name') return a.item.name.localeCompare(b.item.name);
      if (sellSort === 'rarity') {
        const ra = RARITY_ORDER[a.item.rarity ?? 'Common'] ?? 99;
        const rb = RARITY_ORDER[b.item.rarity ?? 'Common'] ?? 99;
        if (ra !== rb) return ra - rb;
        return b.price - a.price;
      }
      return b.price - a.price; // default: most valuable first
    });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SHOP</Text>
        <TouchableOpacity
          onPress={openDismiss}
          style={styles.dismissBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.dismissText}>DISMISS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.vendorCard}>
        <Text style={styles.vendorName}>{vendor.name}</Text>
        <Text style={styles.vendorTitle}>{vendor.title}</Text>
        <Text style={styles.vendorDesc}>{vendor.description}</Text>
      </View>

      {tutorialDemoVendor && (
        <View style={styles.tourBanner}>
          <Text style={styles.tourBannerText}>
            TOUR MODE — buy, sell, and contracts are disabled. Irma vanishes when the tour ends.
          </Text>
        </View>
      )}

      <View style={styles.walletRow}>
        <Text style={styles.walletLabel}>Your purse</Text>
        <Text style={styles.walletValue}>{player.tc} TC</Text>
      </View>
      {corruptionMarkupPct > 0 && (
        <Text style={styles.corruptionMarkup}>
          ⚠ +{corruptionMarkupPct}% prices — your aether unsettles them. ({corruptionTier})
        </Text>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, mode === 'buy' && styles.tabActive]}
          onPress={() => setMode('buy')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, mode === 'buy' && styles.tabTextActive]}>BUY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'sell' && styles.tabActive]}
          onPress={() => setMode('sell')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, mode === 'sell' && styles.tabTextActive]}>SELL</Text>
        </TouchableOpacity>
        {vendor.faction && (
          <TouchableOpacity
            style={[styles.tab, mode === 'contracts' && styles.tabActive]}
            onPress={() => setMode('contracts')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, mode === 'contracts' && styles.tabTextActive]}>CONTRACTS</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {mode === 'contracts' ? (
          (() => {
            // OTA 220 — faction-less vendors (Velar Shadowblade etc.)
            // can still offer "open contracts" — hunts/mysteries
            // authored with factionId=null. Previously this branch
            // returned a flat refusal. Faction quests + storylines
            // remain factional by design (they're authored per
            // faction) so we only fetch hunts + mysteries for
            // unaffiliated traders. Playtester: "how come velar
            // shadowblade doesn't have any quests? was there an
            // update that took the quests away from the vendors?"
            const rep = vendor.faction ? getStanding(player.factionStanding, vendor.faction) : 0;
            const quests = vendor.faction
              ? availableFactionQuests(
                  vendor.faction,
                  rep,
                  player.activeFactionQuestIds ?? [],
                  player.completedFactionQuestIds ?? [],
                )
              : [];
            const hunts = availableHunts(
              vendor.faction,
              rep,
              (player.activeHunts ?? []).map((h) => h.id),
              player.completedHuntIds ?? [],
            );
            const mysteries = availableMysteries(
              vendor.faction,
              rep,
              (player.activeMysteries ?? []).map((m) => m.id),
              player.completedMysteryIds ?? [],
            );
            const stories = vendor.faction
              ? availableStorylines(
                  vendor.faction,
                  rep,
                  (player.activeStorylines ?? []).map((s) => s.id),
                  player.completedStorylineIds ?? [],
                )
              : [];
            const total = quests.length + hunts.length + mysteries.length + stories.length;
            if (total === 0) {
              const tail = vendor.faction
                ? `Build reputation with the ${vendor.faction.replace(/_/g, ' ')} or finish what you're already carrying.`
                : `No open contracts pending for this trader right now — check back after the next hunt cycle, or finish what you're already carrying.`;
              return (
                <Text style={styles.empty}>
                  {vendor.name} has no contracts on offer for you right now. {tail}
                </Text>
              );
            }
            return (
              <>
                {quests.length > 0 && (
                  <View style={styles.contractSection}>
                    <Text style={styles.contractSectionTitle}>FACTION CONTRACTS</Text>
                    {quests.map((q) => (
                      <TouchableOpacity
                        key={`fq_${q.id}`}
                        style={styles.contractRow}
                        onPress={() => setPending({ mode: 'accept', kind: 'faction', title: q.title, reward: `${q.reward.tc} TC, +${q.reward.rep} rep` })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.offerStripe, { backgroundColor: '#c9a86a' }]} />
                        <View style={styles.offerBody}>
                          <View style={styles.offerHead}>
                            <Text style={styles.offerName} numberOfLines={2}>{q.title}</Text>
                            <Text style={styles.contractReward}>{q.reward.tc} TC</Text>
                          </View>
                          <Text style={styles.contractBody}>{q.objective}</Text>
                          <Text style={styles.contractDesc} numberOfLines={3}>{q.description}</Text>
                          <Text style={styles.contractAccept}>tap to accept</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {hunts.length > 0 && (
                  <View style={styles.contractSection}>
                    <Text style={styles.contractSectionTitle}>BOUNTIES</Text>
                    {hunts.map((h) => (
                      <TouchableOpacity
                        key={`h_${h.id}`}
                        style={styles.contractRow}
                        onPress={() => setPending({ mode: 'accept', kind: 'hunt', title: h.title, reward: `${h.rewardTc} TC${h.rewardRep ? `, +${h.rewardRep} rep` : ''}` })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.offerStripe, { backgroundColor: '#e07a5f' }]} />
                        <View style={styles.offerBody}>
                          <View style={styles.offerHead}>
                            <Text style={styles.offerName} numberOfLines={2}>{h.title}</Text>
                            <Text style={styles.contractReward}>{h.rewardTc} TC</Text>
                          </View>
                          <Text style={styles.contractDesc} numberOfLines={3}>{h.posterText}</Text>
                          <Text style={styles.contractAccept}>tap to accept</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {mysteries.length > 0 && (
                  <View style={styles.contractSection}>
                    <Text style={styles.contractSectionTitle}>MYSTERIES</Text>
                    {mysteries.map((m) => (
                      <TouchableOpacity
                        key={`m_${m.id}`}
                        style={styles.contractRow}
                        onPress={() => setPending({ mode: 'accept', kind: 'mystery', title: m.title, reward: `${m.rewardTc} TC${m.rewardRep ? `, +${m.rewardRep} rep` : ''}` })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.offerStripe, { backgroundColor: '#b88ce0' }]} />
                        <View style={styles.offerBody}>
                          <View style={styles.offerHead}>
                            <Text style={styles.offerName} numberOfLines={2}>{m.title}</Text>
                            <Text style={styles.contractReward}>{m.rewardTc} TC</Text>
                          </View>
                          <Text style={styles.contractDesc} numberOfLines={3}>{m.posterText}</Text>
                          <Text style={styles.contractAccept}>tap to accept</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {stories.length > 0 && (
                  <View style={styles.contractSection}>
                    <Text style={styles.contractSectionTitle}>STORYLINES</Text>
                    {stories.map((s) => (
                      <TouchableOpacity
                        key={`s_${s.id}`}
                        style={styles.contractRow}
                        onPress={() => setPending({ mode: 'accept', kind: 'storyline', title: s.title, reward: `${s.rewardTc} TC, +${s.rewardRep} rep` })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.offerStripe, { backgroundColor: '#9ec96a' }]} />
                        <View style={styles.offerBody}>
                          <View style={styles.offerHead}>
                            <Text style={styles.offerName} numberOfLines={2}>{s.title}</Text>
                            <Text style={styles.contractReward}>{s.rewardTc} TC</Text>
                          </View>
                          <Text style={styles.contractDesc} numberOfLines={3}>{s.posterText}</Text>
                          <Text style={styles.contractAccept}>tap to accept</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            );
          })()
        ) : mode === 'buy' ? (
          vendor.offers.length === 0 ? (
            <Text style={styles.empty}>The vendor's pack is empty. Nothing more to trade.</Text>
          ) : (
            vendor.offers.map((o, i) => {
              // OTA 039 — corruption-tier markup. Show the marked-up
              // price; canAfford / buyFromVendor both compute on the
              // same value so the player never sees a mismatch.
              const effPrice = Math.ceil(o.price * corruptionMult);
              const canAfford = player.tc >= effPrice;
              const itemPreview = getItemPreview(o.itemName);
              const owned = player.inventory
                .filter((inv) => inv.name.toLowerCase() === o.itemName.toLowerCase())
                .reduce((sum, inv) => sum + inv.quantity, 0);
              return (
                <View
                  key={`buy_${o.itemName}_${i}`}
                  style={[styles.offerRow, !canAfford && styles.offerRowBroke]}
                >
                  <View style={[styles.offerStripe, { backgroundColor: rarityColor(itemPreview.rarity) }]} />
                  <TouchableOpacity
                    style={styles.offerBody}
                    onPress={() => openBuy(o.itemName, effPrice)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>{o.itemName}</Text>
                      <Text style={[styles.offerPrice, !canAfford && styles.offerPriceBroke]}>
                        {effPrice} TC
                      </Text>
                    </View>
                    <View style={styles.offerSubHead}>
                      <Text style={styles.offerKind} numberOfLines={1}>
                        {itemPreview.kindLabel}{itemPreview.rarity ? ` · ${itemPreview.rarity}` : ''}
                      </Text>
                      {owned > 0 && (
                        <Text style={styles.offerOwned}>you have {owned}</Text>
                      )}
                    </View>
                    {itemPreview.stats.length > 0 && (
                      <Text style={styles.offerStats} numberOfLines={2}>
                        {itemPreview.stats.join(' · ')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {/* OTA 030 — STEAL button. DC stamped on the chip so the
                      player knows the risk before tapping. */}
                  {!tutorialDemoVendor && (
                    <TouchableOpacity
                      onPress={() => openSteal(o.itemName)}
                      style={styles.stealBtn}
                      hitSlop={6}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.stealText}>STEAL</Text>
                      <Text style={styles.stealDc}>DC {stealDc}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )
        ) : (
          // SELL mode — inventory list with sell prices.
          <>
            {sellable.length > 0 && (
              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>Sort:</Text>
                {(['value', 'rarity', 'name'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSellSort(s)}
                    style={[styles.sortTab, sellSort === s && styles.sortTabActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sortTabText, sellSort === s && styles.sortTabTextActive]}>
                      {s === 'value' ? 'VALUE' : s === 'rarity' ? 'RARITY' : 'NAME'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {sellable.length === 0 ? (
              <Text style={styles.empty}>
                Nothing in your pack worth selling. Equipped gear can't be sold — unequip from the
                Inventory tab first, then come back to trade.
              </Text>
            ) : (
              sellable.map(({ item, price }) => {
              const preview = getItemPreview(item.name);
              return (
                <TouchableOpacity
                  key={`sell_${item.id}`}
                  style={styles.offerRow}
                  onPress={() => openSell(item.name, price)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.offerStripe, { backgroundColor: rarityColor(preview.rarity) }]} />
                  <View style={styles.offerBody}>
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>
                        {item.name}{item.quantity > 1 ? ` (x${item.quantity})` : ''}
                      </Text>
                      <Text style={styles.sellPrice}>+{price} TC</Text>
                    </View>
                    <View style={styles.offerSubHead}>
                      <Text style={styles.offerKind} numberOfLines={1}>
                        {preview.kindLabel}{preview.rarity ? ` · ${preview.rarity}` : ''}
                      </Text>
                      {item.durability && (
                        <Text style={styles.offerOwned}>
                          {item.durability.current}/{item.durability.max} dur
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
            )}
          </>
        )}
      </ScrollView>

      <BrandedModal
        visible={pending !== null}
        title={
          pending?.mode === 'dismiss'
            ? `Dismiss ${vendor.name}?`
            : pending?.mode === 'sell'
              ? `Sell to ${vendor.name}`
              : pending?.mode === 'steal'
                ? `Steal ${pending.itemName}?`
                : pending?.mode === 'accept'
                  ? `Accept "${pending.title}"`
                  : canAffordPending
                    ? `Buy from ${vendor.name}`
                    : 'Not enough TC'
        }
        itemPreview={pending?.mode === 'accept' ? null : preview}
        contextLine={
          pending?.mode === 'dismiss'
            ? 'They leave the scene. New offers will come from the next vendor who shows up.'
            : pending?.mode === 'sell'
              ? `Price: +${pending.price} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc + pending.price} TC`
              : pending?.mode === 'steal'
                ? `DEX ${player.stats.dexterity} vs DC ${pending.dc}. On a miss, ${vendor.name} draws steel and the deal becomes a fight.${vendor.faction ? ` Caught theft tanks rep with ${vendor.faction.replace(/_/g, ' ')}.` : ''}`
                : pending?.mode === 'accept'
                  ? `Reward on completion: ${pending.reward}. The contract starts now — you can review it on the Contracts screen.`
                  : pending?.mode === 'buy'
                    ? canAffordPending
                      ? `Price: ${pending.price} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc - pending.price} TC`
                      : `Price: ${pending.price} TC   ·   You only have ${player.tc} TC.`
                    : undefined
        }
        buttons={
          pending?.mode === 'dismiss'
            ? [
                { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                { label: 'Dismiss', onPress: confirmAction, tone: 'destructive' },
              ]
            : pending?.mode === 'sell'
              ? [
                  { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                  { label: 'Sell', onPress: confirmAction, tone: 'primary' },
                ]
              : pending?.mode === 'steal'
                ? [
                    { label: 'Back off', onPress: cancel, tone: 'neutral' },
                    { label: 'Lift it', onPress: confirmAction, tone: 'destructive' },
                  ]
                : pending?.mode === 'accept'
                  ? [
                      { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                      { label: 'Accept', onPress: confirmAction, tone: 'primary' },
                    ]
                  : pending?.mode === 'buy' && canAffordPending
                    ? [
                        { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                        { label: 'Buy', onPress: confirmAction, tone: 'primary' },
                      ]
                    : [{ label: 'OK', onPress: cancel, tone: 'neutral' }]
        }
        onRequestClose={cancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  dismissBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#7a4040',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  dismissText: { color: '#e07a5f', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#2a2520',
    borderColor: '#c9a86a',
  },
  tabText: { color: '#7a705c', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  tabTextActive: { color: '#c9a86a' },
  sellPrice: { color: '#9ec96a', fontSize: 12, fontWeight: '700' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, paddingHorizontal: 2 },
  sortLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginRight: 4 },
  sortTab: { paddingHorizontal: 8, paddingVertical: 3, borderColor: '#3a342c', borderWidth: 1, borderRadius: 2 },
  sortTabActive: { borderColor: '#c9a86a' },
  sortTabText: { color: '#7a705c', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  sortTabTextActive: { color: '#c9a86a' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  vendorCard: {
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  vendorName: { color: '#c9a86a', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  vendorTitle: { color: '#7a705c', fontSize: 11, letterSpacing: 1, marginTop: 1 },
  vendorDesc: { color: '#cdbf99', fontSize: 12, marginTop: 6, lineHeight: 17, fontStyle: 'italic' },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  walletLabel: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  corruptionMarkup: {
    color: '#e07a5f',
    fontSize: 10,
    letterSpacing: 1,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  walletValue: { color: '#c9a86a', fontSize: 13, fontWeight: '700' },
  tourBanner: {
    backgroundColor: '#2a1f12',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  tourBannerText: {
    color: '#c9a86a',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 12 },
  offerRow: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  offerRowBroke: { opacity: 0.45 },
  offerStripe: { width: 4 },
  offerBody: { flex: 1, padding: 10 },
  // CONTRACTS tab — vendor-side list of available hunts / mysteries
  // / storylines / faction quests. Reuses offerStripe / offerHead /
  // offerName from the BUY rows but with quest-specific reward +
  // body styling.
  contractSection: { marginBottom: 10 },
  contractSectionTitle: { color: '#c9a86a', fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  contractRow: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  contractReward: { color: '#9ec96a', fontSize: 13, fontWeight: '700' },
  contractBody: { color: '#cdbf99', fontSize: 12, marginTop: 2, marginBottom: 4, fontStyle: 'italic' },
  contractDesc: { color: '#a89c7a', fontSize: 11, lineHeight: 15 },
  contractAccept: { color: '#c9a86a', fontSize: 10, marginTop: 6, letterSpacing: 1, fontStyle: 'italic' },
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  offerName: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  offerPrice: { color: '#c9a86a', fontSize: 12, fontWeight: '700' },
  offerPriceBroke: { color: '#7a705c' },
  offerSubHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  offerKind: { color: '#7a705c', fontSize: 10, letterSpacing: 1, flex: 1 },
  offerOwned: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStats: { color: '#cdbf99', fontSize: 11, marginTop: 4 },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
  // OTA 030 — steal button sits at the right edge of every BUY row.
  // Darker tone than BUY so the player reads it as the risky path.
  stealBtn: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#221512',
    borderLeftColor: '#7a4040',
    borderLeftWidth: 1,
  },
  stealText: { color: '#e07a5f', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  stealDc: { color: '#7a4040', fontSize: 9, letterSpacing: 1, marginTop: 1 },
});
