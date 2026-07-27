const BILI_MEMO_OWNED_ATTR = "data-bilimemo-owned";
const BILI_MEMO_OWNED_SELECTOR = `[${BILI_MEMO_OWNED_ATTR}]`;

function isOwnedElement(element: Element | null): boolean {
  return Boolean(element?.closest(BILI_MEMO_OWNED_SELECTOR));
}

export function markOwnedElement<T extends HTMLElement>(element: T): T {
  element.setAttribute(BILI_MEMO_OWNED_ATTR, "true");
  return element;
}

 function isOwnedNode(node: Node | null): boolean {
  if (!node) return false;
  if (node instanceof Element) return isOwnedElement(node);
  if (node instanceof ShadowRoot) return isOwnedElement(node.host);
  return isOwnedElement(node.parentElement);
}

function hasExternalAddedNodes(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) => {
    if (isOwnedNode(mutation.target)) return false;
    return Array.from(mutation.addedNodes).some((node) => !isOwnedNode(node));
  });
}

