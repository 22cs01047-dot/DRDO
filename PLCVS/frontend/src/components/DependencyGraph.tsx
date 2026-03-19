import { useMemo } from "react";
import { ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import type { StageData } from "../types";
import { DEPENDENCY_TYPE_LABELS } from "../utils/constants";

interface DependencyGraphProps {
  stages: StageData[];
  activeStageId: string | null;
  onStageClick: (stageId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const DependencyGraph = ({
  stages, activeStageId, onStageClick,
  collapsed = false, onToggleCollapse,
}: DependencyGraphProps) => {
  const sorted = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);

  const stageIndex = useMemo(() => {
    const map: Record<string, number> = {};
    sorted.forEach((s, i) => { map[s.id] = i; });
    return map;
  }, [sorted]);

  if (sorted.length === 0) return null;

  const nodeW = 150;
  const nodeH = 64;
  const gapX = 40;
  const padX = 16;
  const padY = 12;
  const totalW = padX * 2 + sorted.length * nodeW + (sorted.length - 1) * gapX;
  const totalH = padY * 2 + nodeH;

  const statusStroke: Record<string, string> = {
    CONFIRMED: "#059669",
    FAILED: "#dc2626",
    IN_PROGRESS: "#0284c7",
    PENDING: "#cbd5e1",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header with collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between px-5 py-3
                   text-left hover:bg-slate-50/50 transition-colors"
        aria-expanded={!collapsed}
        aria-label="Toggle dependency graph"
      >
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Stage Dependencies
          </h3>
        </div>
        {collapsed
          ? <ChevronRight size={16} className="text-slate-400" />
          : <ChevronDown size={16} className="text-slate-400" />
        }
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 overflow-x-auto">
          <svg
            width={totalW}
            height={totalH + 8}
            viewBox={`0 0 ${totalW} ${totalH + 8}`}
            className="min-w-full"
            role="img"
            aria-label="Stage dependency flow diagram"
          >
            <defs>
              <marker id="arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill="#94a3b8" />
              </marker>
            </defs>

            {/* Connecting arrows */}
            {sorted.map((stage) => {
              if (!stage.dependsOn || stageIndex[stage.dependsOn] === undefined) return null;
              const fromIdx = stageIndex[stage.dependsOn];
              const toIdx = stageIndex[stage.id];
              const x1 = padX + fromIdx * (nodeW + gapX) + nodeW;
              const x2 = padX + toIdx * (nodeW + gapX);
              const y = padY + nodeH / 2;
              return (
                <line
                  key={`arrow-${stage.id}`}
                  x1={x1} y1={y} x2={x2 - 5} y2={y}
                  stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#arrow)"
                />
              );
            })}

            {/* Stage nodes */}
            {sorted.map((stage, i) => {
              const x = padX + i * (nodeW + gapX);
              const y = padY;
              const isActive = stage.id === activeStageId;
              const stroke = statusStroke[stage.status] || statusStroke.PENDING;

              return (
                <g
                  key={stage.id}
                  onClick={() => onStageClick(stage.id)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Stage ${stage.order}: ${stage.name}, ${stage.progress}% complete`}
                  onKeyDown={(e) => { if (e.key === "Enter") onStageClick(stage.id); }}
                >
                  <rect
                    x={x} y={y} width={nodeW} height={nodeH}
                    rx={6} ry={6}
                    fill={isActive ? "#f8fafc" : "#ffffff"}
                    stroke={isActive ? "#0f172a" : stroke}
                    strokeWidth={isActive ? 2 : 1.5}
                  />

                  {/* Stage name */}
                  <text
                    x={x + nodeW / 2} y={y + 20}
                    textAnchor="middle" fontSize={11} fontWeight={600}
                    fill="#1e293b" fontFamily="Inter, sans-serif"
                  >
                    {stage.name.length > 17 ? stage.name.slice(0, 15) + "…" : stage.name}
                  </text>

                  {/* Progress */}
                  <text
                    x={x + nodeW / 2} y={y + 35}
                    textAnchor="middle" fontSize={10} fill="#64748b"
                    fontFamily="Inter, sans-serif"
                  >
                    {stage.progress}% complete
                  </text>

                  {/* Dependency type */}
                  <text
                    x={x + nodeW / 2} y={y + 50}
                    textAnchor="middle" fontSize={9} fill="#94a3b8"
                    fontFamily="Inter, sans-serif"
                  >
                    {DEPENDENCY_TYPE_LABELS[stage.dependencyType]}
                  </text>

                  {/* Status dot */}
                  <circle
                    cx={x + nodeW - 10} cy={y + 10} r={4}
                    fill={stroke}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
};
