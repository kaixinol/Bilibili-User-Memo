import { describe, expect, it } from "vitest";
import type { BiliUser } from "@/core/types";
import { syncRenderedNodeState } from "@/core/render/rendered-node";

function fakeEl(title = "") {
  return {
    title,
    textContent: "",
    classList: { toggle() {} },
  } as unknown as HTMLElement;
}

const user = (memo: string, memoDetail?: string) =>
  ({ id: "1", nickname: "nick", memo, memoDetail }) as BiliUser;

// displayMode 2 === 昵称(备注)
const render = (el: HTMLElement, u: BiliUser) =>
  syncRenderedNodeState(el, u, "nick", 2);

describe("syncRenderedNodeState — 详细备注 title", () => {
  it("追加到已有 title 之后", () => {
    const el = fakeEl("原始标题");
    render(el, user("备注", "第一条"));

    expect(el.title).toBe("原始标题\n详细备注：第一条");
  });

  it("title 为空时不留前导换行", () => {
    const el = fakeEl();
    render(el, user("备注", "第一条"));

    expect(el.title).toBe("详细备注：第一条");
  });

  it("重复调用幂等，不会叠加", () => {
    const el = fakeEl("原始标题");
    render(el, user("备注", "第一条"));
    render(el, user("备注", "第一条"));

    expect(el.title).toBe("原始标题\n详细备注：第一条");
  });

  it("改值后 title 会跟着更新（曾经的 bug：只写一次，之后恒不更新）", () => {
    const el = fakeEl("原始标题");
    render(el, user("备注", "第一条"));
    render(el, user("备注", "第二条"));

    expect(el.title).toBe("原始标题\n详细备注：第二条");
  });

  it("清空详细备注会剥掉该段并还原 B 站原标题", () => {
    const el = fakeEl("原始标题");
    render(el, user("备注", "第一条"));
    render(el, user("备注"));

    expect(el.title).toBe("原始标题");
  });

  it("详细备注含换行时也能完整剥掉", () => {
    const el = fakeEl("原始标题");
    render(el, user("备注", "多行\n详细备注内容"));
    render(el, user("备注"));

    expect(el.title).toBe("原始标题");
  });

  it("title 被外部重置后重算不丢段（Editable wrapper 每次渲染会重写 title）", () => {
    const el = fakeEl();
    render(el, user("备注", "第一条"));
    el.title = "原始标题"; // renderEditable 的 wrapper.title = el.title
    render(el, user("备注", "第一条"));

    expect(el.title).toBe("原始标题\n详细备注：第一条");
  });

  it("备注(memo) 更新仍然会改 textContent", () => {
    const el = fakeEl();
    render(el, user("备注A"));
    expect(el.textContent).toBe("nick(备注A)");

    render(el, user("备注B"));
    expect(el.textContent).toBe("nick(备注B)");
  });
});
