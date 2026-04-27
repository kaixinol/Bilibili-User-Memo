import { logger } from "./logger";

export type BiliFixAPI = {
    annotateElements(elements: Iterable<HTMLElement>): void
};

export const biliFixAPIReady = (() => {
    let p: Promise<BiliFixAPI> | null = null;

    return () => {
        if (!p) {
            p = new Promise((resolve) => {
                window.dispatchEvent(
                    new CustomEvent("biliFix:request-api", {
                        detail: (api: BiliFixAPI) => {
                            logger.info("biliFix:request-api: get BiliFixAPI instance successfully ", api);
                            resolve(api);
                        },
                    }),
                );
            });
        }
        return p;
    };
})();