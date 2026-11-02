"use client";

import { useSyncExternalStore } from "react";
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

/**
 * Light or dark screen. By default STARS follows the computer's own setting;
 * a person can pin it to light or dark here. The choice is kept per device in
 * localStorage and applied before first paint by the script in
 * app/layout.tsx (THEME_SCRIPT), which also follows the computer when it
 * switches (for example at sunset) while the choice is "system".
 */
export const THEME_KEY = "stars-theme";

const THEMES = [
  { value: "system", label: "Match this computer", icon: DesktopIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

type Theme = (typeof THEMES)[number]["value"];

/**
 * Runs before the page paints; keep it tiny and self-contained. The gate
 * kiosk has its own dark design and is left alone.
 */
export const THEME_SCRIPT = `try{if(!location.pathname.startsWith("/kiosk")){var m=matchMedia("(prefers-color-scheme: dark)"),a=function(){var s=localStorage.getItem("${THEME_KEY}");document.documentElement.classList.toggle("dark",s==="dark"||(s!=="light"&&m.matches))};a();m.addEventListener("change",a);window.__starsTheme=a}}catch(e){}`;

function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyTheme(next: Theme) {
  try {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    // Private windows can refuse storage; fall through and apply it anyway.
  }
  const reapply = (window as unknown as { __starsTheme?: () => void }).__starsTheme;
  if (reapply) reapply();
  else document.documentElement.classList.toggle("dark", next === "dark");
  listeners.forEach((listener) => listener());
}

export function ThemeSwitch({ className }: { className?: string }) {
  // The server cannot know the stored choice, so it renders "system".
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);

  return (
    <div role="radiogroup" aria-label="Screen colors" className={cn("flex flex-wrap gap-2", className)}>
      {THEMES.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => applyTheme(option.value)}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-md border px-4 text-base font-medium transition-colors duration-150",
              selected
                ? "border-tup-maroon-600 bg-tup-maroon-600 text-white"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <option.icon className="h-5 w-5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
