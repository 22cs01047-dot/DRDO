import type { ProgressData } from "../types";
interface ProgressBarProps {
  progress: ProgressData;
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  const pct = progress.overallProgress;

  const barColor =
    pct === 100
      ? "bg-emerald-500"
      : progress.failedItems > 0
        ? "bg-red-500"
        : "bg-sky-500";

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Overall Progress
        </h2>
        <span className="text-2xl font-bold text-slate-900 tabular-nums">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Overall progress: ${pct}%`}
        />
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2">
        <Chip label="Total" value={progress.totalItems} />
        <Chip label="Confirmed" value={progress.confirmedItems} variant="success" />
        <Chip label="Failed" value={progress.failedItems} variant="danger" />
        <Chip label="Ambiguous" value={progress.ambiguousItems} variant="warning" />
        <Chip label="Pending" value={progress.pendingItems} />
      </div>
    </div>
  );
};

const variants = {
  default: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
};

const Chip = ({
  label,
  value,
  variant = "default",
}: { label: string; value: number; variant?: keyof typeof variants }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${variants[variant]}`}>
    {label}
    <span className="font-bold">{value}</span>
  </span>
);