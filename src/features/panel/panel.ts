import Alpine from "alpinejs";
import panelHtml from "./panel.html?raw";
import boxHtml from "./box.html?raw";
import "@/styles/panel.css";
import "@/styles/global.css";
import "@/styles/box.css";
import { createPanelPrefsStore } from "./panel-prefs";
import { registerUserStore, type UserListStore } from "./user-list-store";
import { markOwnedElement } from "@/core/dom/owned-node";
import { registerPanelComponents } from "./panel-components";

function useUserListStore(): UserListStore {
  return Alpine.store("userList") as UserListStore;
}

export function initMainPanel() {
  if (document.getElementById("bili-memo-container")) return;

  registerUserStore();
  if (!Alpine.store("panelPrefs")) {
    Alpine.store(
      "panelPrefs",
      createPanelPrefsStore({ getUserListStore: useUserListStore }),
    );
  }
  registerPanelComponents();

  const finalHtml = panelHtml
    .replace("${appName}", "备注管理")
    .replace("${boxTemplate}", boxHtml);

  const container = markOwnedElement(document.createElement("div"));
  container.id = "bili-memo-container";
  container.innerHTML = finalHtml;
  document.body.appendChild(container);
}
