export function getUidFromVueInstance(el: HTMLElement): string | null {
    return String(el.__vue__?.$data.user?.mid // https://t.bilibili.com/*
        ?? el.__vue__?.$data.mid // https://t.bilibili.com/
        ?? null);

}