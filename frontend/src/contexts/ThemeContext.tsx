import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({ theme: "light", toggleTheme: () => {}, isDark: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("membermd_theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem("membermd_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme(t => t === "light" ? "dark" : "light"), isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
