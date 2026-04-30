import {
  querySelectorAllDeep as rawQuerySelectorAllDeep,
  querySelectorDeep as rawQuerySelectorDeep,
} from "query-selector-shadow-dom";
import { getCaller } from "./caller";
import { recordQueryDiagnostic } from "./perf-diagnostics";

export function querySelectorDeep(selector: string): HTMLElement | null {
  if (!__IS_DEBUG__) return rawQuerySelectorDeep(selector);

  const startedAt = performance.now();
  const caller = getCaller();
  try {
    const element = rawQuerySelectorDeep(selector);
    recordQueryIfUseful({
      kind: "one",
      selector,
      caller,
      matchCount: element ? 1 : 0,
      durationMs: performance.now() - startedAt,
    });
    return element;
  } catch (error) {
    recordQueryIfUseful({
      kind: "one",
      selector,
      caller,
      matchCount: 0,
      durationMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function querySelectorAllDeep(
  selector: string,
  root?: Document | Element | ShadowRoot,
): HTMLElement[] {
  const typedRoot = root as Document | HTMLElement | undefined;
  if (!__IS_DEBUG__) return rawQuerySelectorAllDeep(selector, typedRoot);

  const startedAt = performance.now();
  const caller = getCaller();
  try {
    const elements = rawQuerySelectorAllDeep(selector, typedRoot);
    recordQueryIfUseful({
      kind: "all",
      selector,
      caller,
      matchCount: elements.length,
      durationMs: performance.now() - startedAt,
      scopeType: describeRoot(root),
    });
    return elements;
  } catch (error) {
    recordQueryIfUseful({
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

function recordQueryIfUseful(input: Parameters<typeof recordQueryDiagnostic>[0]) {
  if (input.caller?.includes("/features/debugger/debugger.ts")) return;
  recordQueryDiagnostic(input);
}
