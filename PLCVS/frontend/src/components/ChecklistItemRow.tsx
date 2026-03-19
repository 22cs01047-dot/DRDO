import { useState, useEffect, useCallback, useRef } from "react";
import { Pen } from "lucide-react";
import type { ChecklistItemData, ItemStatus } from "../types";
import { StatusIcon } from "./StatusIcon";
import { STATUS_COLORS, STATUS_LABELS } from "../utils/constants";
import { formatTimestamp, confidenceBadgeClass } from "../utils/helpers";

interface ChecklistItemRowProps {
  item: ChecklistItemData;
  stageId: string;
  onManualOverride: (itemId: string, stageId: string, status: ItemStatus, notes: string) => void;
}

const overrideOptions: ItemStatus[] = ["CONFIRMED", "FAILED", "PENDING", "AMBIGUOUS"];

export const ChecklistItemRow = ({ item, stageId, onManualOverride }: ChecklistItemRowProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const colors = STATUS_COLORS[item.status];

  useEffect(() => {
    if (!showMenu) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setShowMenu(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  const handleOverride = useCallback(
    (status: ItemStatus) => {
      onManualOverride(item.id, stageId, status, "Manual override");
      setShowMenu(false);
    },
    [item.id, stageId, onManualOverride]
  );

  const detailText = item.matchedText
    ? `"${item.matchedText}"`
    : item.status === "IN_PROGRESS"
      ? "Listening…"
      : item.status === "AMBIGUOUS"
        ? "Ambiguous response"
        : "Pending";

  return (
    <div
      className={`relative p-3.5 rounded-lg border-l-[3px] ${colors.border} ${colors.bg}
                  transition-all hover:shadow-sm dark:hover:shadow-slate-900/20`}
      role="listitem"
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5 flex-shrink-0">
          <StatusIcon status={item.status} size={18} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: Name + badges */}
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-semibold leading-snug ${colors.text}`}>
              {item.mandatory && <span className="text-red-500 dark:text-red-400 mr-1">*</span>}
              {item.name}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.confidence > 0 && (
                <span
                  className={`text-2xs px-1.5 py-0.5 rounded font-semibold tabular-nums ${confidenceBadgeClass(item.confidence)}`}
                >
                  {(item.confidence * 100).toFixed(0)}%
                </span>
              )}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 hover:bg-white/60 dark:hover:bg-slate-600/60 rounded transition-colors"
                  aria-label={`Override ${item.name}`}
                  aria-expanded={showMenu}
                  aria-haspopup="menu"
                >
                  <Pen size={12} className="text-slate-400 dark:text-slate-500" />
                </button>

                {/* Override dropdown — FIX: Added dark mode styles */}
                {showMenu && (
                  <div
                    className="absolute right-0 top-8 bg-white dark:bg-slate-800 shadow-lg dark:shadow-slate-900/50
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
                        <StatusIcon status={st} size={13} />
                        {STATUS_LABELS[st]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Detail text + timestamp */}
          <div className="flex items-center gap-2 mt-1 text-2xs text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="italic truncate max-w-[260px]">{detailText}</span>
            {item.timestamp && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="tabular-nums">{formatTimestamp(item.timestamp)}</span>
              </>
            )}
            {item.updatedBy === "MANUAL_OVERRIDE" && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">Manual</span>
              </>
            )}
          </div>

          {/* Row 3: Thin confidence bar */}
          {item.confidence > 0 && (
            <div className="mt-2 h-1 bg-slate-200/60 dark:bg-slate-600/40 rounded-full overflow-hidden w-full max-w-[200px]">
              <div
                className={`h-1 rounded-full transition-all duration-500 ${colors.barColor}`}
                style={{ width: `${item.confidence * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};