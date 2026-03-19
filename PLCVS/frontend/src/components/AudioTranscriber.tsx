import { useRef, useCallback } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { useTranscribeFile } from "../hooks/useTranscribeFile";

export const AudioTranscriber = () => {
  const { result, isLoading, error, transcribe, clear } = useTranscribeFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) transcribe(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [transcribe]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400">Audio Transcriber</h4>
        {result && (
          <button
            onClick={clear}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            aria-label="Clear result"
          >
            <X size={12} className="text-slate-400 dark:text-slate-500" />
          </button>
        )}
      </div>

      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter") fileInputRef.current?.click(); }}
        tabIndex={0}
        role="button"
        aria-label="Upload audio file for transcription"
        className={`
          border border-dashed rounded-md p-4 text-center cursor-pointer transition-colors
          ${isLoading
            ? "border-amber-300 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/5"
            : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.ogg,.flac,.m4a"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="text-amber-600 dark:text-amber-400 animate-spin" />
            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">Transcribing…</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Upload size={16} className="text-slate-400 dark:text-slate-500" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Upload audio file</p>
          </div>
        )}
        <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1">WAV, MP3, OGG, FLAC</p>
      </div>

      {error && (
        <p className="mt-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10
                      p-2 rounded-md">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-2">
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-md p-3">
            <p className="text-2xs text-slate-400 dark:text-slate-500 mb-1 font-medium">Transcription</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {result.text || "(empty)"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Confidence", value: `${(result.confidence * 100).toFixed(1)}%` },
              { label: "Duration", value: `${result.duration.toFixed(1)}s` },
              { label: "Language", value: result.language.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-md p-2">
                <p className="text-2xs text-slate-400 dark:text-slate-500">{label}</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};