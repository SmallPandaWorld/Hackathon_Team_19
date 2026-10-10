// Shared by the inline <head> script (server-rendered in app/layout.tsx) and
// the useTheme() hook. No "use client": the layout imports THEME_SCRIPT.

export const STORAGE_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
// Surface colours, for the browser UI (<meta name="theme-color">).
export const THEME_COLORS = { light: "#ffffff", dark: "#0e1113" } as const;

// Runs before the first paint: resolves "system" and sets data-theme and
// color-scheme on <html>. Keep in sync with readMode/applyTheme in theme.ts.
export const THEME_SCRIPT = `(function(){var m;try{m=localStorage.getItem("${STORAGE_KEY}")}catch(e){}try{if(m!=="light"&&m!=="dark")m=matchMedia("${DARK_QUERY}").matches?"dark":"light";var d=document.documentElement;d.dataset.theme=m;d.style.colorScheme=m}catch(e){}})()`;
