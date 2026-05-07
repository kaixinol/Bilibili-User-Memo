import Alpine from "alpinejs";
import type { BiliUser } from "@/core/types";
import type { PanelPrefsStore } from "./panel-prefs";
import type { UserListStore } from "./user-list-store";
import { confirmDialog, promptText, showAlert } from "./dialogs";
import { biliFixAPIReady } from "@/utils/compatibility";
import { registerAddUserDialog } from "./add-user-dialog";
import { isNoFaceAvatar } from "@/core/dom/dom-utils";
interface DisplayModeOption {
  value: number;
  label: string;
}

interface AlpineMagicContext {
  $el?: HTMLElement;
  $nextTick?: (callback: () => void) => void;
  $refs?: Record<string, Element | undefined>;
}

const DISPLAY_MODE_OPTIONS: DisplayModeOption[] = [
  { value: 0, label: "昵称" },
  { value: 1, label: "备注(昵称)" },
  { value: 2, label: "昵称(备注)" },
  { value: 3, label: "备注" },
];

let panelBindingsRegistered = false;
let panelComponentsRegistered = false;
const processedUID = new WeakSet<Element>();
function getUserListStore(): UserListStore {
  return Alpine.store("userList") as UserListStore;
}

function getPanelPrefsStore(): PanelPrefsStore {
  return Alpine.store("panelPrefs") as PanelPrefsStore;
}

function runOnNextTick(context: object, callback: () => void) {
  (context as AlpineMagicContext).$nextTick?.(callback);
}

function getRef<T extends Element>(context: object, key: string): T | undefined {
  return (context as AlpineMagicContext).$refs?.[key] as T | undefined;
}

function getCurrentElement(context: object): HTMLElement | undefined {
  return (context as AlpineMagicContext).$el;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
    ":disabled":
      "userList.isRefreshing || (userList.isMultiSelect && userList.selectedIds.length === 0)",
    ":class":
      "{ 'panel-btn': true, 'btn-disabled': userList.isRefreshing || (userList.isMultiSelect && userList.selectedIds.length === 0) }",
    ":title":
      "userList.isRefreshing ? '正在同步 Bilibili 最新数据...' : (userList.isMultiSelect ? (userList.selectedIds.length === 0 ? '请选择要刷新的用户' : '刷新所选用户数据') : '刷新UP主名字和头像')",
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

export function registerPanelComponents() {
  if (panelComponentsRegistered) return;
  panelComponentsRegistered = true;
  registerPanelBindings();
  registerAddUserDialog();

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

  Alpine.data("panelToggleBtn", () => ({
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

  Alpine.data("panelSettings", () => ({
    displayModes: DISPLAY_MODE_OPTIONS,
    get userList(): UserListStore {
      return getUserListStore();
    },
    get prefs(): PanelPrefsStore {
      return getPanelPrefsStore();
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
    syncAdvancedCssDialog() {
      const dialog = getRef<HTMLDialogElement>(this, "memoCssDialog");
      if (!dialog) return;

      if (this.showAdvancedCss && !dialog.open) {
        dialog.showModal();
        runOnNextTick(this, () => {
          getRef<HTMLTextAreaElement>(this, "memoCssInput")?.focus();
        });
        return;
      }

      if (!this.showAdvancedCss && dialog.open) {
        dialog.close();
      }
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
      return getUserListStore();
    },
    get fuzzySearchEnabled(): boolean {
      return this.userList.fuzzySearchEnabled;
    },
    clearSearch() {
      this.userList.searchQuery = "";
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

  Alpine.data("userCard", (userId: string) => ({
    userId,
    get userList(): UserListStore {
      return getUserListStore();
    },
    get currentUser(): BiliUser | undefined {
      return this.userList.getUserById(this.userId);
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
      if (!target || target.closest(".user-select")) return;

      event.preventDefault();
      this.toggleSelected();
    },
    confirmRemove() {
      if (confirmDialog("确定要删除吗？")) {
        this.userList.removeUser(this.userId);
      }
    },
  }));

  Alpine.data("copyableUid", (uid: string) => ({
    uid,
    copied: false,
    get isMultiSelect(): boolean {
      return getUserListStore().isMultiSelect;
    },
    init() {
      this.refreshOverflow();
    },
    refreshOverflow() {
      runOnNextTick(this, () => {
        const element = getCurrentElement(this);
        if (!element) return;
        element.classList.toggle("can-expand", element.scrollWidth > element.clientWidth);
      });
    },
    handleMouseEnter() {
      this.refreshOverflow();
    },
    handleMouseLeave() {
      getCurrentElement(this)?.classList.remove("can-expand");
    },
    copy() {
      if (this.isMultiSelect) return;
      void navigator.clipboard.writeText(`UID:${this.uid}`);
      this.copied = true;
      window.setTimeout(() => {
        this.copied = false;
      }, 500);
      this.refreshOverflow();
    },
    get displayText(): string {
      return this.copied ? "✅ 已复制" : this.uid;
    },
  }));

  Alpine.data("avatarEditor", (userId: string) => ({
    userId,
    get userList(): UserListStore {
      return getUserListStore();
    },
    get currentUser(): BiliUser | undefined {
      return this.userList.getUserById(this.userId);
    },
    get currentAvatar(): string {
      return this.currentUser?.avatar || "";
    },
    get canEditAvatar(): boolean {
      return isNoFaceAvatar(this.currentAvatar);
    },
    get avatarTitle(): string {
      if (this.canEditAvatar) return "右键修改头像";
      return this.currentUser?.nickname || this.userId;
    },
    editAvatar() {
      if (this.userList.isMultiSelect || !this.canEditAvatar) return;

      const nextAvatar = promptText("请输入头像 URL");
      if (!nextAvatar) return;

      if (!isValidHttpUrl(nextAvatar)) {
        showAlert("请输入有效的 http(s) 头像 URL");
        return;
      }

      this.userList.updateUser(this.userId, { avatar: nextAvatar });
    },
  }));

  Alpine.data("memoEditor", (userId: string, initialMemo = "") => ({
    userId,
    isEditing: false,
    memoDraft: String(initialMemo ?? ""),
    get userList(): UserListStore {
      return getUserListStore();
    },
    get isMultiSelect(): boolean {
      return this.userList.isMultiSelect;
    },
    get currentMemo(): string {
      return this.userList.getUserById(this.userId)?.memo || "";
    },
    syncDraft() {
      if (!this.isEditing) {
        this.memoDraft = this.currentMemo;
      }
    },
    startEdit() {
      if (this.isMultiSelect) return;
      this.isEditing = true;
      runOnNextTick(this, () => {
        getRef<HTMLInputElement>(this, "memoInput")?.focus();
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
      getRef<HTMLInputElement>(this, "memoInput")?.blur();
    },
    handleInput(input: HTMLInputElement) {
      if (input.value.length >= input.maxLength) {
        input.setCustomValidity("已达到最大长度：24 字符");
        input.reportValidity();
      } else {
        input.setCustomValidity("");
      }
    }
  }));

  Alpine.data("uidFixLink", (uid: string, isDeleted?: boolean) => ({
    uid,
    isDeleted,
    async init() {
      const el = this.$el;

      if (processedUID.has(el)) return;
      processedUID.add(el);

      const api = await biliFixAPIReady();

      if (!api || !this.isDeleted === true) return;

      api.annotateElements([el]);
    },
  }));
}
