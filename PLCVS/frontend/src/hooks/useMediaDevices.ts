/**
 * useMediaDevices — enumerates browser audio input devices.
 * Requests microphone permission, listens for device changes.
 */

import { useState, useCallback, useEffect } from "react";

export interface BrowserAudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
  isDefault: boolean;
}

interface MediaDevicesState {
  devices: BrowserAudioDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  isLoading: boolean;
  error: string | null;
  enumerate: () => Promise<void>;
  hasPermission: boolean;
}

export function useMediaDevices(): MediaDevicesState {
  const [devices, setDevices] = useState<BrowserAudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  const enumerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error("MediaDevices API not available");
      }

      // Request permission first (needed to get device labels)
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());
        setHasPermission(true);
      } catch {
        setHasPermission(false);
        // Can still enumerate but labels will be empty
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
          groupId: d.groupId,
          isDefault: d.deviceId === "default" || i === 0,
        }));

      setDevices(audioInputs);

      // Auto-select default if nothing selected
      if (!selectedDeviceId && audioInputs.length > 0) {
        const def = audioInputs.find((d) => d.isDefault) || audioInputs[0];
        setSelectedDeviceId(def.deviceId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId]);

  // Listen for device changes
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const handler = () => enumerate();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [enumerate]);

  return { devices, selectedDeviceId, setSelectedDeviceId, isLoading, error, enumerate, hasPermission };
}