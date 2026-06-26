import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

type ThemeCtx = {
  isLight: boolean;
  toggleTheme: () => void;
  setTheme: (t: "light" | "dark") => void;
};

const ThemeContext = createContext<ThemeCtx>({
  isLight: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isLight, setIsLight] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("helix.theme") === "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light-theme", isLight);
    localStorage.setItem("helix.theme", isLight ? "light" : "dark");
  }, [isLight]);

  return (
    <ThemeContext.Provider value={{
      isLight,
      toggleTheme: () => setIsLight((v) => !v),
      setTheme: (t) => setIsLight(t === "light"),
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
