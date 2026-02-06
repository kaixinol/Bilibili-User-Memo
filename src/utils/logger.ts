// 这里的样式你可以根据个人喜好调整
const LOG_STYLE =
  "color: white; background: #2196F3; padding: 2px 4px; border-radius: 3px; font-weight: bold;";
const PREFIX = "[Bili-User-Memo]";

export const logger = {
  info: (msg: any, ...args: any[]) => {
    console.log(
      `%c${PREFIX}%c`,
      "background: #9e9e9e; " + LOG_STYLE,
      "",
      msg,
      ...args,
    );
  },
  error: (msg: any, ...args: any[]) => {
    console.error(
      `%c${PREFIX}%c`,
      "background: #9e9e9e; " + LOG_STYLE,
      "",
      msg,
      ...args,
    );
  },
  warn: (msg: any, ...args: any[]) => {
    console.warn(
      `%c${PREFIX}%c`,
      "background: #9e9e9e; " + LOG_STYLE,
      "",
      msg,
      ...args,
    );
  },
  // 生产环境可以把这个函数设为空，实现“一键静音”
  debug: (msg: any, ...args: any[]) => {
    if (import.meta.env.DEV) {
      // 利用 Vite 的环境变量
      console.debug(
        `%c${PREFIX}[DEBUG]%c`,
        "background: #9e9e9e; " + LOG_STYLE,
        "",
        msg,
        ...args,
      );
    }
  },
};
