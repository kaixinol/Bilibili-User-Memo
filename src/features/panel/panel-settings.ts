import Alpine from "alpinejs";
import type { PanelPrefsStore } from "./panel-prefs";
import type { UserListStore } from "./user-list-store";
import {
  DISPLAY_MODE_OPTIONS,
  getUserListStore,
  getPanelPrefsStore,
} from "./panel-core";

export function registerPanelSettings() {
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
      const dialog = this.$refs.memoCssDialog as HTMLDialogElement | undefined;
      if (!dialog) return;

      if (this.showAdvancedCss && !dialog.open) {
        dialog.showModal();
        this.$nextTick(() => {
          (this.$refs.memoCssInput as HTMLTextAreaElement | undefined)?.focus();
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
    saveMemoCss() {
      this.prefs.saveMemoCss();
    },
  }));
}
