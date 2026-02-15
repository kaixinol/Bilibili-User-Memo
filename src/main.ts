import Alpine from "alpinejs";
import { initMainPanel } from "./ui/panel";
import { initPageInjection } from "./core/injector";
import { unsafeWindow } from "$";

(async () => {
  initPageInjection();
  initMainPanel();

  unsafeWindow.Alpine = Alpine;
  if (import.meta.env.DEV) {
    Alpine.start();
  }

  if (__IS_DEBUG__) {
    console.debug("调试模式已启用");
    const mod = await import("./ui/debug/debugger");
    mod.initDebugger();
  }
})();
