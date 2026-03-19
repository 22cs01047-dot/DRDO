/**
 * ManualOverride — form to manually override a checklist item status.
 * Reconstructed from interface contract (original source not provided).
 */

import { useState, useMemo, useCallback } from "react";
import { PenSquare, ChevronDown, Send } from "lucide-react";
import type { StageData, ItemStatus } from "../types";
import { StatusIcon } from "./StatusIcon";
import { STATUS_LABELS } from "../utils/constants";

interface ManualOverrideProps {
  stages: StageData[];
  onOverride: (itemId: string, stageId: string, status: ItemStatus, notes: string) => void;
}

const statusOptions: ItemStatus[] = ["CONFIRMED", "FAILED", "PENDING", "AMBIGUOUS"];

export const ManualOverride = ({ stages, onOverride }: ManualOverrideProps) => {
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<ItemStatus>("CONFIRMED");
  const [notes, setNotes] = useState("");
  const [lastOverride, setLastOverride] = useState<string | null>(null);

  const sorted = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);

  const selectedStage = sorted.find((s) => s.id === selectedStageId);
  const items = selectedStage
    ? [...selectedStage.items].sort((a, b) => a.orderInStage - b.orderInStage)
    : [];
  const selectedItem = items.find((i) => i.id === selectedItemId);

  const canSubmit = selectedStageId && selectedItemId && selectedStatus;

  const handleStageChange = useCallback((stageId: string) => {
    setSelectedStageId(stageId);
    setSelectedItemId("");
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onOverride(selectedItemId, selectedStageId, selectedStatus, notes.trim() || "Manual override from panel");
    setLastOverride(
      `${selectedItem?.name || selectedItemId} → ${STATUS_LABELS[selectedStatus]}`
    );
    setNotes("");
  }, [canSubmit, selectedItemId, selectedStageId, selectedStatus, notes, onOverride, selectedItem]);

  return (
    <div aria-label="Manual override controls">
      <div className="flex items-center gap-2 mb-4">
        <PenSquare size={14} className="text-slate-400 dark:text-slate-500" />
        <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Manual Override
        </h3>
      </div>

      <div className="space-y-3">
        {/* Stage selector */}
        <div>
          <label className="block text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Stage
          </label>
          <div className="relative">
            <select
              value={selectedStageId}
              onChange={(e) => handleStageChange(e.target.value)}
              className="w-full appearance-none px-3 py-2 pr-8 rounded-md border
                         border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-900
                         text-sm text-slate-700 dark:text-slate-300
                         focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-slate-400/30
                         transition-colors"
            >
              <option value="">Select stage…</option>
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  Stage {s.order}: {s.name} ({s.progress}%)
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2
                                               text-slate-400 dark:text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Item selector */}
        <div>
          <label className="block text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Checklist Item
          </label>
          <div className="relative">
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              disabled={!selectedStageId}
              className="w-full appearance-none px-3 py-2 pr-8 rounded-md border
                         border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-900
                         text-sm text-slate-700 dark:text-slate-300
                         disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-slate-400/30
                         transition-colors"
            >
              <option value="">Select item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {STATUS_LABELS[item.status]}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2
                                               text-slate-400 dark:text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Status selector */}
        <div>
          <label className="block text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            New Status
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {statusOptions.map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium
                           border transition-colors
                  ${selectedStatus === st
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }
                `}
              >
                <StatusIcon
                  status={st}
                  size={13}
                  className={selectedStatus === st ? "!text-white dark:!text-slate-900" : ""}
                />
                {STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for override…"
            rows={2}
            className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600
                       bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300
                       placeholder:text-slate-400 dark:placeholder:text-slate-500
                       focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-slate-400/30
                       resize-none transition-colors"
          />
        </div>

        {/* Current item status preview */}
        {selectedItem && (
          <div className="flex items-center gap-2 p-2.5 rounded-md
                          bg-slate-50 dark:bg-slate-700/40
                          border border-slate-100 dark:border-slate-600/50
                          text-2xs text-slate-500 dark:text-slate-400">
            <StatusIcon status={selectedItem.status} size={13} />
            <span className="font-medium text-slate-700 dark:text-slate-300">{selectedItem.name}</span>
            <span className="text-slate-300 dark:text-slate-600">→</span>
            <StatusIcon status={selectedStatus} size={13} />
            <span className="font-medium text-slate-700 dark:text-slate-300">{STATUS_LABELS[selectedStatus]}</span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md
                     text-sm font-medium transition-colors
                     bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900
                     hover:bg-slate-800 dark:hover:bg-slate-200
                     disabled:bg-slate-200 dark:disabled:bg-slate-700
                     disabled:text-slate-400 dark:disabled:text-slate-500
                     disabled:cursor-not-allowed"
        >
          <Send size={14} />
          Apply Override
        </button>

        {/* Last override confirmation */}
        {lastOverride && (
          <p className="text-2xs text-emerald-600 dark:text-emerald-400 text-center font-medium animate-fade-in">
            ✓ Applied: {lastOverride}
          </p>
        )}
      </div>
    </div>
  );
};