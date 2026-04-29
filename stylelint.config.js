// stylelint.config.js
export default {
  extends: ["stylelint-config-standard"],
  plugins: ["stylelint-no-unsupported-browser-features"],
  rules: {
    // 允许现代伪类
    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: [
          "global",
          "local",
          "deep",
          "slotted",
          "host",
          "host-context",
        ],
      },
    ],

    // 允许现代伪元素
    "selector-pseudo-element-no-unknown": [
      true,
      {
        ignorePseudoElements: ["v-deep"],
      },
    ],

    // 允许一些新特性
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "tailwind",
          "apply",
          "layer",
          "variants",
          "responsive",
          "screen",
        ],
      },
    ],

    "property-no-unknown": [
      true,
      {
        ignoreProperties: ["composes"],
      },
    ],

    "selector-pseudo-class-disallowed-list": ["host-context"],

    "plugin/no-unsupported-browser-features": [
      true,
      {
        ignore: ["css-nesting", "intrinsic-width", "extended-system-fonts"],
      },
    ],

    "selector-no-vendor-prefix": true,
    "property-no-vendor-prefix": true,
    "value-no-vendor-prefix": true,
    "property-no-deprecated": true,
    "at-rule-no-deprecated": true,

    // 不强制空行位置
    "declaration-empty-line-before": null,
    "rule-empty-line-before": null,
    "no-descending-specificity": null,
    "declaration-block-no-shorthand-property-overrides": null,
  },
};
