// 这里的样式你可以根据个人喜好调整
const LOG_STYLE =
  "color: white; background: #2196F3; padding: 2px 4px; border-radius: 3px; font-weight: bold;";
const PREFIX = "[Bilibili-User-Remark]";

export const logger = {
  info: (msg: string, ...args: any[]) => {
    console.log(`%c${PREFIX}%c ${msg}`, LOG_STYLE, "color: unset;", ...args);
  },
  error: (msg: string, ...args: any[]) => {
    console.error(
      `%c${PREFIX}%c ${msg}`,
      "background: #f44336; " + LOG_STYLE,
      "",
      ...args,
    );
  },
  // 生产环境可以把这个函数设为空，实现“一键静音”
  debug: (msg: string, ...args: any[]) => {
    if (import.meta.env.DEV) {
      // 利用 Vite 的环境变量
      console.debug(
        `%c${PREFIX}[DEBUG]%c ${msg}`,
        "background: #9e9e9e; " + LOG_STYLE,
        "",
        ...args,
      );
    }
  },
};
