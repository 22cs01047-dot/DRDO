/**
 * TranscriptFeed — live scrolling feed of transcription segments.
 * Reconstructed from interface contract (original source not provided).
 */

import { useRef, useEffect, useState } from "react";
import { MessageSquare, ChevronDown } from "lucide-react";
import type { TranscriptionSegment } from "../types";
import { formatTimestamp, confidenceBadgeClass } from "../utils/helpers";

interface TranscriptFeedProps {
  transcriptions: TranscriptionSegment[];
}

const speakerStyles: Record<string, { label: string; color: string }> = {
  QUESTIONER: { label: "Q",  color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  RESPONDER:  { label: "R",  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  UNKNOWN:    { label: "?",  color: "bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300" },
};

export const TranscriptFeed = ({ transcriptions }: TranscriptFeedProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to top when new transcriptions arrive (newest first)
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [transcriptions.length, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    // If user scrolled away from top, disable auto-scroll
    setAutoScroll(containerRef.current.scrollTop < 10);
  };

  return (
    <div aria-label="Live transcription feed">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-slate-400 dark:text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Transcripts
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-slate-400 dark:text-slate-500 tabular-nums">
            {transcriptions.length} total
          </span>
          {!autoScroll && transcriptions.length > 0 && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (containerRef.current) containerRef.current.scrollTop = 0;
              }}
              className="flex items-center gap-1 text-2xs text-blue-600 dark:text-blue-400
                         hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              aria-label="Scroll to latest"
            >
              <ChevronDown size={10} className="rotate-180" />
              Latest
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="space-y-2 max-h-64 overflow-y-auto scrollbar-on-hover"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {transcriptions.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-8">
            No transcriptions yet. Start a session to begin.
          </p>
        ) : (
          transcriptions.map((t) => {
            const speaker = speakerStyles[t.speaker] || speakerStyles.UNKNOWN;

            return (
              <div
                key={t.id}
                className="p-2.5 rounded-md bg-slate-50/80 dark:bg-slate-700/40
                           border border-slate-100 dark:border-slate-600/50
                           transition-colors hover:bg-slate-100/60 dark:hover:bg-slate-700/60"
              >
                <div className="flex items-start gap-2">
                  {/* Speaker badge */}
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center
                                text-[10px] font-bold ${speaker.color}`}
                    title={t.speaker}
                  >
                    {speaker.label}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Transcript text */}
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      {t.text}
                    </p>

                    {/* Metadata row */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-2xs text-slate-400 dark:text-slate-500 tabular-nums">
                        {formatTimestamp(t.timestamp)}
                      </span>

                      {t.confidence > 0 && (
                        <span className={`text-2xs px-1.5 py-0.5 rounded font-medium tabular-nums
                                          ${confidenceBadgeClass(t.confidence)}`}>
                          {(t.confidence * 100).toFixed(0)}%
                        </span>
                      )}

                      {t.matchedItemName && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="text-2xs text-blue-600 dark:text-blue-400 font-medium truncate max-w-[140px]">
                            → {t.matchedItemName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};