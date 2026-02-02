import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import monkey, { cdn, util } from "vite-plugin-monkey";
export default defineConfig(({ mode }) => {
  const isDebug = mode === "debug";

  return {
    plugins: [
      monkey({
        entry: "src/main.ts",
        userscript: {
          name: isDebug ? "【開發版】B站工具箱" : "B站用戶備註工具",
          namespace: "https://github.com/kaixinol/",
          match: ["https://*.bilibili.com/*"],
          noframes: true,
          grant: ["GM_setValue", "GM_getValue"],
        },
        build: {
          externalGlobals: {
            alpinejs: cdn.jsdelivr("Alpine", "dist/cdn.min.js"),
            "query-selector-shadow-dom": cdn.jsdelivr(
              "querySelectorShadowDom",
              "dist/querySelectorDeep.min.js",
            ),
          },
        },
        server: {
          mountGmApi: true, // 开启此选项会将 GM_api 挂载到 window，解决 Dev 模式下的报错
        },
      }),
      visualizer({ filename: "stats.html" }),
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
      __IS_DEBUG__: JSON.stringify(isDebug),
    },
    build: {
      // 1. 重要：在非 debug 模式下關閉 minify，防止變數名被壓扁
      // Vite 7 預設使用 esbuild，所以這裡必須顯式指定
      minify: isDebug ? "terser" : false,

      // 2. 強化 Tree Shaking (減枝)
      modulePreload: { polyfill: false },
      rollupOptions: {
        treeshake: {
          preset: "recommended",
          propertyReadSideEffects: false, // 允許刪除只讀取但未使用的屬性
          moduleSideEffects: false, // 標記模組無副作用，讓 Rollup 大膽刪減
        },
        output: {
          manualChunks: undefined, // 不拆分包，確保輸出一條 script
        },
      },

      // 3. Terser 配置：即便不混淆，也能用來刪除死代碼
      terserOptions: {
        compress: {
          unused: true, // 移除未使用的函數和變量
          dead_code: true, // 移除 unreachable 代碼
          drop_console: !isDebug, // 正式版移除 console.log
          passes: 2, // 執行兩次壓縮掃描，增加減枝成功率
        },
        // 政策關鍵：非 debug 模式絕對不混淆變數名 (mangle)
        mangle: isDebug,
        format: {
          beautify: !isDebug, // 正式版代碼排版整齊，方便審核
          comments: /^\s*@/, // 保留油猴元數據注釋
        },
      },

      // 4. 針對 Vite 7 的額外處理
      cssMinify: isDebug,
      reportCompressedSize: true,
    },
  };
});
