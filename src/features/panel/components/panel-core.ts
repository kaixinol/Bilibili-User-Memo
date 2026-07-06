import Alpine from "alpinejs";
import type { PanelPrefsStore } from "../panel-prefs";
import type { UserListStore } from "../user-list-store";
import { confirmDialog } from "../dialogs";

interface AlpineMagicContext {
  $el?: HTMLElement;
  $nextTick?: (callback: () => void) => void;
  $refs?: Record<string, Element | undefined>;
}

interface DisplayModeOption {
  value: number;
  label: string;
}

export const DISPLAY_MODE_OPTIONS: DisplayModeOption[] = [
  { value: 0, label: "昵称" },
  { value: 1, label: "备注(昵称)" },
  { value: 2, label: "昵称(备注)" },
  { value: 3, label: "备注" },
];

export function getUserListStore(): UserListStore {
  return Alpine.store("userList") as UserListStore;
}

export function getPanelPrefsStore(): PanelPrefsStore {
  return Alpine.store("panelPrefs") as PanelPrefsStore;
}

export function runOnNextTick(context: object, callback: () => void) {
  (context as AlpineMagicContext).$nextTick?.(callback);
}

export function getRef<T extends Element>(
  context: object,
  key: string,
): T | undefined {
  return (context as AlpineMagicContext).$refs?.[key] as T | undefined;
}

export function getCurrentElement(context: object): HTMLElement | undefined {
  return (context as AlpineMagicContext).$el;
}

let panelBindingsRegistered = false;

export function registerPanelBindings() {
  if (panelBindingsRegistered) return;
  panelBindingsRegistered = true;

  Alpine.bind("panelImportBtn", () => ({
    type: "button",
    class: "panel-btn",
    title: "导入JSON文件，支持老格式",
    "@click": "userList.importData()",
  }));

  Alpine.bind("panelMultiSelectBtn", () => ({
    type: "button",
    title: "按Ctrl + A 全选 / 反选",
    ":class": "{ 'panel-btn': true, 'btn-active': userList.isMultiSelect }",
    "@click": "userList.toggleMultiSelect()",
  }));

  Alpine.bind("panelRefreshBtn", () => ({
    type: "button",
    ":disabled":
      "userList.isRefreshing || (userList.isMultiSelect && userList.selectedIds.length === 0)",
    ":class":
      "{ 'panel-btn': true, 'btn-disabled': userList.isRefreshing || (userList.isMultiSelect && userList.selectedIds.length === 0) }",
    ":title":
      "userList.isRefreshing ? '正在同步 Bilibili 最新数据...' : (userList.isMultiSelect ? (userList.selectedIds.length === 0 ? '请选择要刷新的用户' : '刷新所选用户数据') : '刷新UP主名字和头像')",
    "@click": "userList.refreshData()",
  }));

  Alpine.bind("panelExportBtn", () => ({
    type: "button",
    class: "panel-btn",
    "@click": "userList.exportData()",
  }));
}

export function registerPanelShell() {
  Alpine.data("panelShell", () => ({
    init() {
      getPanelPrefsStore().init();
    },
    get isOpen(): boolean {
      return getUserListStore().isOpen;
    },
    set isOpen(next: boolean) {
      getUserListStore().setOpen(next);
    },
    handleSelectAll(event: KeyboardEvent) {
      const userList = getUserListStore();
      if (!userList.isMultiSelect) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "a") return;

      event.preventDefault();
      userList.invertSelection(userList.filteredUsers.map((user) => user.id));
    },
  }));
}

export function registerPanelToggleBtn() {
  Alpine.data("panelToggleBtn", () => ({
    init() {
      const ua = navigator.userAgent;
      if (ua.includes("Windows") && ua.includes("Chrome")) {
        getCurrentElement(this)?.classList.add("is-windows-chrome");
      }
    },
    get prefs(): PanelPrefsStore {
      return getPanelPrefsStore();
    },
    get isOpen(): boolean {
      return getUserListStore().isOpen;
    },
    set isOpen(next: boolean) {
      getUserListStore().setOpen(next);
    },
    get openText(): string {
      return this.prefs.openText;
    },
    get closeText(): string {
      return this.prefs.closeText;
    },
    togglePanel() {
      this.isOpen = !this.isOpen;
    },
    editToggleText() {
      this.prefs.editToggleText(this.isOpen);
    },
  }));
}

export function registerPanelActions() {
  Alpine.data("panelActions", () => ({
    draftSearchQuery: "",
    get userList(): UserListStore {
      return getUserListStore();
    },
    init() {
      this.draftSearchQuery = this.userList.searchQuery;
    },
    commitSearch() {
      this.applySearchQuery();
    },
    applySearchQuery() {
      this.userList.searchQuery = this.draftSearchQuery.trim();
    },
    toggleFuzzySearch(event: Event) {
      const checked = (event.target as HTMLInputElement).checked;
      this.userList.setFuzzySearchEnabled(checked);
    },
    confirmRemoveSelected() {
      const count = this.userList.selectedIds.length;
      if (count === 0) return;
      if (confirmDialog(`确定要删除所选 ${count} 个用户吗？`)) {
        this.userList.removeSelected();
      }
    },
  }));
}
