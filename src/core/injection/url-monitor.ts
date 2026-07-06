import { unsafeWindow } from "$";
import { logger } from "@/utils/logger";

export interface UrlMonitor {
  start(): void;
  stop(): void;
  syncUrl(): void;
}

export function createUrlMonitor(onChange: () => void): UrlMonitor {
  let lastUrl = "";
  let intervalId: number | null = null;

  function handleUrlDetected(forcedUrl?: string) {
    const currentUrl = forcedUrl ?? unsafeWindow.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    logger.debug(`🌏 URL 变更检测: ${currentUrl}`);
    onChange();
  }

  return {
    start() {
      lastUrl = unsafeWindow.location.href;

      navigation.addEventListener("navigate", (e) => {
        const nextUrl = e.destination.url;
        if (!nextUrl) return;
        queueMicrotask(() => handleUrlDetected(nextUrl));
      });

      intervalId = window.setInterval(() => handleUrlDetected(), 5000);
    },

    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    syncUrl() {
      handleUrlDetected();
    },
  };
}
