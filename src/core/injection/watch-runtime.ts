import { querySelectorDeep } from "@/utils/query-dom";
import type { ScanScope } from "./scan-scope";

export function resolveWatchScope(target: HTMLElement): ScanScope {
  return target.shadowRoot || target;
}

export function getWatchTarget(selector: string): HTMLElement | null {
  return querySelectorDeep(selector, document);
}
