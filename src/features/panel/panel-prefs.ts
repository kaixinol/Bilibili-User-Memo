import Alpine from "alpinejs";
import type { UserListStore } from "./user-list-store";
import { createPrefixedGmStorage, getGmValue } from "@/utils/gm-storage";
import { promptText, showAlert } from "./dialogs";
import {
  applyCustomFontColor,
  applyTheme,
  getResolvedCustomFontColor,
  resolveCustomCssStatus,
} from "./custom-css";
import { setCustomMemoCss } from "@/core/injection/injector";

const CUSTOM_FONT_COLOR_KEY = "customFontColor";
const CUSTOM_MEMO_CSS_KEY = "customMemoCss";
const THEME_KEY = "isDark";
const TOGGLE_OPEN_TEXT_KEY = "btn_open_text";
const TOGGLE_CLOSE_TEXT_KEY = "btn_close_text";
const PERSIST_KEY_PREFIX = "panelPrefs:";

interface PersistInterceptor<T> {
  as(key: string): PersistInterceptor<T>;
  using(storage: ReturnType<typeof createPrefixedGmStorage>): T;
}

const gmPersistStorage = createPrefixedGmStorage(PERSIST_KEY_PREFIX);

function persistWithGmStorage<T>(key: string, initialValue: T): T {
  const persistFactory = (Alpine as unknown as {
    $persist?: (value: T) => PersistInterceptor<T>;
  }).$persist;

  if (!persistFactory) return initialValue;

  return persistFactory(initialValue).as(key).using(gmPersistStorage);
}

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
}

interface PanelPrefsDeps {
  getUserListStore: () => UserListStore;
}

export function createPanelPrefsStore({
  getUserListStore,
}: PanelPrefsDeps): PanelPrefsStore {
  const initialOpenText = getGmValue<string>(TOGGLE_OPEN_TEXT_KEY, "UvU");
  const initialCloseText = getGmValue<string>(TOGGLE_CLOSE_TEXT_KEY, "UwU");
  const initialDarkTheme = getGmValue<boolean>(THEME_KEY, false);
  const initialFontColor = getGmValue<string>(CUSTOM_FONT_COLOR_KEY, "").trim();
  const initialMemoCss = getGmValue<string>(CUSTOM_MEMO_CSS_KEY, "");

  return {
    initialized: false,
    openText: persistWithGmStorage("toggle.openText", initialOpenText),
    closeText: persistWithGmStorage("toggle.closeText", initialCloseText),
    isDark: persistWithGmStorage("theme.isDark", initialDarkTheme),
    customFontColor: persistWithGmStorage("style.customFontColor", initialFontColor),
    customMemoCss: persistWithGmStorage("style.customMemoCss", initialMemoCss),
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
      this.showAdvancedCss = false;
    },

    applyMemoCss() {
      const nextCss = this.customMemoCss || "";
      const result = setCustomMemoCss(nextCss);
      this.cssStatus = resolveCustomCssStatus(nextCss, result);
    },
  };
}
