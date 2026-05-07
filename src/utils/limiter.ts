// utils/limiter.ts
import pLimit from "p-limit"; // 建议安装 p-limit 库，或者用刚才手写的 createLimit

const limit = pLimit(4);

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
