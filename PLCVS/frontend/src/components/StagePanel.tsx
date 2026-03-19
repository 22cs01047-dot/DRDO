import { ChevronRight } from "lucide-react";
import { ChecklistItem } from "./ChecklistItem";
import { StatusIcon } from "./StatusIcon";
import type { StageData, ItemStatus } from "../types";
import { STATUS_COLORS, STATUS_LABELS, DEPENDENCY_TYPE_LABELS } from "../utils/constants";

interface StagePanelProps {
  stage: StageData;
  isActive: boolean;
  onManualOverride: (itemId: string, stageId: string, status: ItemStatus, notes: string) => void;
}

export const StagePanel = ({ stage, isActive, onManualOverride }: StagePanelProps) => {
  const colors = STATUS_COLORS[stage.status] || STATUS_COLORS.PENDING;
  const confirmedCount = stage.items.filter((i) => i.status === "CONFIRMED").length;

  return (
    <section
      className={`
        bg-white border rounded-lg transition-colors
        ${isActive ? "border-slate-900 shadow-sm" : "border-slate-200"}
      `}
      aria-label={`Stage ${stage.order}: ${stage.name}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <StatusIcon status={stage.status} size={18} />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Stage {stage.order}: {stage.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-2xs text-slate-400">
                {DEPENDENCY_TYPE_LABELS[stage.dependencyType]}
              </span>
              <span className="text-2xs text-slate-300">·</span>
              <span className={`text-2xs font-medium ${colors.text}`}>
                {STATUS_LABELS[stage.status] || stage.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-500 tabular-nums">
            {confirmedCount}
            <span className="text-slate-300 mx-0.5">/</span>
            {stage.items.length}
          </span>
          {isActive && <ChevronRight size={14} className="text-slate-400" />}
        </div>
      </div>

      {/* Progress bar (thin) */}
      <div className="h-0.5 bg-slate-100">
        <div
          className={`h-0.5 transition-all duration-500 ${colors.barColor}`}
          style={{ width: `${stage.progress}%` }}
        />
      </div>

      {/* Items */}
      <div className="p-4 space-y-2">
        {stage.items.map((item) => (
          <ChecklistItem
            key={item.id}
            item={item}
            stageId={stage.id}
            onManualOverride={onManualOverride}
          />
        ))}
      </div>
    </section>
  );
};
