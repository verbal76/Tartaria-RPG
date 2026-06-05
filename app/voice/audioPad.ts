// Pure PCM padding helper, split out of PiperTTSManager so it can be
// unit-tested without dragging in expo-av / react-native-executorch
// native bindings (which don't load under jest).
//
// arb65 — after trimSilenceLeadTrail strips Kokoro's own leading silence
// pad, expo-av's AudioTrack warm-up clips the first ~200-300ms of SPEECH
// ("Choose your character" → "aracter"). Re-adding a small CONTROLLED
// silent lead gives the warm-up zeros to eat instead of phonemes; the
// tail pad protects the final word from didJustFinish/unload shaving.

/** Prepend `leadMs` and append `tailMs` of pure silence (zeros) to a PCM
 *  buffer, returning a NEW Float32Array (input untouched). Pure function.
 *  Returns the input unchanged when both pads round to zero samples. */
export function padSilence(
  samples: Float32Array,
  sampleRate: number,
  leadMs: number,
  tailMs: number,
): Float32Array {
  const lead = Math.max(0, Math.floor((sampleRate * leadMs) / 1000));
  const tail = Math.max(0, Math.floor((sampleRate * tailMs) / 1000));
  if (lead === 0 && tail === 0) return samples;
  const out = new Float32Array(lead + samples.length + tail);
  out.set(samples, lead);
  return out;
}
