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
          grant: ["GM_setValue", "GM_getValue", "GM_xmlhttpRequest"],
          connect: ["api.bilibili.com"],
          "run-at": "document-start",
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
        server: { mountGmApi: isDebug ? true : false },
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

      terserOptions: {
        compress: {
          unused: true,
          dead_code: true,
          drop_console: !isDebug,
          passes: 2,
        },
        mangle: false,
        format: {
          beautify: !isDebug,
          comments: /^\s*(@|==UserScript==|==\/UserScript==)/,
        },
      },
      cssMinify: true,
    },
  };
});
