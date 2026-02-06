// src/vite-env.d.ts

/// <reference types="vite/client" />

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

declare global {
  // 全局常量（来自打包替换或 define）
  const __IS_DEBUG__: boolean;
  interface Window {
    Alpine: typeof Alpine;
  }
}

export {};
