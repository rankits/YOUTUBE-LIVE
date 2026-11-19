/**
 * Builds Pollinations prompts for Shorts images.
 * Hindi/Devanagari topics are mapped to English visual subjects so the model
 * does not fall back to generic "pencil sketch of a woman" priors.
 */

const SUFFIX =
  "realistic documentary photograph, vibrant natural colors, cinematic lighting, 8k uhd, sharp focus, no text, no watermark, no words, no letters, no logo, no pencil sketch, no drawing, no anime";

/** Negative / anti-portrait guard unless the query is clearly about a named person. */
const ANTI_PORTRAIT =
  "not a portrait of a random woman, not a girl face sketch, not pencil drawing, not graphite sketch, not fashion model";

type TopicRule = { re: RegExp; subject: string };

/** Ordered: first match wins. Hindi + English competitive-exam / GK topics. */
export const TOPIC_VISUALS: TopicRule[] = [
  {
    re: /police|दरोगा|सिपाही|पुलिस|constable|sipahi|daroga|khaki/i,
    subject: "Indian police officers in khaki uniform standing at a police station courtyard, realistic documentary photography",
  },
  {
    re: /railway|railways|ट्रेन|रेलवे|आरआरबी|rrb|train|loco|ntpc alp/i,
    subject: "Indian Railways express passenger train on tracks at a busy station, realistic high resolution photography",
  },
  {
    re: /\bssc\b|upsc|परीक्षा|भर्ती|bharti|recruitment|vacancy|naukri|नौकरी|exam hall|competitive exam|ibps|nta|banking exam/i,
    subject: "Students sitting in a modern examination hall writing an exam, academic setting, realistic photo",
  },
  {
    re: /admit\s*card|एडमिट|प्रवेश पत्र|hall ticket|result|परिणाम|रिजल्ट|answer key/i,
    subject: "Students checking exam results and admit card on a computer screen in an office, realistic documentary photo",
  },
  {
    re: /संसद|संविधान|कानून|parliament|constitution|lok sabha|rajya sabha|supreme court|vidhan/i,
    subject: "Indian Parliament building New Delhi with Ashoka lion emblem and official constitution book, documentary photography",
  },
  {
    re: /अंतरिक्ष|ग्रह|सौरमंडल|\bmars\b|\bmoon\b|space|planet|nasa|isro|solar system|astronomy|satellite/i,
    subject: "Planet in deep dark space with glowing stars and nebula, NASA astronomical photography",
  },
  {
    re: /नदी|पहाड़|हिमालय|भूगोल|geography|himalaya|ganges|ganga|mountain|river|monsoon|desert|tharde/i,
    subject: "Scenic Indian landscape, Himalayan snow mountains and river valley, aerial photography",
  },
  {
    re: /विज्ञान|कोशिका|हृदय|\batom\b|biology|science|cell|heart|physics|chemistry|microscope|dna/i,
    subject: "3D scientific medical illustration of cells and anatomy, high detail scientific visualization",
  },
  {
    re: /इतिहास|किला|ताज\s*महल|history|fort|taj mahal|heritage|monument|qutub|red fort|hampi|ajanta/i,
    subject: "Ancient Indian heritage monument stone architecture, historical documentary photography",
  },
  {
    re: /army|navy|air\s*force|सैन्य|सेना|defence|defense|soldier|military/i,
    subject: "Indian armed forces soldiers in uniform during parade, realistic documentary photography",
  },
  {
    re: /bank|बैंकिंग|sbi|rbi|atm|finance|economy|मुद्रा|gdp/i,
    subject: "Modern Indian bank branch interior with counters and customers, realistic documentary photography",
  },
  {
    re: /computer|कंप्यूटर|software|internet|coding|ai\b|artificial intelligence|chip|processor/i,
    subject: "Modern computer science lab with screens showing code and circuit boards, realistic tech photography",
  },
  {
    re: /farmer|कृषि|खेत|agriculture|crop|wheat|rice|irrigation/i,
    subject: "Indian farmers working in green crop fields at sunrise, realistic documentary photography",
  },
  {
    re: /cricket|क्रिकेट|stadium| खेल |olympic|hockey|football/i,
    subject: "Packed Indian cricket stadium during a match, sports documentary photography",
  },
];

const DEVANAGARI = /[\u0900-\u097F]/;

/** True when the string still has Devanagari letters. */
export function hasDevanagari(s: string): boolean {
  return DEVANAGARI.test(s);
}

/** Strips Devanagari and other non-Latin letters; keeps ASCII letters/digits/spaces. */
export function stripNonAsciiWords(s: string): string {
  return s
    .replace(DEVANAGARI, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First matching educational visual subject, or null. */
export function matchTopicVisual(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  for (const rule of TOPIC_VISUALS) {
    if (rule.re.test(q)) return rule.subject;
  }
  return null;
}

/** Small style twists so the same topic does not always get the same photo. */
const VARIATIONS = [
  "golden hour warm light",
  "crisp daylight, high contrast",
  "cinematic teal and orange grade",
  "fresh morning misty atmosphere",
  "dramatic sky, wide angle lens",
  "shallow depth of field bokeh",
  "aerial drone perspective",
  "street-level documentary angle",
];

/**
 * Per-scene camera / subject angles so ONE Short shows different photos
 * while staying related to the same recruitment news.
 */
export const SCENE_ANGLES = [
  "wide establishing shot of the workplace or campus",
  "close-up of official application form and stamp on desk",
  "crowded examination hall with desks and answer sheets",
  "recruitment banner and notice board outside government office",
  "candidates standing in a queue outside exam center",
  "computer screen showing online application portal",
  "uniform accessories badge ID card and documents flat lay",
  "motivational study desk with books notebooks and calendar",
];

/** Clean hero graphic for poster / thumbnail scenes. */
export function posterHeroQuery(headline: string): string {
  const mapped = matchTopicVisual(headline);
  if (mapped) {
    return `${mapped}, clean educational poster look, bright colors, simple background, ${SUFFIX}, ${ANTI_PORTRAIT}`.slice(0, 220);
  }
  return `Indian government job recruitment educational poster, bright colors, ${SUFFIX}, ${ANTI_PORTRAIT}`;
}

/**
 * Builds a unique, news-related English visual for scene `index` inside one Short.
 * Combines topic match from the headline + scene hint + a distinct angle.
 */
export function sceneImageQuery(headline: string, sceneIndex: number, sceneHint = ""): string {
  const base = matchTopicVisual(sceneHint) || matchTopicVisual(headline);
  const angle = SCENE_ANGLES[Math.abs(sceneIndex) % SCENE_ANGLES.length]!;
  const hint = sceneHint.trim();
  const englishHint =
    hint && !hasDevanagari(hint)
      ? hint
      : hint
        ? stripNonAsciiWords(hint)
        : "";
  if (base) return `${base}, ${englishHint ? `${englishHint}, ` : ""}${angle}`.slice(0, 180);
  const fallback = englishHint || stripNonAsciiWords(headline) || "Indian government recruitment";
  return `${fallback}, ${angle}, documentary photo`.slice(0, 180);
}

/**
 * Builds the final Pollinations prompt for a Shorts background image.
 * Prefers dictionary-mapped English subjects; never asks for pencil sketches.
 * `seed` rotates visual variation so each Job Alert render looks fresh.
 */
export function buildShortImagePrompt(rawQuery: string, seed = 0): string {
  const q = rawQuery.trim().slice(0, 200);
  const twist = VARIATIONS[Math.abs(seed) % VARIATIONS.length]!;
  if (!q) return `educational documentary photograph of India, ${twist}, vertical 9:16 composition, ${SUFFIX}, ${ANTI_PORTRAIT}`;

  const mapped = matchTopicVisual(q);
  if (mapped) return `${mapped}, ${twist}, vertical 9:16 composition filled frame, ${SUFFIX}, ${ANTI_PORTRAIT}`;

  let subject = q;
  if (hasDevanagari(q)) {
    const cleaned = stripNonAsciiWords(q);
    subject = cleaned || "Indian competitive exam education scene";
  }

  // Avoid feeding face-portrait priors when the leftover text is too vague.
  if (subject.length < 8) subject = "Indian classroom competitive exam education scene";

  return `${subject}, ${twist}, vertical 9:16 composition filled frame, ${SUFFIX}, ${ANTI_PORTRAIT}`;
}
