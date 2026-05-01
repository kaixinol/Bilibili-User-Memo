import { logger } from "./logger";

export type BiliFixAPI = {
    annotateElements(elements: Iterable<HTMLElement>): void;
};

export const biliFixAPIReady = (() => {
    // 这里的两个 null 含义不同：
    // 外层 null 代表：还没人调用过这个函数，任务没开始。
    // 内层 null 代表：任务执行了，但没拿到结果（比如超时）。
    let p: Promise<BiliFixAPI | null> | null = null;

    return (): Promise<BiliFixAPI | null> => {
        if (!p) {
            p = new Promise((resolve) => {
                const timer = setTimeout(() => {
                    logger.warn("biliFix:request-api: timeout, permanent failure set.");
                    resolve(null);
                }, 200);

                window.dispatchEvent(
                    new CustomEvent("biliFix:request-api", {
                        detail: (api: BiliFixAPI) => {
                            clearTimeout(timer); if (api && "annotateElements" in api) {
                                logger.info("biliFix:request-api: get BiliFixAPI successfully", api);
                                resolve(api);
                            } else {
                                logger.warn("biliFix:request-api: get BiliFixAPI failed, not compatible api:", api, "required:", "annotateElements");

                                resolve(null);
                            }
                        },
                    }),
                );
            });
        }
        return p;
    };
})();