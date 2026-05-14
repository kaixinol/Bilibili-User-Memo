export function getUidFromVueInstance(el: HTMLElement): string | null {
    return String(el.__vue__?.$data.user?.mid // https://t.bilibili.com/*
        ?? el.__vue__?.$data.mid // https://t.bilibili.com/
        ?? null);

}
export function getOpusAuthorUid(): unknown {
  return window.__INITIAL_STATE__?.detail?.basic?.uid
    || window.__INITIAL_STATE__?.detail?.modules?.find((m) => m.module_author)?.module_author?.mid;
}