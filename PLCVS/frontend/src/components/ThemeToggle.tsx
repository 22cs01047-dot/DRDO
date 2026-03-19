import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface ThemeToggleProps {
  /** Additional classes for the outer button */
  className?: string;
  /** Show a compact icon-only toggle (default) or a wider pill */
  variant?: "icon" | "pill";
}

export const ThemeToggle = ({ className = "", variant = "icon" }: ThemeToggleProps) => {
  const { theme, isDark, toggleTheme } = useTheme();

  if (variant === "pill") {
    return (
      <div
        className={`
          inline-flex items-center rounded-lg p-0.5
          bg-slate-100 dark:bg-slate-700
          border border-slate-200 dark:border-slate-600
          ${className}
        `}
        role="radiogroup"
        aria-label="Theme selection"
      >
        <button
          onClick={() => !isDark || toggleTheme()}
          className={`
            inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
            transition-colors duration-200
            ${!isDark
              ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }
          `}
          role="radio"
          aria-checked={!isDark}
          aria-label="Light mode"
        >
          <Sun size={12} />
          <span className="hidden sm:inline">Light</span>
        </button>
        <button
          onClick={() => isDark || toggleTheme()}
          className={`
            inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
            transition-colors duration-200
            ${isDark
              ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }
          `}
          role="radio"
          aria-checked={isDark}
          aria-label="Dark mode"
        >
          <Moon size={12} />
          <span className="hidden sm:inline">Dark</span>
        </button>
      </div>
    );
  }

  // Default: icon-only toggle
  return (
    <button
      onClick={toggleTheme}
      className={`
        relative inline-flex items-center justify-center w-8 h-8 rounded-lg
        transition-all duration-200
        bg-slate-100 hover:bg-slate-200
        dark:bg-slate-700 dark:hover:bg-slate-600
        text-slate-600 dark:text-slate-300
        focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50
        ${className}
      `.trim()}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun
        size={15}
        className={`absolute transition-all duration-300 ${
          isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"
        }`}
      />
      <Moon
        size={15}
        className={`absolute transition-all duration-300 ${
          isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
        }`}
      />
    </button>
  );
};