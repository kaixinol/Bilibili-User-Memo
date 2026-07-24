import { logger } from "@/utils/logger";

export interface UrlMonitor {
  start(): void;
  stop(): void;
  syncUrl(): void;
}

export function createUrlMonitor(onChange: () => void): UrlMonitor {
  let lastUrl = "";
  let throttleTimer: number | null = null;

  function handleUrlDetected(forcedUrl?: string, source = "unknown") {
    const currentUrl = forcedUrl ?? location.href;
    if (currentUrl === lastUrl) {
      logger.debug(`🌏 [${source}] URL 未变化, 跳过: ${currentUrl}`);
      return;
    }
    const prevUrl = lastUrl;
    lastUrl = currentUrl;
    logger.debug(
      `🌏 [${source}] URL 变更检测: ${prevUrl} → ${currentUrl} (${performance.now().toFixed(0)}ms)`,
    );
    onChange();
  }

  function throttledHandleUrlDetected() {
    if (throttleTimer !== null) {
      clearTimeout(throttleTimer);
    }
    throttleTimer = window.setTimeout(() => {
      throttleTimer = null;
      handleUrlDetected(undefined, "navigated节流");
    }, 300);
  }

  return {
    start() {
      lastUrl = location.href;

      // Navigation API (Chromium) — use "navigated" so DOM is already updated.
      // Throttle to deduplicate rapid triggers from bilibili tracking scripts.
      (globalThis as any).navigation?.addEventListener(
        "navigated",
        throttledHandleUrlDetected,
      );
    },

    stop() {
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
    },

    syncUrl() {
      handleUrlDetected();
    },
  };
}
