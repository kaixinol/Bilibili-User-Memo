import { getGmValue, setGmValue } from "../../utils/gm-storage";

const DISABLED_PAGE_SCOPES_KEY = "disabledPageScopes";

function wildcardToRegExp(pattern: string): RegExp {
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${base}(?:/.*)?$`);
  }

  const escaped = pattern
    .split("*")
    .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

function normalizeTargetUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname}`;
}

function loadDisabledPageScopes(): string[] {
  const raw = getGmValue<unknown>(DISABLED_PAGE_SCOPES_KEY, []);
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const patterns: string[] = [];

  raw.forEach((entry) => {
    if (typeof entry !== "string") return;
    const pattern = entry.trim();
    if (!pattern || seen.has(pattern)) return;
    seen.add(pattern);
    patterns.push(pattern);
  });

  return patterns;
}

function saveDisabledPageScopes(patterns: string[]) {
  setGmValue(DISABLED_PAGE_SCOPES_KEY, patterns);
}

export function getCurrentPageScopePattern(rawUrl = window.location.href): string {
  const url = new URL(rawUrl);
  const firstPathSegment = url.pathname.split("/").filter(Boolean)[0];

  if (!firstPathSegment) {
    return `${url.origin}/*`;
  }
  return `${url.origin}/${firstPathSegment}/*`;
}

export function isCurrentPageDisabled(rawUrl = window.location.href): boolean {
  const target = normalizeTargetUrl(rawUrl);
  const patterns = loadDisabledPageScopes();
  return patterns.some((pattern) => wildcardToRegExp(pattern).test(target));
}

export function disablePageScope(scopePattern: string): void {
  const patterns = loadDisabledPageScopes();
  if (patterns.includes(scopePattern)) return;
  patterns.push(scopePattern);
  saveDisabledPageScopes(patterns);
}

export function enablePageScope(scopePattern: string): void {
  const patterns = loadDisabledPageScopes();
  const next = patterns.filter((pattern) => pattern !== scopePattern);
  if (next.length === patterns.length) return;
  saveDisabledPageScopes(next);
}
