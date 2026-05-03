import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";
import { browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';
import { fileURLToPath, URL } from "node:url";
export default defineConfig(({ mode }) => {
  const isDebug = mode === "debug";

  return {
    plugins: [{
      name: 'minify-html-raw',
      transform(code, id) {
        // 1. 精准命中 ?raw 导入的 HTML 文件
        if (id.endsWith('.html?raw') || id.endsWith('.html')) {
          const minified = code
            .replace(/\\n/g, '')             // 匹配 JS 字符串里的 \n 字符
            .replace(/\\r/g, '')             // 匹配 \r
            .replace(/>\s{1,}</g, '><')      // 删除标签间的空格
            .replace(/\s{2,}/g, ' ');        // 将连续空格合并为一个

          return {
            code: minified,
            map: null
          };
        }

        // 2. 关键补丁：如果不匹配，必须返回 null，让 Vite 继续处理其他文件
        return null;
      }
    },
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
            "GM.xmlHttpRequest",
            "GM_addValueChangeListener",
            "unsafeWindow",
            "GM_registerMenuCommand",
          ],
          connect: ["api.bilibili.com"],
          "run-at": "document-body",
          supportURL: "https://github.com/kaixinol/Bilibili-User-Memo/issues",
          contributionURL: "https://s2.loli.net/2025/08/04/1hjKA5qwXHS8Glu.webp",
          contributionAmount: "10￥",
        },
        build: {
          metaFileName: true, // Generate .meta.js for efficient update checks
          externalGlobals: {
            alpinejs: cdn.jsdelivr("Alpine", "dist/cdn.min.js"),
            "opencc-js": cdn.jsdelivr("OpenCC", "dist/umd/full.js"),
            "query-selector-shadow-dom": cdn.jsdelivr(
              "querySelectorShadowDom",
              "dist/querySelectorShadowDom.js",
            ),
          },
        },
        server: {
          mountGmApi: true,
        },
      }),
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
      __IS_DEBUG__: JSON.stringify(isDebug),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
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

      cssMinify: isDebug ? false : "lightningcss",
      cssCodeSplit: false,
    },
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: browserslistToTargets(browserslist()),
        drafts: {
          customMedia: true
        },
        minify: true,
        nonStandardKeepWhitespace: false,
        cssModules: false,
        unusedSymbols: [],
      }
    }
  };
});
const targets = browserslistToTargets(browserslist());
console.log('LightningCSS Targets:', targets);
