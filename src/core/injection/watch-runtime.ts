import { querySelectorAllDeep, querySelectorDeep } from "@/utils/query-dom";
import { hasExternalAddedNodes } from "../dom/owned-node";
import type { ScanScope } from "./scan-scope";

export function resolveWatchScope(target: HTMLElement): ScanScope {
  return target.shadowRoot || target;
}

export function getWatchTarget(selector: string): HTMLElement | null {
  return querySelectorDeep(selector, document);
}

export function getWatchTargets(selector: string): HTMLElement[] {
  return querySelectorAllDeep(selector, document);
}

export function shouldHandleDiscoveryMutations(mutations: MutationRecord[]): {
  hasAddedNodes: boolean;
} {
  return {
    hasAddedNodes: hasExternalAddedNodes(mutations),
  };
}
