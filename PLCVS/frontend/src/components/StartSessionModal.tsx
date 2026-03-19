import { useState, useRef, useEffect } from "react";
import { User, Rocket, X } from "lucide-react";

interface StartSessionModalProps {
  onConfirm: (operatorName: string) => void;
  onCancel: () => void;
}

export const StartSessionModal = ({ onConfirm, onCancel }: StartSessionModalProps) => {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);

  // Auto-focus
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  // Focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    dialog.addEventListener("keydown", handleTab);
    return () => dialog.removeEventListener("keydown", handleTab);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(name.trim() || "Operator");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-session-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px]"
        onClick={onCancel}
      />

      {/* Dialog */}
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        className="relative z-10 bg-white dark:bg-slate-800 rounded-lg shadow-xl
                   dark:shadow-slate-900/50 border border-slate-200 dark:border-slate-700
                   p-6 w-full max-w-md mx-4"
      >
        {/* Close button — FIX: Added consistent spacing from edge */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700
                     rounded-md transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-slate-400 dark:text-slate-500" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700
                          flex items-center justify-center flex-shrink-0">
            <User size={18} className="text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <h2
              id="start-session-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Start New Session
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Enter operator name to begin verification
            </p>
          </div>
        </div>

        {/* Input */}
        <div className="mb-6">
          <label
            htmlFor="operator-name"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Operator Name
          </label>
          <input
            ref={inputRef}
            id="operator-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lt. Col. Sharma"
            className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-600
                       rounded-md text-sm bg-white dark:bg-slate-900
                       text-slate-900 dark:text-slate-100
                       focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-slate-400/30
                       placeholder:text-slate-400 dark:placeholder:text-slate-500
                       transition-colors"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1.5 text-2xs text-slate-400 dark:text-slate-500">
            Defaults to &quot;Operator&quot; if left blank
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300
                       bg-slate-100 dark:bg-slate-700 rounded-md
                       hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium
                       text-white dark:text-slate-900 bg-slate-900 dark:bg-slate-100
                       rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            <Rocket size={14} />
            Start Session
          </button>
        </div>
      </form>
    </div>
  );
};