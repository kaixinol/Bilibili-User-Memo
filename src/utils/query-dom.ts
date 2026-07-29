import {
  querySelectorAllDeep as rawQuerySelectorAllDeep,
  querySelectorDeep as rawQuerySelectorDeep,
} from "query-selector-shadow-dom";
import { getCaller } from "./caller";
import { recordQueryDiagnostic } from "./perf-diagnostics";
import { logger } from "./logger";
import { activityMonitor } from "./activity-monitor";

export function querySelectorDeep(selector: string, root: Document | HTMLElement | ShadowRoot): HTMLElement | null {
  if (activityMonitor.isIdle()) return null;
  const rawRoot = root as Document | HTMLElement;
  if (!__IS_DEBUG__) return rawQuerySelectorDeep(selector, rawRoot);

  const startedAt = performance.now();
  const caller = getCaller();
  try {
    const element = rawQuerySelectorDeep(selector, rawRoot);
    recordQueryDiagnostic({
      kind: "one",
      selector,
      caller,
      matchCount: element ? 1 : 0,
      durationMs: performance.now() - startedAt,
      scopeType: describeRoot(root),
    });
    return element;
  } catch (error) {
    recordQueryDiagnostic({
      kind: "one",
      selector,
      caller,
      matchCount: 0,
      durationMs: performance.now() - startedAt,
      scopeType: describeRoot(root),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function querySelectorAllDeep(
  selector: string,
  root: Document | HTMLElement | ShadowRoot,
): HTMLElement[] {
  if (activityMonitor.isIdle()) return [];
  const rawRoot = root as Document | HTMLElement;
  if (!__IS_DEBUG__) return rawQuerySelectorAllDeep(selector, rawRoot);

  const startedAt = performance.now();
  const caller = getCaller();
  if (root instanceof Document){
    logger.debug( `🔍 querySelectorAllDeep: selector=${selector}, root=document, caller=${caller}`,)
  }
  try {
    const elements = rawQuerySelectorAllDeep(selector, rawRoot);
    recordQueryDiagnostic({
      kind: "all",
      selector,
      caller,
      matchCount: elements.length,
      durationMs: performance.now() - startedAt,
      scopeType: describeRoot(root),
    });
    return elements;
  } catch (error) {
    recordQueryDiagnostic({
      kind: "all",
      selector,
      caller,
      matchCount: 0,
      durationMs: performance.now() - startedAt,
      scopeType: describeRoot(root),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function describeRoot(root: Document | Element | ShadowRoot | undefined) {
  if (!root) return "document";
  if (root instanceof ShadowRoot) return "shadow";
  if (root instanceof Document) return "document";
  return root.tagName.toLowerCase();
}


