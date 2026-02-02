import Alpine from "alpinejs";
import "./styles/global.css";
import { initMainPanel, appendUserCard } from "./ui/panel";

(async () => {
  // 1. 注册主面板（只注入 HTML 和定义 data，不 start）
  initMainPanel();

  // 2. 调试模式处理
  if (__IS_DEBUG__) {
    // 使用 vite.config.ts 定义的变量
    console.debug("调试模式已启用");
    const mod = await import("./ui/debug/debugger");
    mod.initDebugger();
  }
  window.Alpine = Alpine;
  Alpine.start();

  appendUserCard({
    id: "1928059834",
    nickname: "圼乁UwU",
    avatar: "https://i0.hdslb.com/bfs/face/member/noface.jpg",
    note: "测试备注",
  });
})();
