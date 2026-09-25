type TextControl = HTMLInputElement | HTMLTextAreaElement;

function isTextControl(node: Element | null): node is TextControl {
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
}

/**
 * input / textarea 的选区不进 document selection：Chrome 里 window.getSelection()
 * 对控件内选区返回 isCollapsed=true、containsNode=false（值本身倒是能 toString 出来）。
 * 所以必须单独读 selectionStart/End。
 */
function getControlSelection(control: TextControl): string {
  try {
    const { selectionStart, selectionEnd } = control;
    // number / email 之类的 type 读 selectionStart 会抛 InvalidStateError
    if (selectionStart === null || selectionEnd === null) return "";
    if (selectionEnd <= selectionStart) return "";
    return control.value.slice(selectionStart, selectionEnd);
  } catch {
    return "";
  }
}

/**
 * 元素内部是否已有非空文字选区（用户正在/刚做完拖选，打算自己复制）
 */
export function hasTextSelectionInside(element: HTMLElement): boolean {
  const active = document.activeElement;
  if (isTextControl(active) && (active === element || element.contains(active))) {
    if (getControlSelection(active).trim()) return true;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  if (!selection.toString().trim()) return false;
  // 允许部分包含：选区从标签内拖到外面（或反过来）时也算「标签里有选中文字」
  // 注意：双击选词救不了 —— 第一下 click 时选区还没产生，那时已经进编辑态了
  return selection.containsNode(element, true);
}
