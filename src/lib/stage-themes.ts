// Broadcast stage themes. CSS classes live in styles.css; canvas palettes are
// used by the Shorts renderer, which cannot read CSS variables.
export type StageThemeId = "studio" | "chalkboard" | "podcast" | "neon" | "whiteboard";
export type CanvasPalette = { bg1: string; bg2: string; text: string; muted: string; primary: string; card: string; border: string; success: string; hand?: boolean; viral?: boolean };

export const STAGE_THEMES: { id: StageThemeId; label: string; hint: string; canvas: CanvasPalette }[] = [
  { id: "studio", label: "Broadcast Studio", hint: "Default indigo TV studio", canvas: { bg1: "#151a33", bg2: "#272056", text: "#f8fafc", muted: "#a5adc6", primary: "#6d6af7", card: "#232a4d", border: "#353d66", success: "#22c55e" } },
  { id: "chalkboard", label: "Chalkboard Classroom", hint: "Green board, chalk text — lectures & MCQ", canvas: { bg1: "#1d3b2c", bg2: "#13281e", text: "#f3f1e6", muted: "#b9c7b6", primary: "#f4d35e", card: "#24493a", border: "#4d7562", success: "#4ade80" } },
  { id: "podcast", label: "Podcast Studio", hint: "Warm lights, amber mics", canvas: { bg1: "#2a1a12", bg2: "#140c08", text: "#fbf3ea", muted: "#c9b2a0", primary: "#f59e0b", card: "#3a261b", border: "#5c3e2c", success: "#22c55e" } },
  { id: "neon", label: "Neon Tech Arena", hint: "Cyberpunk cyan & magenta", canvas: { bg1: "#05060f", bg2: "#130a2a", text: "#eafcff", muted: "#8fb3c4", primary: "#22d3ee", card: "#0e1430", border: "#273a6b", success: "#34d399" } },
  { id: "whiteboard", label: "Whiteboard Hand-Drawn", hint: "Marker-pen writing on a white board", canvas: { bg1: "#fdfdfb", bg2: "#eef0f2", text: "#111827", muted: "#475569", primary: "#1d4ed8", card: "#ffffff", border: "#cbd5e1", success: "#86efac", hand: true } },
];

export function stageTheme(id: unknown) {
  return STAGE_THEMES.find((t) => t.id === id) ?? STAGE_THEMES[0]!;
}

// Shorts-only looks (no live-stage CSS): the stage themes plus the viral GK quiz poster.
export type ShortThemeId = StageThemeId | "viral";
export const SHORT_THEMES: { id: ShortThemeId; label: string; hint: string; canvas: CanvasPalette }[] = [
  { id: "viral", label: "Viral 3D GK (Wooden board)", hint: "Wooden signboard, gold picture card, pill options", canvas: { bg1: "#2e7d6b", bg2: "#0f1f5c", text: "#ffffff", muted: "#dbeafe", primary: "#f5c518", card: "#fffaf0", border: "#1d4ed8", success: "#22c55e", viral: true } },
  ...STAGE_THEMES,
];

export function shortTheme(id: unknown) {
  return SHORT_THEMES.find((t) => t.id === id) ?? stageTheme(id);
}
