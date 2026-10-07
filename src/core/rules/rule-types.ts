export const StyleScope = { Minimal: 1, Editable: 2 } as const;
export type StyleScope = typeof StyleScope[keyof typeof StyleScope];

export const DYNAMIC_SCAN_INTERVAL_MS = 750;

export type RawRule = {
  name: string;
  styleScope: StyleScope;
  container?: string | string[];
  uidResolver?: UidResolverFn;
  originalNameResolver?: OriginalNameResolverFn;
  // 只取直接子文本节点作名称，避免 textContent 吞掉同级 SVG/span 的文本
  directText?: boolean;
} & (
  | { aSelector: string; textSelector?: string; matchByName?: false }
  | { textSelector: string; aSelector?: string; matchByName?: false }
  | { textSelector: string; aSelector?: string; matchByName: true }
);

export interface RawConfig {
  urlPattern: RegExp;
  rule: RawRule;
}

type UidResolverFn = (el: HTMLElement) => string | null | Promise<string | null>;
type OriginalNameResolverFn = (el: HTMLElement) => string | null;

export type PageRule = RawRule;
export type RuleConfigEntry = RawConfig;
