export const StyleScope = { Minimal: 1, Editable: 2 } as const;
export type StyleScope = typeof StyleScope[keyof typeof StyleScope];

export const DYNAMIC_SCAN_INTERVAL_MS = 750;

export interface RawRule {
  name: string;
  styleScope: StyleScope;
  aSelector?: string;
  textSelector?: string;
  container?: string;
  matchByName?: boolean;
  uidResolver?: UidResolverFn;
  originalNameResolver?: OriginalNameResolverFn;
}

export interface RawConfig {
  urlPattern: RegExp;
  rule: RawRule;
}

type UidResolverFn = (
  el: HTMLElement,
  rule: RawRule,
) => string | null | Promise<string | null>;
type OriginalNameResolverFn = (
  el: HTMLElement,
  rule: RawRule,
) => string | null;

export type PageRule = RawRule;
export type RuleConfigEntry = RawConfig;
