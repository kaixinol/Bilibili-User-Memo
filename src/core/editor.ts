// src/core/editor.ts
import { BiliUser } from "./types";
import { userStore } from "./store";
import { formatDisplayName } from "./dom-utils";

/**
 * 进入行内编辑模式
 * @param targetElement 用户点击的元素 (在 Editable 模式下是我们的 span，Extended 模式下是原元素)
 * @param user 用户对象
 */
export function enterEditMode(targetElement: HTMLElement, user: BiliUser) {
  if (!user || targetElement.querySelector("input.bili-memo-input")) return;

  const originalName =
    targetElement.dataset.biliOriginal || targetElement.textContent || "";
  const currentMemo = user.memo || originalName;

  // 1. 创建 UI
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentMemo;
  input.className = "bili-memo-input";
  input.placeholder = "输入备注...";

  // 动态宽度：最小 60px，每个字符约 14px
  const updateWidth = () => {
    const len = (input.value || "").replace(/[^\x00-\xff]/g, "xx").length; // 中文算2个宽
    input.style.width = `${Math.max(len * 8 + 20, 80)}px`;
  };
  updateWidth();
  input.addEventListener("input", updateWidth);

  // 2. 挂载
  // 为了不破坏布局，我们隐藏目标元素，在同级插入 input
  const parent = targetElement.parentElement;
  if (!parent) return;

  targetElement.style.display = "none";
  parent.insertBefore(input, targetElement.nextSibling);
  input.focus();

  // 3. 状态保存闭包
  const saveAndExit = (shouldSave: boolean) => {
    // 防止多次触发
    if (!input.isConnected) return;

    const newValue = input.value.trim();

    // 清理 DOM
    input.remove();
    targetElement.style.display = ""; // 恢复显示 (让 renderer 接管后续样式)

    if (shouldSave && newValue !== currentMemo) {
      // 1. 更新 Store (这会触发全局的数据同步)
      userStore.updateUserMemo(user.id, newValue, originalName);

      // 2. 立即给予视觉反馈 (不必等待 Store 的响应式回调)
      // 这样用户体验更流畅
      const newDisplayText = formatDisplayName(
        { ...user, memo: newValue },
        originalName,
        userStore.displayMode,
      );
      targetElement.textContent = newDisplayText;

      if (newValue) {
        targetElement.classList.add("bili-memo-tag");
      } else {
        targetElement.classList.remove("bili-memo-tag");
      }
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
  input.addEventListener("click", (e) => e.stopPropagation()); // 防止冒泡触发跳转
}
