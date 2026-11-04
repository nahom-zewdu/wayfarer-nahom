"use client";

import { useEffect, useRef } from "react";

const channelName = "wayfarer:availability:v1";
const refreshEvent = {
  type: "availability-changed",
  version: 1,
} as const;
const pollingIntervalMs = 12_000;

export function useAvailabilitySync(refreshAvailability: () => void): () => void {
  const refreshRef = useRef(refreshAvailability);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    refreshRef.current = refreshAvailability;
  }, [refreshAvailability]);

  useEffect(() => {
    let refreshQueued = false;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || refreshQueued) {
        return;
      }

      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (document.visibilityState === "visible") {
          refreshRef.current();
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIfVisible();
      }
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      let candidate: BroadcastChannel | null = null;
      try {
        candidate = new BroadcastChannel(channelName);
        candidate.addEventListener("message", (event: MessageEvent<unknown>) => {
          if (
            typeof event.data === "object" &&
            event.data !== null &&
            "type" in event.data &&
            event.data.type === refreshEvent.type &&
            "version" in event.data &&
            event.data.version === refreshEvent.version
          ) {
            refreshIfVisible();
          }
        });
        channel = candidate;
        channelRef.current = candidate;
      } catch {
        candidate?.close();
        channel = null;
        channelRef.current = null;
      }
    }

    const interval = window.setInterval(
      refreshIfVisible,
      pollingIntervalMs,
    );
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      channel?.close();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, []);

  return () => {
    channelRef.current?.postMessage(refreshEvent);
  };
}
