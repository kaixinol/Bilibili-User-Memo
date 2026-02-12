import Alpine from "alpinejs";
import "./styles/global.css";
import { initMainPanel } from "./ui/panel";
import { initPageInjection } from "./core/injector";
import { unsafeWindow } from "$";

(async () => {
  initPageInjection();
  initMainPanel();

  unsafeWindow.Alpine = Alpine;
  Alpine.start();

  if (__IS_DEBUG__) {
    console.debug("调试模式已启用");
    const mod = await import("./ui/debug/debugger");
    mod.initDebugger();
  }
})();
