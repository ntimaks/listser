export type ThemePref = "system" | "light" | "dark";

export const THEME_KEY = "listser-theme";

const THEME_COLOR = { light: "#EEEEEE", dark: "#121212" } as const;

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // storage blocked (private mode etc.) — fall back to system
  }
  return "system";
}

export function saveThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // non-persistent is fine; the theme still applies for this visit
  }
}

// Sets data-theme on <html> (globals.css keys the palette off it) and keeps the
// browser chrome color in sync. "system" removes the attribute so the
// prefers-color-scheme media query takes over again.
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  const resolved =
    pref === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : pref;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => {
      // Explicit choice: pin every theme-color tag to the chosen color.
      // System: restore each tag to its media-matched default.
      const media = m.getAttribute("media") ?? "";
      m.content =
        pref === "system"
          ? media.includes("dark")
            ? THEME_COLOR.dark
            : THEME_COLOR.light
          : THEME_COLOR[resolved];
    });
}

// Runs inline in <head> before first paint so a saved theme never flashes.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
