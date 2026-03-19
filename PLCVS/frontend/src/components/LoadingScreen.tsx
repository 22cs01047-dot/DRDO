import { Rocket, Loader2 } from "lucide-react";

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen = ({ message = "Loading mission configuration…" }: LoadingScreenProps) => (
  /* FIX: Replaced hardcoded bg-[#f8fafc] with theme-aware classes */
  <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors">
    <div className="text-center">
      <div className="w-14 h-14 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
        <Rocket size={24} className="text-white" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">PLCVS</h1>
      <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">Pre-Launch Checklist Verification System</p>
      <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        <span>{message}</span>
      </div>
    </div>
  </div>
);