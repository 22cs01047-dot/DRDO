/**
 * SlideDrawer — reusable off-canvas panel that slides in from the right.
 * Supports backdrop, Escape key, focus trap, responsive sizing, dark mode.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface SlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class. Default: "max-w-lg" */
  width?: string;
}

export const SlideDrawer = ({
  isOpen, onClose, title, subtitle, icon, children,
  width = "max-w-lg",
}: SlideDrawerProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    panel.addEventListener("keydown", handleTab);
    return () => panel.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative w-full ${width} h-full flex flex-col
                    bg-white dark:bg-slate-800 shadow-2xl dark:shadow-slate-900/50
                    border-l border-slate-200 dark:border-slate-700
                    animate-slide-in-right`}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4
                        border-b border-slate-200 dark:border-slate-700
                        bg-slate-50/50 dark:bg-slate-800/80">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-md bg-slate-900 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h2>
              {subtitle && <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors flex-shrink-0"
            aria-label="Close panel"
          >
            <X size={18} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-on-hover">
          {children}
        </div>
      </div>
    </div>
  );
};