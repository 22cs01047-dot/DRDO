import { useMemo, useState, useCallback } from "react";
import { useTheme } from "../contexts/ThemeContext";
import type { StageData, Alert } from "../types";

interface TunnelProgressProps {
  stages: StageData[];
  activeStageId: string | null;
  onStageClick: (stageId: string) => void;
  overallProgress: number;
  sessionStatus?: string;
  alerts?: Alert[];
  onItemSelect?: (itemId: string, stageId: string) => void;
  showTooltips?: boolean;
  compact?: boolean;
  highlightNextAction?: boolean;
}

// ─── Layout Constants (theme-independent) ──────────────────────
const DESIGN = {
  PAD: 40, CY: 50, SVG_H: 160, TH: 6, GR: 12, DR: 5, DPAD: 20,
  SEG_MIN_WIDTH: 160, SEG_MAX_WIDTH: 240,
};

const PULSE = { fast: "0.8s", normal: "1.2s", slow: "2s" };

// ─── Theme-Aware Color Factory ─────────────────────────────────
function createColors(isDark: boolean) {
  const d = isDark;
  return {
    status: {
      CONFIRMED: {
        fill: "#10b981", stroke: "#059669",
        light: d ? "rgba(16,185,129,0.15)" : "#d1fae5",
        text: d ? "#6ee7b7" : "#065f46",
        textBg: d ? "rgba(16,185,129,0.15)" : "#d1fae5",
        textBgStroke: d ? "rgba(5,150,105,0.4)" : "#059669",
      },
      FAILED: {
        fill: "#ef4444", stroke: "#dc2626",
        light: d ? "rgba(239,68,68,0.15)" : "#fee2e2",
        text: d ? "#fca5a5" : "#991b1b",
        textBg: d ? "rgba(239,68,68,0.15)" : "#fee2e2",
        textBgStroke: d ? "rgba(220,38,38,0.4)" : "#dc2626",
      },
      IN_PROGRESS: {
        fill: "#3b82f6", stroke: "#2563eb",
        light: d ? "rgba(59,130,246,0.15)" : "#dbeafe",
        text: d ? "#93c5fd" : "#1e40af",
        textBg: d ? "rgba(59,130,246,0.15)" : "#dbeafe",
        textBgStroke: d ? "rgba(37,99,235,0.4)" : "#2563eb",
      },
      PENDING: {
        fill: d ? "#334155" : "#f1f5f9",
        stroke: d ? "#475569" : "#cbd5e1",
        light: d ? "rgba(51,65,85,0.3)" : "#f8fafc",
        text: d ? "#94a3b8" : "#64748b",
        textBg: d ? "#334155" : "#f1f5f9",
        textBgStroke: d ? "#475569" : "#cbd5e1",
      },
      AMBIGUOUS: {
        fill: "#f59e0b", stroke: "#d97706",
        light: d ? "rgba(245,158,11,0.15)" : "#fef3c7",
        text: d ? "#fcd34d" : "#92400e",
        textBg: d ? "rgba(245,158,11,0.15)" : "#fef3c7",
        textBgStroke: d ? "rgba(217,119,6,0.4)" : "#d97706",
      },
    },
    session: {
      IDLE:      { border: "border-slate-200 dark:border-slate-600", bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-400" },
      RUNNING:   { border: "border-blue-300 dark:border-blue-500/40", bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
      PAUSED:    { border: "border-amber-300 dark:border-amber-500/40", bg: "bg-amber-100 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
      COMPLETED: { border: "border-emerald-300 dark:border-emerald-500/40", bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
      ABORTED:   { border: "border-red-300 dark:border-red-500/40", bg: "bg-red-100 dark:bg-red-500/15", text: "text-red-700 dark:text-red-400" },
    },
    gradient: { progress: ["#10b981", "#3b82f6"], active: ["#3b82f6", "#8b5cf6"] },
    svg: {
      track: d ? "#334155" : "#e2e8f0",
      trackOpacity: d ? 0.5 : 0.6,
      gateBg: d ? "#1e293b" : "#ffffff",
      dotBg: d ? "#1e293b" : "#ffffff",
      overlayBg: d ? "#1e293b" : "#ffffff",
      overlayStroke: d ? "#334155" : "#e2e8f0",
      overlayText: d ? "#94a3b8" : "#64748b",
      cursorBg: d ? "#e2e8f0" : "#1e293b",
      cursorText: d ? "#0f172a" : "#ffffff",
      shineOpacity: d ? 0.1 : 0.2,
      failedBg: d ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.06)",
      focusStroke: d ? "#93c5fd" : "#3b82f6",
    },
  };
}

type StatusColors = ReturnType<typeof createColors>["status"];
type StatusColorEntry = StatusColors[keyof StatusColors];

// ─── Theme-independent helpers ─────────────────────────────────
function needsAction(status: string, isActive: boolean, sessionStatus: string): boolean {
  return sessionStatus === "RUNNING" && (status === "PENDING" || status === "IN_PROGRESS" || isActive);
}

// ─── Types ─────────────────────────────────────────────────────
interface Seg {
  id: string; name: string; order: number; status: string;
  progress: number; lx: number; rx: number; cx: number;
  isActive: boolean;
  dots: { id: string; x: number; status: string; name: string }[];
  alertCount: number; hasCritical: boolean; itemCount: number; needsAction: boolean;
}
interface GateInfo {
  x: number; color: string; isFilled: boolean;
  hasCritical: boolean; index: number; needsAction: boolean;
}
interface TooltipData {
  visible: boolean; x: number; y: number;
  content: { title: string; status: string; progress?: number; items?: number; alerts?: number; description?: string };
}

// ─── Main Component ────────────────────────────────────────────
export const TunnelProgress = ({
  stages, activeStageId, onStageClick, overallProgress,
  sessionStatus = "IDLE", alerts = [], onItemSelect,
  showTooltips = true, compact = false, highlightNextAction = true,
}: TunnelProgressProps) => {
  const { isDark } = useTheme();
  const COLORS = useMemo(() => createColors(isDark), [isDark]);

  // Color helpers (depend on current theme)
  const getStatusColor = useCallback(
    (status: string): StatusColorEntry =>
      COLORS.status[status as keyof StatusColors] || COLORS.status.PENDING,
    [COLORS]
  );

  const getGateColor = useCallback(
    (l: string | null, r: string | null): string => {
      if (l === "CONFIRMED" && r === "CONFIRMED") return COLORS.status.CONFIRMED.fill;
      if (l === "CONFIRMED") return COLORS.status.CONFIRMED.fill;
      if (l === "FAILED" || r === "FAILED") return COLORS.status.FAILED.fill;
      if (l === "IN_PROGRESS" || r === "IN_PROGRESS") return COLORS.status.IN_PROGRESS.fill;
      return COLORS.status.PENDING.stroke;
    },
    [COLORS]
  );

  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const [hoveredDot, setHoveredDot] = useState<{ id: string; stageId: string } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData>({ visible: false, x: 0, y: 0, content: { title: "", status: "" } });
  const [focusedStage, setFocusedStage] = useState<string | null>(null);

  const sorted = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);
  const N = sorted.length;
  const unackedAlerts = useMemo(() => alerts.filter((a) => !a.acknowledged), [alerts]);

  // ── Layout computation ────────────────────────────────
  const layout = useMemo(() => {
    if (N === 0) return null;

    const alertMap: Record<string, { total: number; critical: number; byItem: Record<string, number> }> = {};
    for (const a of unackedAlerts) {
      if (a.stageId) {
        if (!alertMap[a.stageId]) alertMap[a.stageId] = { total: 0, critical: 0, byItem: {} };
        alertMap[a.stageId].total++;
        if (a.severity === "CRITICAL") alertMap[a.stageId].critical++;
        if (a.itemId) alertMap[a.stageId].byItem[a.itemId] = (alertMap[a.stageId].byItem[a.itemId] || 0) + 1;
      }
    }

    const segWidth = Math.min(DESIGN.SEG_MAX_WIDTH, Math.max(DESIGN.SEG_MIN_WIDTH, (1200 - DESIGN.PAD * 2) / N));
    const svgW = Math.max(800, DESIGN.PAD * 2 + N * segWidth);
    const actualSegW = (svgW - DESIGN.PAD * 2) / N;
    const gates = Array.from({ length: N + 1 }, (_, i) => DESIGN.PAD + i * actualSegW);

    let confirmed = 0, failed = 0, pending = 0, ambiguous = 0, inProgress = 0;

    const segs: Seg[] = sorted.map((st, i) => {
      const lx = gates[i], rx = gates[i + 1], cx = (lx + rx) / 2;
      const items = [...st.items].sort((a, b) => a.orderInStage - b.orderInStage);
      const n = items.length;
      const dl = lx + DESIGN.DPAD, dr = rx - DESIGN.DPAD;
      const sp = n > 1 ? (dr - dl) / (n - 1) : 0;

      for (const it of items) {
        switch (it.status) {
          case "CONFIRMED": confirmed++; break;
          case "FAILED": failed++; break;
          case "IN_PROGRESS": inProgress++; break;
          case "AMBIGUOUS": ambiguous++; break;
          default: pending++;
        }
      }

      const isActive = st.id === activeStageId;
      const stageNeeds = sessionStatus === "RUNNING" && (st.status === "PENDING" || st.status === "IN_PROGRESS" || isActive);

      return {
        id: st.id, name: st.name, order: st.order, status: st.status,
        progress: st.progress, lx, rx, cx, isActive,
        dots: items.map((it, j) => ({ id: it.id, x: n === 1 ? cx : dl + j * sp, status: it.status, name: it.name })),
        alertCount: alertMap[st.id]?.total || 0,
        hasCritical: (alertMap[st.id]?.critical || 0) > 0,
        itemCount: n, needsAction: stageNeeds,
      };
    });

    const gateInfos: GateInfo[] = gates.map((x, i) => {
      const left = i > 0 ? segs[i - 1] : null;
      const right = i < N ? segs[i] : null;
      return {
        x,
        color: getGateColor(left?.status || null, right?.status || null),
        isFilled: (left?.status || null) === "CONFIRMED",
        hasCritical: (left?.hasCritical || false) || (right?.hasCritical || false),
        index: i,
        needsAction: (left?.needsAction || false) || (right?.needsAction || false),
      };
    });

    let fillEnd = DESIGN.PAD;
    for (const s of segs) {
      if (s.progress === 100) { fillEnd = s.rx; }
      else if (s.progress > 0) { fillEnd = s.lx + (s.progress / 100) * (s.rx - s.lx); break; }
      else break;
    }

    return {
      svgW, segs, gateInfos, fillW: fillEnd - DESIGN.PAD,
      counts: { total: confirmed + failed + pending + ambiguous + inProgress, confirmed, failed, pending, ambiguous, inProgress },
      totalAlerts: unackedAlerts.length, segWidth: actualSegW,
    };
  }, [sorted, N, activeStageId, unackedAlerts, sessionStatus, getGateColor]);

  // ── Event handlers (stable references) ────────────────
  const handleStageHover = useCallback((stageId: string | null, event?: React.MouseEvent) => {
    setHoveredStage(stageId);
    if (showTooltips && stageId && event) {
      const seg = layout?.segs.find((s) => s.id === stageId);
      if (seg) {
        setTooltip({
          visible: true, x: event.clientX, y: event.clientY,
          content: { title: seg.name, status: seg.status, progress: seg.progress, items: seg.itemCount, alerts: seg.alertCount, description: `Stage ${seg.order}` },
        });
      }
    } else if (!stageId) setTooltip((t) => ({ ...t, visible: false }));
  }, [layout?.segs, showTooltips]);

  const handleDotHover = useCallback((dotId: string | null, stageId: string | null, event?: React.MouseEvent) => {
    setHoveredDot(dotId && stageId ? { id: dotId, stageId } : null);
    if (showTooltips && dotId && stageId && event) {
      const seg = layout?.segs.find((s) => s.id === stageId);
      const dot = seg?.dots.find((d) => d.id === dotId);
      if (dot) {
        setTooltip({
          visible: true, x: event.clientX, y: event.clientY,
          content: { title: dot.name, status: dot.status },
        });
      }
    } else if (!dotId) setTooltip((t) => ({ ...t, visible: false }));
  }, [layout?.segs, showTooltips]);

  const handleStageClick = useCallback((stageId: string) => {
    onStageClick(stageId); setFocusedStage(stageId);
  }, [onStageClick]);

  const handleDotClick = useCallback((dotId: string, stageId: string) => {
    if (onItemSelect) onItemSelect(dotId, stageId);
    setFocusedStage(stageId);
  }, [onItemSelect]);

  // ── Empty state ───────────────────────────────────────
  if (!layout || N === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center transition-colors">
        <div className="text-slate-400 dark:text-slate-500 text-sm">No stages configured</div>
      </div>
    );
  }

  const { svgW, segs, gateInfos, fillW, counts, totalAlerts } = layout;
  const sessionState = {
    idle: sessionStatus === "IDLE", running: sessionStatus === "RUNNING",
    paused: sessionStatus === "PAUSED", completed: sessionStatus === "COMPLETED",
    aborted: sessionStatus === "ABORTED",
  };
  const sessionColors = COLORS.session[sessionStatus as keyof typeof COLORS.session] || COLORS.session.IDLE;
  const S = COLORS.svg;

  const fillColor = sessionState.completed ? COLORS.status.CONFIRMED.fill
    : sessionState.aborted ? COLORS.status.FAILED.fill
    : sessionState.paused ? COLORS.status.AMBIGUOUS.fill
    : "url(#progress-gradient)";

  const dotOpacity = sessionState.idle ? 0.4 : sessionState.paused ? 0.7 : 1;

  return (
    <div className={`bg-white dark:bg-slate-800 border-2 ${sessionColors.border} rounded-2xl overflow-visible relative transition-all duration-300 shadow-lg hover:shadow-xl dark:shadow-slate-900/30`}>
      {/* Session Status Badge */}
      <div className="absolute top-3 right-4 z-10">
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${sessionColors.bg} ${sessionColors.text} border ${sessionColors.border} shadow-sm`}>
          <span className={`w-2 h-2 rounded-full ${
            sessionState.running ? "bg-blue-500 animate-pulse"
            : sessionState.completed ? "bg-emerald-500"
            : sessionState.paused ? "bg-amber-500"
            : sessionState.aborted ? "bg-red-500"
            : "bg-slate-400 dark:bg-slate-500"
          }`} />
          {sessionStatus}
        </span>
      </div>

      {/* Next Action Banner */}
      {highlightNextAction && sessionState.running && segs.some((s) => s.needsAction) && (
        <div className="absolute top-3 left-4 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-100 dark:from-blue-500/20 to-blue-50 dark:to-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 text-xs font-semibold animate-pulse shadow-sm">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            ⚡ Action Required
          </div>
        </div>
      )}

      {/* SVG Container */}
      <div className="overflow-x-auto px-4 pt-12 pb-2">
        <svg width={svgW} height={DESIGN.SVG_H} viewBox={`0 0 ${svgW} ${DESIGN.SVG_H}`} className="min-w-full" role="img"
          aria-label={`Mission progress: ${overallProgress}% complete. ${counts.confirmed} of ${counts.total} items confirmed.${totalAlerts > 0 ? ` ${totalAlerts} active alerts.` : ""}`}>
          <defs>
            <linearGradient id="progress-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLORS.gradient.progress[0]} stopOpacity="0.95" />
              <stop offset="50%" stopColor={COLORS.gradient.active[0]} stopOpacity="0.95" />
              <stop offset="100%" stopColor={COLORS.gradient.active[1]} stopOpacity="0.95" />
            </linearGradient>
            <filter id="alert-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#ef4444" floodOpacity="0.4" />
              <feComposite in2="blur" operator="in" result="glow" />
              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity={isDark ? 0.3 : 0.1} />
            </filter>
            <radialGradient id="pulse-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="action-pulse-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="critical-pulse-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Track */}
          <rect x={DESIGN.PAD} y={DESIGN.CY - DESIGN.TH / 2} width={svgW - DESIGN.PAD * 2}
            height={DESIGN.TH} rx={DESIGN.TH / 2} fill={S.track} opacity={S.trackOpacity} />

          {/* Progress Fill */}
          {fillW > 0 && (
            <g>
              <rect x={DESIGN.PAD} y={DESIGN.CY - DESIGN.TH / 2} width={fillW} height={DESIGN.TH}
                rx={DESIGN.TH / 2} fill={fillColor} className="transition-all duration-700 ease-out" filter="url(#soft-shadow)" />
              <rect x={DESIGN.PAD} y={DESIGN.CY - DESIGN.TH / 2} width={fillW} height={DESIGN.TH / 2}
                rx={DESIGN.TH / 2} fill="white" opacity={S.shineOpacity}>
                {sessionState.running && <animate attributeName="opacity" values={`${S.shineOpacity};${S.shineOpacity * 2};${S.shineOpacity}`} dur="2s" repeatCount="indefinite" />}
              </rect>
            </g>
          )}

          {/* Failed Stage Highlights */}
          {segs.filter((s) => s.status === "FAILED").map((seg) => (
            <rect key={`fail-${seg.id}`} x={seg.lx + 2} y={DESIGN.CY - 22} width={seg.rx - seg.lx - 4} height={44}
              rx={8} fill={S.failedBg} stroke="rgba(239,68,68,0.3)" strokeWidth={1.5} strokeDasharray="6 4" className="animate-pulse" />
          ))}

          {/* Active Stage Highlight */}
          {segs.filter((s) => s.isActive).map((seg) => (
            <g key={`active-hl-${seg.id}`}>
              <rect x={seg.lx} y={DESIGN.CY - 25} width={seg.rx - seg.lx} height={50} rx={10} fill="url(#pulse-gradient)" opacity="0.5">
                {sessionState.running && <animate attributeName="opacity" values="0.3;0.6;0.3" dur="1.5s" repeatCount="indefinite" />}
              </rect>
              {seg.needsAction && highlightNextAction && (
                <rect x={seg.lx - 5} y={DESIGN.CY - 30} width={seg.rx - seg.lx + 10} height={60}
                  rx={14} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="8 4" opacity="0.8">
                  <animate attributeName="stroke-dashoffset" values="0;12;0" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0.4;0.8" dur="1.5s" repeatCount="indefinite" />
                </rect>
              )}
            </g>
          ))}

          {/* Segments */}
          {segs.map((seg) => {
            const isHovered = hoveredStage === seg.id;
            const isFocused = focusedStage === seg.id;
            const statusColor = getStatusColor(seg.status);
            const shouldBlink = seg.needsAction && highlightNextAction;

            return (
              <g key={seg.id} tabIndex={0} role="button"
                aria-label={`Stage ${seg.order}: ${seg.name}, ${seg.progress}% complete, ${seg.itemCount} items${seg.alertCount > 0 ? `, ${seg.alertCount} alerts` : ""}`}
                aria-pressed={seg.isActive}
                onClick={() => handleStageClick(seg.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleStageClick(seg.id); } }}
                onMouseEnter={(e) => handleStageHover(seg.id, e)}
                onMouseLeave={() => handleStageHover(null)}
                onFocus={() => setFocusedStage(seg.id)}
                onBlur={() => setFocusedStage(null)}
                className="cursor-pointer outline-none" style={{ transition: "all 0.2s ease" }}>

                {shouldBlink && (
                  <rect x={seg.lx + 3} y={DESIGN.CY - 23} width={seg.rx - seg.lx - 6} height={46}
                    rx={9} fill={statusColor.light} opacity="0.3">
                    <animate attributeName="opacity" values="0.3;0.6;0.3" dur={PULSE.normal} repeatCount="indefinite" />
                  </rect>
                )}

                <rect x={seg.lx + 3} y={DESIGN.CY - 23} width={seg.rx - seg.lx - 6} height={46}
                  rx={9} fill={isHovered ? statusColor.light : "transparent"}
                  opacity={isHovered ? 0.5 : 0} className="transition-opacity duration-200" />

                <rect x={seg.lx + 2} y={DESIGN.CY - 24} width={seg.rx - seg.lx - 4} height={48}
                  rx={10} fill="none" stroke={isFocused ? S.focusStroke : "transparent"}
                  strokeWidth={2} strokeDasharray={isFocused ? "4 2" : "0"} className="transition-all duration-200" />

                <rect x={seg.lx} y={DESIGN.CY - 28} width={seg.rx - seg.lx} height={56} fill="transparent" />

                {/* Item Dots */}
                <g opacity={dotOpacity}>
                  {seg.dots.map((dot) => {
                    const isDotHovered = hoveredDot?.id === dot.id;
                    const shouldDotBlink = needsAction(dot.status, seg.isActive, sessionStatus) && highlightNextAction;
                    return (
                      <g key={dot.id}
                        onClick={(e) => { e.stopPropagation(); handleDotClick(dot.id, seg.id); }}
                        onMouseEnter={(e) => handleDotHover(dot.id, seg.id, e)}
                        onMouseLeave={() => handleDotHover(null, null)}
                        className="cursor-pointer" style={{ transition: "transform 0.15s ease" }}>
                        <ItemDot x={dot.x} y={DESIGN.CY} status={dot.status} name={dot.name}
                          animate={sessionState.running} isHovered={isDotHovered || false}
                          needsAction={shouldDotBlink} pulseDuration={PULSE.normal}
                          colors={COLORS} isDark={isDark} />
                      </g>
                    );
                  })}
                </g>

                {/* Stage Labels */}
                <g opacity={sessionState.idle ? 0.6 : 1}>
                  {shouldBlink && (
                    <line x1={seg.cx - 25} y1={DESIGN.CY + 80} x2={seg.cx + 25} y2={DESIGN.CY + 80}
                      stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" opacity="0.8">
                      <animate attributeName="opacity" values="0.8;0.3;0.8" dur={PULSE.normal} repeatCount="indefinite" />
                      <animate attributeName="stroke-dashoffset" values="0;6;0" dur="1s" repeatCount="indefinite" />
                    </line>
                  )}

                  {/* Name pill */}
                  <rect x={seg.cx - 55} y={DESIGN.CY + 28} width={110} height={18}
                    rx={9} fill={statusColor.textBg} stroke={statusColor.textBgStroke}
                    strokeWidth={0.5} opacity={0.85} filter="url(#soft-shadow)" />
                  <text x={seg.cx} y={DESIGN.CY + 37} textAnchor="middle" fontSize={9}
                    fontWeight={seg.isActive ? 700 : 600} fill={statusColor.text}
                    fontFamily="Inter, system-ui, sans-serif" className="transition-colors duration-200">
                    {seg.name.length > 14 ? seg.name.slice(0, 12) + "…" : seg.name}
                  </text>

                  {/* Progress badge */}
                  {(() => {
                    const pColor = seg.progress === 100 ? getStatusColor("CONFIRMED")
                      : seg.status === "FAILED" ? getStatusColor("FAILED")
                      : seg.progress > 0 ? getStatusColor("IN_PROGRESS")
                      : getStatusColor("PENDING");
                    return (<>
                      <rect x={seg.cx - 18} y={DESIGN.CY + 50} width={36} height={16} rx={8}
                        fill={pColor.textBg} stroke={pColor.textBgStroke} strokeWidth={0.5} filter="url(#soft-shadow)" />
                      <text x={seg.cx} y={DESIGN.CY + 58} textAnchor="middle" fontSize={10} fontWeight={800}
                        fill={pColor.text} fontFamily="Inter, system-ui, sans-serif">
                        {seg.progress}%
                      </text>
                    </>);
                  })()}

                  {/* Item count + alerts badge */}
                  {(() => {
                    const aColor = seg.alertCount > 0
                      ? (seg.hasCritical ? getStatusColor("FAILED") : getStatusColor("AMBIGUOUS"))
                      : getStatusColor("PENDING");
                    return (<>
                      <rect x={seg.cx - 35} y={DESIGN.CY + 70} width={70} height={14} rx={7}
                        fill={aColor.textBg} stroke={aColor.textBgStroke} strokeWidth={0.5} opacity={0.9} />
                      <text x={seg.cx} y={DESIGN.CY + 77} textAnchor="middle" fontSize={8}
                        fill={aColor.text} fontWeight={seg.alertCount > 0 ? 700 : 500}
                        fontFamily="Inter, system-ui, sans-serif">
                        {seg.itemCount} item{seg.itemCount !== 1 ? "s" : ""}
                        {seg.alertCount > 0 ? ` · ⚠${seg.alertCount}` : ""}
                      </text>
                    </>);
                  })()}

                  {isHovered && (
                    <line x1={seg.cx} y1={DESIGN.CY + 28} x2={seg.cx} y2={DESIGN.CY + 72}
                      stroke={statusColor.fill} strokeWidth={2} strokeDasharray="4 2" opacity="0.6" />
                  )}
                </g>
              </g>
            );
          })}

          {/* Gate Rings */}
          {gateInfos.map((g) => {
            const shouldGateBlink = g.needsAction && highlightNextAction;
            const pulseGradientId = g.hasCritical ? "critical-pulse-gradient" : "action-pulse-gradient";
            return (
              <g key={`gate-${g.index}`}>
                {shouldGateBlink && (
                  <circle cx={g.x} cy={DESIGN.CY} r={DESIGN.GR + 8} fill={`url(#${pulseGradientId})`} opacity="0.4">
                    <animate attributeName="r" values={`${DESIGN.GR + 6};${DESIGN.GR + 12};${DESIGN.GR + 6}`} dur={PULSE.normal} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.1;0.4" dur={PULSE.normal} repeatCount="indefinite" />
                  </circle>
                )}
                {g.hasCritical && sessionState.running && (
                  <circle cx={g.x} cy={DESIGN.CY} r={DESIGN.GR + 4} fill="none" stroke="#ef4444" strokeWidth={2} opacity="0.6">
                    <animate attributeName="r" values={`${DESIGN.GR + 3};${DESIGN.GR + 8};${DESIGN.GR + 3}`} dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={g.x} cy={DESIGN.CY} r={DESIGN.GR}
                  fill={g.isFilled ? g.color : S.gateBg} stroke={g.color} strokeWidth={2.5}
                  filter={g.hasCritical ? "url(#alert-glow)" : "url(#soft-shadow)"}
                  opacity={sessionState.idle ? 0.6 : 1} className="transition-all duration-300">
                  {shouldGateBlink && !g.isFilled && (
                    <animate attributeName="stroke-width" values="2.5;4;2.5" dur={PULSE.fast} repeatCount="indefinite" />
                  )}
                </circle>
                {g.isFilled && <circle cx={g.x} cy={DESIGN.CY} r={DESIGN.GR - 4} fill={g.color} opacity="0.3" />}
                <circle cx={g.x} cy={DESIGN.CY} r={DESIGN.GR - 2}
                  fill={g.isFilled ? g.color : S.gateBg} opacity={g.isFilled ? 0.9 : 1} />
                <text x={g.x} y={DESIGN.CY + 1} textAnchor="middle" dominantBaseline="central"
                  fontSize={10} fontWeight={800} fill={g.isFilled ? "white" : g.color}
                  fontFamily="Inter, system-ui, sans-serif"
                  style={{ textShadow: g.isFilled ? "0 1px 2px rgba(0,0,0,0.2)" : "none" }}>
                  {g.index}
                  {shouldGateBlink && !g.isFilled && (
                    <animate attributeName="opacity" values="1;0.5;1" dur={PULSE.fast} repeatCount="indefinite" />
                  )}
                </text>
              </g>
            );
          })}

          {/* Session Status Overlays */}
          {sessionState.idle && (
            <g>
              <rect x={svgW / 2 - 140} y={DESIGN.CY - 14} width={280} height={28} rx={14}
                fill={S.overlayBg} fillOpacity="0.95" stroke={S.overlayStroke} strokeWidth={1} filter="url(#soft-shadow)" />
              <text x={svgW / 2} y={DESIGN.CY + 1} textAnchor="middle" dominantBaseline="central"
                fontSize={12} fontWeight={600} fill={S.overlayText} fontFamily="Inter, system-ui, sans-serif">
                ▶ Start session to begin verification
              </text>
            </g>
          )}

          {sessionState.running && segs.filter((s) => s.isActive).map((seg) => (
            <g key={`cursor-${seg.id}`}>
              <polygon points={`${seg.cx - 6},${DESIGN.CY - 32} ${seg.cx + 6},${DESIGN.CY - 32} ${seg.cx},${DESIGN.CY - 22}`} fill={S.cursorBg} opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.5;0.9" dur="1.2s" repeatCount="indefinite" />
              </polygon>
              <rect x={seg.cx - 28} y={DESIGN.CY - 50} width={56} height={20} rx={6} fill={S.cursorBg} opacity="0.95">
                <animate attributeName="opacity" values="0.95;0.7;0.95" dur="1.2s" repeatCount="indefinite" />
              </rect>
              <text x={seg.cx} y={DESIGN.CY - 37} textAnchor="middle" fontSize={10} fontWeight={800}
                fill={S.cursorText} fontFamily="Inter, system-ui, sans-serif">
                <animate attributeName="opacity" values="1;0.7;1" dur="1.2s" repeatCount="indefinite" />
                ACTIVE
              </text>
            </g>
          ))}

          {sessionState.paused && segs.filter((s) => s.isActive).map((seg) => (
            <g key={`paused-${seg.id}`}>
              <polygon points={`${seg.cx - 6},${DESIGN.CY - 32} ${seg.cx + 6},${DESIGN.CY - 32} ${seg.cx},${DESIGN.CY - 22}`} fill="#d97706" />
              <rect x={seg.cx - 30} y={DESIGN.CY - 50} width={60} height={20} rx={6} fill="#d97706" />
              <text x={seg.cx} y={DESIGN.CY - 37} textAnchor="middle" fontSize={10} fontWeight={800} fill="white" fontFamily="Inter, system-ui, sans-serif">
                ⏸ PAUSED
              </text>
            </g>
          ))}

          {sessionState.completed && (
            <g>
              <rect x={svgW / 2 - 60} y={DESIGN.CY - 48} width={120} height={24} rx={12} fill={COLORS.status.CONFIRMED.fill} filter="url(#soft-shadow)">
                <animate attributeName="opacity" values="1;0.9;1" dur="2s" repeatCount="indefinite" />
              </rect>
              <text x={svgW / 2} y={DESIGN.CY - 33} textAnchor="middle" fontSize={11} fontWeight={800} fill="white" fontFamily="Inter, system-ui, sans-serif">✓ COMPLETE</text>
            </g>
          )}

          {sessionState.aborted && (
            <g>
              <rect x={svgW / 2 - 50} y={DESIGN.CY - 48} width={100} height={24} rx={12} fill={COLORS.status.FAILED.fill} filter="url(#soft-shadow)" />
              <text x={svgW / 2} y={DESIGN.CY - 33} textAnchor="middle" fontSize={11} fontWeight={800} fill="white" fontFamily="Inter, system-ui, sans-serif">✕ ABORTED</text>
            </g>
          )}
        </svg>
      </div>

      {/* Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50/80 dark:from-slate-800/80 to-white/80 dark:to-slate-800/50 gap-4">
        {/* Overall Progress Ring */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg width="48" height="48" className="transform -rotate-90">
              <circle cx="24" cy="24" r="20" fill="none" stroke={S.track} strokeWidth="6" />
              <circle cx="24" cy="24" r="20" fill="none"
                stroke={sessionState.completed ? COLORS.status.CONFIRMED.fill : "url(#progress-gradient)"}
                strokeWidth="6" strokeDasharray={`${(overallProgress / 100) * 125.6} 125.6`}
                strokeLinecap="round" className="transition-all duration-700 ease-out" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-300">
              {overallProgress}%
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overall Progress</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{counts.confirmed}/{counts.total} items</div>
          </div>
        </div>

        {/* FIX: Replaced COLORS.status.*.text (hex) with proper Tailwind classes */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <StatChip label="Total" value={counts.total} color="text-slate-600 dark:text-slate-400" bg="bg-slate-100 dark:bg-slate-700/50" icon="📊" />
          <StatChip label="Confirmed" value={counts.confirmed} color="text-emerald-700 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-500/10" icon="✓" />
          <StatChip label="In Progress" value={counts.inProgress} color="text-blue-700 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-500/10" icon="⟳" />
          <StatChip label="Failed" value={counts.failed} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-500/10" icon="✕" />
          <StatChip label="Ambiguous" value={counts.ambiguous} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-500/10" icon="?" />
          <StatChip label="Pending" value={counts.pending} color="text-slate-500 dark:text-slate-400" bg="bg-slate-50 dark:bg-slate-700/30" icon="○" blink={counts.pending > 0 && sessionState.running} />
          {totalAlerts > 0 && (
            <StatChip label="Alerts" value={totalAlerts} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-500/10" icon="⚠" pulse />
          )}
        </div>
      </div>

      {/* Paused Overlay */}
      {sessionState.paused && (
        <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden z-0 opacity-30">
          <div className="w-full h-full" style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(245,158,11,${isDark ? 0.08 : 0.05}) 10px, rgba(245,158,11,${isDark ? 0.08 : 0.05}) 20px)`,
          }} />
        </div>
      )}

      {/* Tooltip */}
      {showTooltips && tooltip.visible && (
        <div className="fixed z-50 pointer-events-none" style={{ left: tooltip.x + 12, top: tooltip.y - 12, transform: "translate(-50%, -100%)" }}>
          <div className="bg-slate-900 dark:bg-slate-600 text-white px-4 py-3 rounded-lg shadow-2xl text-sm max-w-xs">
            <div className="font-semibold mb-1">{tooltip.content.title}</div>
            {tooltip.content.description && <div className="text-slate-300 dark:text-slate-400 text-xs mb-2">{tooltip.content.description}</div>}
            <div className="flex items-center gap-3 text-xs">
              {tooltip.content.status !== undefined && <span className="px-2 py-0.5 rounded bg-slate-700 dark:bg-slate-500">{tooltip.content.status}</span>}
              {tooltip.content.progress !== undefined && <span>{tooltip.content.progress}% complete</span>}
              {tooltip.content.items !== undefined && <span>{tooltip.content.items} items</span>}
              {tooltip.content.alerts !== undefined && tooltip.content.alerts > 0 && <span className="text-amber-400">⚠ {tooltip.content.alerts} alerts</span>}
            </div>
          </div>
          <div className="absolute left-1/2 bottom-0 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900 dark:border-t-slate-600"
            style={{ transform: "translateX(-50%) translateY(100%)" }} />
        </div>
      )}
    </div>
  );
};

// ─── ItemDot Component ─────────────────────────────────────────
const ItemDot = ({
  x, y, status, name, animate, isHovered, needsAction: shouldBlink,
  pulseDuration = "1.2s", colors, isDark,
}: {
  x: number; y: number; status: string; name: string;
  animate: boolean; isHovered: boolean; needsAction: boolean;
  pulseDuration?: string;
  colors: ReturnType<typeof createColors>;
  isDark: boolean;
}) => {
  const r = DESIGN.DR;
  const color = colors.status[status as keyof typeof colors.status] || colors.status.PENDING;
  const scale = isHovered ? 1.3 : 1;
  const dur = pulseDuration;
  const bg = isDark ? "#1e293b" : "#ffffff";

  switch (status) {
    case "CONFIRMED":
      return (
        <g transform={`scale(${scale}) translate(${x * (1 - 1 / scale)}, ${y * (1 - 1 / scale)})`}>
          <title>{name} — Confirmed</title>
          <circle cx={x} cy={y} r={r} fill={color.fill} stroke={color.stroke} strokeWidth={1.5} filter="url(#soft-shadow)" />
          <polyline points={`${x - 2.5},${y} ${x - 0.5},${y + 2.5} ${x + 3},${y - 2.5}`} fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "FAILED":
      return (
        <g transform={`scale(${scale}) translate(${x * (1 - 1 / scale)}, ${y * (1 - 1 / scale)})`}>
          <title>{name} — Failed</title>
          <circle cx={x} cy={y} r={r} fill={color.fill} stroke={color.stroke} strokeWidth={1.5} filter="url(#soft-shadow)" />
          <line x1={x - 2.5} y1={y - 2.5} x2={x + 2.5} y2={y + 2.5} stroke="white" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={x + 2.5} y1={y - 2.5} x2={x - 2.5} y2={y + 2.5} stroke="white" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      );
    case "IN_PROGRESS":
      return (
        <g transform={`scale(${scale}) translate(${x * (1 - 1 / scale)}, ${y * (1 - 1 / scale)})`}>
          <title>{name} — In Progress</title>
          <circle cx={x} cy={y} r={r} fill={bg} stroke={color.fill} strokeWidth={2.5}>
            {animate && (<>
              <animate attributeName="r" values={`${r};${r + 2.5};${r}`} dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
            </>)}
            {shouldBlink && (<>
              <animate attributeName="stroke-width" values="2.5;4;2.5" dur={dur} repeatCount="indefinite" />
              <animate attributeName="stroke" values={`${color.fill};#f59e0b;${color.fill}`} dur={dur} repeatCount="indefinite" />
            </>)}
          </circle>
          <circle cx={x} cy={y} r={2} fill={color.fill}>
            {shouldBlink && <animate attributeName="r" values="2;3;2" dur={dur} repeatCount="indefinite" />}
          </circle>
        </g>
      );
    case "AMBIGUOUS":
      return (
        <g transform={`scale(${scale}) translate(${x * (1 - 1 / scale)}, ${y * (1 - 1 / scale)})`}>
          <title>{name} — Ambiguous</title>
          <circle cx={x} cy={y} r={r} fill={color.fill} stroke={color.stroke} strokeWidth={1.5} filter="url(#soft-shadow)">
            {shouldBlink && (<>
              <animate attributeName="r" values={`${r};${r + 1.5};${r}`} dur={dur} repeatCount="indefinite" />
              <animate attributeName="fill" values={`${color.fill};#fbbf24;${color.fill}`} dur={dur} repeatCount="indefinite" />
            </>)}
          </circle>
          <text x={x} y={y + 0.5} textAnchor="middle" fontSize={7} fontWeight={800} fill="white" dominantBaseline="middle" fontFamily="Inter, system-ui, sans-serif">
            ?{shouldBlink && <animate attributeName="opacity" values="1;0.5;1" dur={dur} repeatCount="indefinite" />}
          </text>
        </g>
      );
    default: // PENDING
      return (
        <g transform={`scale(${scale}) translate(${x * (1 - 1 / scale)}, ${y * (1 - 1 / scale)})`}>
          <title>{name} — Pending</title>
          {shouldBlink && (
            <circle cx={x} cy={y} r={r + 4} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity="0.6">
              <animate attributeName="r" values={`${r + 3};${r + 6};${r + 3}`} dur={dur} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0.2;0.6" dur={dur} repeatCount="indefinite" />
            </circle>
          )}
          <circle cx={x} cy={y} r={r} fill={bg} stroke={shouldBlink ? "#f59e0b" : color.stroke} strokeWidth={shouldBlink ? 2.5 : 2} strokeDasharray="3 2">
            {shouldBlink && (<>
              <animate attributeName="stroke-dashoffset" values="0;5;0" dur="1s" repeatCount="indefinite" />
              <animate attributeName="stroke" values="#f59e0b;#fbbf24;#f59e0b" dur={dur} repeatCount="indefinite" />
            </>)}
          </circle>
        </g>
      );
  }
};

// ─── StatChip Component ────────────────────────────────────────
const StatChip = ({
  label, value, color = "text-slate-600 dark:text-slate-400",
  bg = "bg-slate-100 dark:bg-slate-700/50", icon, pulse = false, blink = false,
}: {
  label: string; value: number; color?: string; bg?: string;
  icon?: string; pulse?: boolean; blink?: boolean;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${bg} ${color} transition-all duration-200 hover:scale-105 cursor-default shadow-sm ${pulse ? "animate-pulse" : ""} ${blink ? "animate-blink" : ""}`}
    style={blink ? { animation: "blink 1.2s ease-in-out infinite" } : {}}>
    {icon && <span className="text-sm">{icon}</span>}
    <span>{label}</span>
    <span className="font-bold tabular-nums px-1.5 py-0.5 rounded bg-white/60 dark:bg-white/10">{value}</span>
  </span>
);