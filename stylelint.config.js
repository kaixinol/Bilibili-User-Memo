// stylelint.config.js
export default {
  extends: [
    "stylelint-config-standard",
  ],

  rules: {
    // 允许现代伪类
    "selector-pseudo-class-no-unknown": [true, {
      ignorePseudoClasses: [
        "global",
        "local",
        "deep",
        "slotted",
        "host",
        "host-context",
      ],
    }],

    // 允许现代伪元素
    "selector-pseudo-element-no-unknown": [true, {
      ignorePseudoElements: ["v-deep"],
    }],

    // 允许一些新特性
    "at-rule-no-unknown": [true, {
      ignoreAtRules: [
        "tailwind",
        "apply",
        "layer",
        "variants",
        "responsive",
        "screen",
      ],
    }],

    // 可选：放宽限制（避免烦人）
    "property-no-unknown": [true, {
      ignoreProperties: [
        "composes", // CSS Modules
      ],
    }],

    // 关闭一些过于严格的规则（更贴近实际开发）
    "declaration-empty-line-before": null,
    "rule-empty-line-before": null,
    "property-no-deprecated": true,
    "at-rule-no-deprecated": true,
    "property-no-vendor-prefix": true,
    "value-no-vendor-prefix": true,
  },
};
