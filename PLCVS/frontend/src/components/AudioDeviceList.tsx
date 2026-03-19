/**
 * AudioDeviceList — shows browser audio devices (interactive/selectable)
 * and backend devices (reference).
 *
 * CHANGE: Uses useMediaDevices for browser-side device enumeration.
 * Devices are now clickable — selection is passed to parent for
 * the audio analyzer to use the selected device.
 */

import { useEffect } from "react";
import { RefreshCw, Mic, CheckCircle2, MonitorSpeaker } from "lucide-react";
import { useMediaDevices } from "../hooks/useMediaDevices";
import { useAudioDevices } from "../hooks/useAudioDevices";

interface AudioDeviceListProps {
  autoLoad?: boolean;
  selectedDeviceId?: string | null;
  onDeviceSelect?: (deviceId: string) => void;
}

export const AudioDeviceList = ({
  autoLoad = true,
  selectedDeviceId,
  onDeviceSelect,
}: AudioDeviceListProps) => {
  const browser = useMediaDevices();
  const backend = useAudioDevices();

  useEffect(() => {
    if (autoLoad) {
      browser.enumerate();
      backend.load();
    }
  }, [autoLoad]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (deviceId: string) => {
    browser.setSelectedDeviceId(deviceId);
    onDeviceSelect?.(deviceId);
  };

  const activeId = selectedDeviceId ?? browser.selectedDeviceId;

  return (
    <div>
      {/* ── Browser Devices (Interactive) ─────────── */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          Audio Input Devices
        </h4>
        <button
          onClick={() => browser.enumerate()}
          disabled={browser.isLoading}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
          aria-label="Refresh device list"
        >
          <RefreshCw size={12} className={`text-slate-400 dark:text-slate-500 ${browser.isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {browser.error && <p className="text-2xs text-red-600 dark:text-red-400 mb-2">{browser.error}</p>}

      {!browser.hasPermission && browser.devices.length === 0 && (
        <button
          onClick={() => browser.enumerate()}
          className="w-full p-3 border border-dashed border-slate-300 dark:border-slate-600
                     rounded-md text-center text-xs text-slate-500 dark:text-slate-400
                     hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <Mic size={16} className="mx-auto mb-1 text-slate-400" />
          Click to grant microphone access
        </button>
      )}

      {browser.devices.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto mb-4">
          {browser.devices.map((d) => {
            const isSelected = activeId === d.deviceId;
            return (
              <button
                key={d.deviceId}
                onClick={() => handleSelect(d.deviceId)}
                className={`w-full flex items-center justify-between p-2.5 rounded-md border text-sm text-left
                            transition-all duration-150
                  ${isSelected
                    ? "border-blue-400 dark:border-blue-500/50 bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-400/30"
                    : "border-slate-100 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/30 hover:border-slate-300 dark:hover:border-slate-500"
                  }`}
                aria-pressed={isSelected}
                aria-label={`Select ${d.label}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isSelected
                    ? <CheckCircle2 size={14} className="text-blue-500 flex-shrink-0" />
                    : <Mic size={14} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  }
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate ${
                      isSelected ? "text-blue-700 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {d.label}
                    </p>
                    {d.isDefault && (
                      <span className="text-2xs text-slate-400 dark:text-slate-500">System default</span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <span className="text-2xs text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">Active</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Backend Devices (Reference) ──────────── */}
      {backend.devices.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <MonitorSpeaker size={11} className="text-slate-400 dark:text-slate-500" />
            <h4 className="text-2xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Server Devices (PyAudio)
            </h4>
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {backend.devices.map((d) => (
              <div key={d.index}
                   className={`flex items-center justify-between p-2 rounded text-2xs
                     ${d.is_default
                       ? "bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20"
                       : "bg-slate-50/50 dark:bg-slate-700/20 border border-slate-100 dark:border-slate-700"
                     }`}>
                <span className="text-slate-600 dark:text-slate-400 truncate">{d.name}</span>
                <span className="text-slate-400 dark:text-slate-500 font-mono flex-shrink-0 ml-2">#{d.index}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};