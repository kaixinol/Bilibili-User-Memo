// src/core/editor.ts
import type { BiliUser } from "../types";
import { userStore } from "../store/store";
import { syncRenderedNodeState } from "./rendered-node";
import { markOwnedElement } from "../dom/owned-node";

/**
 * 进入行内编辑模式
 * @param targetElement 用户点击的元素（Editable 模式下为注入的 span）
 * @param user 用户对象
 */
export function enterEditMode(targetElement: HTMLElement, user: BiliUser) {
  if (!user || targetElement.querySelector("input.bili-memo-input")) return;

  const originalName =
    targetElement.dataset.biliOriginal || targetElement.textContent || "";
  const currentMemo = user.memo || originalName;

  // 1. 创建 UI
  const input = markOwnedElement(document.createElement("input"));
  input.type = "text";
  input.value = currentMemo;
  input.className = "bili-memo-input";
  input.translate = false;
  input.maxLength = 24;
  const detectedFontSize = targetElement.style.getPropertyValue('--auto-detected-font-size');
  if (detectedFontSize) {
    input.style.setProperty('--auto-detected-font-size', detectedFontSize);
  }
  // 2. 挂载
  // 为了不破坏布局，我们隐藏目标元素，在同级插入 input
  const parent = targetElement.parentElement;
  if (!parent) return;
  targetElement.style.display = "none";
  parent.insertBefore(input, targetElement.nextSibling);
  input.focus();

  // 3. 状态保存闭包let exited = false;

  let exited = false;
  const saveAndExit = (shouldSave: boolean) => {
    if (exited) return;
    exited = true;

    const newValue = input.value.trim();

    input.remove();
    targetElement.style.display = "";

    if (shouldSave && newValue !== currentMemo) {
      userStore.updateUserMemo(user.id, newValue, originalName);
      syncRenderedNodeState(
        targetElement,
        { ...user, memo: newValue },
        originalName,
        userStore.displayMode,
        {
          isEditableWrapper:
            targetElement.classList.contains("editable-textarea"),
        },
      );
    }
  };

  // 4. 事件监听
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return; // 输入法状态中不处理
    if (e.key === "Enter") {
      e.preventDefault();
      saveAndExit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      saveAndExit(false);
    }
  };

  input.addEventListener("keydown", handleKeyDown);
  input.addEventListener("blur", () => saveAndExit(true)); // 失去焦点自动保存
  input.addEventListener("click", (e) => e.stopPropagation());
  function autoResize(input: HTMLInputElement) {
    input.style.width = "0px";
    input.style.width = input.scrollWidth + 1 + "px";
  }

  input.addEventListener("input", () => {
    if (input.value.length >= input.maxLength) {
      input.setCustomValidity("已达到最大长度：24 字符");
      input.reportValidity();
    } else {
      input.setCustomValidity("");
    } autoResize(input);
  });
  autoResize(input);
}
