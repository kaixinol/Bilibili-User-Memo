import Alpine from "alpinejs";
import persist from "@alpinejs/persist";
import { initMainPanel } from "./ui/panel";
import { initPageInjection } from "./core/injection/injector";
import { unsafeWindow, GM_registerMenuCommand } from "$";
import {
  disablePageScope,
  enablePageScope,
  getCurrentPageScopePattern,
  isCurrentPageDisabled,
} from "./core/store/page-disable-storage";

(async () => {
  Alpine.plugin(persist);

  const currentScopePattern = getCurrentPageScopePattern();
  const pageDisabled = isCurrentPageDisabled();

  if (pageDisabled) {
    GM_registerMenuCommand("✅在此页面启用", () => {
      enablePageScope(currentScopePattern);
      location.reload();
    });
  } else {
    GM_registerMenuCommand("❌在此页面禁用", () => {
      disablePageScope(currentScopePattern);
      location.reload();
    });
  }

  GM_registerMenuCommand("❓帮助", () => {
    window.open(
      "https://github.com/kaixinol/Bilibili-User-Memo?tab=readme-ov-file#bilibili-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8-ui-%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E",
    );
  });
  GM_registerMenuCommand("❤️给作者一杯咖啡☕", () => {
    window.open("https://s2.loli.net/2025/08/04/1hjKA5qwXHS8Glu.webp");
  });
  GM_registerMenuCommand("🐛反馈", () => {
    window.open("https://github.com/kaixinol/Bilibili-User-Memo/issues");
  });
  if (pageDisabled) {
    console.info(`[Bilibili-User-Memo] 当前页面已禁用: ${currentScopePattern}`);
    return;
  }

  unsafeWindow.Alpine = Alpine;
  initPageInjection();
  initMainPanel();

  if (import.meta.env.DEV) {
    Alpine.start();
  }

  if (__IS_DEBUG__) {
    console.debug("调试模式已启用");
    const mod = await import("./ui/debug/debugger");
    mod.initDebugger();
  }
})();
