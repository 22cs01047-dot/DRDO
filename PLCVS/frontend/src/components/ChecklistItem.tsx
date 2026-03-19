import { useState, useEffect, useCallback, useRef } from "react";
import { Pen } from "lucide-react";
import type { ChecklistItemData, ItemStatus } from "../types";
import { StatusIcon } from "./StatusIcon";
import { STATUS_COLORS, STATUS_LABELS } from "../utils/constants";
import { formatTimestamp, confidenceBadgeClass } from "../utils/helpers";

interface ChecklistItemProps {
  item: ChecklistItemData;
  stageId: string;
  onManualOverride: (itemId: string, stageId: string, status: ItemStatus, notes: string) => void;
}

const overrideOptions: ItemStatus[] = ["CONFIRMED", "FAILED", "PENDING", "AMBIGUOUS"];

export const ChecklistItem = ({ item, stageId, onManualOverride }: ChecklistItemProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const colors = STATUS_COLORS[item.status];

  useEffect(() => {
    if (!showMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const handleOverride = useCallback(
    (status: ItemStatus) => {
      onManualOverride(item.id, stageId, status, "Manual override from UI");
      setShowMenu(false);
    },
    [item.id, stageId, onManualOverride]
  );

  return (
    <div
      className={`
        relative flex items-center justify-between p-3 rounded-md border
        ${colors.bg} ${colors.border} transition-colors
      `}
      role="listitem"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <StatusIcon status={item.status} size={16} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${colors.text}`}>
            {item.mandatory && (
              <span className="text-red-500 dark:text-red-400 mr-1" aria-label="Required item">*</span>
            )}
            {item.name}
          </div>
          {item.matchedText && (
            <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5 truncate italic">
              Matched: &ldquo;{item.matchedText}&rdquo;
            </p>
          )}
          {item.timestamp && (
            <p className="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">
              {formatTimestamp(item.timestamp)}
              {item.updatedBy === "MANUAL_OVERRIDE" && (
                <span className="ml-1 text-amber-500 dark:text-amber-400">(manual)</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {item.confidence > 0 && (
          <span className={`text-2xs px-1.5 py-0.5 rounded-md font-medium ${confidenceBadgeClass(item.confidence)}`}>
            {(item.confidence * 100).toFixed(0)}%
          </span>
        )}

        <span className={`text-2xs font-medium ${colors.text}`}>
          {STATUS_LABELS[item.status]}
        </span>

        {/* Override dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-600/50 rounded transition-colors"
            aria-label={`Override status for ${item.name}`}
            aria-expanded={showMenu}
            aria-haspopup="menu"
          >
            <Pen size={12} className="text-slate-400 dark:text-slate-500" />
          </button>

          {showMenu && (
            <div
              className="absolute right-0 top-9 bg-white dark:bg-slate-800 shadow-lg dark:shadow-slate-900/50
                         rounded-md border border-slate-200 dark:border-slate-600 py-1 z-50 min-w-[140px]"
              role="menu"
            >
              {overrideOptions.map((st) => (
                <button
                  key={st}
                  onClick={() => handleOverride(st)}
                  disabled={st === item.status}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm
                             text-slate-700 dark:text-slate-300
                             hover:bg-slate-50 dark:hover:bg-slate-700
                             disabled:opacity-30 disabled:cursor-not-allowed"
                  role="menuitem"
                >
                  <StatusIcon status={st} size={14} />
                  {STATUS_LABELS[st]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};