import Alpine from "alpinejs";
import persist from "@alpinejs/persist";
import { initMainPanel } from "@/features/panel/panel";
import { initPageInjection } from "@/core/injection/injector";
import { unsafeWindow, GM_registerMenuCommand } from "$";
import {
  getPanelPreloadAllCards,
  setPanelPreloadAllCards,
} from "@/features/panel/user-list-store";
import {
  disablePageScope,
  enablePageScope,
  getCurrentPageScopePattern,
  isCurrentPageDisabled,
} from "@/core/store/page-disable-storage";
import { showAlert } from "@/features/panel/dialogs";

(async () => {
  Alpine.plugin(persist);

  // 👉 统一 Alpine 实例（很关键）
  unsafeWindow.Alpine = Alpine;

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

  const preloadAllCards = getPanelPreloadAllCards();
  GM_registerMenuCommand(
    `${preloadAllCards ? "✅" : "⬜"}默认预注入全部卡片`,
    () => {
      const next = !getPanelPreloadAllCards();
      setPanelPreloadAllCards(next);

      const userList = Alpine.store("userList") as
        | { setPreloadAllCards?: (value: boolean) => void }
        | undefined;

      userList?.setPreloadAllCards?.(next);

      showAlert(
        next
          ? "已开启默认预注入全部卡片。当前页面会尽量立即生效。"
          : "已关闭默认预注入全部卡片。未打开面板前将延后加载列表。",
      );
    },
  );

  if (pageDisabled) {
    console.info(`[Bilibili-User-Memo] 当前页面已禁用: ${currentScopePattern}`);
    return;
  }

  // 👉 先注册 debugger（关键修复点）
  if (__IS_DEBUG__) {
    console.debug("调试模式已启用");
    const mod = await import("@/features/debugger/debugger");
    mod.initDebugger(); // 这里会 Alpine.data("monkeyApp")
  }

  // 👉 再初始化其他逻辑
  initPageInjection();
  initMainPanel();

  // 👉 最后再启动 Alpine（只调用一次）
  if (import.meta.env.DEV) {
    Alpine.start();
  }
})();
