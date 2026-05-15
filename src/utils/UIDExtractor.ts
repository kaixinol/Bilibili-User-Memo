export function getUidFromVueInstance(el: HTMLElement): string | null {
  return String(el.__vue__?.author.mid ?? null);

}
export function getOpusAuthorUid(el: HTMLElement): unknown {
  return window.__INITIAL_STATE__?.detail?.basic?.uid
    || window.__INITIAL_STATE__?.detail?.modules?.find((m) => m.module_author)?.module_author?.mid || (el as any).$log.click.value.mid;
}