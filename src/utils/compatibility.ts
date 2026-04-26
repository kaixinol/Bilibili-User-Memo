export type BiliFixAPI = {
    uidToShortId(uid: string): string;
};

export const biliFixAPIReady = (() => {
    let p: Promise<BiliFixAPI> | null = null;
    return () => {
        if (!p) {
            p = new Promise((resolve) => {
                window.dispatchEvent(
                    new CustomEvent("biliFix:request-api", {
                        detail: resolve,
                    }),
                );
            });
        }
        return p;
    };
})();