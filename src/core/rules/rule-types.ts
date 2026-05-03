export const InjectionMode = { Static: 1, Dynamic: 2, Polling: 3 } as const;
export type InjectionMode = typeof InjectionMode[keyof typeof InjectionMode];

export const StyleScope = { Minimal: 1, Editable: 2 } as const;
export type StyleScope = typeof StyleScope[keyof typeof StyleScope];

export class RawRule {
  constructor(init: Partial<PageRule>) {
    Object.assign(this, init);
  }

  name!: string;
  styleScope!: StyleScope;
  aSelector?: string;
  textSelector?: string;
  trigger?: { watch: string; interval: number };
  ignoreProcessed?: boolean;
  matchByName?: boolean;
  dynamicWatch?: boolean;
  get injectMode(): InjectionMode {
    if (!this.trigger) return InjectionMode.Static;
    return this.ignoreProcessed ? InjectionMode.Polling : InjectionMode.Dynamic;
  }
}

export interface RawConfig {
  urlPattern: RegExp;
  rule: RawRule;
}

export type UidResolverFn = (el: HTMLElement, rule: RawRule) => string | null;

export type StaticPageRule = RawRule & { trigger?: never };
export type DynamicPageRule = RawRule & { trigger: NonNullable<RawRule["trigger"]>; uidResolver?: UidResolverFn };
export type PollingPageRule = DynamicPageRule & { ignoreProcessed: true };

export type PageRule = RawRule;
export type RuleConfigEntry = RawConfig;
export type DynamicTriggerConfig = NonNullable<RawRule["trigger"]>;
export type PollingTriggerConfig = DynamicTriggerConfig & { ignoreProcessed: true };

export const isStaticMode = (rule: RawRule): rule is StaticPageRule => rule.injectMode === InjectionMode.Static;
export const isDynamicMode = (rule: RawRule): rule is DynamicPageRule => rule.injectMode === InjectionMode.Dynamic;
export const isPollingMode = (rule: RawRule): rule is PollingPageRule => rule.injectMode === InjectionMode.Polling;
