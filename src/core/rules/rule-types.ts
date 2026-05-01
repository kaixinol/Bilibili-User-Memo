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
  trigger?: { watch: string; interval: number;};
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

// 修正：StaticPageRule 的 trigger 必须是 undefined[cite: 2]
export type StaticPageRule = RawRule & { trigger?: never };
export type DynamicPageRule = RawRule & { trigger: NonNullable<RawRule["trigger"]> };
export type PollingPageRule = DynamicPageRule & { ignoreProcessed: true };

// 类型守卫：显式使用 rule.trigger 判断[cite: 2]
export const isDynamicRule = (rule: RawRule): rule is DynamicPageRule => !!rule.trigger;
export const isStaticRule = (rule: RawRule): rule is StaticPageRule => rule.trigger === undefined;
export const isPollingRule = (rule: RawRule): rule is PollingPageRule => isDynamicRule(rule) && rule.ignoreProcessed === true;

/** 隐式推导：绝不返回 undefined */
export const getInjectionMode = (rule: RawRule): InjectionMode => {
  if (isPollingRule(rule)) return InjectionMode.Polling;
  if (isDynamicRule(rule)) return InjectionMode.Dynamic;
  return InjectionMode.Static;
};

// 语义一致性别名
export type PageRule = RawRule;
export type RuleConfigEntry = RawConfig;
export type DynamicTriggerConfig = NonNullable<RawRule["trigger"]>;
export type PollingTriggerConfig = DynamicTriggerConfig & { ignoreProcessed: true };