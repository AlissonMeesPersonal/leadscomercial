"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  const saved = localStorage.getItem("leads-theme");
  if (saved === "light" || saved === "dark") return saved;

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    setMounted(true);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("leads-theme", next);
    document.documentElement.dataset.theme = next;
  }

  if (!mounted) {
    return (
      <button className={compact ? "theme-toggle compact" : "theme-toggle"} type="button" aria-label="Alternar tema">
        ◐
      </button>
    );
  }

  return (
    <button
      className={compact ? "theme-toggle compact" : "theme-toggle"}
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      title={theme === "dark" ? "Modo claro" : "Modo escuro"}
    >
      <span className="theme-icon" aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      {!compact && <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>}
    </button>
  );
}
