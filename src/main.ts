import Alpine from "alpinejs";
import focus from "@alpinejs/focus";
import persist from "@alpinejs/persist";
import { initMainPanel } from "./ui/panel";
import { initPageInjection } from "./core/injection/injector";
import { unsafeWindow } from "$";

(async () => {
  Alpine.plugin([focus, persist]);

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
