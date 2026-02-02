declare module 'query-selector-shadow-dom' {
    /**
     * 穿透 Shadow DOM 尋找單一元素
     */
    export function querySelectorDeep(
        selector: string,
        root?: HTMLElement | Document | ShadowRoot,
        allElements?: HTMLElement[] | null
    ): HTMLElement | null;

    /**
     * 穿透 Shadow DOM 尋找所有符合的元素
     */
    export function querySelectorAllDeep(
        selector: string,
        root?: HTMLElement | Document | ShadowRoot,
        allElements?: HTMLElement[] | null
    ): HTMLElement[];
}