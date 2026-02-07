import Alpine from "alpinejs";
import "./styles/global.css";
import { initMainPanel, appendUserCard } from "./ui/panel";
import { initPageInjection } from "./core/injector";
import { logger } from "./utils/logger";

(async () => {
  initPageInjection();
  initMainPanel();

  window.Alpine = Alpine;
  Alpine.start();

  appendUserCard({
    id: "1928059834",
    nickname: "圼乁UwU",
    avatar: "https://i0.hdslb.com/bfs/face/member/noface.jpg",
    memo: "测试备注",
  });
  appendUserCard({
    id: "3546763113794470",
    nickname: "圼乁UwU",
    avatar: "https://i0.hdslb.com/bfs/face/member/noface.jpg",
    memo: "测试备注",
  });
  if (__IS_DEBUG__) {
    console.debug("调试模式已启用");
    const mod = await import("./ui/debug/debugger");
    mod.initDebugger();
  }
})();
