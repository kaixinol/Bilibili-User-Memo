export const InjectionMode = { Static: 1, Dynamic: 2 } as const;
export type InjectionMode = typeof InjectionMode[keyof typeof InjectionMode];

export const StyleScope = { Minimal: 1, Editable: 2 } as const;
export type StyleScope = typeof StyleScope[keyof typeof StyleScope];

export const DYNAMIC_SCAN_INTERVAL_MS = 750;

export interface RawRule {
  name: string;
  styleScope: StyleScope;
  aSelector?: string;
  textSelector?: string;
  trigger?: { watch: string; multiTarget?: boolean };
  matchByName?: boolean;
  uidResolver?: UidResolverFn;
  originalNameResolver?: OriginalNameResolverFn;
}

export const getInjectMode = (rule: RawRule): InjectionMode => {
  if (!rule.trigger) return InjectionMode.Static;
  return InjectionMode.Dynamic;
};

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

export type StaticPageRule = RawRule & { trigger?: never };
export type DynamicPageRule = RawRule & {
  trigger: NonNullable<RawRule["trigger"]>;
};
export type PageRule = StaticPageRule | DynamicPageRule;
export type RuleConfigEntry = RawConfig;
export type DynamicTriggerConfig = NonNullable<RawRule["trigger"]>;

export const isStaticMode = (rule: RawRule): rule is StaticPageRule => getInjectMode(rule) === InjectionMode.Static;
export const isDynamicMode = (rule: RawRule): rule is DynamicPageRule => getInjectMode(rule) === InjectionMode.Dynamic;
