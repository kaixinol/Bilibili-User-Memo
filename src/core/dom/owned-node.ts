const BILI_MEMO_OWNED_ATTR = "data-bilimemo-owned";

export function markOwnedElement<T extends HTMLElement>(element: T): T {
  element.setAttribute(BILI_MEMO_OWNED_ATTR, "true");
  return element;
}
