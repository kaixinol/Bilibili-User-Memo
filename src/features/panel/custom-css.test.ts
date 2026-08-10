import { describe, expect, it } from "vitest";
import type { MemoCssProbe } from "./custom-css";
import { countTopLevelRuleStarts, validateMemoCss } from "./custom-css";

const SENTINEL_RULE = "#__biliMemoCssProbeSentinel__ {}";

function createProbe(ruleCssTexts: string[]): MemoCssProbe {
  return {
    replaceSync() {},
    cssRules: ruleCssTexts.map((cssText) => ({ cssText })),
  };
}

describe("countTopLevelRuleStarts", () => {
  it("counts zero for empty or whitespace-only css", () => {
    expect(countTopLevelRuleStarts("")).toBe(0);
    expect(countTopLevelRuleStarts("   \n  ")).toBe(0);
  });

  it("counts each top-level rule", () => {
    expect(countTopLevelRuleStarts(".a { color: red }")).toBe(1);
    expect(countTopLevelRuleStarts(".a { color: red } .b { color: blue }")).toBe(
      2,
    );
  });

  it("ignores braces inside strings", () => {
    expect(countTopLevelRuleStarts('.a { content: "{" }')).toBe(1);
    expect(countTopLevelRuleStarts(".a { content: '}' }")).toBe(1);
  });

  it("ignores braces inside comments", () => {
    expect(
      countTopLevelRuleStarts("/* { .a } */ .b { color: red } /* } */"),
    ).toBe(1);
  });

  it("counts a nested @media block as one top-level rule", () => {
    expect(
      countTopLevelRuleStarts("@media (min-width: 100px) { .a { color: red } }"),
    ).toBe(1);
  });

  it("counts a nested rule as one top-level rule", () => {
    expect(countTopLevelRuleStarts(".a { .b { color: red } }")).toBe(1);
  });

  it("counts an unclosed rule as one", () => {
    expect(countTopLevelRuleStarts(".a { color: red")).toBe(1);
  });

  it("handles a stray closing brace", () => {
    expect(countTopLevelRuleStarts("} .a { color: red }")).toBe(1);
  });
});

describe("validateMemoCss", () => {
  it("returns no status for empty css", () => {
    const probe = createProbe([]);
    expect(validateMemoCss("   ", probe)).toBe("");
  });

  it("returns no status for valid css", () => {
    const probe = createProbe([".bili-memo-tag { color: red }", SENTINEL_RULE]);
    expect(validateMemoCss(".bili-memo-tag { color: red }", probe)).toBe("");
  });

  it("detects an unclosed brace that swallows the sentinel", () => {
    const probe = createProbe([
      ".bili-memo-tag { color: red; #__biliMemoCssProbeSentinel__ }",
    ]);
    const status = validateMemoCss(".bili-memo-tag { color: red", probe);
    expect(status).toContain("未正确闭合");
  });

  it("reports rules dropped by the browser", () => {
    const css = ".bili-memo-tag { color: red }\n..bad, { color: blue }";
    const probe = createProbe([".bili-memo-tag { color: red }", SENTINEL_RULE]);
    const status = validateMemoCss(css, probe);
    expect(status).toContain("1 条规则未被浏览器解析");
  });

  it("reports the dropped rule count", () => {
    const css = ".a { color: red }\n..bad { color: blue }\n[ { color: green }";
    const probe = createProbe([".a { color: red }", SENTINEL_RULE]);
    const status = validateMemoCss(css, probe);
    expect(status).toContain("2 条规则未被浏览器解析");
  });

  it("reports when no user rule survives", () => {
    const probe = createProbe([SENTINEL_RULE]);
    const status = validateMemoCss("..bad { color: red }", probe);
    expect(status).toContain("未解析出任何规则");
  });
});
