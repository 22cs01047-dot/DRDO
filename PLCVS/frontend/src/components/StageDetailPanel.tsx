import { useState, useMemo, useRef, useEffect } from "react";
import { Layers, ChevronDown, ChevronRight } from "lucide-react";
import { ChecklistItemRow } from "./ChecklistItemRow";
import { StatusIcon } from "./StatusIcon";
import type { StageData, ItemStatus } from "../types";
import { STATUS_COLORS, STATUS_LABELS, DEPENDENCY_TYPE_LABELS } from "../utils/constants";

interface StageDetailPanelProps {
  stages: StageData[];
  activeStageId: string | null;
  onStageClick: (stageId: string) => void;
  onManualOverride: (itemId: string, stageId: string, status: ItemStatus, notes: string) => void;
}

export const StageDetailPanel = ({
  stages, activeStageId, onStageClick, onManualOverride,
}: StageDetailPanelProps) => {
  const [viewAll, setViewAll] = useState(false);
  const sorted = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);
  const activeStage = sorted.find((s) => s.id === activeStageId) ?? null;

  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!navRef.current || !activeStageId) return;
    const btn = navRef.current.querySelector(`[data-stage-id="${activeStageId}"]`);
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeStageId]);

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
        No stages loaded. Load a mission config to begin.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stage Navigator */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0 px-4 pt-3">
        <div ref={navRef} className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-on-hover pb-1">
          {sorted.map((s) => {
            const isActive = s.id === activeStageId;
            const c = STATUS_COLORS[s.status];
            return (
              <button
                key={s.id}
                data-stage-id={s.id}
                onClick={() => onStageClick(s.id)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                  whitespace-nowrap transition-colors
                  ${isActive
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                    : `bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 ${c.text} hover:bg-slate-50 dark:hover:bg-slate-600`
                  }
                `}
                aria-current={isActive ? "step" : undefined}
              >
                <StatusIcon status={s.status} size={12} className={isActive ? "!text-white dark:!text-slate-900" : ""} />
                S{s.order}
                <span className="text-[10px] opacity-60 tabular-nums">{s.progress}%</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setViewAll((v) => !v)}
          className={`
            flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium
            transition-colors flex-shrink-0
            ${viewAll
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
            }
          `}
          aria-label={viewAll ? "Show focused view" : "Show all stages"}
        >
          <Layers size={12} />
          {viewAll ? "Focus" : "All"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-on-hover px-4 pb-3 min-h-0">
        {viewAll ? (
          <AllStagesView
            stages={sorted}
            activeStageId={activeStageId}
            onStageClick={onStageClick}
            onManualOverride={onManualOverride}
          />
        ) : activeStage ? (
          <FocusedStageView stage={activeStage} onManualOverride={onManualOverride} />
        ) : (
          <div className="flex items-center justify-center h-40 text-slate-400 dark:text-slate-500 text-sm">
            Select a stage from the tunnel or navigator above.
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── FocusedStageView ─────────────────────────────────────── */

const FocusedStageView = ({
  stage,
  onManualOverride,
}: {
  stage: StageData;
  onManualOverride: (id: string, sid: string, st: ItemStatus, n: string) => void;
}) => {
  const colors = STATUS_COLORS[stage.status];
  const confirmed = stage.items.filter((i) => i.status === "CONFIRMED").length;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                    rounded-lg overflow-hidden transition-colors">
      {/* Stage header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon status={stage.status} size={20} />
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Stage {stage.order}: {stage.name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-2xs text-slate-400 dark:text-slate-500">
                  {DEPENDENCY_TYPE_LABELS[stage.dependencyType]}
                </span>
                <span className="text-2xs text-slate-300 dark:text-slate-600">·</span>
                <span className={`text-2xs font-medium ${colors.text}`}>
                  {STATUS_LABELS[stage.status]}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {stage.progress}%
            </p>
            <p className="text-2xs text-slate-400 dark:text-slate-500 tabular-nums">
              {confirmed}/{stage.items.length} items
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${colors.barColor}`}
            style={{ width: `${stage.progress}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-2" role="list" aria-label={`Checklist items for ${stage.name}`}>
        {[...stage.items]
          .sort((a, b) => a.orderInStage - b.orderInStage)
          .map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              stageId={stage.id}
              onManualOverride={onManualOverride}
            />
          ))}
      </div>
    </div>
  );
};

/* ─── AllStagesView ────────────────────────────────────────── */

const AllStagesView = ({
  stages, activeStageId, onStageClick, onManualOverride,
}: {
  stages: StageData[];
  activeStageId: string | null;
  onStageClick: (id: string) => void;
  onManualOverride: (id: string, sid: string, st: ItemStatus, n: string) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current || !activeStageId) return;
    const el = containerRef.current.querySelector(`[data-all-stage="${activeStageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeStageId]);

  return (
    <div ref={containerRef} className="space-y-3">
      {stages.map((stage) => {
        const isActive = stage.id === activeStageId;
        const colors = STATUS_COLORS[stage.status];
        const confirmed = stage.items.filter((i) => i.status === "CONFIRMED").length;

        return (
          <div
            key={stage.id}
            data-all-stage={stage.id}
            className={`bg-white dark:bg-slate-800 border rounded-lg overflow-hidden transition-colors ${
              isActive
                ? "border-slate-900 dark:border-slate-400 shadow-sm"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <button
              onClick={() => onStageClick(stage.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left
                         hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors"
              aria-expanded={isActive}
            >
              <div className="flex items-center gap-2.5">
                <StatusIcon status={stage.status} size={16} />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Stage {stage.order}: {stage.name}
                  </p>
                  <p className="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {DEPENDENCY_TYPE_LABELS[stage.dependencyType]} ·{" "}
                    <span className={colors.text}>{STATUS_LABELS[stage.status]}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                  {confirmed}/{stage.items.length}
                </span>
                <span className={`text-xs font-bold tabular-nums ${colors.text}`}>
                  {stage.progress}%
                </span>
                {isActive
                  ? <ChevronDown size={14} className="text-slate-400 dark:text-slate-500" />
                  : <ChevronRight size={14} className="text-slate-400 dark:text-slate-500" />
                }
              </div>
            </button>
            <div className="h-0.5 bg-slate-100 dark:bg-slate-700">
              <div
                className={`h-0.5 transition-all duration-500 ${colors.barColor}`}
                style={{ width: `${stage.progress}%` }}
              />
            </div>
            {isActive ? (
              <div className="p-3 space-y-2" role="list">
                {[...stage.items]
                  .sort((a, b) => a.orderInStage - b.orderInStage)
                  .map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      stageId={stage.id}
                      onManualOverride={onManualOverride}
                    />
                  ))}
              </div>
            ) : (
              <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
                {[...stage.items]
                  .sort((a, b) => a.orderInStage - b.orderInStage)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-1"
                      title={`${item.name}: ${STATUS_LABELS[item.status]}`}
                    >
                      <StatusIcon status={item.status} size={13} />
                      <span className="text-2xs text-slate-500 dark:text-slate-400 max-w-[90px] truncate">
                        {item.name}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};