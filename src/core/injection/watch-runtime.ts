import {
  querySelectorAllDeep,
  querySelectorDeep,
} from "query-selector-shadow-dom";
import {
  hasExternalAddedNodes,
  hasExternalRemovedNodes,
} from "../dom/owned-node";
import type { ScanScope } from "./scan-scope";

export type DiscoveryScope = Document | ShadowRoot;

export function resolveWatchScope(target: HTMLElement): ScanScope {
  return target.shadowRoot || target;
}

export function isNodeInsideScope(node: Node, scope: ScanScope): boolean {
  if (scope === document) {
    return node.isConnected;
  }

  let current: Node | null = node;
  while (current) {
    if (current === scope) return true;

    if (current instanceof ShadowRoot) {
      current = current.host;
      continue;
    }

    current = current.parentNode;
  }

  return false;
}

export function getWatchTarget(selector: string): HTMLElement | null {
  return querySelectorDeep(selector);
}

export function getWatchTargets(selector: string): HTMLElement[] {
  return querySelectorAllDeep(selector);
}

export function shouldHandleDiscoveryMutations(mutations: MutationRecord[]): {
  hasAddedNodes: boolean;
  hasRemovedNodes: boolean;
} {
  return {
    hasAddedNodes: hasExternalAddedNodes(mutations),
    hasRemovedNodes: hasExternalRemovedNodes(mutations),
  };
}
