// Variety rules for Shorts: rotate the look and the narrator so a channel never posts identical-looking videos.

/** Theme for the n-th Short when "Shuffle" is picked: rotates through every theme, never the same twice in a row. */
export function pickShuffleTheme<T extends string>(ids: readonly T[], n: number): T {
  if (!ids.length) throw new Error("No themes");
  return ids[((n % ids.length) + ids.length) % ids.length]!;
}

export type VoiceOverride = { voice_provider: "edge"; voice_id: string };

/**
 * Narrator for the n-th Short when voice mix is on: the show's own voice, then a free female and a free male
 * Microsoft voice, in turn. null = keep the show's own voice.
 */
export function shuffleVoice(language: string, n: number): VoiceOverride | null {
  const english = language === "english";
  const turn = ((n % 3) + 3) % 3;
  if (turn === 0) return null;
  const voice_id = turn === 1 ? (english ? "en-IN-NeerjaNeural" : "hi-IN-SwaraNeural") : english ? "en-IN-PrabhatNeural" : "hi-IN-MadhurNeural";
  return { voice_provider: "edge", voice_id };
}
