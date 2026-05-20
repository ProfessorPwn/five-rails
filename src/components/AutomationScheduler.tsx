"use client";

import { useEffect, useRef } from "react";

export default function AutomationScheduler() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let intervalMinutes = 15;

    async function runHeartbeat() {
      try {
        await fetch("/api/automation/process", { method: "POST" });
      } catch {
        // Silent — automation runs in background
      }
    }

    async function init() {
      try {
        const res = await fetch("/api/automation/settings");
        if (res.ok) {
          const settings = await res.json();
          const configured = parseInt(settings.automation_interval_minutes);
          if (configured && configured >= 1) intervalMinutes = configured;
        }
      } catch {
        // Use default
      }

      // Run once on startup after 30s delay (let the app load first)
      const startupTimer = setTimeout(runHeartbeat, 30000);

      // Then run on interval
      intervalRef.current = setInterval(runHeartbeat, intervalMinutes * 60 * 1000);

      return () => clearTimeout(startupTimer);
    }

    init();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Renders nothing — pure background process
  return null;
}
