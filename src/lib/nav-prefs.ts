/** Sidebar visibility: YouTube / Job Alert core stays on; interview studio menus default off. */

export const NAV_PREFS_KEY = "app-nav-prefs";
export const NAV_PREFS_EVENT = "nav-prefs-changed";

export type OptionalNavId =
  | "integrations"
  | "dashboard"
  | "interviews-new"
  | "studio"
  | "live-broadcast"
  | "obs"
  | "history"
  | "recordings"
  | "analytics"
  | "schedule";

export const OPTIONAL_NAV: { id: OptionalNavId; label: string; hint: string }[] = [
  { id: "integrations", label: "Integrations", hint: "AI / voice / YouTube connection status" },
  { id: "dashboard", label: "Dashboard", hint: "Interview overview home" },
  { id: "interviews-new", label: "Create Show", hint: "New AI interview / lecture" },
  { id: "studio", label: "Live Interview Studio", hint: "Run live AI shows" },
  { id: "live-broadcast", label: "Live Broadcast", hint: "New live broadcast + stream keys" },
  { id: "obs", label: "OBS Output", hint: "Browser source for OBS" },
  { id: "history", label: "Interview History", hint: "Past interviews" },
  { id: "recordings", label: "Recordings", hint: "Saved recordings" },
  { id: "analytics", label: "Analytics", hint: "Usage charts" },
  { id: "schedule", label: "Schedule", hint: "Interview calendar" },
];

/** Default: interview/studio + Integrations hidden — Job Alerts / YouTube focused. */
export type NavPrefs = Record<OptionalNavId, boolean>;

export function defaultNavPrefs(): NavPrefs {
  return {
    integrations: false,
    dashboard: false,
    "interviews-new": false,
    studio: false,
    "live-broadcast": false,
    obs: false,
    history: false,
    recordings: false,
    analytics: false,
    schedule: false,
  };
}

export function readNavPrefs(): NavPrefs {
  const base = defaultNavPrefs();
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = JSON.parse(localStorage.getItem(NAV_PREFS_KEY) ?? "{}") as Partial<NavPrefs>;
    for (const item of OPTIONAL_NAV) {
      if (typeof raw[item.id] === "boolean") base[item.id] = raw[item.id]!;
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function writeNavPrefs(prefs: NavPrefs) {
  localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(NAV_PREFS_EVENT));
}

export function isOptionalNavVisible(id: OptionalNavId, prefs = readNavPrefs()) {
  return !!prefs[id];
}
