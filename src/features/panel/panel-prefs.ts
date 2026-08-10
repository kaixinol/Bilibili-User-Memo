import type { UserListStore } from "./user-list-types";
import { persistWithGmStorage } from "@/utils/gm-storage";
import { promptText, showAlert } from "./dialogs";
import {
  applyCustomFontColor,
  applyTheme,
  getResolvedCustomFontColor,
  validateMemoCss,
} from "./custom-css";
import { setCustomMemoCss } from "@/core/injection/injector";

export interface PanelPrefsStore {
  initialized: boolean;
  openText: string;
  closeText: string;
  isDark: boolean;
  customFontColor: string;
  customMemoCss: string;
  cssStatus: string;
  showAdvancedCss: boolean;
  init(): void;
  toggleTheme(): void;
  editToggleText(isOpen: boolean): void;
  onCustomColorInput(): void;
  clearCustomColor(): void;
  closeAdvancedCss(): void;
  applyMemoCss(): void;
  saveMemoCss(): void;
}

interface PanelPrefsDeps {
  getUserListStore: () => UserListStore;
}

export function createPanelPrefsStore({
  getUserListStore,
}: PanelPrefsDeps): PanelPrefsStore {
  return {
    initialized: false,
    openText: persistWithGmStorage("panelPrefs:toggle.openText", "UvU"),
    closeText: persistWithGmStorage("panelPrefs:toggle.closeText", "UwU"),
    isDark: persistWithGmStorage("panelPrefs:theme.isDark", false),
    customFontColor: persistWithGmStorage("panelPrefs:style.customFontColor", ""),
    customMemoCss: persistWithGmStorage("panelPrefs:style.customMemoCss", ""),
    cssStatus: "",
    showAdvancedCss: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      applyTheme(this.isDark);
      getUserListStore().isDark = this.isDark;
      const cssVarColor = getResolvedCustomFontColor();
      this.customFontColor = this.customFontColor || cssVarColor;
      applyCustomFontColor(this.customFontColor);
      this.applyMemoCss();
    },

    toggleTheme() {
      this.isDark = !this.isDark;
      getUserListStore().isDark = this.isDark;
      applyTheme(this.isDark);
    },

    editToggleText(isOpen: boolean) {
      const currentText = isOpen ? this.openText : this.closeText;
      const nextText = promptText("修改文字:", currentText);
      if (!nextText) return;
      if (isOpen) this.openText = nextText;
      else this.closeText = nextText;
    },

    onCustomColorInput() {
      applyCustomFontColor(this.customFontColor);
    },

    clearCustomColor() {
      this.customFontColor = "";
      applyCustomFontColor("");
      showAlert("已取消自定义字体颜色");
    },

    closeAdvancedCss() {
      if (this.showAdvancedCss) this.saveMemoCss();
      this.showAdvancedCss = false;
    },

    applyMemoCss() {
      const nextCss = this.customMemoCss || "";
      setCustomMemoCss(nextCss);
    },

    saveMemoCss() {
      const nextCss = this.customMemoCss || "";
      setCustomMemoCss(nextCss);
      this.cssStatus = validateMemoCss(nextCss);
    },
  };
}
