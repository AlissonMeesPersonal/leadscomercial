"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "leads-theme";

function readPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export default function ThemeToggle({
  compact = false
}: {
  compact?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const preferredTheme = readPreferredTheme();

    setTheme(preferredTheme);
    applyTheme(preferredTheme);
    setIsReady(true);
  }, []);

  function handleThemeChange() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  const className = compact
    ? "theme-toggle compact"
    : "theme-toggle";

  if (!isReady) {
    return (
      <button
        className={className}
        type="button"
        aria-label="Alternar tema"
      >
        ◐
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      className={className}
      type="button"
      onClick={handleThemeChange}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo claro" : "Modo escuro"}
    >
      <span className="theme-icon" aria-hidden="true">
        {isDark ? "☀" : "☾"}
      </span>

      {!compact && (
        <span>{isDark ? "Modo claro" : "Modo escuro"}</span>
      )}
    </button>
  );
}
