// ==UserScript==
// @name         Bilibili 变量与生命周期分析器
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  对比 B 站全局变量与 DOM 节点的加载脉络
// @author       Gemini
// @match        *://*.bilibili.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const startTime = performance.now();
    const trackedKeys = new Set();

    const getTs = () => `[${(performance.now() - startTime).toFixed(2)}ms]`;

    // 统一的日志打印函数
    function logEvent(label, detail, color = "#999", isGroup = true) {
        const msg = `%c${getTs()} ${label}: ${detail}`;
        const style = `color: ${color}; font-weight: bold; border-left: 3px solid ${color}; padding-left: 5px;`;
        if (isGroup) {
            console.groupCollapsed(msg, style);
            console.trace("Stack Trace:");
            console.groupEnd();
        } else {
            console.log(msg, style);
        }
    }

    // 监控变量逻辑
    function watch(key) {
        if (trackedKeys.has(key)) return;
        trackedKeys.add(key);

        let val = win[key];
        if (val !== undefined) {
            logEvent("📜 初始存量", key, "#9b59b6");
        }

        try {
            Object.defineProperty(win, key, {
                configurable: true,
                enumerable: true,
                get: () => val,
                set: (newVal) => {
                    val = newVal;
                    logEvent("🔔 发现/赋值", key, "#00a1d6");
                }
            });
        } catch (e) {}
    }

    const scan = () => {
        Object.getOwnPropertyNames(win).forEach(key => {
            if (key.startsWith('__') && !trackedKeys.has(key)) watch(key);
        });
    };

    // --- 生命周期监听 ---

    // 1. Document Start (脚本执行瞬间)
    logEvent("🚀 START", "脚本开始注入 (document-start)", "#e74c3c", false);

    // 2. 轮询检查
    const i = setInterval(scan, 2);

    // 3. Document Interactive (类似于 document-end，DOM 解析完毕但资源未加载完)
    document.onreadystatechange = () => {
        if (document.readyState === 'interactive') {
            logEvent("🚧 INTERACTIVE", "DOM 解析完成 (Document-End 阶段)", "#f39c12", false);
        }
    };

    // 4. DOM Content Loaded
    window.addEventListener('DOMContentLoaded', () => {
        logEvent("📦 DOM_READY", "DOMContentLoaded (同步 JS 执行完毕)", "#e67e22", false);
    });

    // 5. Window Loaded
    window.addEventListener('load', () => {
        clearInterval(i); // 停止高频轮询
        logEvent("🏁 LOAD_COMPLETE", "Window Loaded (所有资源就绪)", "#2ecc71", false);
    });

    // 初始扫描
    scan();
})();