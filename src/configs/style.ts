interface GlobalStyleConfig {
  /** * 別名的全局文本顏色
   * 支援 Hex, RGB, 或 CSS 顏色名稱 (例如: "#ff6699", "red")
   */
  theme: "light" | "night";
  /** * 用戶自定義的高級 CSS 樣式
   * 用於處理更複雜的視覺需求，例如字體、陰影或動畫
   * 範例: ".custom-alias { font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.1); }"
   */
  customCss?: string;
}

/**
 * 實例化全局默认樣式配置
 */
export const defaultSetting: GlobalStyleConfig = {
  theme: "light",
  // 提供一個預留位置供用戶編寫複雜樣式
  customCss: undefined,
};
