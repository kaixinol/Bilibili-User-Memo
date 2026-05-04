// src/vite-env.d.ts

/// <reference types="vite/client" />
/// <reference types="vite-plugin-monkey/client" />
/// <reference types="vite-plugin-monkey/global" />
declare module "*.html?raw" {
  const content: string;
  export default content;
}
declare module "*.css?inline" {
  const content: string;
  export default content;
}
// 引入类型（使用 type-only import 避免运行时副作用）
import type Alpine from "alpinejs";


type InitialState = {
  detail?: {
    basic?: { uid?: unknown };
    modules?: Array<{ module_author?: { mid?: unknown } }>;
  };
};
declare global {
  // 全局常量（来自打包替换或 define）
  const __IS_DEBUG__: boolean;
  interface Window {
    Alpine: typeof Alpine;
    __INITIAL_STATE__?: InitialState;
  }
  interface WindowEventMap {
    "biliFix:request-api": CustomEvent<(api: BiliFixAPI) => void>;
  }
  interface VueInstance {
    $data: Record<string, any>;
    $props: Record<string, any>;
    [key: string]: any;
  }

  interface HTMLElement {
    __vue__?: VueInstance;
  }

}
