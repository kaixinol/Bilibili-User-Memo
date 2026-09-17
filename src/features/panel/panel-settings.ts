import Alpine from "alpinejs";
import {
  DISPLAY_MODE_OPTIONS,
  getUserListStore,
  getPanelPrefsStore,
} from "./panel-core";

export function registerPanelSettings() {
  Alpine.data("panelSettings", () => ({
    displayModes: DISPLAY_MODE_OPTIONS,
    get displayModeProxy(): number {
      return getUserListStore().displayMode;
    },
    set displayModeProxy(mode: number) {
      getUserListStore().setDisplayMode(Number(mode));
    },
    get customFontColor(): string {
      return getPanelPrefsStore().customFontColor;
    },
    set customFontColor(next: string) {
      getPanelPrefsStore().customFontColor = next;
    },
    get customMemoCss(): string {
      return getPanelPrefsStore().customMemoCss;
    },
    set customMemoCss(next: string) {
      getPanelPrefsStore().customMemoCss = next;
    },
    get cssStatus(): string {
      return getPanelPrefsStore().cssStatus;
    },
    get showAdvancedCss(): boolean {
      return getPanelPrefsStore().showAdvancedCss;
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
      getPanelPrefsStore().toggleTheme();
    },
    onCustomColorInput() {
      getPanelPrefsStore().onCustomColorInput();
    },
    closeAdvancedCss() {
      getPanelPrefsStore().closeAdvancedCss();
    },
    handleColorSettingContextMenu(event: MouseEvent) {
      event.preventDefault();
      getPanelPrefsStore().showAdvancedCss = !getPanelPrefsStore().showAdvancedCss;
    },
    handleColorSettingMouseDown(event: MouseEvent) {
      if (event.button !== 1) return;
      event.preventDefault();
      getPanelPrefsStore().clearCustomColor();
    },
    applyMemoCss() {
      getPanelPrefsStore().applyMemoCss();
    },
    saveMemoCss() {
      getPanelPrefsStore().saveMemoCss();
    },
  }));
}
