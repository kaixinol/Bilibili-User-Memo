import Alpine from "alpinejs";
import panelHtml from "./panel.html?raw";
import boxHtml from "./box.html?raw";
import "../styles/panel.css";
import "../styles/global.css";
import "../styles/box.css";
import { BiliUser } from "../core/types";
import { createPanelPrefsStore, PanelPrefsStore } from "./panel-prefs";
import { registerUserStore, UserListStore } from "./user-list-store";

interface DisplayModeOption {
  value: number;
  label: string;
}

const DISPLAY_MODE_OPTIONS: DisplayModeOption[] = [
  { value: 0, label: "昵称" },
  { value: 1, label: "备注(昵称)" },
  { value: 2, label: "昵称(备注)" },
  { value: 3, label: "备注" },
];

let panelComponentsRegistered = false;
let panelBindingsRegistered = false;

function useUserListStore(): UserListStore {
  return Alpine.store("userList") as UserListStore;
}

function usePanelPrefsStore(): PanelPrefsStore {
  return Alpine.store("panelPrefs") as PanelPrefsStore;
}

function registerPanelBindings() {
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
    ":disabled": "userList.isRefreshing",
    ":class": "{ 'panel-btn': true, 'btn-disabled': userList.isRefreshing }",
    ":title":
      "userList.isRefreshing ? '正在同步 Bilibili 最新数据...' : '刷新UP主名字和头像'",
    "@click": "userList.refreshData()",
  }));

  Alpine.bind("panelSearchClearBtn", () => ({
    type: "button",
    class: "panel-search-clear",
    "x-show": "userList.searchQuery",
    "@click": "clearSearch()",
  }));

  Alpine.bind("panelExportBtn", () => ({
    type: "button",
    class: "panel-btn",
    "@click": "userList.exportData()",
  }));
}

function registerPanelComponents() {
  if (panelComponentsRegistered) return;
  panelComponentsRegistered = true;
  registerPanelBindings();

  Alpine.data("panelShell", () => ({
    init() {
      usePanelPrefsStore().init();
    },
    get isOpen(): boolean {
      return useUserListStore().isOpen;
    },
    set isOpen(next: boolean) {
      useUserListStore().isOpen = Boolean(next);
    },
    handleSelectAll(event: KeyboardEvent) {
      const userList = useUserListStore();
      if (!userList.isMultiSelect) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "a") return;

      event.preventDefault();
      userList.invertSelection(userList.filteredUsers.map((user) => user.id));
    },
  }));

  Alpine.data("panelToggleBtn", () => ({
    get prefs(): PanelPrefsStore {
      return usePanelPrefsStore();
    },
    get isOpen(): boolean {
      return useUserListStore().isOpen;
    },
    set isOpen(next: boolean) {
      useUserListStore().isOpen = Boolean(next);
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

  Alpine.data("panelSettings", () => ({
    displayModes: DISPLAY_MODE_OPTIONS,
    get userList(): UserListStore {
      return useUserListStore();
    },
    get prefs(): PanelPrefsStore {
      return usePanelPrefsStore();
    },
    get displayModeProxy(): number {
      return this.userList.displayMode;
    },
    set displayModeProxy(mode: number) {
      this.userList.setDisplayMode(Number(mode));
    },
    get isDark(): boolean {
      return this.prefs.isDark;
    },
    get customFontColor(): string {
      return this.prefs.customFontColor;
    },
    set customFontColor(next: string) {
      this.prefs.customFontColor = next;
    },
    get customMemoCss(): string {
      return this.prefs.customMemoCss;
    },
    set customMemoCss(next: string) {
      this.prefs.customMemoCss = next;
    },
    get cssStatus(): string {
      return this.prefs.cssStatus;
    },
    get showAdvancedCss(): boolean {
      return this.prefs.showAdvancedCss;
    },
    toggleTheme() {
      this.prefs.toggleTheme();
    },
    onCustomColorInput() {
      this.prefs.onCustomColorInput();
    },
    closeAdvancedCss() {
      this.prefs.closeAdvancedCss();
    },
    handleColorSettingContextMenu(event: MouseEvent) {
      event.preventDefault();
      this.prefs.showAdvancedCss = !this.prefs.showAdvancedCss;
      if (!this.prefs.showAdvancedCss) return;

      (this as any).$nextTick(() => {
        const input = (this as any).$refs.memoCssInput as
          | HTMLTextAreaElement
          | undefined;
        input?.focus();
      });
    },
    handleColorSettingMouseDown(event: MouseEvent) {
      if (event.button !== 1) return;
      event.preventDefault();
      this.prefs.clearCustomColor();
    },
    applyMemoCss() {
      this.prefs.applyMemoCss();
    },
  }));

  Alpine.data("panelActions", () => ({
    get userList(): UserListStore {
      return useUserListStore();
    },
    clearSearch() {
      this.userList.searchQuery = "";
    },
    confirmRemoveSelected() {
      const count = this.userList.selectedIds.length;
      if (count === 0) return;
      if (confirm(`确定要删除所选 ${count} 个用户吗？`)) {
        this.userList.removeSelected();
      }
    },
  }));

  Alpine.data("userCard", (userId: string) => ({
    userId,
    get userList(): UserListStore {
      return useUserListStore();
    },
    get currentUser(): BiliUser | undefined {
      return this.userList.users.find((item) => item.id === this.userId);
    },
    get isSelected(): boolean {
      return this.userList.selectedIds.includes(this.userId);
    },
    get isMultiSelect(): boolean {
      return this.userList.isMultiSelect;
    },
    get selectedIds(): string[] {
      return this.userList.selectedIds;
    },
    set selectedIds(next: string[]) {
      this.userList.selectedIds = next;
    },
    toggleSelected() {
      const next = new Set(this.userList.selectedIds);
      if (next.has(this.userId)) next.delete(this.userId);
      else next.add(this.userId);
      this.userList.selectedIds = Array.from(next);
    },
    handleCardClick(event: MouseEvent) {
      if (!this.isMultiSelect) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".user-select")) return;

      event.preventDefault();
      this.toggleSelected();
    },
    confirmRemove() {
      if (confirm("确定要删除吗？")) {
        this.userList.removeUser(this.userId);
      }
    },
  }));

  Alpine.data("copyableUid", (uid: string) => ({
    uid,
    copied: false,
    get isMultiSelect(): boolean {
      return useUserListStore().isMultiSelect;
    },
    init() {
      this.refreshOverflow();
    },
    refreshOverflow() {
      (this as any).$nextTick(() => {
        const el = (this as any).$el as HTMLElement;
        el.classList.toggle("can-expand", el.scrollWidth > el.clientWidth);
      });
    },
    copy() {
      if (this.isMultiSelect) return;
      navigator.clipboard.writeText(`UID:${this.uid}`);
      this.copied = true;
      window.setTimeout(() => {
        this.copied = false;
      }, 500);
    },
    get displayText(): string {
      return this.copied ? "✅ 已复制" : this.uid;
    },
  }));

  Alpine.data("memoEditor", (userId: string, initialMemo = "") => ({
    userId,
    isEditing: false,
    memoDraft: String(initialMemo ?? ""),
    get userList(): UserListStore {
      return useUserListStore();
    },
    get isMultiSelect(): boolean {
      return this.userList.isMultiSelect;
    },
    get currentMemo(): string {
      return (
        this.userList.users.find((item) => item.id === this.userId)?.memo || ""
      );
    },
    syncDraft() {
      if (!this.isEditing) {
        this.memoDraft = this.currentMemo;
      }
    },
    startEdit() {
      if (this.isMultiSelect) return;
      this.isEditing = true;
      (this as any).$nextTick(() => {
        const input = (this as any).$refs.memoInput as
          | HTMLInputElement
          | undefined;
        input?.focus();
      });
    },
    commit() {
      this.isEditing = false;
      const nextMemo =
        typeof this.memoDraft === "string"
          ? this.memoDraft
          : String(this.memoDraft ?? "");
      this.userList.updateUser(this.userId, { memo: nextMemo });
    },
    cancel() {
      this.memoDraft = this.currentMemo;
      this.isEditing = false;
    },
    blurInput() {
      const input = (this as any).$refs.memoInput as
        | HTMLInputElement
        | undefined;
      input?.blur();
    },
  }));
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

  const container = document.createElement("div");
  container.id = "bili-memo-container";
  container.innerHTML = finalHtml;
  document.body.appendChild(container);
}
