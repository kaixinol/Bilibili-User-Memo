import Alpine from "alpinejs";
import type { PanelPrefsStore } from "./panel-prefs";
import type { UserListStore } from "./user-list-store";
import { confirmDialog } from "./dialogs";

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

/**
 * 组件外读取 store。返回类型由 ./store-types.d.ts 的 Stores augmentation 提供，
 * 所以既不需要 `as UserListStore` 这类断言，注册端也会做类型校验。
 *
 * 之所以还要这两个 helper 而不是统一用 `this.$store.xxx`：Alpine.data 里的
 * `this` 会退化成 any（ThisType 依赖 T 自身，TS 解不开这个循环），
 * 走 helper 才能拿到真实类型。详见 ALPINE-AUDIT.md。
 */
export function getUserListStore(): UserListStore {
  return Alpine.store("userList");
}

export function getPanelPrefsStore(): PanelPrefsStore {
  return Alpine.store("panelPrefs");
}

let panelBindingsRegistered = false;

export function registerPanelBindings() {
  if (panelBindingsRegistered) return;
  panelBindingsRegistered = true;

  Alpine.bind("panelImportBtn", () => ({
    type: "button",
    class: "panel-btn",
    title: "导入JSON文件，支持老格式",
    "@click": "$store.userList.importData()",
  }));

  Alpine.bind("panelMultiSelectBtn", () => ({
    type: "button",
    title: "按Ctrl + A 全选 / 反选",
    ":class": "{ 'panel-btn': true, 'btn-active': $store.userList.isMultiSelect }",
    "@click": "$store.userList.toggleMultiSelect()",
  }));

  Alpine.bind("panelRefreshBtn", () => ({
    type: "button",
    ":disabled":
      "$store.userList.isRefreshing || ($store.userList.isMultiSelect && $store.userList.selectedIds.length === 0)",
    ":class":
      "{ 'panel-btn': true, 'btn-disabled': $store.userList.isRefreshing || ($store.userList.isMultiSelect && $store.userList.selectedIds.length === 0) }",
    ":title":
      "$store.userList.isRefreshing ? '正在同步 Bilibili 最新数据...' : ($store.userList.isMultiSelect ? ($store.userList.selectedIds.length === 0 ? '请选择要刷新的用户' : '刷新所选用户数据') : '刷新UP主名字和头像')",
    "@click": "$store.userList.refreshData()",
  }));

  Alpine.bind("panelExportBtn", () => ({
    type: "button",
    class: "panel-btn",
    "@click": "$store.userList.exportData()",
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
    handleInvertSelectionShortcut(event: KeyboardEvent) {
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
        this.$el.classList.add("is-windows-chrome");
      }
    },
    get isOpen(): boolean {
      return getUserListStore().isOpen;
    },
    set isOpen(next: boolean) {
      getUserListStore().setOpen(next);
    },
    get openText(): string {
      return getPanelPrefsStore().openText;
    },
    get closeText(): string {
      return getPanelPrefsStore().closeText;
    },
    togglePanel() {
      this.isOpen = !this.isOpen;
    },
    editToggleText() {
      getPanelPrefsStore().editToggleText(this.isOpen);
    },
  }));
}

/** 停止输入多久后才真正触发搜索 */
const SEARCH_DEBOUNCE_MS = 200;

export function registerPanelActions() {
  Alpine.data("panelActions", () => ({
    draftSearchQuery: "",
    /** 输入法组合中：拼音还没上屏，此时的内容不该拿来搜索 */
    isComposing: false,
    searchTimer: 0,
    init() {
      this.draftSearchQuery = getUserListStore().searchQuery;
    },
    handleSearchInput(value: string) {
      if (!String(value ?? "").trim()) {
        this.cancelPendingSearch();
        getUserListStore().searchQuery = "";
        return;
      }
      this.scheduleSearch();
    },
    scheduleSearch(delay = SEARCH_DEBOUNCE_MS) {
      this.cancelPendingSearch();
      // 组合中不算「打完字」，直接跳过；上屏后由 compositionend 重新排程
      if (this.isComposing) return;
      this.searchTimer = window.setTimeout(() => {
        this.searchTimer = 0;
        this.applySearchQuery();
      }, delay);
    },
    cancelPendingSearch() {
      if (this.searchTimer) {
        window.clearTimeout(this.searchTimer);
        this.searchTimer = 0;
      }
    },
    beginComposition() {
      this.isComposing = true;
      this.cancelPendingSearch();
    },
    endComposition() {
      this.isComposing = false;
      // 延后一个宏任务：compositionend 与最终 input 的先后顺序各浏览器不一致
      this.scheduleSearch(0);
    },
    commitSearch() {
      this.cancelPendingSearch();
      this.applySearchQuery();
    },
    applySearchQuery() {
      getUserListStore().searchQuery = this.draftSearchQuery.trim();
    },
    toggleFuzzySearch(event: Event) {
      const checked = (event.target as HTMLInputElement).checked;
      getUserListStore().setFuzzySearchEnabled(checked);
    },
    confirmRemoveSelected() {
      const count = getUserListStore().selectedIds.length;
      if (count === 0) return;
      if (confirmDialog(`确定要删除所选 ${count} 个用户吗？`)) {
        getUserListStore().removeSelected();
      }
    },
  }));
}
