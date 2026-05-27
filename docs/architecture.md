# Tartaria Realms — Hybrid AI Interaction Architecture

## Purpose

This document defines the architecture for converting Tartaria Realms from a rigid parser-driven text game into a responsive hybrid intelligence RPG.

Primary design philosophy: **Reward curiosity. Never punish imagination.**

---

## Core Design Philosophy

The player must FEEL like:

- the game understands intent
- the world reacts dynamically
- discoveries matter
- experimentation is rewarded
- language is flexible
- progression is visible
- danger escalates over time
- the Arbiter is intelligent

The player should NEVER feel like:

- they must guess hidden keywords
- only buttons work reliably
- the AI is confused constantly
- actions do not matter
- searching is pointless
- the game repeats itself endlessly

The single biggest goal of the interaction system is preserving immersion momentum. If the player attempts something reasonable: reinterpret it, infer intent, partially succeed, guide them forward, provide feedback. Do NOT hard fail unless absolutely necessary.

---

## Overall Architecture

Tartaria Realms is a **hybrid intelligence system**, not a full AI-driven game:

- deterministic gameplay systems
- AI-assisted interpretation
- AI-enhanced narration
- structured game state
- minimal token usage

The AI is NOT the game engine. The AI is a flavor and interpretation layer.

---

## Layer 1 — Input Normalization

Convert messy human language into clean structured intent. Fast, lightweight, deterministic, mostly offline.

Features:

- Typo correction (missing/swapped letters, common misspellings)
- Synonym mapping (look/inspect/observe/examine → OBSERVE; search/investigate/scavenge → SEARCH_AREA; eat/consume/devour → USE_FOOD)
- Inventory awareness ("use torch" with one torch in pack → Aetheric Torch automatically)
- Context memory (scene-mentioned nouns like "humming stone" resolve "inspect the humming")
- Confidence score per parse (high → execute; medium → execute with clarifier; low → suggest)

**Never hard fail.** Replace "I do not understand" with reinterpretation, partial success, redirect, suggestion, or in-world Arbiter remarks.

---

## Layer 2 — Deterministic Game Engine

Controls combat, HP, corruption, inventory, factions, hazards, procedural generation, loot, relics, quests, progression, timers, enemy behavior, event escalation, cooldowns, map generation, discovery states.

Game state stored as **structured data**, not in AI prompts. The AI never owns HP, inventory, quests, enemies, or progression.

---

## Layer 3 — Narrative AI Layer

Converts structured game events into dynamic atmospheric narration. Receives only: current scene, recent action, relevant discovery state, nearby enemies, hazard state, mood. Never: full game history, entire lore database, all inventory, all factions, full chat logs, every prior action.

---

## Layer 4 — Response Assembly

Every response combines:

1. Action result (mechanical outcome)
2. Atmospheric response (flavor)
3. World change (what evolved)
4. Progression feedback (visible advancement)
5. Suggested actions (soft affordances)

---

## Progressive Discovery

Repeated actions evolve scenes. Searching the same area returns different text each pass — faint resonance → buried structure → relic fragment → destabilization → exhausted.

---

## Escalation

The world evolves constantly: corruption spread, storms intensify, enemies converge, sentinels awaken, resonance spikes, environmental collapse, faction interference, relic instability, time decay.

---

## Hazard Stages

Hazards escalate. Example — Awakening Defenses:

1. faint mechanical movement
2. heat signatures detected
3. sentinels activate
4. hunter drones deployed
5. full lockdown

Lingering has consequences.

---

## Action Categories

All parsed input resolves into:

`OBSERVE`, `SEARCH`, `USE_ITEM`, `ATTACK`, `INTERACT`, `TRAVEL`, `REST`, `TALK`, `CRAFT`, `HIDE`, `TRADE`, `SCAN`, `REPAIR`, `ACTIVATE`

---

## AI Memory Strategy

- **Short-term context window** — recent actions, nouns, discoveries, enemies, tone
- **Structured long-term state** — quests, inventory, factions, corruption, locations, progression, relics
- **Context summarization** — every few actions, summarize. Use summaries instead of raw logs.

---

## Development Priority Order

### Phase 1
- input normalization
- typo handling
- synonym mapping
- inventory-aware parsing
- contextual noun memory
- removal of hard parser failures

### Phase 2
- progressive discovery states
- dynamic world escalation
- response variation
- contextual action suggestions
- visible progression indicators

### Phase 3
- narrative AI layer
- AI atmospheric descriptions
- AI dialogue generation
- dynamic lore generation

### Phase 4
- adaptive hazards
- faction intelligence
- procedural narrative arcs
- emergent world events

---

## Final Core Rules

1. Never punish curiosity.
2. Never force keyword guessing.
3. Never make typing feel dangerous.
4. Always evolve the world state.
5. Always provide progression feedback.
6. Preserve immersion momentum.
7. Use AI for flavor, not mechanics.
8. Keep game state deterministic.
9. Reward experimentation constantly.
10. Make the player feel understood.
