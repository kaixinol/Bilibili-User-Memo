// utils/limiter.ts
import pLimit from "p-limit"; // 建议安装 p-limit 库，或者用刚才手写的 createLimit

// 创建一个全局并发计数器（并发 2，每秒最多处理几个，比较稳）
const limit = pLimit(2);

/**
 * 限速装饰器：将普通异步函数包装成带并发控制的任务
 */
export function withLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
): T {
  return ((...args: any[]) => {
    // 将函数放入队列执行
    return limit(async () => {
      // 执行前随机等待 300ms-800ms，模拟人类行为
      await new Promise((resolve) =>
        setTimeout(resolve, 300 + Math.random() * 500),
      );
      return fn(...args);
    });
  }) as T;
}
