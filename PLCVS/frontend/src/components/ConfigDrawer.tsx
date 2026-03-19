/**
 * ConfigDrawer — visualizes the mission checklist YAML configuration
 * with progressive disclosure (collapsible stages, items, rules).
 */

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, Layers, ListChecks,
  ShieldAlert, GitBranch, Loader2, Tag, Check, X as XIcon, AlertTriangle,
} from "lucide-react";
import { SlideDrawer } from "./SlideDrawer";
import { API_BASE_URL } from "../utils/constants";

interface ConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConfigData {
  mission: { id: string; name: string; version: string };
  stages: StageConfig[];
  rules: RuleConfig[];
}

interface StageConfig {
  id: string; name: string; order: number;
  dependency: string | null; type: string; description?: string;
  checklist_items: ItemConfig[];
}

interface ItemConfig {
  id: string; name: string; keywords: string[];
  expected_responses: { positive: string[]; negative: string[] };
  mandatory: boolean; order_in_stage: number;
}

interface RuleConfig {
  id: string; description: string; type: string; severity: string;
  params?: Record<string, unknown>;
}

const DEP_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  STRICT:      { label: "Sequential",  color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10" },
  SOFT:        { label: "Recommended", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" },
  PARALLEL:    { label: "Parallel",    color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10" },
  INDEPENDENT: { label: "Independent", color: "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-500/10" },
};

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  WARNING:  "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  INFO:     "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400",
};

export const ConfigDrawer = ({ isOpen, onClose }: ConfigDrawerProps) => {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedRules, setExpandedRules] = useState(false);

  useEffect(() => {
    if (isOpen && !config) {
      setLoading(true);
      setError(null);
      fetch(`${API_BASE_URL}/checklist/config`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(setConfig)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [isOpen, config]);

  const toggleStage = useCallback((id: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleItem = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const totalItems = config?.stages.reduce((a, s) => a + s.checklist_items.length, 0) ?? 0;
  const mandatoryItems = config?.stages.reduce(
    (a, s) => a + s.checklist_items.filter((i) => i.mandatory).length, 0
  ) ?? 0;
  const deps = config?.stages.filter((s) => s.dependency) ?? [];

  return (
    <SlideDrawer
      isOpen={isOpen} onClose={onClose}
      title="Mission Configuration"
      subtitle={config?.mission.name || "Loading…"}
      icon={<BookOpen size={16} className="text-white" />}
      width="max-w-xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Loading configuration…</span>
        </div>
      )}

      {error && (
        <div className="m-5 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-sm text-red-700 dark:text-red-400">
          Failed to load config: {error}
        </div>
      )}

      {config && (
        <div className="p-5 space-y-5">
          {/* ── Mission Info ──────────────────────────── */}
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <div className="flex items-center gap-2 mb-3">
              <Layers size={14} className="text-slate-400 dark:text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Mission</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-2xs text-slate-400 dark:text-slate-500">ID</span>
                <p className="font-mono text-slate-700 dark:text-slate-300 text-xs">{config.mission.id}</p>
              </div>
              <div>
                <span className="text-2xs text-slate-400 dark:text-slate-500">Version</span>
                <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs">{config.mission.version}</p>
              </div>
              <div>
                <span className="text-2xs text-slate-400 dark:text-slate-500">Stages</span>
                <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs">{config.stages.length}</p>
              </div>
              <div>
                <span className="text-2xs text-slate-400 dark:text-slate-500">Items</span>
                <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                  {totalItems} ({mandatoryItems} mandatory)
                </p>
              </div>
            </div>
          </div>

          {/* ── Dependencies ─────────────────────────── */}
          {deps.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <GitBranch size={14} className="text-slate-400 dark:text-slate-500" />
                <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Dependencies</h3>
              </div>
              <div className="space-y-1.5">
                {config.stages.map((s) => {
                  const dep = DEP_TYPE_LABELS[s.type] || DEP_TYPE_LABELS.INDEPENDENT;
                  const depStage = s.dependency ? config.stages.find((x) => x.id === s.dependency) : null;
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-xs p-2 rounded-md bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-600/50">
                      <span className={`px-1.5 py-0.5 rounded text-2xs font-semibold ${dep.color}`}>{dep.label}</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{s.name}</span>
                      {depStage && (
                        <>
                          <span className="text-slate-400 dark:text-slate-500">←</span>
                          <span className="text-slate-500 dark:text-slate-400">{depStage.name}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Stages ───────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ListChecks size={14} className="text-slate-400 dark:text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Stages & Items
              </h3>
            </div>
            <div className="space-y-2">
              {config.stages
                .sort((a, b) => a.order - b.order)
                .map((stage) => {
                  const isExpanded = expandedStages.has(stage.id);
                  const dep = DEP_TYPE_LABELS[stage.type] || DEP_TYPE_LABELS.INDEPENDENT;

                  return (
                    <div key={stage.id} className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                      {/* Stage header */}
                      <button
                        onClick={() => toggleStage(stage.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left
                                   hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isExpanded
                            ? <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                            : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                          }
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums flex-shrink-0">
                            {stage.order}.
                          </span>
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{stage.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-2xs px-1.5 py-0.5 rounded font-medium ${dep.color}`}>{dep.label}</span>
                          <span className="text-2xs text-slate-400 dark:text-slate-500">{stage.checklist_items.length} items</span>
                        </div>
                      </button>

                      {/* Stage items (expanded) */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                          {stage.checklist_items
                            .sort((a, b) => a.order_in_stage - b.order_in_stage)
                            .map((item) => {
                              const isItemExpanded = expandedItems.has(item.id);
                              return (
                                <div key={item.id}>
                                  <button
                                    onClick={() => toggleItem(item.id)}
                                    className="w-full flex items-center justify-between px-4 py-2 text-left
                                               hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                                    aria-expanded={isItemExpanded}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {isItemExpanded
                                        ? <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
                                        : <ChevronRight size={12} className="text-slate-400 flex-shrink-0" />
                                      }
                                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{item.name}</span>
                                      {item.mandatory && (
                                        <span className="text-red-500 dark:text-red-400 text-2xs font-bold flex-shrink-0">✱</span>
                                      )}
                                    </div>
                                    <span className="text-2xs text-slate-400 dark:text-slate-500 font-mono flex-shrink-0">{item.id}</span>
                                  </button>

                                  {/* Item details (expanded) */}
                                  {isItemExpanded && (
                                    <div className="px-4 pb-3 pl-9 space-y-2">
                                      {/* Keywords */}
                                      <div>
                                        <span className="text-2xs text-slate-400 dark:text-slate-500 font-medium">Keywords</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {item.keywords.map((kw, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs
                                                                      bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400
                                                                      border border-blue-100 dark:border-blue-500/20">
                                              <Tag size={8} /> {kw}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                      {/* Expected Responses */}
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-2xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                            <Check size={9} /> Positive
                                          </span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {item.expected_responses.positive.map((r, i) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded text-2xs bg-emerald-50 dark:bg-emerald-500/10
                                                                       text-emerald-700 dark:text-emerald-400">{r}</span>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-2xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                                            <XIcon size={9} /> Negative
                                          </span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {item.expected_responses.negative.map((r, i) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded text-2xs bg-red-50 dark:bg-red-500/10
                                                                       text-red-700 dark:text-red-400">{r}</span>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* ── Rules ────────────────────────────────── */}
          {config.rules.length > 0 && (
            <div>
              <button
                onClick={() => setExpandedRules((v) => !v)}
                className="flex items-center gap-2 mb-2 w-full text-left"
                aria-expanded={expandedRules}
              >
                <ShieldAlert size={14} className="text-slate-400 dark:text-slate-500" />
                <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Rules ({config.rules.length})
                </h3>
                {expandedRules
                  ? <ChevronDown size={12} className="text-slate-400" />
                  : <ChevronRight size={12} className="text-slate-400" />
                }
              </button>
              {expandedRules && (
                <div className="space-y-1.5">
                  {config.rules.map((rule) => (
                    <div key={rule.id} className="flex items-start gap-2 p-2.5 rounded-md bg-slate-50 dark:bg-slate-700/30
                                                   border border-slate-100 dark:border-slate-600/50 text-xs">
                      <AlertTriangle size={12} className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-2xs text-slate-400 dark:text-slate-500">{rule.id}</span>
                          <span className={`text-2xs px-1.5 py-0.5 rounded font-medium ${SEVERITY_STYLES[rule.severity] || SEVERITY_STYLES.INFO}`}>
                            {rule.severity}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{rule.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </SlideDrawer>
  );
};