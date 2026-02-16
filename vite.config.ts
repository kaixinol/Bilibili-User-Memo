import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import monkey, { cdn } from "vite-plugin-monkey";
export default defineConfig(({ mode }) => {
  const isDebug = mode === "debug";

  return {
    plugins: [
      monkey({
        entry: "src/main.ts",
        userscript: {
          name: isDebug ? "【调试】B站一键备注 Rev" : "B站一键备注 Rev",
          namespace: "https://github.com/kaixinol/",
          website: "https://github.com/kaixinol/Bilibili-User-Memo",
          icon: "https://www.bilibili.com/favicon.ico",
          match: ["https://*.bilibili.com/*"],
          exclude: ["https://*.hdslb.com/*"],
          noframes: true,
          grant: [
            "GM_setValue",
            "GM_getValue",
            "GM_xmlhttpRequest",
            "GM_addValueChangeListener",
            "unsafeWindow",
          ],
          connect: ["api.bilibili.com"],
          "run-at": "document-body",
        },
        build: {
          externalGlobals: {
            alpinejs: cdn.jsdelivr("Alpine", "dist/cdn.min.js"),
            "query-selector-shadow-dom": cdn.jsdelivr(
              "querySelectorShadowDom",
              "dist/querySelectorShadowDom.js",
            ),
            valibot: cdn.jsdelivr("valibot", "dist/index.min.mjs"),
          },
        },
        server: { mountGmApi: true }, // 修复production莫名其妙没有gm api的问题
      }),
      visualizer({ filename: "stats.html" }),
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
      __IS_DEBUG__: JSON.stringify(isDebug),
    },
    build: {
      minify: isDebug ? false : "terser",

      rollupOptions: {
        treeshake: "recommended",
        output: {
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },

      terserOptions: isDebug
        ? {
            compress: false,
            mangle: false,
            format: {
              beautify: true,
              comments: "all",
            },
          }
        : {
            compress: {
              // 基础清理
              unused: true,
              dead_code: true,
              drop_debugger: true,
              passes: 2,

              // 安全结构优化
              hoist_funs: true, // 函数提升
              hoist_vars: false, // 避免影响可读性
              collapse_vars: true,
              reduce_vars: true,
              evaluate: true,
              booleans: true,
              conditionals: true,
              sequences: false, // ❗ 保持语句可读
              inline: 1, // 仅简单内联
            },

            mangle: false, // GF 友好：保留变量名

            format: {
              beautify: false,
              comments: /^\s*(@|==UserScript==|==\/UserScript==)/,
            },
          },

      cssMinify: !isDebug,
    },
  };
});
